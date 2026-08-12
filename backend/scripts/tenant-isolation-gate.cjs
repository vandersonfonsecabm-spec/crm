const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { Prisma, PrismaClient } = require("@prisma/client");
const { relationSpecs } = require("./check-tenant-relation-integrity.cjs");
const { classifyPolymorphicRows, POLYMORPHIC_ROWS_QUERY } = require("./tenant-isolation-verifier-utils.cjs");
const { sanitizeFailure: sanitizeVerifierFailure } = require("./tenant-isolation-log-utils.cjs");

const EXPECTED_RELATION_COUNT = 89;
const TENANT_RELATION_MANIFEST_VERSION = 1;
const EXPECTED_TENANT_RELATION_MANIFEST_SHA256 = "4043f4369693a41b2636c1aa4e56c22da1997fb83689c6008aa26a879763c82b";
const DEFAULT_MIGRATION_NAME = "20260801123000_enforce_tenant_safe_relations";
const DEFAULT_MIGRATION_DIR = path.resolve(__dirname, "..", "prisma", "migrations");
const DEFAULT_POSTGRES_MIGRATION_DIR = path.resolve(__dirname, "..", "prisma-postgres", "migrations");

const CASCADE_RELATIONS = new Set([
  "Nota.clienteId->Cliente",
  "HistoricoAcompanhamento.acompanhamentoId->Acompanhamento",
  "IntegracaoOAuthState.usuarioId->Usuario",
  "IntegracaoOAuthState.canalIntegracaoId->CanalIntegracao",
  "SincronizacaoIntegracao.integracaoId->Integracao",
  "ErroIntegracao.integracaoId->Integracao",
  "ProdutoExterno.integracaoId->Integracao",
  "EstoqueExterno.integracaoId->Integracao",
  "EstoqueExterno.produtoExternoId->ProdutoExterno",
  "PrecoExterno.integracaoId->Integracao",
  "PrecoExterno.produtoExternoId->ProdutoExterno",
  "CondicaoPagamentoExterna.integracaoId->Integracao",
  "EmailMailboxAddress.canalIntegracaoId->CanalIntegracao",
  "ContatoCanal.canalIntegracaoId->CanalIntegracao",
  "ConversaCanal.canalIntegracaoId->CanalIntegracao",
  "ConversaCanal.contatoCanalId->ContatoCanal",
  "MetaCredential.canalIntegracaoId->CanalIntegracao",
  "MensagemCanal.canalIntegracaoId->CanalIntegracao",
  "MensagemCanal.conversaCanalId->ConversaCanal",
  "EmailMessageMetadata.mensagemCanalId->MensagemCanal",
  "SessaoUsuario.usuarioId->Usuario",
  "SessaoRefreshToken.sessaoId->SessaoUsuario",
  "TokenRecuperacaoSenha.usuarioId->Usuario",
  "HistoricoPropostaComercial.propostaId->PropostaComercial",
  "AutomacaoExecucao.regraId->AutomacaoRegra",
  "AutomacaoAcaoJob.execucaoId->AutomacaoExecucao",
  "AutomacaoRoundRobinEstado.regraId->AutomacaoRegra",
]);

const GLOBAL_RELATION_EXCEPTIONS = Object.freeze({
  "AuditoriaFuncionalidade.usuarioId->Usuario": Object.freeze({
    fromFields: ["usuarioId"],
    toFields: ["id"],
    scope: "global",
    reason: "AuditoriaFuncionalidade.usuarioId preserva o ator historico global e nullable.",
  }),
  "PlatformTenantAudit.actorUserId->Usuario": Object.freeze({
    fromFields: ["actorUserId"],
    toFields: ["id"],
    scope: "platform",
    reason: "PlatformTenantAudit.actorUserId representa o operador de plataforma global.",
  }),
  "CanalIntegracao.id->MetaCredential": Object.freeze({
    fromFields: ["empresaId", "id", "accessTokenRef"],
    toFields: ["empresaId", "canalIntegracaoId", "reference"],
    scope: "integration",
    reason: "CanalIntegracao aponta para a credencial Meta atual por chave composta opcional e tenant-scoped.",
  }),
});

const MIGRATION_REGISTRY = Object.freeze({
  [DEFAULT_MIGRATION_NAME]: Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "1ed42b8752af6234c4abcb3aaff6805d610819848eb8ab6fbb7e4e67b3532b0c",
    postgresSha256: "d37a4ddbec32dacece4892c8e09bc457ce53a01a3acb973cb4fe02c992a4fa96",
  }),
  "20260801150000_add_user_security_foundation": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "b34acdfebadf0ae3badc55af5ca86a64a1627c3aece46edb414463a3c48dbca7",
    postgresSha256: "176b4502032affd3d779bd968b13094aadc71128681ed937bfffcd0e03776174",
  }),
  "20260811120000_add_meta_credential_store": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
    sqliteSha256: "41e080170602b2ea9adbd2659829d12ba7637bc989263dfaf1bff21910e924af",
    postgresSha256: "c5efb656d5483d53ac48eabb33753fad93107362ebc74b91ca0ca036985ab1ff",
  }),
  "20260811130000_add_meta_oauth_state_binding": Object.freeze({
    relationCount: EXPECTED_RELATION_COUNT,
    relationManifestSha256: "4043f4369693a41b2636c1aa4e56c22da1997fb83689c6008aa26a879763c82b",
    sqliteSha256: "08f76dce5d9b4c1b0d44990d116dfb60dd373bb8b988438e1037a9fc9571c34c",
    postgresSha256: "403951c8fe5fba9e8bc57d739fafab2ad6216c6052ee48380bd270a3586935f4",
  }),
});

class GateFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "GateFailure";
    this.code = code;
  }
}

function relationKey(child, childField, parent) {
  return `${child}.${childField}->${parent}`;
}

function relationSpecKey(spec) {
  return relationKey(spec[1], spec[2], spec[3]);
}

function quotedIdentifier(value) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new GateFailure("TENANT_GATE_IDENTIFIER_INVALID");
  return `"${value}"`;
}

function normalizeFields(fields) {
  return Array.isArray(fields) ? fields.map(String) : [];
}

function expectedDeleteAction(key) {
  return CASCADE_RELATIONS.has(key) ? "Cascade" : "Restrict";
}

function canonicalRelationManifest(specs = relationSpecs, exceptions = GLOBAL_RELATION_EXCEPTIONS) {
  return {
    version: TENANT_RELATION_MANIFEST_VERSION,
    relations: specs.map(([category, child, childField, parent, tenantKey = "empresaId"]) => {
      const key = relationKey(child, childField, parent);
      return {
        category,
        child,
        childField,
        parent,
        tenantKey,
        onDelete: expectedDeleteAction(key),
        onUpdate: "Restrict",
      };
    }),
    exceptions: Object.entries(exceptions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({
        key,
        fromFields: [...value.fromFields],
        toFields: [...value.toFields],
        scope: value.scope,
        reason: value.reason,
      })),
  };
}

function tenantRelationManifestHash(specs = relationSpecs, exceptions = GLOBAL_RELATION_EXCEPTIONS) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalRelationManifest(specs, exceptions)))
    .digest("hex");
}

function loadDatamodel() {
  const datamodel = Prisma?.dmmf?.datamodel;
  if (!datamodel || !Array.isArray(datamodel.models)) throw new GateFailure("TENANT_GATE_DMMF_UNAVAILABLE");
  return datamodel;
}

function scalarField(model, name) {
  return model.fields.find((field) => field.kind === "scalar" && field.name === name);
}

function tenantField(model) {
  return scalarField(model, "empresaId") || scalarField(model, "tenantId");
}

function hasUniqueFields(model, fields) {
  const expected = JSON.stringify(fields);
  return (model.uniqueFields || []).some((candidate) => JSON.stringify(candidate) === expected)
    || (model.uniqueIndexes || []).some((candidate) => JSON.stringify(candidate.fields) === expected);
}

function discoverTenantRelations(datamodel) {
  const models = new Map(datamodel.models.map((model) => [model.name, model]));
  const tenantModels = datamodel.models.filter((model) => tenantField(model));
  const candidates = [];

  for (const child of tenantModels) {
    const childTenant = tenantField(child).name;
    for (const field of child.fields.filter((item) => item.kind === "object" && item.relationFromFields?.length)) {
      const parent = models.get(field.type);
      if (!parent || !scalarField(parent, "empresaId")) continue;
      const fromFields = normalizeFields(field.relationFromFields);
      const toFields = normalizeFields(field.relationToFields);
      const childField = fromFields.find((value) => value !== childTenant);
      if (!childField) throw new GateFailure("TENANT_GATE_RELATION_FIELD_INVALID");
      candidates.push({
        child: child.name,
        childField,
        childTenant,
        field: field.name,
        fromFields,
        parent: parent.name,
        toFields,
        relationOnDelete: field.relationOnDelete || "Restrict",
        relationOnUpdate: field.relationOnUpdate || "Restrict",
      });
    }
  }

  return { models, tenantModels, candidates };
}

function inspectArchitecture({
  datamodel = loadDatamodel(),
  specs = relationSpecs,
  exceptions = GLOBAL_RELATION_EXCEPTIONS,
} = {}) {
  const failures = [];
  if (specs.length !== EXPECTED_RELATION_COUNT) failures.push("TENANT_GATE_RELATION_COUNT_MISMATCH");
  const relationManifestHash = tenantRelationManifestHash(specs, exceptions);
  if (relationManifestHash !== EXPECTED_TENANT_RELATION_MANIFEST_SHA256) {
    failures.push("TENANT_GATE_RELATION_MANIFEST_HASH_MISMATCH");
  }

  const { models, tenantModels, candidates } = discoverTenantRelations(datamodel);
  const composite = new Map();
  const simple = new Map();

  for (const candidate of candidates) {
    const key = relationKey(candidate.child, candidate.childField, candidate.parent);
    const isComposite = candidate.fromFields.includes(candidate.childTenant)
      && candidate.toFields.includes("empresaId")
      && candidate.toFields.includes("id");
    const target = isComposite ? composite : simple;
    if (target.has(key)) failures.push("TENANT_GATE_DUPLICATE_RELATION");
    target.set(key, candidate);
  }

  const seenSpecs = new Set();
  for (const spec of specs) {
    const [, child, childField, parent, tenantKey = "empresaId"] = spec;
    const key = relationKey(child, childField, parent);
    if (seenSpecs.has(key)) failures.push("TENANT_GATE_DUPLICATE_MANIFEST");
    seenSpecs.add(key);
    const candidate = composite.get(key);
    if (!candidate) {
      failures.push("TENANT_RELATION_MISSING_FROM_SCHEMA");
      continue;
    }
    const expectedFrom = [tenantKey, childField];
    const expectedTo = ["empresaId", "id"];
    if (JSON.stringify(candidate.fromFields) !== JSON.stringify(expectedFrom)
      || JSON.stringify(candidate.toFields) !== JSON.stringify(expectedTo)) {
      failures.push("TENANT_RELATION_COMPOSITE_KEY_MISMATCH");
    }
    const parentModel = models.get(parent);
    if (!parentModel || !hasUniqueFields(parentModel, expectedTo)) failures.push("TENANT_PARENT_UNIQUE_MISSING");
    if (candidate.relationOnDelete !== expectedDeleteAction(key)) failures.push("TENANT_RELATION_DELETE_ACTION_MISMATCH");
    if (candidate.relationOnUpdate !== "Restrict") failures.push("TENANT_RELATION_UPDATE_ACTION_MISMATCH");
  }

  for (const [key] of composite) if (!seenSpecs.has(key)) failures.push("TENANT_RELATION_NOT_REGISTERED");

  for (const [key, candidate] of simple) {
    const exception = exceptions[key];
    if (!exception) {
      failures.push("TENANT_RELATION_SIMPLE_UNDOCUMENTED");
      continue;
    }
    if (JSON.stringify(candidate.fromFields) !== JSON.stringify(exception.fromFields)
      || JSON.stringify(candidate.toFields) !== JSON.stringify(exception.toFields)) {
      failures.push("TENANT_RELATION_EXCEPTION_SHAPE_MISMATCH");
    }
  }

  for (const [key, expectedException] of Object.entries(GLOBAL_RELATION_EXCEPTIONS)) {
    const candidate = simple.get(key);
    const exception = exceptions[key];
    if (!candidate || !exception) failures.push("TENANT_RELATION_EXCEPTION_MISSING");
    if (!exception?.reason || !exception?.scope || exception.reason !== expectedException.reason || exception.scope !== expectedException.scope) {
      failures.push("TENANT_RELATION_EXCEPTION_UNDOCUMENTED");
    }
  }

  return {
    failures: [...new Set(failures)],
    relationCount: composite.size,
    relationManifestHash,
    tenantModelCount: tenantModels.length,
    discovered: { composite, simple, models },
  };
}

function databaseUrl(env = process.env) {
  const value = String(env.POSTGRES_DATABASE_URL || env.DATABASE_URL || "").trim();
  if (!value) throw new GateFailure("TENANT_GATE_DATABASE_URL_MISSING");
  if (!/^postgres(ql)?:\/\//i.test(value) && !/^file:/i.test(value)) {
    throw new GateFailure("TENANT_GATE_DATABASE_PROTOCOL_INVALID");
  }
  return value;
}

function databaseKind(url) {
  return /^file:/i.test(url) ? "sqlite" : "postgresql";
}

function migrationDirectories(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(directory, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && char === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote && sql[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function sqlTokens(statement) {
  return String(statement).toUpperCase().match(/[A-Z][A-Z0-9_]*/g) || [];
}

function migrationTouchesTenantRelations(sql, architecture) {
  const tenantTables = new Set();
  for (const candidate of architecture.discovered.composite.values()) {
    tenantTables.add(candidate.child.toUpperCase());
    tenantTables.add(candidate.parent.toUpperCase());
  }
  for (const statement of splitSqlStatements(sql)) {
    const tokens = sqlTokens(statement);
    const hasForeignKey = tokens.includes("FOREIGN") && tokens.includes("KEY");
    const hasReference = tokens.includes("REFERENCES");
    const hasConstraintChange = tokens.includes("CONSTRAINT") && (tokens.includes("ADD") || tokens.includes("DROP"));
    const hasUniqueChange = tokens.includes("UNIQUE") && (tokens.includes("INDEX") || tokens.includes("CONSTRAINT"));
    if (!(hasForeignKey || hasReference || hasConstraintChange || hasUniqueChange)) continue;
    if (tokens.some((token) => tenantTables.has(token))) return true;
  }
  return false;
}

function createdTablesFromMigrationSql(sql) {
  const created = new Set();
  for (const statement of splitSqlStatements(sql)) {
    const tokens = sqlTokens(statement);
    const createIndex = tokens.indexOf("CREATE");
    if (createIndex < 0 || tokens[createIndex + 1] !== "TABLE") continue;
    let tableIndex = createIndex + 2;
    if (tokens[tableIndex] === "IF" && tokens[tableIndex + 1] === "NOT" && tokens[tableIndex + 2] === "EXISTS") {
      tableIndex += 3;
    }
    if (tokens[tableIndex]) created.add(tokens[tableIndex]);
  }
  return created;
}

function createdTablesThroughMigrations(directory, migrationName) {
  if (!directory || !fs.existsSync(directory)) return new Set();
  const names = migrationDirectories(directory);
  const selected = migrationName ? names.filter((name) => name <= migrationName) : names;
  const created = new Set();
  for (const name of selected) {
    const file = path.join(directory, name, "migration.sql");
    if (!fs.existsSync(file)) continue;
    for (const table of createdTablesFromMigrationSql(fs.readFileSync(file, "utf8"))) created.add(table);
  }
  return created;
}

async function pendingMigrationNames({ url, directory, migrationName }) {
  const canonical = migrationDirectories(directory);
  if (canonical.length === 0) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_UNKNOWN");
  const expectedLatest = canonical.at(-1);
  if (migrationName && migrationName !== expectedLatest) throw new GateFailure("TENANT_GATE_MIGRATION_LATEST_MISMATCH");
  const kind = databaseKind(url);
  let rows = [];
  let appTableCount = 0;
  if (kind === "postgresql") {
    const client = new Client({ connectionString: url, statement_timeout: 30000 });
    await client.connect();
    try {
      const tables = await client.query("SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()");
      appTableCount = tables.rows.filter((row) => String(row.name) !== "_prisma_migrations").length;
      if (tables.rows.some((row) => row.name === "_prisma_migrations")) {
        rows = (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at, id')).rows;
      }
    } finally { await client.end(); }
  } else {
    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
      const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
      appTableCount = tables.filter((row) => String(row.name) !== "_prisma_migrations").length;
      if (tables.some((row) => row.name === "_prisma_migrations")) {
        rows = await prisma.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at, id');
      }
    } finally { await prisma.$disconnect(); }
  }
  if (rows.length === 0 && appTableCount > 0) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_MISSING");
  const uniqueApplied = validateMigrationHistory(canonical, rows, appTableCount);
  return canonical.slice(uniqueApplied.length);
}

function validateMigrationHistory(canonical, rows, appTableCount = 0) {
  if (rows.length === 0 && appTableCount > 0) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_MISSING");
  const applied = [];
  for (const row of rows) {
    const name = String(row.migration_name || "");
    if (!canonical.includes(name)) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_UNKNOWN");
    if (!row.finished_at || row.rolled_back_at) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_DIRTY");
    applied.push(name);
  }
  const uniqueApplied = [...new Set(applied)];
  if (uniqueApplied.length !== applied.length) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_DUPLICATE");
  for (let index = 0; index < uniqueApplied.length; index += 1) {
    if (uniqueApplied[index] !== canonical[index]) throw new GateFailure("TENANT_GATE_MIGRATION_HISTORY_OUT_OF_ORDER");
  }
  return uniqueApplied;
}

async function createdTablesForPendingMigrations({ url, directory, migrationName }) {
  const pending = await pendingMigrationNames({ url, directory, migrationName });
  const created = new Set();
  for (const name of pending) {
    const file = path.join(directory, name, "migration.sql");
    for (const table of createdTablesFromMigrationSql(fs.readFileSync(file, "utf8"))) created.add(table);
  }
  return created;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function inferHashKey(directory) {
  const normalized = path.resolve(directory).replace(/\\/g, "/");
  if (normalized.includes("/prisma-postgres/")) return "postgresSha256";
  if (normalized.includes("/prisma/migrations")) return "sqliteSha256";
  return null;
}

function assertMigrationRegistration({
  architecture,
  migrationDir,
  migrationName,
  sqliteMigrationDir,
  postgresMigrationDir,
} = {}) {
  const directories = [
    { directory: sqliteMigrationDir, hashKey: "sqliteSha256" },
    { directory: postgresMigrationDir, hashKey: "postgresSha256" },
    ...(!sqliteMigrationDir && !postgresMigrationDir && migrationDir
      ? [{ directory: migrationDir, hashKey: inferHashKey(migrationDir) }]
      : []),
  ].filter((item) => item.directory);
  if (directories.length === 0) return { migrationName: null, relationAffecting: false };

  const resolvedName = migrationName || migrationDirectories(directories[0].directory).at(-1);
  if (!resolvedName) throw new GateFailure("TENANT_GATE_MIGRATION_MISSING");
  const registry = MIGRATION_REGISTRY[resolvedName];
  let relationAffecting = false;
  let createdTables = null;

  for (const { directory, hashKey } of directories) {
    const file = path.join(directory, resolvedName, "migration.sql");
    if (!fs.existsSync(file)) throw new GateFailure("TENANT_GATE_MIGRATION_FILE_MISSING");
    const sql = fs.readFileSync(file, "utf8");
    relationAffecting ||= migrationTouchesTenantRelations(sql, architecture);
    const providerCreatedTables = createdTablesFromMigrationSql(sql);
    if (createdTables && JSON.stringify([...createdTables].sort()) !== JSON.stringify([...providerCreatedTables].sort())) {
      throw new GateFailure("TENANT_GATE_MIGRATION_PROVIDER_DRIFT");
    }
    createdTables = providerCreatedTables;
    if (registry && hashKey && registry[hashKey] !== sha256(file)) throw new GateFailure("TENANT_GATE_MIGRATION_HASH_MISMATCH");
  }

  if (relationAffecting && !registry) throw new GateFailure("TENANT_GATE_MIGRATION_UNREGISTERED");
  if (registry && registry.relationCount !== relationSpecs.length) throw new GateFailure("TENANT_GATE_REGISTRY_RELATION_COUNT_MISMATCH");
  if (registry && registry.relationManifestSha256 !== architecture.relationManifestHash) {
    throw new GateFailure("TENANT_GATE_REGISTRY_MANIFEST_HASH_MISMATCH");
  }
  const result = { migrationName: resolvedName, relationAffecting };
  Object.defineProperty(result, "createdTables", { value: createdTables || new Set(), enumerable: false });
  return result;
}

function allRelationTables() {
  const tables = new Set();
  for (const [, child, , parent] of relationSpecs) {
    tables.add(child);
    tables.add(parent);
  }
  tables.add("AutomacaoExecucao");
  tables.add("Lead");
  tables.add("Negocio");
  return [...tables];
}

function failureIfUnsafe(result) {
  const totals = result.relations.reduce(
    (sum, item) => ({ orphaned: sum.orphaned + item.orphaned, crossed: sum.crossed + item.crossed }),
    { orphaned: 0, crossed: 0 },
  );
  const polymorphicUnsafe = [
    "invalid_pilot_synthetic",
    "orphaned_lead",
    "crossed_lead",
    "incoherent_lead",
    "orphaned_business",
    "crossed_business",
    "incoherent_business",
  ].some((key) => result.polymorphic[key] > 0);
  if (totals.orphaned > 0 || totals.crossed > 0 || polymorphicUnsafe) throw new GateFailure("TENANT_GATE_DATA_INTEGRITY_FAILED");
  return { totals, polymorphic: result.polymorphic };
}

async function queryRows(client, sql) {
  const result = await client.query(sql);
  return Array.isArray(result) ? result : result.rows;
}

async function relationCount(client, spec, kind) {
  const [, child, foreignKey, parent, tenantKey = "empresaId"] = spec;
  const sql = kind === "postgresql"
    ? `SELECT COUNT(*) FILTER (WHERE p."id" IS NULL)::int AS orphaned, COUNT(*) FILTER (WHERE p."id" IS NOT NULL AND p."empresaId" <> c.${quotedIdentifier(tenantKey)})::int AS crossed FROM ${quotedIdentifier(child)} c LEFT JOIN ${quotedIdentifier(parent)} p ON p."id" = c.${quotedIdentifier(foreignKey)} WHERE c.${quotedIdentifier(foreignKey)} IS NOT NULL`
    : `SELECT COALESCE(SUM(CASE WHEN p."id" IS NULL THEN 1 ELSE 0 END), 0) AS orphaned, COALESCE(SUM(CASE WHEN p."id" IS NOT NULL AND p."empresaId" <> c.${quotedIdentifier(tenantKey)} THEN 1 ELSE 0 END), 0) AS crossed FROM ${quotedIdentifier(child)} c LEFT JOIN ${quotedIdentifier(parent)} p ON p."id" = c.${quotedIdentifier(foreignKey)} WHERE c.${quotedIdentifier(foreignKey)} IS NOT NULL`;
  const row = (await queryRows(client, sql))[0] || {};
  return { category: spec[0], relation: relationSpecKey(spec), orphaned: Number(row.orphaned || 0), crossed: Number(row.crossed || 0) };
}

async function polymorphicCount(client) {
  const rows = await queryRows(client, POLYMORPHIC_ROWS_QUERY);
  return classifyPolymorphicRows(rows);
}

async function listTables(client, kind) {
  const rows = kind === "postgresql"
    ? (await queryRows(client, "SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()"))
    : (await queryRows(client, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"));
  return new Set(rows.map((row) => String(row.name)));
}

function relationSpecsForExistingSchema(tables, allowedMissingTables = new Set()) {
  const required = allRelationTables();
  const missing = required.filter((table) => !tables.has(table));
  const allowed = new Set([...allowedMissingTables].map((table) => String(table).toUpperCase()));
  if (missing.some((table) => !allowed.has(table.toUpperCase()))) {
    throw new GateFailure("TENANT_GATE_SCHEMA_INCOMPLETE");
  }
  for (const [, child, , parent] of relationSpecs) {
    if (!tables.has(parent) && tables.has(child)) {
      throw new GateFailure("TENANT_GATE_SCHEMA_INCOMPLETE");
    }
  }
  return relationSpecs.filter(([, child, , parent]) => tables.has(child) && tables.has(parent));
}

async function inspectData(client, kind, { allowEmpty = false, allowedMissingTables = new Set() } = {}) {
  const tables = await listTables(client, kind);
  const required = allRelationTables();
  const present = required.filter((table) => tables.has(table));
  if (present.length === 0) {
    if (allowEmpty) return { emptyDatabase: true, relations: [], polymorphic: {} };
    throw new GateFailure("TENANT_GATE_SCHEMA_EMPTY");
  }
  const inspectableSpecs = relationSpecsForExistingSchema(tables, allowedMissingTables);
  const relations = [];
  for (const spec of inspectableSpecs) relations.push(await relationCount(client, spec, kind));
  const polymorphic = await polymorphicCount(client);
  const result = failureIfUnsafe({ relations, polymorphic });
  return { emptyDatabase: false, relations, ...result };
}

function expectedConstraintKey(child, childColumns, parent, parentColumns) {
  return `${child}|${childColumns.join(",")}|${parent}|${parentColumns.join(",")}`;
}

function allowedConstraintKeys() {
  const allowed = new Set();
  for (const [, child, childField, parent, tenantKey = "empresaId"] of relationSpecs) {
    allowed.add(expectedConstraintKey(child, [tenantKey, childField], parent, ["empresaId", "id"]));
  }
  for (const [key, exception] of Object.entries(GLOBAL_RELATION_EXCEPTIONS)) {
    const [left, parent] = key.split("->");
    const [child, childField] = left.split(".");
    allowed.add(expectedConstraintKey(child, exception.fromFields, parent, exception.toFields));
  }
  return allowed;
}

function expectedConstraintActions(child, childField, parent) {
  const key = relationKey(child, childField, parent);
  return { onDelete: expectedDeleteAction(key), onUpdate: "Restrict" };
}

async function postgresForeignKeys(client) {
  const rows = (await client.query(`SELECT child.relname AS "child", parent.relname AS "parent", constraint_row.confdeltype AS "deleteAction", constraint_row.confupdtype AS "updateAction", ARRAY(SELECT child_attribute.attname FROM unnest(constraint_row.conkey) WITH ORDINALITY AS column_list(attnum, ord) JOIN pg_attribute child_attribute ON child_attribute.attrelid = constraint_row.conrelid AND child_attribute.attnum = column_list.attnum ORDER BY column_list.ord) AS "childColumns", ARRAY(SELECT parent_attribute.attname FROM unnest(constraint_row.confkey) WITH ORDINALITY AS column_list(attnum, ord) JOIN pg_attribute parent_attribute ON parent_attribute.attrelid = constraint_row.confrelid AND parent_attribute.attnum = column_list.attnum ORDER BY column_list.ord) AS "parentColumns" FROM pg_constraint constraint_row JOIN pg_class child ON child.oid = constraint_row.conrelid JOIN pg_class parent ON parent.oid = constraint_row.confrelid JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace WHERE constraint_row.contype = 'f' AND child_namespace.nspname = current_schema()`)).rows;
  return rows.map((row) => ({
    ...row,
    childColumns: normalizeDatabaseArray(row.childColumns),
    parentColumns: normalizeDatabaseArray(row.parentColumns),
  }));
}

function normalizeDatabaseArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value.slice(1, -1).split(",").filter(Boolean).map((item) => item.replace(/^"|"$/g, ""));
  }
  if (value && typeof value === "object") return Object.values(value).map(String);
  throw new GateFailure("TENANT_GATE_DATABASE_ARRAY_INVALID");
}

function postgresAction(code) {
  return { a: "NoAction", r: "Restrict", c: "Cascade", n: "SetNull", d: "SetDefault" }[code] || "Unknown";
}

function canonicalAction(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  return {
    noaction: "NoAction",
    restrict: "Restrict",
    cascade: "Cascade",
    setnull: "SetNull",
    setdefault: "SetDefault",
  }[normalized] || "Unknown";
}

async function postgresUniqueKeys(client) {
  const rows = (await client.query(`SELECT table_class.relname AS "table", ARRAY(SELECT attribute.attname FROM unnest(index_row.indkey) WITH ORDINALITY AS column_list(attnum, ord) JOIN pg_attribute attribute ON attribute.attrelid = index_row.indrelid AND attribute.attnum = column_list.attnum ORDER BY column_list.ord) AS "columns" FROM pg_index index_row JOIN pg_class table_class ON table_class.oid = index_row.indrelid JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace WHERE index_row.indisunique AND table_namespace.nspname = current_schema()`)).rows;
  return rows.map((row) => ({ ...row, columns: normalizeDatabaseArray(row.columns) }));
}

async function sqliteForeignKeys(client, tables) {
  const result = [];
  for (const table of tables) {
    const rows = await queryRows(client, `PRAGMA foreign_key_list(${quotedIdentifier(table)})`);
    const groups = new Map();
    for (const row of rows) {
      const id = Number(row.id);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(row);
    }
    for (const group of groups.values()) {
      group.sort((left, right) => Number(left.seq) - Number(right.seq));
      result.push({
        child: table,
        parent: String(group[0].table),
        childColumns: group.map((row) => String(row.from)),
        parentColumns: group.map((row) => String(row.to)),
        deleteAction: String(group[0].on_delete || "NoAction").replace(" ", ""),
        updateAction: String(group[0].on_update || "NoAction").replace(" ", ""),
      });
    }
  }
  return result;
}

async function sqliteUniqueKeys(client, tables) {
  const result = [];
  for (const table of tables) {
    const indexes = await queryRows(client, `PRAGMA index_list(${quotedIdentifier(table)})`);
    for (const index of indexes.filter((row) => Number(row.unique) === 1)) {
      const columns = await queryRows(client, `PRAGMA index_info(${quotedIdentifier(String(index.name))})`);
      result.push({ table, columns: columns.sort((left, right) => Number(left.seqno) - Number(right.seqno)).map((row) => String(row.name)) });
    }
  }
  return result;
}

async function inspectConstraints(client, kind, architecture) {
  const actual = kind === "postgresql"
    ? await postgresForeignKeys(client)
    : await sqliteForeignKeys(client, allRelationTables());
  const uniques = kind === "postgresql"
    ? await postgresUniqueKeys(client)
    : await sqliteUniqueKeys(client, [...new Set(relationSpecs.map((spec) => spec[3]))]);
  const allowed = allowedConstraintKeys();
  const actualKeys = new Set();
  for (const row of actual) {
    const key = expectedConstraintKey(row.child, row.childColumns, row.parent, row.parentColumns);
    const isTenantParent = architecture.discovered.models.get(row.parent)?.fields?.some((field) => field.kind === "scalar" && field.name === "empresaId");
    const isTenantChild = Boolean(tenantField(architecture.discovered.models.get(row.child) || { fields: [] }));
    if (isTenantParent && isTenantChild && !allowed.has(key)) throw new GateFailure("TENANT_GATE_CONSTRAINT_UNREGISTERED");
    if (allowed.has(key)) actualKeys.add(key);
    if (!allowed.has(key)) continue;
    const expected = expectedConstraintActions(row.child, row.childColumns.find((field) => field !== "empresaId" && field !== "tenantId") || row.childColumns[0], row.parent);
    const onDelete = kind === "postgresql" ? postgresAction(row.deleteAction) : canonicalAction(row.deleteAction);
    const onUpdate = kind === "postgresql" ? postgresAction(row.updateAction) : canonicalAction(row.updateAction);
    if (row.childColumns.length > 1 && (onDelete !== expected.onDelete || onUpdate !== expected.onUpdate)) {
      const error = new GateFailure("TENANT_GATE_CONSTRAINT_ACTION_MISMATCH");
      error.relation = key;
      error.expected = expected;
      error.actual = { onDelete, onUpdate };
      throw error;
    }
  }
  for (const [, child, childField, parent, tenantKey = "empresaId"] of relationSpecs) {
    const key = expectedConstraintKey(child, [tenantKey, childField], parent, ["empresaId", "id"]);
    if (!actualKeys.has(key)) throw new GateFailure("TENANT_GATE_CONSTRAINT_MISSING");
  }
  for (const [relation, exception] of Object.entries(GLOBAL_RELATION_EXCEPTIONS)) {
    const [left, parent] = relation.split("->");
    const [child, childField] = left.split(".");
    const key = expectedConstraintKey(child, exception.fromFields, parent, exception.toFields);
    if (!actualKeys.has(key)) throw new GateFailure("TENANT_GATE_EXCEPTION_CONSTRAINT_MISSING");
  }
  for (const [, , , parent] of relationSpecs) {
    const found = uniques.some((row) => row.table === parent && JSON.stringify(row.columns) === JSON.stringify(["empresaId", "id"]));
    if (!found) throw new GateFailure("TENANT_GATE_PARENT_UNIQUE_MISSING");
  }
  return { checkedForeignKeys: actual.length, checkedUniqueParents: new Set(relationSpecs.map((spec) => spec[3])).size };
}

async function inspectPostgres({ mode, env, architecture, allowEmpty, allowedMissingTables }) {
  const url = databaseUrl(env);
  const client = new Client({ connectionString: url, statement_timeout: 30000 });
  await client.connect();
  let rolledBack = false;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const data = await inspectData(client, "postgresql", { allowEmpty, allowedMissingTables });
    const constraints = data.emptyDatabase || mode === "pre-migration" ? null : await inspectConstraints(client, "postgresql", architecture);
    await client.query("ROLLBACK");
    rolledBack = true;
    return { database: "postgresql", data, constraints, rolledBack };
  } finally {
    if (!rolledBack) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    await client.end();
  }
}

async function inspectSqlite({ mode, env, architecture, allowEmpty, allowedMissingTables }) {
  const url = databaseUrl(env);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$connect();
    await prisma.$queryRawUnsafe("PRAGMA query_only = ON");
    const data = await inspectData({ query: (sql) => prisma.$queryRawUnsafe(sql) }, "sqlite", { allowEmpty, allowedMissingTables });
    const constraints = data.emptyDatabase || mode === "pre-migration" ? null : await inspectConstraints({ query: (sql) => prisma.$queryRawUnsafe(sql) }, "sqlite", architecture);
    return { database: "sqlite", data, constraints, rolledBack: false };
  } finally {
    await prisma.$disconnect();
  }
}

function sanitizeFailure(error) {
  return sanitizeVerifierFailure(error, "tenant-isolation-gate");
}

async function runGate({
  mode,
  env = process.env,
  datamodel,
  specs = relationSpecs,
  exceptions = GLOBAL_RELATION_EXCEPTIONS,
  schemaPath,
  migrationDir,
  migrationName,
  sqliteMigrationDir,
  postgresMigrationDir,
} = {}) {
  if (!["architecture", "pre-migration", "post-migration", "production-readonly"].includes(mode)) {
    throw new GateFailure("TENANT_GATE_MODE_INVALID");
  }
  if (schemaPath && (!fs.existsSync(schemaPath) || !fs.statSync(schemaPath).isFile())) throw new GateFailure("TENANT_GATE_SCHEMA_MISSING");
  const architecture = inspectArchitecture({ datamodel: datamodel || loadDatamodel(), specs, exceptions });
  if (architecture.failures.length > 0) throw new GateFailure(architecture.failures[0]);
  const migration = assertMigrationRegistration({ architecture, migrationDir, migrationName, sqliteMigrationDir, postgresMigrationDir });
  if (mode === "architecture") return {
    mode,
    safe: true,
    relationCount: architecture.relationCount,
    relationManifestHash: architecture.relationManifestHash,
    migration,
  };

  const url = databaseUrl(env);
  const kind = databaseKind(url);
  const migrationDirectory = sqliteMigrationDir || postgresMigrationDir || migrationDir;
  const allowedMissingTables = mode === "pre-migration"
    ? await createdTablesForPendingMigrations({ url: databaseUrl(env), directory: migrationDirectory, migrationName: migration.migrationName })
    : new Set();
  const database = kind === "postgresql"
    ? await inspectPostgres({ mode, env, architecture, allowEmpty: mode === "pre-migration", allowedMissingTables })
    : await inspectSqlite({ mode, env, architecture, allowEmpty: mode === "pre-migration", allowedMissingTables });
  if (mode === "production-readonly" && database.database !== "postgresql") throw new GateFailure("TENANT_GATE_PRODUCTION_POSTGRES_REQUIRED");
  return {
    mode,
    safe: true,
    relationCount: architecture.relationCount,
    relationManifestHash: architecture.relationManifestHash,
    migration,
    database: database.database,
    emptyDatabase: database.data.emptyDatabase,
    totals: database.data.totals || { orphaned: 0, crossed: 0 },
    polymorphic: database.data.polymorphic || {},
    constraints: database.constraints,
    rolledBack: database.rolledBack,
  };
}

async function runCli({ defaultMode } = {}) {
  const args = process.argv.slice(2);
  const mode = args[0] || defaultMode;
  const options = { mode };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!["--schema", "--migration-dir", "--migration-name", "--sqlite-migration-dir", "--postgres-migration-dir"].includes(arg)) {
      throw new GateFailure("TENANT_GATE_ARGUMENT_INVALID");
    }
    options[arg.slice(2).replaceAll("-", "")] = args[++index];
  }
  const result = await runGate({
    ...options,
    schemaPath: options.schema,
    migrationDir: options.migrationdir,
    migrationName: options.migrationname,
    sqliteMigrationDir: options.sqlitemigrationdir,
    postgresMigrationDir: options.postgresmigrationdir,
  });
  console.log(JSON.stringify({ event: "tenant_isolation_gate", ...result }));
  return result;
}

if (require.main === module) {
  runCli()
    .catch((error) => {
      console.error(JSON.stringify({ event: "tenant_isolation_gate", safe: false, error: sanitizeFailure(error) }));
      process.exitCode = 1;
    });
}

module.exports = {
  CASCADE_RELATIONS,
  DEFAULT_MIGRATION_NAME,
  GLOBAL_RELATION_EXCEPTIONS,
  MIGRATION_REGISTRY,
  EXPECTED_RELATION_COUNT,
  TENANT_RELATION_MANIFEST_VERSION,
  EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
  GateFailure,
  canonicalRelationManifest,
  createdTablesFromMigrationSql,
  createdTablesThroughMigrations,
  validateMigrationHistory,
  failureIfUnsafe,
  inspectArchitecture,
  migrationTouchesTenantRelations,
  relationSpecsForExistingSchema,
  runCli,
  runGate,
  sanitizeFailure,
  tenantRelationManifestHash,
};
