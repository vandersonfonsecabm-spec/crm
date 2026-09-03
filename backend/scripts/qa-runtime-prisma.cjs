const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { createPostgresTestWorkspace, cleanupPostgresTestWorkspace, resolvePrismaCli } = require("./postgres-prisma.cjs");

const TEST_WORKSPACE_ROOT = path.join(os.tmpdir(), "crm-prisma-tests");
const CLEANUP_SCRIPT = path.join(__dirname, "qa-runtime-prisma-cleanup.cjs");

function assertPostgresDatabaseUrl(env = process.env) {
  const primary = String(env.DATABASE_URL || "").trim();
  const secondary = String(env.POSTGRES_DATABASE_URL || "").trim();
  if (!primary || !/^postgres(?:ql)?:\/\//i.test(primary)) throw new Error("QA_POSTGRES_DATABASE_URL_REQUIRED");
  if (secondary && secondary !== primary) throw new Error("QA_POSTGRES_DATABASE_URL_DIVERGENCE");
  return primary;
}

function generatePostgresClient(workspace) {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), "generate", "--schema", workspace.schemaPath], {
    cwd: path.resolve(__dirname, ".."),
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
    workspace = createPostgresTestWorkspace();
    const PostgresPrismaClient = generatePostgresClient(workspace);
    prisma = new PostgresPrismaClient({ datasourceUrl: databaseUrl });
  } catch (error) {
    if (workspace) {
      try { cleanupPostgresTestWorkspace(workspace.root); } catch {}
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
        cleanupPostgresTestWorkspace(workspace.root);
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
