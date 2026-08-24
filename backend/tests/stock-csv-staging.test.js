const assert = require("node:assert/strict");
const test = require("node:test");
const { createFileCsvAdapter } = require("../src/stock/adapters/fileCsv");
const { createStockImportService: createIntegrationService, createStockFeatureGate } = require("../src/stock/imports/service");
const { createStockImportService, MAX_CONFIRM_LINES } = require("../src/stock/imports/staging-service");

test("FILE_IMPORT_CSV exige cabecalhos estritos, identidade explicita e metadados portaveis", async () => {
  const adapter = createFileCsvAdapter({ limits: { maxRows: 4 } });
  const preview = await adapter.parsePreview({
    input: Buffer.from([
      "source_product_id,product_name,unit,on_hand,available,available_semantics,source_lot_id,expiry_date,expiry_precision",
      "product-1,Produto de teste,UN,10.125000,8.125000,EXPLICIT,lot-1,2026-12,MONTH",
    ].join("\n")),
    delimiter: "comma",
  });

  assert.equal(preview.schemaVersion, "stock-csv.v1");
  assert.equal(preview.acceptedCount, 1);
  assert.equal(preview.rejectedCount, 0);
  assert.equal(preview.capabilities.PRODUCT_IDENTITY, true);
  assert.equal(preview.capabilities.EXPIRATION_DATE, true);
  assert.equal(preview.capabilities.semantics.quantityRelevantForExpiry, true);
  assert.equal(preview.lines[0].normalized.quantityRelevantForExpiry, true);
  assert.match(preview.lines[0].sourceVersion, /^manual:[a-f0-9]{64}$/);
  assert.deepEqual(preview.lines[0].normalized.expiryDate, "2026-12");
  assert.deepEqual(preview.lines[0].normalized.expiryPrecision, "MONTH");

  await assert.rejects(
    adapter.parsePreview({ input: "source_product_id,token\nproduct-1,secret", delimiter: "comma" }),
    (error) => error.code === "STOCK_CSV_SENSITIVE_HEADER",
  );
  await assert.rejects(
    adapter.parsePreview({ input: "product_name,unit\nProduto,UN", delimiter: "comma" }),
    (error) => error.code === "STOCK_CSV_SOURCE_PRODUCT_ID_REQUIRED",
  );
  const invalidExpiry = await adapter.parsePreview({ input: "source_product_id,unit,on_hand,expiry_date,expiry_precision\np-1,UN,1,2026-00,MONTH", delimiter: "comma" });
  assert.equal(invalidExpiry.lines[0].status, "REJECTED");
  assert.equal(invalidExpiry.lines[0].errors[0].code, "STOCK_CSV_EXPIRY_INVALID");
});

test("servico de importacao fica desligado por padrao antes de consultar Prisma", async () => {
  let calls = 0;
  const prisma = new Proxy({}, { get() { calls += 1; throw new Error("Prisma nao deveria ser consultado"); } });
  const service = createIntegrationService({ prisma, env: {} });
  await assert.rejects(
    service.preview({ empresaId: 1, fonteId: 1, actorUsuarioId: 1, idempotencyKey: "preview-1", content: "source_product_id\np-1", delimiter: "comma" }),
    (error) => error.code === "STOCK_DISABLED",
  );
  assert.equal(calls, 0);
  assert.equal(await createStockFeatureGate({ STOCK_DOMAIN_ENABLED: "true", STOCK_SOURCE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "1" })({ empresaId: 1 }), true);
  assert.equal(await createStockFeatureGate({ STOCK_DOMAIN_ENABLED: "true", STOCK_SOURCE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "1" })({ empresaId: 2 }), false);
});

test("CSV hard cap stays bounded even when a caller requests a larger limit", async () => {
  const adapter = createFileCsvAdapter({ limits: { maxRows: 999999 } });
  const rows = ["source_product_id,unit,on_hand"];
  for (let index = 0; index < 501; index += 1) rows.push(`p-${index},UN,1`);
  await assert.rejects(adapter.parsePreview({ input: rows.join("\n"), delimiter: "comma" }), (error) => error.code === "STOCK_CSV_ROWS_EXCEEDED");
});

test("preview, replay por idempotencia, confirmacao CAS e staging duravel nao persistem arquivo bruto", async () => {
  const prisma = memoryPrisma();
  const adapter = {
    async parsePreview() {
      return {
        schemaVersion: "stock-csv.v1",
        byteSize: 42,
        fileHash: "a".repeat(64),
        capabilities: { PRODUCT_IDENTITY: true },
        rowCount: 2,
        acceptedCount: 1,
        rejectedCount: 1,
        lines: [
          {
            rowNumber: 2,
            rowChecksum: "b".repeat(64),
            sourceRecordId: "product-1",
            sourceVersion: "manual:version-1",
            status: "ACCEPTED",
            normalized: { sourceProductId: "product-1", sourceVersion: "manual:version-1", quantities: { on_hand: "2.000000" } },
            warnings: [],
            errors: [],
          },
          {
            rowNumber: 3,
            rowChecksum: "c".repeat(64),
            sourceRecordId: "invalid-row",
            sourceVersion: null,
            status: "REJECTED",
            normalized: null,
            warnings: [],
            errors: [{ code: "STOCK_CSV_ROW_INVALID", message: "Linha CSV de estoque rejeitada." }],
          },
        ],
      };
    },
  };
  const now = new Date("2026-08-23T18:00:00.000Z");
  const service = createStockImportService({
    prisma,
    adapter,
    clock: () => now,
    featureGate: async () => true,
    applyAcceptedRows: async ({ lines }) => ({ appliedLineIds: lines.map((line) => line.id) }),
  });

  const first = await service.preview({
    empresaId: 1,
    fonteId: 10,
    actorUsuarioId: 100,
    idempotencyKey: "stock-preview-1",
    content: "never persisted",
    delimiter: "comma",
    safeFilename: "../../estoque.csv",
  });
  assert.equal(first.replayed, false);
  assert.equal(first.importacao.status, "READY");
  assert.equal(prisma.state.imports.length, 1);
  assert.equal(Object.hasOwn(prisma.state.imports[0], "content"), false);
  assert.equal(prisma.state.imports[0].safeFilename, ".._.._estoque.csv");
  assert.equal(prisma.state.lines.length, 2);
  assert.equal(prisma.state.lines[0].normalizedJsonSanitized.includes("never persisted"), false);

  const replay = await service.preview({
    empresaId: 1,
    fonteId: 10,
    actorUsuarioId: 100,
    idempotencyKey: "stock-preview-1",
    content: "different content ignored by replay",
    delimiter: "comma",
  });
  assert.equal(replay.replayed, true);
  assert.equal(prisma.state.imports.length, 1);

  const confirmed = await service.confirm({ empresaId: 1, importacaoId: first.importacao.id, actorUsuarioId: 100, expectedRevision: 1, allowPartial: true });
  assert.equal(confirmed.status, "PARTIAL");
  assert.equal(confirmed.syncRunId, 1);
  assert.equal(prisma.state.syncRuns[0].estado, "PARTIAL");
  assert.equal(prisma.state.lines.find((line) => line.status === "APPLIED").appliedAt.toISOString(), now.toISOString());
  assert.equal(prisma.state.audits.some((audit) => audit.action === "STOCK_IMPORT_CONFIRMED"), true);
  assert.equal(prisma.state.capabilities[0].versao, "stock-csv.v1");
});

test("confirmacao recusa staging acima do limite antes de chamar o aplicador", async () => {
  const prisma = memoryPrisma();
  const now = new Date("2026-08-23T18:00:00.000Z");
  prisma.state.imports.push({
    id: 91,
    empresaId: 1,
    fonteId: 10,
    actorUsuarioId: 100,
    status: "READY",
    schemaVersion: "stock-csv.v1",
    fileHash: "d".repeat(64),
    safeFilename: "bounded.csv",
    byteSize: 1024,
    rowCount: MAX_CONFIRM_LINES + 1,
    acceptedCount: MAX_CONFIRM_LINES + 1,
    rejectedCount: 0,
    idempotencyKey: "stock-preview-bounded",
    revision: 1,
    expiresAt: new Date(now.getTime() + 60000),
    retentionUntil: new Date(now.getTime() + 86400000),
  });
  for (let index = 0; index <= MAX_CONFIRM_LINES; index += 1) {
    prisma.state.lines.push({
      id: 1000 + index,
      empresaId: 1,
      importacaoId: 91,
      rowNumber: index + 2,
      rowChecksum: `${index}`.padStart(64, "0"),
      sourceRecordId: `product-${index}`,
      sourceVersion: `manual:${index}`,
      status: "ACCEPTED",
      normalizedJsonSanitized: "{}",
      warningsJson: "[]",
      errorsJson: "[]",
      revision: 1,
    });
  }
  let applied = false;
  const service = createStockImportService({
    prisma,
    clock: () => now,
    featureGate: async () => true,
    applyAcceptedRows: async () => { applied = true; },
  });

  await assert.rejects(
    service.confirm({ empresaId: 1, importacaoId: 91, actorUsuarioId: 100, expectedRevision: 1 }),
    (error) => error.code === "STOCK_IMPORT_BOUNDS_EXCEEDED",
  );
  assert.equal(applied, false);
  assert.equal(prisma.state.imports[0].status, "READY");
});

function memoryPrisma() {
  const state = {
    audits: [],
    imports: [],
    lines: [],
    sources: [{ id: 10, empresaId: 1, tipoFonte: "FILE_IMPORT_CSV", statusCiclo: "ACTIVE", schemaVersion: "stock-csv.v1" }],
    syncRuns: [],
    capabilities: [],
  };
  let importId = 1;
  let lineId = 1;
  let syncRunId = 1;

  const model = {
    fonteEstoque: {
      async findFirst({ where }) {
        return state.sources.find((source) => source.id === where.id && source.empresaId === where.empresaId && source.tipoFonte === where.tipoFonte && source.statusCiclo === where.statusCiclo) || null;
      },
    },
    importacaoEstoque: {
      async findUnique({ where }) {
        const key = where.empresaId_idempotencyKey;
        return withLines(state.imports.find((item) => item.empresaId === key.empresaId && item.idempotencyKey === key.idempotencyKey), state);
      },
      async findFirst({ where }) {
        const found = state.imports.find((item) => matchesImport(item, where));
        return withLines(found, state);
      },
      async count({ where }) {
        return state.imports.filter((item) => matchesImport(item, where)).length;
      },
      async create({ data }) {
        const item = { id: importId++, syncRunId: null, confirmedAt: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        state.imports.push(item);
        return { ...item };
      },
      async updateMany({ where, data }) {
        const matches = state.imports.filter((item) => matchesImport(item, where));
        for (const item of matches) applyData(item, data);
        return { count: matches.length };
      },
    },
    linhaImportacaoEstoque: {
      async createMany({ data }) {
        for (const row of data) state.lines.push({ id: lineId++, appliedAt: null, ...row });
        return { count: data.length };
      },
      async findMany({ where }) {
        return state.lines.filter((line) => line.empresaId === where.empresaId && line.importacaoId === where.importacaoId && (!where.status || line.status === where.status)).sort((left, right) => left.rowNumber - right.rowNumber).map((line) => ({ ...line }));
      },
      async updateMany({ where, data }) {
        const matches = state.lines.filter((line) => line.empresaId === where.empresaId && line.importacaoId === where.importacaoId && (!where.status || line.status === where.status) && (!where.id?.in || where.id.in.includes(line.id)));
        for (const line of matches) applyData(line, data);
        return { count: matches.length };
      },
    },
    eventoAuditoriaEstoque: {
      async create({ data }) { state.audits.push({ ...data }); return data; },
    },
    capacidadeFonteEstoque: {
      async upsert({ create, update }) {
        const existing = state.capabilities.find((row) => row.empresaId === create.empresaId && row.fonteId === create.fonteId && row.codigo === create.codigo && row.versao === create.versao);
        if (existing) Object.assign(existing, update);
        else state.capabilities.push({ ...create });
        return existing || create;
      },
    },
    execucaoSincronizacaoEstoque: {
      async create({ data }) { const item = { id: syncRunId++, revision: 1, ...data }; state.syncRuns.push(item); return { ...item }; },
      async update({ where, data }) { const item = state.syncRuns.find((run) => run.id === where.id); applyData(item, data); return { ...item }; },
    },
  };
  return { ...model, $transaction: async (callback) => callback(model), state };
}

function matchesImport(item, where = {}) {
  if (where.id !== undefined && item.id !== where.id) return false;
  if (where.empresaId !== undefined && item.empresaId !== where.empresaId) return false;
  if (where.actorUsuarioId !== undefined && item.actorUsuarioId !== where.actorUsuarioId) return false;
  if (where.fileHash !== undefined && item.fileHash !== where.fileHash) return false;
  if (where.fonteId !== undefined && item.fonteId !== where.fonteId) return false;
  if (where.schemaVersion !== undefined && item.schemaVersion !== where.schemaVersion) return false;
  if (where.revision !== undefined && item.revision !== where.revision) return false;
  if (where.status !== undefined) {
    if (typeof where.status === "string" && item.status !== where.status) return false;
    if (where.status.in && !where.status.in.includes(item.status)) return false;
  }
  if (where.expiresAt?.gt && !(new Date(item.expiresAt) > where.expiresAt.gt)) return false;
  if (where.expiresAt?.lte && !(new Date(item.expiresAt) <= where.expiresAt.lte)) return false;
  return true;
}

function withLines(item, state) {
  if (!item) return null;
  return { ...item, linhas: state.lines.filter((line) => line.importacaoId === item.id).sort((left, right) => left.rowNumber - right.rowNumber).map((line) => ({ ...line })) };
}

function applyData(target, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && Object.hasOwn(value, "increment")) target[key] = Number(target[key] || 0) + value.increment;
    else target[key] = value;
  }
}
