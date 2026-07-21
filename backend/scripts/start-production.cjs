const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const BACKEND_DIRECTORY = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(BACKEND_DIRECTORY, "prisma", "schema.prisma");
const VALIDATE_RUNTIME_PATH = path.join(BACKEND_DIRECTORY, "scripts", "validate-runtime.js");
const SERVER_PATH = path.join(BACKEND_DIRECTORY, "src", "server.js");
const OFFICIAL_SERVICE_ID = "16de1b91-7dcb-46b4-9231-1c3e2c3e5a92";
const OFFICIAL_MOUNT_PATH = path.resolve("/app/data");

async function runStartup(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const spawnImpl = options.spawnImpl || spawn;
  const signalSource = options.signalSource || process;
  const railway = isRailwayEnvironment(env);
  let runtime = {
    backendDirectory: options.backendDirectory || BACKEND_DIRECTORY,
    schemaPath: options.schemaPath || SCHEMA_PATH,
    env,
  };

  if (railway) {
    logger.log("Validando ambiente de producao");

    try {
      runtime = validateRailwayEnvironment({
        env,
        backendDirectory: runtime.backendDirectory,
        schemaPath: runtime.schemaPath,
        expectedServiceId: options.expectedServiceId || OFFICIAL_SERVICE_ID,
        expectedMountPath: options.expectedMountPath || OFFICIAL_MOUNT_PATH,
        prismaCliPath: options.prismaCliPath,
      });
    } catch (error) {
      logger.error("Validacao do ambiente Railway falhou; API nao iniciada.");
      throw error;
    }

    logger.log("Executando migrations pendentes");

    try {
      await (options.runMigration || runPrismaMigration)(runtime, { spawnImpl });
    } catch (error) {
      logger.error("Migration falhou; API nao iniciada.");
      throw error;
    }

    logger.log("Migrations concluidas");
  }

  logger.log("Iniciando API");
  const server = await (options.startServer || startApiServer)(runtime, { spawnImpl });
  return superviseServer(server, { signalSource });
}

function isRailwayEnvironment(env) {
  return Boolean(
    env.RAILWAY_SERVICE_ID
      || env.RAILWAY_DEPLOYMENT_ID
      || env.RAILWAY_VOLUME_MOUNT_PATH
      || env.RAILWAY_PROJECT_ID,
  );
}

function validateRailwayEnvironment({
  env,
  backendDirectory = BACKEND_DIRECTORY,
  schemaPath = SCHEMA_PATH,
  expectedServiceId = OFFICIAL_SERVICE_ID,
  expectedMountPath = OFFICIAL_MOUNT_PATH,
  prismaCliPath,
}) {
  if (env.RAILWAY_SERVICE_ID !== expectedServiceId) {
    throw startupError("RAILWAY_SERVICE_MISMATCH");
  }

  if (!env.RAILWAY_DEPLOYMENT_ID) {
    throw startupError("RAILWAY_DEPLOYMENT_MISSING");
  }

  const mountPath = path.resolve(String(env.RAILWAY_VOLUME_MOUNT_PATH || ""));
  const requiredMountPath = path.resolve(expectedMountPath);

  if (!env.RAILWAY_VOLUME_MOUNT_PATH || !samePath(mountPath, requiredMountPath)) {
    throw startupError("RAILWAY_VOLUME_INVALID");
  }

  const databaseUrl = String(env.DATABASE_URL || "").trim();

  if (!databaseUrl.startsWith("file:")) {
    throw startupError("DATABASE_URL_INVALID");
  }

  const databasePath = resolveDatabasePath(databaseUrl, path.dirname(schemaPath));
  const trackedDevelopmentDatabase = path.resolve(path.dirname(schemaPath), "dev.db");
  if (
    !isPathInside(databasePath, mountPath)
      || samePath(databasePath, trackedDevelopmentDatabase)
  ) {
    throw startupError("DATABASE_PATH_INVALID");
  }

  if (!fs.existsSync(schemaPath) || !fs.statSync(schemaPath).isFile()) {
    throw startupError("PRISMA_SCHEMA_MISSING");
  }

  const resolvedPrismaCli = prismaCliPath || resolvePrismaCli(backendDirectory);

  if (!fs.existsSync(resolvedPrismaCli) || !fs.statSync(resolvedPrismaCli).isFile()) {
    throw startupError("PRISMA_CLI_MISSING");
  }

  return {
    backendDirectory,
    databasePath,
    env,
    mountPath,
    prismaCliPath: resolvedPrismaCli,
    schemaPath,
  };
}

async function runPrismaMigration(runtime, { spawnImpl = spawn } = {}) {
  const child = spawnImpl(
    process.execPath,
    [runtime.prismaCliPath, "migrate", "deploy", "--schema", runtime.schemaPath],
    childOptions(runtime, "inherit"),
  );
  const result = await waitForChild(child);

  if (result.code !== 0) {
    throw startupError("PRISMA_MIGRATION_FAILED", result.code);
  }
}

async function startApiServer(runtime, { spawnImpl = spawn } = {}) {
  const validation = spawnImpl(
    process.execPath,
    [VALIDATE_RUNTIME_PATH],
    childOptions(runtime, "inherit"),
  );
  const validationResult = await waitForChild(validation);

  if (validationResult.code !== 0) {
    throw startupError("RUNTIME_VALIDATION_FAILED", validationResult.code);
  }

  return spawnImpl(
    process.execPath,
    [SERVER_PATH],
    childOptions(runtime, "inherit"),
  );
}

function superviseServer(server, { signalSource = process } = {}) {
  return new Promise((resolve, reject) => {
    const forwarded = new Set();
    const handlers = new Map();

    for (const signal of ["SIGTERM", "SIGINT"]) {
      const handler = () => {
        if (forwarded.has(signal)) return;
        forwarded.add(signal);
        server.kill(signal);
      };
      handlers.set(signal, handler);
      signalSource.once(signal, handler);
    }

    const cleanup = () => {
      for (const [signal, handler] of handlers) {
        signalSource.removeListener(signal, handler);
      }
    };

    server.once("error", (error) => {
      cleanup();
      reject(error);
    });
    server.once("close", (code, signal) => {
      cleanup();
      resolve(normalizeExitCode(code, signal));
    });
  });
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code: normalizeExitCode(code, signal), signal });
    });
  });
}

function childOptions(runtime, stdio) {
  return {
    cwd: runtime.backendDirectory,
    env: runtime.env,
    shell: false,
    stdio,
    windowsHide: true,
  };
}

function resolvePrismaCli(backendDirectory = BACKEND_DIRECTORY) {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDirectory] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string"
    ? prismaPackage.bin
    : prismaPackage.bin?.prisma;

  if (!relativeBin) throw startupError("PRISMA_CLI_MISSING");
  return path.resolve(path.dirname(packageJsonPath), relativeBin);
}

function resolveDatabasePath(databaseUrl, schemaDirectory) {
  const configuredPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]);
  return path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(schemaDirectory, configuredPath);
}

function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(left, right) {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function normalizeExitCode(code, signal) {
  if (Number.isInteger(code)) return code;
  const signalNumber = signal && os.constants.signals[signal];
  return Number.isInteger(signalNumber) ? 128 + signalNumber : 1;
}

function startupError(code, exitCode = 1) {
  const error = new Error(code);
  error.code = code;
  error.exitCode = exitCode;
  return error;
}

if (require.main === module) {
  runStartup()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
    });
}

module.exports = {
  OFFICIAL_MOUNT_PATH,
  OFFICIAL_SERVICE_ID,
  isRailwayEnvironment,
  resolveDatabasePath,
  resolvePrismaCli,
  runPrismaMigration,
  runStartup,
  startApiServer,
  superviseServer,
  validateRailwayEnvironment,
};
