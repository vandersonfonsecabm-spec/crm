const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runGate } = require("./tenant-isolation-gate.cjs");
const {
  createPrismaFailure,
  sanitizeFailure: sanitizeVerifierFailure,
  sanitizePrismaOutput,
} = require("./tenant-isolation-log-utils.cjs");

const backendDir = path.resolve(__dirname, "..");
const sqliteSchemaPath = path.join(backendDir, "prisma", "schema.prisma");
const versionedPostgresMigrationsDir = path.join(
  backendDir,
  "prisma-postgres",
  "migrations",
);
const workspaceRoot = path.join(
  backendDir,
  "node_modules",
  ".cache",
  "crm-postgres-prisma",
);
const postgresTestWorkspaceRoot = path.join(os.tmpdir(), "crm-prisma-tests");
const migrationName = "20260728090000_postgres_baseline";
const POSTGRES_MIGRATE_CONFIRMATION = "apply-empty-postgres";

function preparePostgresWorkspace(options = {}) {
  const root = path.resolve(options.root || path.join(workspaceRoot, stableWorkspaceId()));
  const prismaDir = path.join(root, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const migrationDir = path.join(migrationsDir, migrationName);
  const schemaPath = path.join(prismaDir, "schema.prisma");
  const clientOutput = path.resolve(options.clientOutput || path.join(backendDir, "node_modules", ".prisma", "client"));
  const clientLoaderPath = options.writeClientLoader ? path.join(root, "prisma-client-alias.cjs") : null;
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.writeFileSync(schemaPath, postgresSchemaWithClientOutput(postgresSchemaText(fs.readFileSync(sqliteSchemaPath, "utf8")), clientOutput.replace(/\\/g, "/")));
  fs.rmSync(migrationsDir, { recursive: true, force: true });
  if (Object.hasOwn(options, "migrationSql")) {
    fs.mkdirSync(migrationDir, { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, "migration_lock.toml"), 'provider = "postgresql"\n');
    fs.writeFileSync(path.join(migrationDir, "migration.sql"), options.migrationSql);
  } else {
    fs.cpSync(versionedPostgresMigrationsDir, migrationsDir, { recursive: true });
  }
  if (clientLoaderPath) writePostgresClientLoader(clientLoaderPath, clientOutput);
  return { root, prismaDir, migrationsDir, migrationDir, schemaPath, migrationName, clientOutput, clientLoaderPath };
}

function createPostgresTestWorkspace() {
  fs.mkdirSync(postgresTestWorkspaceRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(postgresTestWorkspaceRoot, "postgres-prisma-"));
  try {
    const configPath = ensureWorkspaceProjectRoot(root);
    return { ...preparePostgresWorkspace({ root, clientOutput: path.join(root, "client"), writeClientLoader: true }), configPath };
  } catch (error) {
    cleanupPostgresTestWorkspace(root);
    throw error;
  }
}

function cleanupPostgresTestWorkspace(root) {
  const safeRoot = assertPostgresTestWorkspaceRoot(root);
  fs.rmSync(safeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

function postgresTestWorkspaceOptions(root) {
  const safeRoot = assertPostgresTestWorkspaceRoot(root);
  return { root: safeRoot, clientOutput: path.join(safeRoot, "client"), writeClientLoader: true };
}

function assertPostgresTestWorkspaceRoot(value) {
  const root = path.resolve(String(value || ""));
  if (!isPathInside(root, postgresTestWorkspaceRoot)) throw new Error("Workspace PostgreSQL de teste deve permanecer em %TEMP%\\crm-prisma-tests.");
  if (fs.existsSync(root)) {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Workspace PostgreSQL de teste deve ser um diretorio regular.");
    const realRoot = path.resolve(fs.realpathSync.native(root));
    if (!isPathInside(realRoot, postgresTestWorkspaceRoot)) throw new Error("Workspace PostgreSQL de teste nao pode resolver fora de %TEMP%\\crm-prisma-tests.");
  }
  return root;
}

function isPathInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function writePostgresClientLoader(loaderPath, clientOutput) {
  const clientDefaultPath = path.join(path.resolve(clientOutput), "default.js");
  fs.writeFileSync(loaderPath, [
    'const Module = require("node:module");',
    `const clientDefaultPath = ${JSON.stringify(clientDefaultPath)};`,
    "const originalResolveFilename = Module._resolveFilename;",
    "Module._resolveFilename = function(request, parent, isMain, options) {",
    '  if (request === ".prisma/client/default") return clientDefaultPath;',
    "  return originalResolveFilename.call(this, request, parent, isMain, options);",
    "};",
    "",
  ].join("\n"));
  return loaderPath;
}

function parsePostgresCliArguments(rawArgs) {
  const positional = [];
  let testWorkspace = null;
  for (let index = 0; index < rawArgs.length; index += 1) {
    const value = rawArgs[index];
    if (value !== "--test-workspace") { positional.push(value); continue; }
    if (testWorkspace || index + 1 >= rawArgs.length) throw new Error("--test-workspace exige exatamente um diretorio temporario.");
    testWorkspace = rawArgs[index + 1];
    index += 1;
  }
  return { positional, workspaceOptions: testWorkspace ? postgresTestWorkspaceOptions(testWorkspace) : {} };
}

function latestMigrationSqlPath(migrationsDir) {
  const migrationNames = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  const latestMigration = migrationNames.at(-1);
  if (!latestMigration) throw new Error("Nenhuma migration PostgreSQL versionada foi encontrada.");
  return path.join(migrationsDir, latestMigration, "migration.sql");
}

function latestMigrationName(migrationsDir) {
  const migrationNames = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  const latestMigration = migrationNames.at(-1);
  if (!latestMigration) throw new Error("Nenhuma migration PostgreSQL versionada foi encontrada.");
  return latestMigration;
}

function postgresSchemaText(sqliteSchema) {
  const replaced = sqliteSchema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  if (replaced === sqliteSchema) throw new Error("Provider SQLite nao encontrado no schema Prisma canonico.");
  return replaced;
}

function postgresSchemaWithClientOutput(schema, outputPath) {
  return schema.replace(/generator\s+client\s*{([\s\S]*?)}/, (block, body) => {
    if (/^\s*output\s*=/m.test(body)) return block;
    return `generator client {${body}  output   = "${outputPath}"\n}`;
  });
}

function generatePostgresMigrationSql(schemaPath) {
  const prismaCli = resolvePrismaCli();
  const result = spawnSync(process.execPath, [
    prismaCli,
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    schemaPath,
    "--script",
  ], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0) {
    throw createPrismaFailure("migration-sql", result.stderr || result.stdout);
  }
  return result.stdout;
}

function runPrisma(args, env = process.env) {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), ...args], {
    cwd: backendDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw createPrismaFailure(`prisma-${args[0] || "command"}`, result.error.message);
  if (result.status !== 0) throw createPrismaFailure(`prisma-${args[0] || "command"}`, `${result.stderr || ""}\n${result.stdout || ""}`);
}

function postgresUrlFromEnv(env = process.env) {
  const value = String(env.POSTGRES_TEST_DATABASE_URL || env.POSTGRES_TARGET_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    throw new Error("Informe POSTGRES_TEST_DATABASE_URL ou POSTGRES_TARGET_URL com postgresql://.");
  }
  return value;
}

function assertWriteConfirmation(env = process.env) {
  if (env.CRM_POSTGRES_MIGRATE_CONFIRM !== POSTGRES_MIGRATE_CONFIRMATION) {
    throw postgresMigrationError("POSTGRES_MIGRATE_CONFIRMATION_REQUIRED");
  }
}

function ensureWorkspaceProjectRoot(root) {
  // Prisma 6 infers the project root from the temporary schema path. Without
  // a package boundary it walks to `/` and attempts a network auto-install of
  // Prisma during `generate`, which makes the QA runner fail even when the
  // application database and target are healthy. A minimal private manifest
  // keeps generation local and contains no dependency or secret.
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) fs.writeFileSync(packagePath, '{"private":true}\n', { encoding: "utf8", flag: "wx", mode: 0o600 });
  const configPath = path.join(root, "prisma.config.cjs");
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, [
    'const { defineConfig } = require("prisma/config");',
    "module.exports = defineConfig({",
    '  schema: "./prisma/schema.prisma",',
    '  datasource: { url: "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder" },',
    "});",
    "",
  ].join("\n"), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return configPath;
}

function assertPostgresMigrateEmptyAuthorization(env = process.env) {
  assertWriteConfirmation(env);
  if (isRailwayEnvironment(env)) throw postgresMigrationError("POSTGRES_MIGRATE_ISOLATED_TARGET_REQUIRED");

  const target = String(env.CRM_POSTGRES_MIGRATE_TARGET || "").trim().toLowerCase();
  if (target !== "isolated") throw postgresMigrationError("POSTGRES_MIGRATE_TARGET_CONFIRMATION_REQUIRED");

  const databaseUrl = postgresUrlFromEnv(env);
  const targetFingerprint = postgresTargetFingerprint(databaseUrl);
  const expectedFingerprint = String(env.CRM_POSTGRES_MIGRATE_TARGET_FINGERPRINT || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
    throw postgresMigrationError("POSTGRES_MIGRATE_TARGET_FINGERPRINT_REQUIRED");
  }
  if (!crypto.timingSafeEqual(Buffer.from(expectedFingerprint, "hex"), Buffer.from(targetFingerprint, "hex"))) {
    throw postgresMigrationError("POSTGRES_MIGRATE_TARGET_MISMATCH");
  }

  const runId = String(env.CRM_POSTGRES_MIGRATE_RUN_ID || "").trim();
  const attestation = String(env.CRM_POSTGRES_MIGRATE_ATTESTATION || "").trim().toLowerCase();
  const hmacKey = String(env.CRM_POSTGRES_MIGRATE_ATTESTATION_HMAC_KEY || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(runId)) {
    throw postgresMigrationError("POSTGRES_MIGRATE_RUN_ID_REQUIRED");
  }
  if (!/^[a-f0-9]{64}$/.test(attestation)) {
    throw postgresMigrationError("POSTGRES_MIGRATE_ATTESTATION_REQUIRED");
  }
  if (Buffer.byteLength(hmacKey, "utf8") < 32) {
    throw postgresMigrationError("POSTGRES_MIGRATE_ATTESTATION_KEY_REQUIRED");
  }
  const expectedAttestation = signPostgresMigrateAttestation(hmacKey, canonicalPostgresMigrateAttestationPayload({
    runId,
    target,
    targetFingerprint,
  }));
  if (!crypto.timingSafeEqual(Buffer.from(attestation, "hex"), Buffer.from(expectedAttestation, "hex"))) {
    throw postgresMigrationError("POSTGRES_MIGRATE_ATTESTATION_INVALID");
  }
  return { databaseUrl, target, targetFingerprint };
}

function canonicalPostgresMigrateAttestationPayload({ runId, target, targetFingerprint }) {
  return JSON.stringify({
    runId: String(runId || ""),
    target: String(target || ""),
    targetFingerprint: String(targetFingerprint || ""),
  });
}

function signPostgresMigrateAttestation(hmacKey, payload) {
  return crypto.createHmac("sha256", hmacKey).update(payload).digest("hex");
}

function postgresTargetFingerprint(rawUrl) {
  // Lazily loaded to avoid a module-initialization cycle: prisma-runtime
  // derives its PostgreSQL workspace from this module.
  return require("./prisma-runtime.cjs").databaseTargetFingerprint(rawUrl);
}

function isRailwayEnvironment(env = process.env) {
  return Boolean(env.RAILWAY_SERVICE_ID || env.RAILWAY_DEPLOYMENT_ID || env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID);
}

function postgresMigrationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function stableWorkspaceId() {
  return crypto.createHash("sha256")
    .update(fs.readFileSync(sqliteSchemaPath))
    .digest("hex")
    .slice(0, 16);
}

function resolvePrismaCli() {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin?.prisma;
  if (!relativeBin) throw new Error("Prisma local nao declara binario.");
  return path.resolve(path.dirname(packageJsonPath), relativeBin);
}

function sanitize(text) {
  return JSON.stringify(sanitizePrismaOutput(text, "postgres-prisma"));
}

async function main() {
  const command = process.argv[2];
  if (!command || !["schema", "migration-sql", "validate", "generate", "migrate-empty"].includes(command)) {
    throw new Error("Comando esperado: schema, migration-sql, validate, generate ou migrate-empty.");
  }
  const parsed = parsePostgresCliArguments(process.argv.slice(3));
  if (command !== "migration-sql" && parsed.positional.length !== 0) throw new Error(`${command} nao aceita argumentos posicionais.`);
  if (command === "migration-sql" && parsed.positional.length > 1) throw new Error("migration-sql aceita no maximo um caminho de saida.");
  const workspace = preparePostgresWorkspace(parsed.workspaceOptions);
  if (command === "schema") {
    console.log(workspace.schemaPath);
    return;
  }
  if (command === "migration-sql") {
    const output = parsed.positional[0];
    const sqlPath = latestMigrationSqlPath(workspace.migrationsDir);
    if (output) {
      const target = path.resolve(output);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(sqlPath, target);
      console.log(target);
    } else {
      console.log(sqlPath);
    }
    return;
  }
  if (command === "validate") {
    runPrisma(["validate", "--schema", workspace.schemaPath], { ...process.env, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" });
    return;
  }
  if (command === "generate") {
    runPrisma(["generate", "--schema", workspace.schemaPath], { ...process.env, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" });
    await runGate({
      mode: "architecture",
      env: process.env,
      schemaPath: workspace.schemaPath,
      postgresMigrationDir: workspace.migrationsDir,
      migrationName: latestMigrationName(workspace.migrationsDir),
    });
    return;
  }
  const { databaseUrl } = assertPostgresMigrateEmptyAuthorization(process.env);
  const migrationEnv = { ...process.env, DATABASE_URL: databaseUrl };
  const migrationOptions = {
    env: migrationEnv,
    schemaPath: workspace.schemaPath,
    postgresMigrationDir: workspace.migrationsDir,
    migrationName: latestMigrationName(workspace.migrationsDir),
  };
  runPrisma(["validate", "--schema", workspace.schemaPath], { ...migrationEnv, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" });
  runPrisma(["generate", "--schema", workspace.schemaPath], { ...migrationEnv, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" });
  await runGate({ mode: "architecture", ...migrationOptions });
  await runGate({ mode: "pre-migration", ...migrationOptions });
  runPrisma(["migrate", "deploy", "--schema", workspace.schemaPath], migrationEnv);
  await runGate({ mode: "post-migration", ...migrationOptions });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: "postgres_prisma", safe: false, error: sanitizeVerifierFailure(error, "postgres-prisma") }));
    process.exitCode = 1;
  });
}

module.exports = {
  POSTGRES_MIGRATE_CONFIRMATION,
  assertPostgresMigrateEmptyAuthorization,
  cleanupPostgresTestWorkspace,
  canonicalPostgresMigrateAttestationPayload,
  createPostgresTestWorkspace,
  generatePostgresMigrationSql,
  latestMigrationName,
  latestMigrationSqlPath,
  parsePostgresCliArguments,
  postgresTestWorkspaceOptions,
  postgresSchemaWithClientOutput,
  postgresSchemaText,
  preparePostgresWorkspace,
  resolvePrismaCli,
  sanitize,
  signPostgresMigrateAttestation,
  writePostgresClientLoader,
};
