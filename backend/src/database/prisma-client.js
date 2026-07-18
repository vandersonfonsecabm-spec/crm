const os = require("node:os");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const TEST_DATABASE_ROOT = path.resolve(os.tmpdir(), "crm-prisma-tests");
const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..", "..");
const PRISMA_ROOT = path.resolve(REPOSITORY_ROOT, "backend", "prisma");

function validateTestDatabaseUrl(rawUrl, options = {}) {
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!value) throw new Error("CRM_TEST_DATABASE_URL e obrigatoria quando NODE_ENV=test.");
  if (!value.startsWith("file:")) throw new Error("CRM_TEST_DATABASE_URL deve usar SQLite com prefixo file:.");

  let filePath = decodeURIComponent(value.slice(5));
  if (filePath.startsWith("///") && /^[A-Za-z]:/.test(filePath.slice(3))) filePath = filePath.slice(3);
  if (filePath.startsWith("/") && /^[A-Za-z]:/.test(filePath.slice(1))) filePath = filePath.slice(1);
  if (!path.isAbsolute(filePath)) throw new Error("CRM_TEST_DATABASE_URL deve apontar para um caminho absoluto.");

  const testRoot = path.resolve(options.testRoot || TEST_DATABASE_ROOT);
  const repositoryRoot = path.resolve(options.repositoryRoot || REPOSITORY_ROOT);
  const prismaRoot = path.resolve(options.prismaRoot || PRISMA_ROOT);
  const resolved = path.resolve(filePath);
  if (!isWithin(resolved, testRoot)) throw new Error(`Banco de teste deve estar dentro de ${testRoot}.`);
  if (isWithin(resolved, repositoryRoot) || isWithin(resolved, prismaRoot)) {
    throw new Error("Banco de teste nao pode estar dentro do repositorio ou de backend/prisma.");
  }

  return `file:${resolved.replace(/\\/g, "/")}`;
}

function createPrismaClient(options = {}) {
  const env = options.env || process.env;
  const PrismaClientClass = options.PrismaClientClass || PrismaClient;
  if (env.NODE_ENV !== "test") return new PrismaClientClass();
  const datasourceUrl = validateTestDatabaseUrl(env.CRM_TEST_DATABASE_URL, options);
  return new PrismaClientClass({ datasourceUrl });
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

module.exports = { createPrismaClient, validateTestDatabaseUrl, TEST_DATABASE_ROOT };
