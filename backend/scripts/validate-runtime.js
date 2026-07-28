const path = require("node:path");
const {
  databaseEngineFromUrl,
  databaseProviderFromEnv,
} = require("./prisma-runtime.cjs");
require("dotenv").config();

if (process.env.NODE_ENV !== "production") {
  process.exit(0);
}

const databaseUrl = String(process.env.DATABASE_URL || "").trim();

if (!databaseUrl) {
  fail("DATABASE_URL e obrigatoria em producao.");
}

let provider;
try {
  provider = databaseProviderFromEnv(process.env);
} catch (error) {
  fail(error.message);
}

const engine = databaseEngineFromUrl(databaseUrl);
if (!engine) {
  fail("DATABASE_URL deve apontar explicitamente para SQLite file: ou PostgreSQL postgresql://.");
}

if (engine !== provider) {
  fail("CRM_DATABASE_PROVIDER inconsistente com DATABASE_URL.");
}

if (engine === "sqlite") {
  const configuredPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]);
  const schemaDirectory = path.resolve(__dirname, "..", "prisma");
  const resolvedDatabasePath = path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(schemaDirectory, configuredPath);
  const trackedDevelopmentDatabase = path.resolve(schemaDirectory, "dev.db");

  if (samePath(resolvedDatabasePath, trackedDevelopmentDatabase)) {
    fail("O banco de desenvolvimento rastreado nao pode ser usado em producao.");
  }
}

console.log(`Configuracao de runtime Express validada para producao (${provider}).`);

function samePath(left, right) {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
