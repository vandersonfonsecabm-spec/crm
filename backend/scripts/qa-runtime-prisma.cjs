const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { createPostgresTestWorkspace, cleanupPostgresTestWorkspace, preparePostgresWorkspace, resolvePrismaCli } = require("./postgres-prisma.cjs");

const TEST_WORKSPACE_ROOT = path.join(os.tmpdir(), "crm-prisma-tests");
const PRODUCTION_WORKSPACE_ROOT = path.join(path.resolve(__dirname, ".."), "node_modules", ".cache", "crm-qa-production");
const CLEANUP_SCRIPT = path.join(__dirname, "qa-runtime-prisma-cleanup.cjs");

function assertPostgresDatabaseUrl(env = process.env) {
  const primary = String(env.DATABASE_URL || "").trim();
  const secondary = String(env.POSTGRES_DATABASE_URL || "").trim();
  if (!primary || !/^postgres(?:ql)?:\/\//i.test(primary)) throw new Error("QA_POSTGRES_DATABASE_URL_REQUIRED");
  if (secondary && secondary !== primary) throw new Error("QA_POSTGRES_DATABASE_URL_DIVERGENCE");
  return primary;
}

function createProductionWorkspace() {
  fs.mkdirSync(PRODUCTION_WORKSPACE_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(PRODUCTION_WORKSPACE_ROOT, "postgres-prisma-"));
  try {
    const configPath = ensureWorkspaceProjectRoot(root);
    return { ...preparePostgresWorkspace({ root, clientOutput: path.join(root, "client"), writeClientLoader: true }), configPath, production: true };
  } catch (error) {
    try { cleanupProductionWorkspace(root); } catch {}
    throw error;
  }
}

function cleanupProductionWorkspace(root) {
  const resolved = path.resolve(String(root || ""));
  const parent = path.resolve(PRODUCTION_WORKSPACE_ROOT);
  if (resolved === parent || !resolved.startsWith(parent + path.sep)) throw new Error("Workspace PostgreSQL de producao fora do cache permitido.");
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
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

function generatePostgresClient(workspace) {
  const args = [resolvePrismaCli(), "generate", "--schema", workspace.schemaPath];
  if (workspace.configPath) args.push("--config", workspace.configPath);
  const result = spawnSync(process.execPath, args, {
    cwd: workspace.root,
    env: { ...process.env, DATABASE_URL: "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder" },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) throw new Error("QA_POSTGRES_CLIENT_GENERATE_FAILED");
  const generatedClientPath = path.join(workspace.clientOutput, "default.js");
  if (!fs.existsSync(generatedClientPath) || !fs.statSync(generatedClientPath).isFile()) throw new Error("QA_POSTGRES_CLIENT_MISSING");
  const generated = require(generatedClientPath);
  if (typeof generated?.PrismaClient !== "function") throw new Error("QA_POSTGRES_CLIENT_INVALID");
  return generated.PrismaClient;
}

function createQaPrismaClient({ env = process.env, allowProduction = false } = {}) {
  const provider = String(env.CRM_DATABASE_PROVIDER || "").trim().toLowerCase();
  if (provider !== "postgresql") {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    return { prisma, cleanup: async () => prisma.$disconnect(), provider: "sqlite" };
  }
  const target = String(env.QA_PROD_TARGET_ENV || "").trim().toLowerCase();
  if (target !== "staging" && !(allowProduction === true && target === "production")) throw new Error("QA_POSTGRES_STAGING_ONLY");
  const databaseUrl = assertPostgresDatabaseUrl(env);
  fs.mkdirSync(TEST_WORKSPACE_ROOT, { recursive: true });
  let workspace = null;
  let prisma = null;
  try {
    workspace = target === "production" ? createProductionWorkspace() : createPostgresTestWorkspace();
    const PostgresPrismaClient = generatePostgresClient(workspace);
    prisma = new PostgresPrismaClient({ datasourceUrl: databaseUrl });
  } catch (error) {
    if (workspace) {
      try { (workspace.production ? cleanupProductionWorkspace : cleanupPostgresTestWorkspace)(workspace.root); } catch {}
    }
    throw error;
  }
  let cleaned = false;
  return {
    prisma,
    provider: "postgresql",
    workspace,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      let cleanupError = null;
      try { await prisma.$disconnect(); } catch (error) { cleanupError = error; }
      try {
        (workspace.production ? cleanupProductionWorkspace : cleanupPostgresTestWorkspace)(workspace.root);
      } catch (error) {
        if (isWorkspaceCleanupDeferrable(error, workspace.root)) {
          scheduleWorkspaceCleanup(workspace.root);
        } else {
          cleanupError ||= error;
        }
      }
      if (cleanupError) throw new Error("QA_POSTGRES_CLIENT_CLEANUP_FAILED");
    },
  };
}

function isWorkspaceCleanupDeferrable(error, root) {
  return Boolean(error && root && path.basename(root).toLowerCase().startsWith("postgres-prisma-"));
}

function scheduleWorkspaceCleanup(root) {
  const child = spawn(process.execPath, [CLEANUP_SCRIPT, root], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

module.exports = { assertPostgresDatabaseUrl, createQaPrismaClient, generatePostgresClient, scheduleWorkspaceCleanup };
