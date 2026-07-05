const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
const ExcelJS = require("exceljs");
const multer = require("multer");
const { Prisma } = require("@prisma/client");

const ALLOWED_FIELDS = new Set([
  "externalId",
  "sku",
  "codigoBarras",
  "nome",
  "descricao",
  "categoria",
  "marca",
  "unidade",
  "ativo",
  "quantidade",
  "reservado",
  "disponivel",
  "localExternalId",
  "localNome",
  "precoCentavos",
  "precoPromocionalCentavos",
  "tabelaPreco",
  "inicioPromocao",
  "fimPromocao",
]);

const REQUIRED_KEY_FIELDS = ["externalId", "sku", "codigoBarras"];
const MONEY_MODES = new Set(["CENTAVOS", "REAIS_VIRGULA", "REAIS_PONTO"]);
const UPDATE_STRATEGIES = new Set(["CRIAR_E_ATUALIZAR", "APENAS_CRIAR", "APENAS_ATUALIZAR"]);
const FINAL_IMPORT_STATUSES = new Set(["CONCLUIDO", "CONCLUIDO_COM_ERROS"]);

const COLUMN_ALIASES = {
  externalId: ["id", "codigo", "cod_produto", "codigo_produto", "codproduto", "external_id", "id_externo"],
  sku: ["sku", "referencia", "ref", "codigo_sku"],
  codigoBarras: ["ean", "gtin", "codigo_barras", "cod_barras", "codigobarras", "barcode", "codigo_barra"],
  nome: ["produto", "nome", "descricao_produto", "nome_produto", "item"],
  descricao: ["descricao", "desc", "detalhes", "observacao"],
  categoria: ["categoria", "grupo", "familia"],
  marca: ["marca", "fabricante"],
  unidade: ["unidade", "un", "und", "un_medida"],
  ativo: ["ativo", "status"],
  quantidade: ["estoque", "saldo", "quantidade", "qtd", "qtde"],
  reservado: ["reservado", "reserva"],
  disponivel: ["disponivel", "saldo_disponivel"],
  localExternalId: ["local_id", "id_local", "deposito_id", "almoxarifado_id"],
  localNome: ["local", "deposito", "almoxarifado"],
  precoCentavos: ["preco", "valor", "preco_venda", "valor_venda", "preco_centavos"],
  precoPromocionalCentavos: ["preco_promocional", "valor_promocional", "promo"],
  tabelaPreco: ["tabela", "tabela_preco", "lista_preco"],
  inicioPromocao: ["inicio_promocao", "promocao_inicio"],
  fimPromocao: ["fim_promocao", "promocao_fim"],
};

function getImportLimits() {
  return {
    maxFileSizeBytes: positiveInt(process.env.IMPORT_MAX_FILE_SIZE_BYTES, 10 * 1024 * 1024),
    maxRows: positiveInt(process.env.IMPORT_MAX_ROWS, 50000),
    maxColumns: positiveInt(process.env.IMPORT_MAX_COLUMNS, 100),
    maxErrors: positiveInt(process.env.IMPORT_MAX_ERRORS, 1000),
    batchSize: positiveInt(process.env.IMPORT_BATCH_SIZE, 500),
  };
}

function createUploadMiddleware() {
  const limits = getImportLimits();
  const uploadDir = getUploadDir();
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const suffix = crypto.randomBytes(16).toString("hex");
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `import-${Date.now()}-${suffix}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: limits.maxFileSizeBytes, files: 1 },
  }).single("arquivo");
}

async function analyzeImportFile(file) {
  if (!file) throw httpError(400, "Arquivo obrigatorio.", "IMPORT_FILE_REQUIRED");
  const limits = getImportLimits();
  if (file.size > limits.maxFileSizeBytes) throw httpError(400, "Arquivo maior que o limite permitido.", "IMPORT_FILE_TOO_LARGE");

  const originalName = sanitizeFileName(file.originalname || "arquivo");
  const formato = detectFormat(file);
  const hashArquivo = await sha256File(file.path);
  const parsed = formato === "CSV" ? parseCsvFile(file.path, limits) : await parseXlsxFile(file.path, limits);
  const sugestaoMapeamento = suggestMapping(parsed.columns);

  return {
    formato,
    nomeArquivo: originalName,
    tamanhoBytes: file.size,
    hashArquivo,
    colunasDetectadas: parsed.columns,
    colunasDuplicadas: parsed.duplicateColumns,
    linhas: parsed.rows,
    primeirasLinhas: parsed.preview,
    totalLinhasEstimado: parsed.totalRows,
    separador: parsed.delimiter,
    planilha: parsed.sheetName,
    sugestaoMapeamento,
  };
}

function parseCsvFile(filePath, limits) {
  const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  if (!content.trim()) throw httpError(400, "Arquivo vazio.", "IMPORT_EMPTY_FILE");
  const delimiter = detectCsvDelimiter(content);
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    delimiter,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  return normalizeParsedRows(records, limits, { delimiter });
}

async function parseXlsxFile(filePath, limits) {
  if (path.extname(filePath).toLowerCase() !== ".xlsx") {
    throw httpError(400, "Formato XLSX invalido.", "IMPORT_INVALID_FORMAT");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) throw httpError(400, "Arquivo vazio.", "IMPORT_EMPTY_FILE");

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToString(cell.value);
  });
  if (!headers.some((header) => clean(header))) throw httpError(400, "Cabecalho ausente.", "IMPORT_HEADER_REQUIRED");
  if (headers.length > limits.maxColumns) throw httpError(400, "Arquivo possui mais colunas que o permitido.", "IMPORT_TOO_MANY_COLUMNS");

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    if (rows.length >= limits.maxRows) throw httpError(400, "Arquivo possui mais linhas que o permitido.", "IMPORT_TOO_MANY_ROWS");
    const row = sheet.getRow(rowNumber);
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = cellToString(row.getCell(index + 1).value);
    });
    if (!isEmptySourceRow(obj)) rows.push(obj);
  }
  return normalizeParsedRows(rows, limits, { sheetName: sheet.name });
}

function normalizeParsedRows(records, limits, metadata = {}) {
  if (!Array.isArray(records) || records.length === 0) throw httpError(400, "Arquivo sem linhas de dados.", "IMPORT_EMPTY_FILE");
  const rawColumns = Object.keys(records[0] || {}).map((column) => clean(column));
  if (!rawColumns.some(Boolean)) throw httpError(400, "Cabecalho ausente.", "IMPORT_HEADER_REQUIRED");
  if (rawColumns.length > limits.maxColumns) throw httpError(400, "Arquivo possui mais colunas que o permitido.", "IMPORT_TOO_MANY_COLUMNS");

  const duplicateColumns = findDuplicateColumns(rawColumns);
  const rows = records
    .slice(0, limits.maxRows + 1)
    .map((record, index) => ({ lineNumber: index + 2, values: normalizeRecord(record, rawColumns) }))
    .filter((row) => !isEmptySourceRow(row.values));

  if (records.length > limits.maxRows || rows.length > limits.maxRows) throw httpError(400, "Arquivo possui mais linhas que o permitido.", "IMPORT_TOO_MANY_ROWS");
  if (!rows.length) throw httpError(400, "Arquivo sem linhas de dados.", "IMPORT_EMPTY_FILE");

  return {
    columns: rawColumns,
    duplicateColumns,
    rows,
    preview: rows.slice(0, 5).map((row) => row.values),
    totalRows: rows.length,
    delimiter: metadata.delimiter,
    sheetName: metadata.sheetName,
  };
}

function normalizeRecord(record, columns) {
  const result = {};
  columns.forEach((column) => {
    result[column] = cellToString(record[column]);
  });
  return result;
}

async function saveImportCache(importacaoId, data) {
  const dir = getCacheDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = cachePath(importacaoId);
  await fs.promises.writeFile(filePath, JSON.stringify(data), "utf8");
  return filePath;
}

async function loadImportCache(importacaoId) {
  try {
    const content = await fs.promises.readFile(cachePath(importacaoId), "utf8");
    return JSON.parse(content);
  } catch {
    throw httpError(410, "Arquivo temporario da importacao expirou. Envie o arquivo novamente.", "IMPORT_CACHE_EXPIRED");
  }
}

async function removeImportCache(importacaoId) {
  await removeTempFile(cachePath(importacaoId));
}

async function removeTempFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function mapImportacao({ prisma, importacao, body }) {
  assertImportEditable(importacao);
  const cache = await loadImportCache(importacao.id);
  const config = normalizeMappingPayload(body);
  validateMapping(config.mapping);
  const validation = validateRows(cache.rows, config, { maxErrors: getImportLimits().maxErrors, collectErrors: false });
  const updated = await prisma.importacaoDados.update({
    where: { id: importacao.id },
    data: {
      status: "VALIDANDO",
      mapeamentoJson: JSON.stringify(config),
      totalLinhas: cache.rows.length,
      linhasValidas: validation.validRows.length,
      linhasComErro: validation.invalidLineCount,
    },
  });

  return {
    importacao: updated,
    previa: validation.validRows.slice(0, 5).map((row) => row.data),
    errosConfiguracao: [],
    avisos: validation.warnings,
    linhasValidasEstimadas: validation.validRows.length,
    linhasInvalidasEstimadas: validation.invalidLineCount,
  };
}

async function validateImportacao({ prisma, importacao }) {
  if (!importacao.mapeamentoJson) throw httpError(400, "Mapeamento ausente.", "IMPORT_MAPPING_REQUIRED");
  if (!["VALIDANDO", "PRONTO", "FALHOU"].includes(importacao.status)) {
    throw httpError(409, "Importacao nao esta pronta para validacao.", "IMPORT_INVALID_STATUS");
  }
  const cache = await loadImportCache(importacao.id);
  const config = JSON.parse(importacao.mapeamentoJson);
  const validation = validateRows(cache.rows, config, { maxErrors: getImportLimits().maxErrors, collectErrors: true });

  await prisma.$transaction(async (tx) => {
    await tx.erroImportacao.deleteMany({ where: { importacaoId: importacao.id } });
    if (validation.errors.length) {
      await tx.erroImportacao.createMany({
        data: validation.errors.map((erro) => ({ ...erro, importacaoId: importacao.id })),
      });
    }
  });

  const status = validation.validRows.length ? "PRONTO" : "FALHOU";
  const updated = await prisma.importacaoDados.update({
    where: { id: importacao.id },
    data: {
      status,
      totalLinhas: cache.rows.length,
      linhasValidas: validation.validRows.length,
      linhasComErro: validation.invalidLineCount,
    },
    include: { erros: true },
  });

  await saveValidatedRows(importacao.id, validation.validRows);
  return { importacao: updated, resumo: validationSummary(validation, cache.rows.length) };
}

async function processImportacao({ prisma, importacao, empresaId, usuarioId, body }) {
  if (importacao.status !== "PRONTO") throw httpError(409, "Importacao precisa estar validada antes do processamento.", "IMPORT_INVALID_STATUS");
  if (!body || body.importarLinhasValidas !== true) {
    throw httpError(400, "Confirme a importacao das linhas validas.", "IMPORT_CONFIRMATION_REQUIRED");
  }
  const estrategia = clean(body.estrategiaAtualizacao || "CRIAR_E_ATUALIZAR").toUpperCase();
  if (!UPDATE_STRATEGIES.has(estrategia)) throw httpError(400, "Estrategia de atualizacao invalida.", "VALIDATION_ERROR");

  const validatedRows = await loadValidatedRows(importacao.id);
  const config = JSON.parse(importacao.mapeamentoJson || "{}");
  const integration = await findOrCreateManualIntegration({ prisma, empresaId, formato: importacao.formato });
  const limits = getImportLimits();
  const now = new Date();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let stockTouched = 0;
  let priceTouched = 0;
  let stockCreated = 0;
  let stockUpdated = 0;
  let priceCreated = 0;
  let priceUpdated = 0;
  const processingErrors = [];

  await prisma.importacaoDados.update({
    where: { id: importacao.id },
    data: { status: "PROCESSANDO", iniciadaEm: now, integracaoId: integration.id },
  });

  for (let start = 0; start < validatedRows.length; start += limits.batchSize) {
    const batch = validatedRows.slice(start, start + limits.batchSize);
    const result = await prisma.$transaction(async (tx) => {
      const counters = { created: 0, updated: 0, skipped: 0, stockTouched: 0, priceTouched: 0, stockCreated: 0, stockUpdated: 0, priceCreated: 0, priceUpdated: 0 };
      for (const row of batch) {
        const existing = await tx.produtoExterno.findUnique({
          where: { integracaoId_externalId: { integracaoId: integration.id, externalId: row.data.externalId } },
        });

        if (existing && estrategia === "APENAS_CRIAR") {
          counters.skipped += 1;
          continue;
        }
        if (!existing && estrategia === "APENAS_ATUALIZAR") {
          counters.skipped += 1;
          continue;
        }

        const productData = productDataFromRow({ row: row.data, empresaId, integracaoId: integration.id, now });
        const produto = existing
          ? await tx.produtoExterno.update({ where: { id: existing.id }, data: productData })
          : await tx.produtoExterno.create({ data: productData });
        if (existing) counters.updated += 1;
        else counters.created += 1;

        if (hasStock(row.data)) {
          const stockResult = await upsertStock({ tx, empresaId, integracaoId: integration.id, produtoExternoId: produto.id, row: row.data, now });
          counters.stockTouched += 1;
          if (stockResult.created) counters.stockCreated += 1;
          if (stockResult.updated) counters.stockUpdated += 1;
        }
        if (hasPrice(row.data)) {
          const priceResult = await upsertPrice({ tx, empresaId, integracaoId: integration.id, produtoExternoId: produto.id, row: row.data, now });
          counters.priceTouched += 1;
          if (priceResult.created) counters.priceCreated += 1;
          if (priceResult.updated) counters.priceUpdated += 1;
        }
      }
      return counters;
    });
    created += result.created;
    updated += result.updated;
    skipped += result.skipped;
    stockTouched += result.stockTouched;
    priceTouched += result.priceTouched;
    stockCreated += result.stockCreated;
    stockUpdated += result.stockUpdated;
    priceCreated += result.priceCreated;
    priceUpdated += result.priceUpdated;
  }

  const finalStatus = importacao.linhasComErro > 0 || processingErrors.length ? "CONCLUIDO_COM_ERROS" : "CONCLUIDO";
  const finished = await prisma.importacaoDados.update({
    where: { id: importacao.id },
    data: {
      status: finalStatus,
      finalizadaEm: new Date(),
      integracaoId: integration.id,
    },
    include: { erros: true },
  });

  await prisma.integracao.update({
    where: { id: integration.id },
    data: { status: "ATIVA", ultimaSincronizacaoEm: new Date(), ultimoSucessoEm: new Date() },
  });
  await removeImportCache(importacao.id);
  await removeValidatedRows(importacao.id);

  return {
    importacao: finished,
    resultado: {
      criados: created,
      atualizados: updated,
      ignorados: skipped,
      estoques: stockTouched,
      estoquesCriados: stockCreated,
      estoquesAtualizados: stockUpdated,
      precos: priceTouched,
      precosCriados: priceCreated,
      precosAtualizados: priceUpdated,
    },
    configuracao: config,
  };
}

async function cancelImportacao({ prisma, importacao }) {
  if (FINAL_IMPORT_STATUSES.has(importacao.status)) throw httpError(409, "Importacao concluida nao pode ser cancelada.", "IMPORT_INVALID_STATUS");
  if (importacao.status === "PROCESSANDO") throw httpError(409, "Importacao em processamento nao pode ser cancelada.", "IMPORT_INVALID_STATUS");
  const updated = await prisma.importacaoDados.update({
    where: { id: importacao.id },
    data: { status: "CANCELADO", finalizadaEm: new Date() },
  });
  await removeImportCache(importacao.id);
  await removeValidatedRows(importacao.id);
  return updated;
}

function normalizeMappingPayload(body = {}) {
  const mapping = body.mapeamento || body.mapping;
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw httpError(400, "Mapeamento obrigatorio.", "IMPORT_MAPPING_REQUIRED");
  }

  const normalizedMapping = {};
  for (const [key, value] of Object.entries(mapping)) {
    const left = clean(key);
    const right = clean(value);
    if (!left || !right) continue;
    if (ALLOWED_FIELDS.has(left)) normalizedMapping[left] = right;
    else if (ALLOWED_FIELDS.has(right)) normalizedMapping[right] = left;
    else throw httpError(400, `Campo de mapeamento invalido: ${left}.`, "IMPORT_MAPPING_INVALID");
  }

  const options = body.opcoes || body.options || {};
  const money = options.monetario || options.money || {};
  const normalizedMoney = {};
  ["precoCentavos", "precoPromocionalCentavos"].forEach((field) => {
    const mode = clean(money[field] || options[field] || "CENTAVOS").toUpperCase();
    if (!MONEY_MODES.has(mode)) throw httpError(400, `Modo monetario invalido para ${field}.`, "IMPORT_MAPPING_INVALID");
    normalizedMoney[field] = mode;
  });

  return {
    mapping: normalizedMapping,
    options: { money: normalizedMoney },
    chavePrincipal: clean(body.chavePrincipal || body.keyField || "externalId") || "externalId",
    permitirParcial: body.permitirParcial !== false,
  };
}

function validateMapping(mapping) {
  const fields = new Set(Object.keys(mapping));
  if (!fields.has("nome")) throw httpError(400, "O campo nome deve ser mapeado.", "IMPORT_MAPPING_INVALID");
  if (!REQUIRED_KEY_FIELDS.some((field) => fields.has(field))) {
    throw httpError(400, "Mapeie externalId, sku ou codigo de barras.", "IMPORT_MAPPING_INVALID");
  }
  const columns = Object.values(mapping).map((column) => normalizeColumnName(column));
  const duplicates = columns.filter((column, index) => columns.indexOf(column) !== index);
  if (duplicates.length) throw httpError(400, "Uma coluna nao pode ser usada em mais de um campo.", "IMPORT_MAPPING_INVALID");
}

function validateRows(rows, config, { maxErrors, collectErrors }) {
  const errors = [];
  const validRows = [];
  const keySet = new Set();
  const warnings = [];
  let invalidLineCount = 0;

  for (const row of rows) {
    if (isEmptySourceRow(row.values)) continue;
    const result = convertRow(row, config);
    const lineErrors = result.errors;
    const key = result.data.externalId || result.data.sku || result.data.codigoBarras;
    if (key) {
      if (keySet.has(key)) lineErrors.push(rowError(row.lineNumber, "externalId", "DUPLICATE_IN_FILE", "Codigo duplicado no arquivo.", key));
      keySet.add(key);
    }

    if (lineErrors.length) {
      invalidLineCount += 1;
      if (collectErrors && errors.length < maxErrors) errors.push(...lineErrors.slice(0, maxErrors - errors.length));
      continue;
    }
    validRows.push({ lineNumber: row.lineNumber, data: result.data });
  }

  if (errors.length >= maxErrors) warnings.push(`Foram registrados somente os primeiros ${maxErrors} erros.`);
  return { errors, validRows, invalidLineCount, warnings };
}

function convertRow(row, config) {
  const data = {};
  const errors = [];
  for (const [field, column] of Object.entries(config.mapping)) {
    const value = getColumnValue(row.values, column);
    try {
      data[field] = convertFieldValue(field, value, config.options);
    } catch (error) {
      errors.push(rowError(row.lineNumber, field, error.code || "INVALID_VALUE", error.message, value));
    }
  }

  data.externalId = clean(data.externalId || data.sku || data.codigoBarras);
  if (!data.externalId) errors.push(rowError(row.lineNumber, "externalId", "MISSING_EXTERNAL_KEY", "Informe externalId, sku ou codigo de barras.", ""));
  if (!clean(data.nome)) errors.push(rowError(row.lineNumber, "nome", "MISSING_NAME", "Nome do produto obrigatorio.", data.nome));
  if (data.codigoBarras && !/^\d{8,14}$/.test(String(data.codigoBarras))) {
    errors.push(rowError(row.lineNumber, "codigoBarras", "INVALID_BARCODE", "Codigo de barras invalido.", data.codigoBarras));
  }
  if (data.quantidade !== undefined || data.reservado !== undefined || data.disponivel !== undefined) {
    const quantidade = decimalOrZero(data.quantidade);
    const reservado = data.reservado === undefined || data.reservado === null ? new Prisma.Decimal(0) : new Prisma.Decimal(data.reservado);
    if (data.disponivel === undefined || data.disponivel === null || data.disponivel === "") {
      const disponivel = quantidade.minus(reservado);
      if (disponivel.isNegative()) errors.push(rowError(row.lineNumber, "disponivel", "NEGATIVE_AVAILABLE", "Disponivel nao pode ficar negativo.", disponivel.toString()));
      data.disponivel = disponivel.toString();
    }
  }

  return { data, errors };
}

function convertFieldValue(field, value, options) {
  const text = clean(value);
  if (text === "") return null;
  if (["quantidade", "reservado", "disponivel"].includes(field)) return parseDecimal(text, field).toString();
  if (["precoCentavos", "precoPromocionalCentavos"].includes(field)) return parseMoneyToCents(text, options.money[field]);
  if (["inicioPromocao", "fimPromocao"].includes(field)) return parseDate(text, field);
  if (field === "ativo") return parseBoolean(text);
  return text;
}

function parseDecimal(value, field) {
  const raw = String(value).trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) throw codedError(`${field} invalido.`, "INVALID_DECIMAL");
  const decimal = new Prisma.Decimal(normalized);
  if (decimal.isNegative()) throw codedError(`${field} nao pode ser negativo.`, "NEGATIVE_NUMBER");
  return decimal;
}

function parseMoneyToCents(value, mode) {
  const text = String(value).trim();
  if (mode === "CENTAVOS") {
    if (!/^\d+$/.test(text)) throw codedError("Valor monetario em centavos deve ser inteiro.", "INVALID_PRICE");
    return Number(text);
  }
  const normalized = mode === "REAIS_VIRGULA" ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw codedError("Valor monetario invalido.", "INVALID_PRICE");
  const [whole, cents = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
}

function parseDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw codedError(`${field} invalida.`, "INVALID_DATE");
  return date.toISOString();
}

function parseBoolean(value) {
  const text = normalizeColumnName(value);
  if (["true", "1", "sim", "s", "ativo", "a"].includes(text)) return true;
  if (["false", "0", "nao", "n", "inativo", "i"].includes(text)) return false;
  throw codedError("Ativo invalido.", "INVALID_BOOLEAN");
}

function productDataFromRow({ row, empresaId, integracaoId, now }) {
  return {
    empresaId,
    integracaoId,
    externalId: row.externalId,
    sku: row.sku || null,
    codigoBarras: row.codigoBarras || null,
    nome: row.nome,
    descricao: row.descricao || null,
    categoria: row.categoria || null,
    marca: row.marca || null,
    unidade: row.unidade || null,
    ativo: row.ativo === null || row.ativo === undefined ? true : Boolean(row.ativo),
    dadosOriginaisJson: JSON.stringify(row),
    sincronizadoEm: now,
  };
}

async function upsertStock({ tx, empresaId, integracaoId, produtoExternoId, row, now }) {
  const quantidade = decimalOrZero(row.quantidade);
  const reservado = row.reservado === null || row.reservado === undefined ? new Prisma.Decimal(0) : new Prisma.Decimal(row.reservado);
  const disponivel = row.disponivel === null || row.disponivel === undefined ? quantidade.minus(reservado) : new Prisma.Decimal(row.disponivel);
  const localExternalId = row.localExternalId || null;
  const localNome = row.localNome || "Padrao";
  const existing = await tx.estoqueExterno.findFirst({ where: { empresaId, produtoExternoId, localExternalId, localNome } });
  const data = { empresaId, integracaoId, produtoExternoId, localExternalId, localNome, quantidade, reservado, disponivel, sincronizadoEm: now };
  if (existing) {
    await tx.estoqueExterno.update({ where: { id: existing.id }, data });
    return { updated: true };
  }
  await tx.estoqueExterno.create({ data });
  return { created: true };
}

async function upsertPrice({ tx, empresaId, integracaoId, produtoExternoId, row, now }) {
  const tabela = row.tabelaPreco || "Padrao";
  const existing = await tx.precoExterno.findFirst({ where: { empresaId, produtoExternoId, tabela } });
  const data = {
    empresaId,
    integracaoId,
    produtoExternoId,
    tabela,
    precoCentavos: Number(row.precoCentavos),
    precoPromocionalCentavos: row.precoPromocionalCentavos === null || row.precoPromocionalCentavos === undefined ? null : Number(row.precoPromocionalCentavos),
    inicioPromocao: row.inicioPromocao ? new Date(row.inicioPromocao) : null,
    fimPromocao: row.fimPromocao ? new Date(row.fimPromocao) : null,
    sincronizadoEm: now,
  };
  if (existing) {
    await tx.precoExterno.update({ where: { id: existing.id }, data });
    return { updated: true };
  }
  await tx.precoExterno.create({ data });
  return { created: true };
}

async function findOrCreateManualIntegration({ prisma, empresaId, formato }) {
  const nome = `Importacao manual ${formato}`;
  const existing = await prisma.integracao.findFirst({ where: { empresaId, tipo: formato, nome } });
  if (existing) return existing;
  return prisma.integracao.create({
    data: {
      empresaId,
      nome,
      tipo: formato,
      status: "ATIVA",
      modo: "SOMENTE_LEITURA",
      configuracaoJson: JSON.stringify({ origem: "IMPORTACAO_MANUAL" }),
      ativo: true,
    },
  });
}

async function findPreviousImportByHash({ prisma, empresaId, hashArquivo }) {
  return prisma.importacaoDados.findFirst({
    where: { empresaId, hashArquivo, status: { in: ["PRONTO", "PROCESSANDO", "CONCLUIDO", "CONCLUIDO_COM_ERROS"] } },
    orderBy: { createdAt: "desc" },
  });
}

function importErrorWhere(importacaoId, query = {}) {
  const where = { importacaoId };
  const campo = clean(query.campo);
  const codigo = clean(query.codigo).toUpperCase();
  const linha = Number(query.linha);
  if (campo) where.campo = campo;
  if (codigo) where.codigo = codigo;
  if (Number.isInteger(linha) && linha > 0) where.linha = linha;
  return where;
}

function suggestMapping(columns) {
  const suggestions = {};
  const normalizedColumns = columns.map((column) => ({ original: column, normalized: normalizeColumnName(column) }));
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = normalizedColumns.find((column) => aliases.includes(column.normalized));
    if (match && !suggestions[field]) suggestions[field] = match.original;
  }
  return suggestions;
}

function detectFormat(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  if ([".xlsm", ".xls", ".exe", ".bat", ".cmd", ".js"].includes(ext)) throw httpError(400, "Formato de arquivo nao permitido.", "IMPORT_INVALID_FORMAT");
  if (ext === ".csv" && ["text/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream", ""].includes(mime)) return "CSV";
  if (ext === ".xlsx" && ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", ""].includes(mime)) return "XLSX";
  throw httpError(400, "Formato de arquivo nao permitido.", "IMPORT_INVALID_FORMAT");
}

function detectCsvDelimiter(content) {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function findDuplicateColumns(columns) {
  const seen = new Set();
  const duplicated = new Set();
  columns.forEach((column) => {
    const normalized = normalizeColumnName(column);
    if (seen.has(normalized)) duplicated.add(column);
    seen.add(normalized);
  });
  return Array.from(duplicated);
}

function getColumnValue(values, column) {
  const normalized = normalizeColumnName(column);
  const actual = Object.keys(values).find((key) => normalizeColumnName(key) === normalized);
  return actual ? values[actual] : "";
}

function isEmptySourceRow(values) {
  return Object.values(values || {}).every((value) => clean(value) === "");
}

function sanitizeFileName(name) {
  const base = path.basename(String(name || "arquivo"));
  return base.replace(/[\x00-\x1f<>:"/\\|?*]+/g, "_").slice(0, 160) || "arquivo";
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function cachePath(importacaoId) {
  return path.join(getCacheDir(), `importacao-${Number(importacaoId)}.json`);
}

function validatedRowsPath(importacaoId) {
  return path.join(getCacheDir(), `importacao-${Number(importacaoId)}-validas.json`);
}

async function saveValidatedRows(importacaoId, rows) {
  await fs.promises.mkdir(getCacheDir(), { recursive: true });
  await fs.promises.writeFile(validatedRowsPath(importacaoId), JSON.stringify(rows), "utf8");
}

async function loadValidatedRows(importacaoId) {
  try {
    return JSON.parse(await fs.promises.readFile(validatedRowsPath(importacaoId), "utf8"));
  } catch {
    throw httpError(410, "Resultado validado expirou. Valide a importacao novamente.", "IMPORT_CACHE_EXPIRED");
  }
}

async function removeValidatedRows(importacaoId) {
  await removeTempFile(validatedRowsPath(importacaoId));
}

function getUploadDir() {
  return path.join(os.tmpdir(), "crm-agro-import-uploads", cacheNamespace());
}

function getCacheDir() {
  return path.join(os.tmpdir(), "crm-agro-import-cache", cacheNamespace());
}

function cacheNamespace() {
  return crypto.createHash("sha1").update(String(process.env.DATABASE_URL || "default")).digest("hex").slice(0, 16);
}

function rowError(linha, campo, codigo, mensagem, value) {
  return { linha, campo, codigo, mensagem, valorSanitizado: sanitizeValue(value) };
}

function validationSummary(validation, totalLinhas) {
  return {
    totalLinhas,
    linhasValidas: validation.validRows.length,
    linhasComErro: validation.invalidLineCount,
    errosRegistrados: validation.errors.length,
    avisos: validation.warnings,
  };
}

function hasStock(row) {
  return row.quantidade !== null && row.quantidade !== undefined && row.quantidade !== "";
}

function hasPrice(row) {
  return row.precoCentavos !== null && row.precoCentavos !== undefined && row.precoCentavos !== "";
}

function decimalOrZero(value) {
  return value === null || value === undefined || value === "" ? new Prisma.Decimal(0) : new Prisma.Decimal(value);
}

function normalizeColumnName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Object.hasOwn(value, "result")) return cellToString(value.result);
    if (Object.hasOwn(value, "text")) return cellToString(value.text);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  }
  return String(value).trim();
}

function sanitizeValue(value) {
  return clean(value).slice(0, 180);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assertImportEditable(importacao) {
  if (["PROCESSANDO", "CONCLUIDO", "CONCLUIDO_COM_ERROS", "CANCELADO"].includes(importacao.status)) {
    throw httpError(409, "Importacao nao pode ser alterada neste status.", "IMPORT_INVALID_STATUS");
  }
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  createUploadMiddleware,
  analyzeImportFile,
  saveImportCache,
  removeTempFile,
  removeImportCache,
  mapImportacao,
  validateImportacao,
  processImportacao,
  cancelImportacao,
  findPreviousImportByHash,
  importErrorWhere,
  suggestMapping,
  getImportLimits,
  UPDATE_STRATEGIES,
};



