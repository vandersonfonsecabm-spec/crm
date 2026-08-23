const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { parse } = require("csv-parse");
const { stockError } = require("../shared/errors");

const STOCK_CSV_SCHEMA_VERSION = "stock-csv.v1";
const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxRows: 50_000,
  maxColumns: 32,
  maxFieldCodePoints: 512,
  parseTimeoutMs: 30_000,
});
const DELIMITERS = Object.freeze({ comma: ",", semicolon: ";" });
const ALLOWED_HEADERS = new Set([
  "source_product_id",
  "source_version",
  "product_name",
  "unit",
  "on_hand",
  "reserved",
  "available",
  "quarantined",
  "damaged",
  "in_transit",
  "available_semantics",
  "source_lot_id",
  "lot_code",
  "expiry_date",
  "expiry_precision",
  "source_location_id",
  "location_name",
  "source_updated_at",
]);
const SENSITIVE_HEADER = /(?:password|token|secret|authorization|cpf|cnpj|email|phone|telefone)/i;
const AVAILABLE_SEMANTICS = new Set(["EXPLICIT", "DERIVED_ON_HAND_MINUS_RESERVED", "UNAVAILABLE", "UNKNOWN"]);
const EXPIRY_PRECISIONS = new Set(["DAY", "MONTH", "YEAR", "UNKNOWN"]);
const QUANTITY_FIELDS = ["on_hand", "reserved", "available", "quarantined", "damaged", "in_transit"];

function createStockCsvAdapter({ limits = {}, clock = () => Date.now() } = {}) {
  const effectiveLimits = normalizeLimits(limits);

  return {
    schemaVersion: STOCK_CSV_SCHEMA_VERSION,
    describeCapabilities(headers = []) {
      const present = new Set(headers);
      return capabilityManifest(present);
    },
    async parsePreview(input) {
      return parseStockCsv(input, { limits: effectiveLimits, clock });
    },
  };
}

async function parseStockCsv({ input, delimiter, schemaVersion = STOCK_CSV_SCHEMA_VERSION } = {}, { limits = DEFAULT_LIMITS, clock = () => Date.now() } = {}) {
  if (schemaVersion !== STOCK_CSV_SCHEMA_VERSION) {
    throw stockError(422, "STOCK_CSV_SCHEMA_UNSUPPORTED", "Schema CSV de estoque nao suportado.");
  }
  const delimiterChar = DELIMITERS[delimiter];
  if (!delimiterChar) throw stockError(422, "STOCK_CSV_DELIMITER_REQUIRED", "Delimitador CSV explicito obrigatorio.");

  const source = toReadable(input);
  const byteLimiter = new ByteLimitTransform(limits.maxBytes);
  let headers = null;
  const parser = parse({
    bom: true,
    columns(rawHeaders) {
      headers = validateHeaders(rawHeaders, limits);
      return headers;
    },
    delimiter: delimiterChar,
    max_record_size: limits.maxFieldCodePoints * limits.maxColumns * 2,
    relax_column_count: false,
    relax_quotes: false,
    skip_empty_lines: true,
    trim: false,
    on_record(record, context) {
      return { record, rowNumber: context.lines };
    },
  });
  const deadline = setTimeout(() => {
    const error = stockError(408, "STOCK_CSV_PARSE_TIMEOUT", "Tempo de analise CSV excedido.");
    source.destroy(error);
    parser.destroy(error);
  }, limits.parseTimeoutMs);

  source.pipe(byteLimiter).pipe(parser);
  const lines = [];
  try {
    for await (const entry of parser) {
      if (lines.length >= limits.maxRows) throw stockError(413, "STOCK_CSV_ROWS_EXCEEDED", "Arquivo CSV excede o limite de linhas.");
      const raw = normalizeRawRecord(entry.record, headers, limits);
      lines.push(normalizeLine(raw, entry.rowNumber));
    }
  } catch (error) {
    if (String(error?.code || "").startsWith("STOCK_")) throw error;
    throw stockError(422, "STOCK_CSV_INVALID", "CSV de estoque invalido.");
  } finally {
    clearTimeout(deadline);
  }
  if (!headers) throw stockError(422, "STOCK_CSV_HEADER_REQUIRED", "Cabecalho CSV obrigatorio.");
  if (!lines.length) throw stockError(422, "STOCK_CSV_EMPTY", "CSV sem linhas de dados.");

  const acceptedCount = lines.filter((line) => line.status === "ACCEPTED").length;
  return {
    schemaVersion: STOCK_CSV_SCHEMA_VERSION,
    byteSize: byteLimiter.byteSize,
    fileHash: byteLimiter.digest(),
    headers,
    capabilities: capabilityManifest(new Set(headers)),
    lines,
    rowCount: lines.length,
    acceptedCount,
    rejectedCount: lines.length - acceptedCount,
    parsedAt: new Date(clock()).toISOString(),
  };
}

class ByteLimitTransform extends Transform {
  constructor(maxBytes) {
    super();
    this.maxBytes = maxBytes;
    this.byteSize = 0;
    this.hash = crypto.createHash("sha256");
    this.finalHash = null;
  }

  _transform(chunk, encoding, callback) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    this.byteSize += value.length;
    if (this.byteSize > this.maxBytes) {
      callback(stockError(413, "STOCK_CSV_BYTES_EXCEEDED", "Arquivo CSV excede o limite de bytes."));
      return;
    }
    this.hash.update(value);
    callback(null, value);
  }

  _flush(callback) {
    this.finalHash = this.hash.digest("hex");
    callback();
  }

  digest() {
    return this.finalHash || this.hash.copy().digest("hex");
  }
}

function validateHeaders(rawHeaders, limits) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length === 0) {
    throw stockError(422, "STOCK_CSV_HEADER_REQUIRED", "Cabecalho CSV obrigatorio.");
  }
  if (rawHeaders.length > limits.maxColumns) {
    throw stockError(413, "STOCK_CSV_COLUMNS_EXCEEDED", "CSV excede o limite de colunas.");
  }
  const headers = rawHeaders.map((header) => String(header || "").trim().toLowerCase());
  if (headers.some((header) => !header)) throw stockError(422, "STOCK_CSV_HEADER_INVALID", "Cabecalho CSV invalido.");
  if (headers.some((header) => SENSITIVE_HEADER.test(header))) {
    throw stockError(422, "STOCK_CSV_SENSITIVE_HEADER", "CSV contem cabecalho sensivel proibido.");
  }
  if (headers.some((header) => !ALLOWED_HEADERS.has(header))) {
    throw stockError(422, "STOCK_CSV_HEADER_UNKNOWN", "CSV contem cabecalho nao permitido.");
  }
  if (new Set(headers).size !== headers.length) throw stockError(422, "STOCK_CSV_HEADER_DUPLICATE", "CSV contem cabecalho duplicado.");
  if (!headers.includes("source_product_id")) {
    throw stockError(422, "STOCK_CSV_SOURCE_PRODUCT_ID_REQUIRED", "source_product_id obrigatorio.");
  }
  return headers;
}

function normalizeRawRecord(record, headers, limits) {
  const normalized = {};
  for (const header of headers) {
    const value = String(record[header] ?? "").trim();
    if (value.includes("\uFFFD") || Array.from(value).length > limits.maxFieldCodePoints) {
      throw stockError(422, "STOCK_CSV_FIELD_INVALID", "Campo CSV invalido ou acima do limite.");
    }
    if (value.includes("\u0000")) throw stockError(422, "STOCK_CSV_CONTROL_CHARACTER", "CSV contem caractere de controle proibido.");
    normalized[header] = value;
  }
  return normalized;
}

function normalizeLine(raw, rowNumber) {
  try {
    const sourceProductId = requiredIdentifier(raw.source_product_id, "source_product_id");
    const quantities = Object.fromEntries(QUANTITY_FIELDS.map((field) => [field, parseDecimal(raw[field], field)]));
    const hasQuantity = Object.values(quantities).some((value) => value !== null);
    const unit = optionalText(raw.unit, 32);
    if (hasQuantity && !unit) throw stockError(422, "STOCK_CSV_UNIT_REQUIRED", "Unidade obrigatoria quando houver quantidade.");
    const expiry = parseExpiry(raw.expiry_date, raw.expiry_precision);
    const availableSemantics = parseAvailableSemantics(raw.available_semantics, quantities.available);
    const normalized = {
      sourceProductId,
      sourceVersion: optionalIdentifier(raw.source_version, "source_version") || fallbackVersion(sourceProductId, raw),
      productName: optionalText(raw.product_name, 240),
      unit,
      quantities,
      availableSemantics,
      sourceLotId: optionalIdentifier(raw.source_lot_id, "source_lot_id"),
      lotCode: optionalText(raw.lot_code, 120),
      expiryDate: expiry.date,
      expiryPrecision: expiry.precision,
      sourceLocationId: optionalIdentifier(raw.source_location_id, "source_location_id"),
      locationName: optionalText(raw.location_name, 240),
      sourceUpdatedAt: parseOptionalTimestamp(raw.source_updated_at),
    };
    return {
      rowNumber,
      rowChecksum: sha256(stableJson(normalized)),
      sourceRecordId: sourceProductId,
      sourceVersion: normalized.sourceVersion,
      status: "ACCEPTED",
      normalized: normalized,
      warnings: [],
      errors: [],
    };
  } catch (error) {
    const code = error?.code || "STOCK_CSV_ROW_INVALID";
    return {
      rowNumber,
      rowChecksum: sha256(stableJson(raw)),
      sourceRecordId: safeFallbackId(raw.source_product_id),
      sourceVersion: optionalIdentifier(raw.source_version, "source_version") || null,
      status: "REJECTED",
      normalized: null,
      warnings: [],
      errors: [{ code, message: "Linha CSV de estoque rejeitada." }],
    };
  }
}

function parseExpiry(value, precisionValue) {
  const date = String(value || "").trim();
  const precision = String(precisionValue || (date ? "" : "UNKNOWN")).trim().toUpperCase() || "UNKNOWN";
  if (!EXPIRY_PRECISIONS.has(precision)) throw stockError(422, "STOCK_CSV_EXPIRY_PRECISION_INVALID", "Precisao de validade invalida.");
  if (precision === "UNKNOWN") {
    if (date) throw stockError(422, "STOCK_CSV_EXPIRY_PRECISION_REQUIRED", "Precisao de validade obrigatoria.");
    return { date: null, precision };
  }
  const pattern = precision === "DAY" ? /^\d{4}-\d{2}-\d{2}$/ : precision === "MONTH" ? /^\d{4}-\d{2}$/ : /^\d{4}$/;
  if (!pattern.test(date)) throw stockError(422, "STOCK_CSV_EXPIRY_INVALID", "Validade CSV invalida.");
  return { date, precision };
}

function parseAvailableSemantics(value, available) {
  const normalized = String(value || "").trim().toUpperCase();
  const semantics = normalized || (available === null ? "UNKNOWN" : "EXPLICIT");
  if (!AVAILABLE_SEMANTICS.has(semantics)) throw stockError(422, "STOCK_CSV_AVAILABLE_SEMANTICS_INVALID", "Semantica de disponibilidade invalida.");
  if (available !== null && semantics !== "EXPLICIT") {
    throw stockError(422, "STOCK_CSV_AVAILABLE_SEMANTICS_CONFLICT", "Disponibilidade explicita exige semantica EXPLICIT.");
  }
  return semantics;
}

function parseDecimal(value, field) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!/^-?(?:0|[1-9]\d{0,29})(?:\.\d{1,6})?$/.test(text)) {
    throw stockError(422, "STOCK_CSV_DECIMAL_INVALID", `${field} invalido.`);
  }
  return text;
}

function parseOptionalTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw stockError(422, "STOCK_CSV_TIMESTAMP_INVALID", "Timestamp de fonte invalido.");
  return date.toISOString();
}

function capabilityManifest(headers) {
  return {
    schemaVersion: STOCK_CSV_SCHEMA_VERSION,
    PRODUCT_IDENTITY: headers.has("source_product_id"),
    SOURCE_VERSION: headers.has("source_version"),
    LOT_IDENTIFIER: headers.has("source_lot_id") || headers.has("lot_code"),
    EXPIRATION_DATE: headers.has("expiry_date") && headers.has("expiry_precision"),
    LOCATION: headers.has("source_location_id") || headers.has("location_name"),
    ON_HAND_QUANTITY: headers.has("on_hand"),
    RESERVED_QUANTITY: headers.has("reserved"),
    AVAILABLE_QUANTITY: headers.has("available"),
    QUARANTINED_QUANTITY: headers.has("quarantined"),
    UNIT_OF_MEASURE: headers.has("unit"),
    SOURCE_UPDATED_AT: headers.has("source_updated_at"),
    READ_ONLY_ACCESS: true,
  };
}

function toReadable(input) {
  if (input && typeof input.pipe === "function") return input;
  if (Buffer.isBuffer(input)) return Readable.from([input]);
  if (typeof input === "string") return Readable.from([Buffer.from(input, "utf8")]);
  throw stockError(400, "STOCK_CSV_INPUT_REQUIRED", "Conteudo CSV obrigatorio.");
}

function requiredIdentifier(value, field) {
  const normalized = optionalIdentifier(value, field);
  if (!normalized) throw stockError(422, "STOCK_CSV_SOURCE_PRODUCT_ID_REQUIRED", "source_product_id obrigatorio.");
  return normalized;
}

function optionalIdentifier(value, field) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(text)) throw stockError(422, "STOCK_CSV_IDENTIFIER_INVALID", `${field} invalido.`);
  return text;
}

function optionalText(value, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (Array.from(text).length > maxLength) throw stockError(422, "STOCK_CSV_TEXT_INVALID", "Texto CSV invalido.");
  return text;
}

function fallbackVersion(sourceProductId, raw) {
  return `manual:${sha256(stableJson({ sourceProductId, raw }))}`;
}

function safeFallbackId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(String(value || "")) ? String(value) : "invalid-row";
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function normalizeLimits(limits) {
  const result = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(limits || {})) {
    if (Number.isInteger(value) && value > 0) result[key] = value;
  }
  return result;
}

module.exports = {
  ALLOWED_HEADERS,
  DEFAULT_LIMITS,
  STOCK_CSV_SCHEMA_VERSION,
  createStockCsvAdapter,
  parseStockCsv,
};
