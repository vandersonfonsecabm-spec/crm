const { spawn } = require("node:child_process");
const { databaseEngineFromUrl } = require("./prisma-runtime.cjs");

const PRODUCTION_CONFIRMATION = "postgres-cutover-production";
const REQUIRED_PROVIDER = "postgresql";
const ROLLBACK_PROVIDER = "sqlite";

function sanitize(value, secrets = []) {
  let output = String(value || "");
  for (const secret of secrets.filter(Boolean)) {
    output = output.split(String(secret)).join("[secret]");
  }
  return output
    .replace(/postgres(ql)?:\/\/[^\s"'`]+/gi, "postgresql://[secret]")
    .replace(/file:[^\s"'`]+/gi, "file:[secret]")
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [secret]")
    .replace(/authorization:\s*[^\s,}]+/gi, "authorization:[secret]")
    .slice(0, 4000);
}

function assertExplicitSelectors(selectors = {}, options = {}) {
  const required = ["projectId", "environment", "apiServiceId"];
  for (const key of required) {
    if (!String(selectors[key] || "").trim()) {
      throw cutoverError("CUTOVER_SELECTOR_REQUIRED", `${key} explicito e obrigatorio.`);
    }
  }

  if (String(selectors.environment).trim().toLowerCase() === "production") {
    const confirmation = String(options.confirmation || "").trim();
    if (confirmation !== PRODUCTION_CONFIRMATION) {
      throw cutoverError("CUTOVER_PRODUCTION_CONFIRMATION_REQUIRED", "Confirmacao explicita de production obrigatoria.");
    }
  }

  return {
    apiServiceId: String(selectors.apiServiceId).trim(),
    environment: String(selectors.environment).trim(),
    projectId: String(selectors.projectId).trim(),
  };
}

function validateCutoverUrls({ sqliteDatabaseUrl, postgresDatabaseUrl }) {
  if (databaseEngineFromUrl(sqliteDatabaseUrl) !== "sqlite") {
    throw cutoverError("CUTOVER_SQLITE_URL_REQUIRED", "DATABASE_URL atual deve continuar SQLite.");
  }
  if (databaseEngineFromUrl(postgresDatabaseUrl) !== "postgresql") {
    throw cutoverError("CUTOVER_POSTGRES_URL_REQUIRED", "POSTGRES_DATABASE_URL deve ser PostgreSQL.");
  }
}

function createMemorySecretStore() {
  let sqliteDatabaseUrl = "";
  let postgresDatabaseUrl = "";
  return {
    capture({ sqliteUrl, postgresUrl }) {
      sqliteDatabaseUrl = String(sqliteUrl || "");
      postgresDatabaseUrl = String(postgresUrl || "");
    },
    sqlite() {
      return sqliteDatabaseUrl;
    },
    postgres() {
      return postgresDatabaseUrl;
    },
    clear() {
      sqliteDatabaseUrl = "";
      postgresDatabaseUrl = "";
    },
    isEmpty() {
      return sqliteDatabaseUrl === "" && postgresDatabaseUrl === "";
    },
    secrets() {
      return [sqliteDatabaseUrl, postgresDatabaseUrl].filter(Boolean);
    },
  };
}

function createRailwayVariableClient({ runCommand = runRailwayCommand } = {}) {
  return {
    async getVariables(selectors) {
      const result = await runCommand([
        "variable",
        "list",
        "--project",
        selectors.projectId,
        "--environment",
        selectors.environment,
        "--service",
        selectors.apiServiceId,
        "--json",
      ]);
      if (result.code !== 0) throw cutoverError("CUTOVER_VARIABLE_LIST_FAILED", "Falha ao capturar variaveis.");
      try {
        return JSON.parse(result.stdout || "{}");
      } catch (error) {
        throw cutoverError("CUTOVER_VARIABLE_LIST_INVALID", "Resposta de variaveis invalida.");
      }
    },
    async setVariable(selectors, key, value, options = {}) {
      const args = [
        "variable",
        "set",
        "--project",
        selectors.projectId,
        "--environment",
        selectors.environment,
        "--service",
        selectors.apiServiceId,
        key,
        "--stdin",
      ];
      if (options.skipDeploys) args.push("--skip-deploys");
      const result = await runCommand(args, { input: value });
      if (result.code !== 0) throw cutoverError("CUTOVER_VARIABLE_SET_FAILED", `Falha ao configurar ${key}.`);
    },
    async deleteVariable(selectors, key, options = {}) {
      const args = [
        "variable",
        "delete",
        "--project",
        selectors.projectId,
        "--environment",
        selectors.environment,
        "--service",
        selectors.apiServiceId,
        key,
      ];
      if (options.skipDeploys) args.push("--skip-deploys");
      const result = await runCommand(args);
      if (result.code !== 0) throw cutoverError("CUTOVER_VARIABLE_DELETE_FAILED", `Falha ao remover ${key}.`);
    },
  };
}

async function executeCutoverWorkflow(options = {}, dependencies = {}) {
  const logger = dependencies.logger || quietLogger();
  const railwayClient = dependencies.railwayClient;
  const smoke = dependencies.smoke || (async () => ({ ok: true, routes: [] }));
  if (!railwayClient) throw cutoverError("CUTOVER_RAILWAY_CLIENT_REQUIRED", "Cliente Railway injetado e obrigatorio.");

  const selectors = assertExplicitSelectors(options.selectors, { confirmation: options.confirmation });
  const store = createMemorySecretStore();
  const events = [];
  const record = (event, fields = {}) => {
    events.push({ event, ...fields });
    if (logger.log) logger.log(JSON.stringify({ event, ...fields }));
  };

  try {
    const variables = await railwayClient.getVariables(selectors);
    const sqliteDatabaseUrl = String(variables.DATABASE_URL || "").trim();
    const postgresDatabaseUrl = String(options.postgresDatabaseUrl || variables.POSTGRES_DATABASE_URL || "").trim();
    store.capture({ sqliteUrl: sqliteDatabaseUrl, postgresUrl: postgresDatabaseUrl });
    validateCutoverUrls({ sqliteDatabaseUrl, postgresDatabaseUrl });

    record("cutover_ready", { provider: REQUIRED_PROVIDER, sqliteDatabaseUrlPreserved: true });

    if (options.dryRun) {
      record("cutover_dry_run", { railwayMutations: 0 });
      return {
        events,
        finalProvider: variables.CRM_DATABASE_PROVIDER || ROLLBACK_PROVIDER,
        ok: true,
        rollbackApplied: false,
        secretsCleared: true,
      };
    }

    await railwayClient.setVariable(selectors, "POSTGRES_DATABASE_URL", store.postgres(), { skipDeploys: options.skipDeploys });
    await railwayClient.setVariable(selectors, "CRM_DATABASE_PROVIDER", REQUIRED_PROVIDER, { skipDeploys: options.skipDeploys });
    record("cutover_variables_applied", { provider: REQUIRED_PROVIDER, databaseUrlPreserved: true });

    if (options.simulateFailure) {
      throw cutoverError("CUTOVER_SIMULATED_FAILURE", "Falha simulada apos aplicar variaveis PostgreSQL.");
    }

    const smokeResult = await smoke({ provider: REQUIRED_PROVIDER });
    if (!smokeResult || smokeResult.ok !== true) {
      throw cutoverError("CUTOVER_SMOKE_FAILED", "Smoke autenticado falhou.");
    }

    record("cutover_smoke_ok", { routes: Array.isArray(smokeResult.routes) ? smokeResult.routes.length : 0 });
    return {
      events,
      finalProvider: REQUIRED_PROVIDER,
      ok: true,
      rollbackApplied: false,
      secretsCleared: true,
    };
  } catch (error) {
    record("cutover_failed", { code: error.code || "CUTOVER_FAILED" });
    try {
      await rollbackToSqlite({ selectors, railwayClient, store, skipDeploys: options.skipDeploys });
      record("cutover_rollback_ok", { provider: ROLLBACK_PROVIDER, databaseUrlPreserved: true });
    } catch (rollbackError) {
      const critical = cutoverError(
        "CUTOVER_ROLLBACK_FAILED",
        "Falha critica: rollback nao foi comprovado.",
      );
      critical.cause = rollbackError;
      critical.originalCode = error.code;
      throw critical;
    }
    const rolledBack = cutoverError(error.code || "CUTOVER_FAILED", error.message);
    rolledBack.rollbackApplied = true;
    rolledBack.events = events;
    throw rolledBack;
  } finally {
    store.clear();
    record("cutover_secrets_cleared", { cleared: store.isEmpty() });
  }
}

async function rollbackToSqlite({ selectors, railwayClient, store, skipDeploys }) {
  await railwayClient.setVariable(selectors, "CRM_DATABASE_PROVIDER", ROLLBACK_PROVIDER, { skipDeploys });
  await railwayClient.deleteVariable(selectors, "POSTGRES_DATABASE_URL", { skipDeploys });
  const variables = await railwayClient.getVariables(selectors);
  if (variables.DATABASE_URL !== store.sqlite()) {
    throw cutoverError("CUTOVER_SQLITE_ROLLBACK_UNVERIFIED", "DATABASE_URL SQLite preservada nao confere.");
  }
  return { provider: ROLLBACK_PROVIDER };
}

function runRailwayCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("railway", args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
    if (options.input !== undefined) child.stdin.end(String(options.input));
    else child.stdin.end();
  });
}

function cutoverError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function quietLogger() {
  return { log() {}, error() {} };
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun) {
    console.error("[postgres-cutover] Este helper CLI executa somente --dry-run local. Use o runbook aprovado para operacao real.");
    process.exitCode = 1;
  } else {
    const selectors = {
      apiServiceId: process.env.CRM_CUTOVER_API_SERVICE_ID || "dry-run-api-service",
      environment: process.env.CRM_CUTOVER_ENVIRONMENT || "staging",
      projectId: process.env.CRM_CUTOVER_PROJECT_ID || "dry-run-project",
    };
    executeCutoverWorkflow({
      confirmation: process.env.CRM_CUTOVER_CONFIRM,
      dryRun,
      postgresDatabaseUrl: process.env.POSTGRES_DATABASE_URL || "postgresql://dry-run:dry-run@localhost:5432/crm_cutover_dry_run",
      selectors,
      skipDeploys: true,
    }, {
      railwayClient: {
        async getVariables() {
          return {
            CRM_DATABASE_PROVIDER: "sqlite",
            DATABASE_URL: process.env.CRM_CUTOVER_DRY_RUN_SQLITE_URL || "file:/app/data/dev.db",
          };
        },
      },
      logger: console,
    }).catch((error) => {
      console.error(`[postgres-cutover] ${sanitize(error.message)}`);
      process.exitCode = 1;
    });
  }
}

module.exports = {
  PRODUCTION_CONFIRMATION,
  ROLLBACK_PROVIDER,
  REQUIRED_PROVIDER,
  assertExplicitSelectors,
  createMemorySecretStore,
  createRailwayVariableClient,
  executeCutoverWorkflow,
  rollbackToSqlite,
  sanitize,
  validateCutoverUrls,
};
