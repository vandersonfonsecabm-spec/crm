"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backendDir = path.resolve(__dirname, "..");
const evidenceRoot = path.join(os.tmpdir(), "crm-postgres-real");
const defaultImage = "postgres:16-alpine";
const defaultHealthTimeoutMs = 120000;
const defaultHealthIntervalMs = 1000;
const logLimit = 120000;

// The canonical runner owns the migration order and the PostgreSQL-only files.
// Keep this manifest here so dry-run output and evidence show the exact scope.
const pgSuite = Object.freeze([
  "tests/tenant-isolation-pending-migrations-postgres.test.js",
  "tests/postgres-migration-prep.test.js",
  "tests/auth-admin-concurrency-postgres.test.js",
  "tests/internal-automations-h7.test.js",
  "tests/next-follow-up-projection.test.js",
  "tests/email-inbound-lifecycle.test.js",
  "tests/email-inbound-processing.test.js",
  "tests/commercial-proposal-catalog-v1-postgres.test.js",
]);
const pgHarnessTestCount = 23;

function parseArguments(rawArgs = []) {
  const args = [...rawArgs];
  const dryRun = args.includes("--dry-run");
  const help = args.includes("--help") || args.includes("-h");
  const unknown = args.filter((value) => !["--dry-run", "--help", "-h"].includes(value));
  if (unknown.length) throw new Error(`Argumento nao suportado: ${unknown[0]}`);
  return { dryRun, help };
}

function imageFromEnv(env = process.env) {
  const image = String(env.POSTGRES_TEST_IMAGE || defaultImage).trim();
  // Do not silently follow a mutable latest tag. An explicit postgres major,
  // minor, patch or digest is required for a real run.
  if (!/^postgres:[0-9]+(?:\.[0-9]+){0,2}(?:-[A-Za-z0-9._-]+)?(?:@sha256:[a-f0-9]{64})?$/i.test(image)) {
    throw new Error("POSTGRES_TEST_IMAGE deve ser uma imagem postgres com tag numerica pinada.");
  }
  return image;
}

function externalDatabaseUrlFromEnv(env = process.env) {
  const value = String(env.POSTGRES_TEST_DATABASE_URL || "").trim();
  if (!value) return null;
  if (!/^postgres(?:ql)?:\/\/[^\s]+$/i.test(value)) {
    throw new Error("POSTGRES_TEST_DATABASE_URL deve usar uma URL PostgreSQL.");
  }
  if (env.CRM_POSTGRES_REAL_CONFIRM !== "disposable-external") {
    throw new Error("URL externa exige CRM_POSTGRES_REAL_CONFIRM=disposable-external.");
  }
  if (isOfficialDatabaseUrl(value, env)) {
    throw new Error("URL oficial ou de producao nunca pode ser usada pelo runner real.");
  }
  return value;
}

function isOfficialDatabaseUrl(value, env = process.env) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  for (const key of [
    "DATABASE_URL",
    "POSTGRES_DATABASE_URL",
    "POSTGRES_TARGET_URL",
    "POSTGRES_URL",
    "POSTGRES_MIGRATION_DATABASE_URL",
  ]) {
    const candidate = String(env[key] || "").trim().toLowerCase();
    if (candidate && candidate === normalized) return true;
    if (candidate && sameDatabaseEndpoint(value, candidate)) return true;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return true;
  }
  const host = parsed.hostname.toLowerCase();
  const database = parsed.pathname.replace(/^\/+/, "").toLowerCase();
  const knownProductionFragments = [
    "railway.app",
    "railway.internal",
    "railway",
    "vercel",
    "crm-agro",
    "crm-murex",
    "api-production",
    "glistening-playfulness",
  ];
  return knownProductionFragments.some((fragment) => host.includes(fragment))
    || /(?:^|[.-])(prod|production|official)(?:[.-]|$)/.test(host)
    || /(?:^|[-_])(prod|production|official)(?:$|[-_])/.test(database);
}

function sameDatabaseEndpoint(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.protocol.toLowerCase() === b.protocol.toLowerCase()
      && a.hostname.toLowerCase() === b.hostname.toLowerCase()
      && (a.port || "5432") === (b.port || "5432")
      && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: backendDir,
    env: options.env || process.env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: options.timeoutMs || 30000,
  });
  return {
    status: Number.isInteger(result.status) ? result.status : null,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error || null,
  };
}

function runSuite(databaseUrl, options = {}) {
  const envSource = options.env || process.env;
  const env = {
    ...envSource,
    NODE_ENV: "test",
    CRM_TEST_DATABASE_PROVIDER: "postgresql",
    CRM_TEST_POSTGRES_ALLOW: "true",
    CRM_TEST_DATABASE_URL: databaseUrl,
    POSTGRES_TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    POSTGRES_DATABASE_URL: "",
    POSTGRES_TARGET_URL: "",
    POSTGRES_URL: "",
    POSTGRES_MIGRATION_DATABASE_URL: "",
    AUTOMATION_WORKER_ENABLED: "false",
  };
  const result = spawnSync(process.execPath, ["scripts/run-postgres-tests.cjs"], {
    cwd: backendDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: Number(env.POSTGRES_TEST_SUITE_TIMEOUT_MS) || 900000,
  });
  return {
    status: Number.isInteger(result.status) ? result.status : null,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error || null,
  };
}

function sanitizeLogText(value, secrets = []) {
  let text = String(value || "");
  for (const secret of secrets) {
    const valueText = String(secret || "");
    if (!valueText) continue;
    text = text.split(valueText).join("[REDACTED]");
  }
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[REDACTED]")
    .replace(/((?:authorization|cookie)\s*[:=]\s*)Bearer\s+[^\s,;]+/gi, "$1Bearer [REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/((?:password|passwd|secret|token)[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\r?\n/g, "\n")
    .slice(0, logLimit);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sourceManifestHash() {
  const hash = crypto.createHash("sha256");
  const schemaPath = path.join(backendDir, "prisma", "schema.prisma");
  hash.update("schema.prisma\0");
  hash.update(fs.readFileSync(schemaPath));
  const migrationsRoot = path.join(backendDir, "prisma-postgres", "migrations");
  const names = fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  for (const name of names) {
    const migrationDir = path.join(migrationsRoot, name);
    hash.update(`migration:${name}\0`);
    for (const file of fs.readdirSync(migrationDir).sort()) {
      const filePath = path.join(migrationDir, file);
      if (!fs.statSync(filePath).isFile()) continue;
      hash.update(`${name}/${file}\0`);
      hash.update(fs.readFileSync(filePath));
    }
  }
  return hash.digest("hex");
}

function makeRunId() {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
}

function safeRunId(value) {
  const normalized = String(value || "").replace(/[^a-z0-9_-]/gi, "-").slice(0, 80);
  return normalized || makeRunId();
}

function makeResourceName(prefix, runId) {
  return `${prefix}-${runId.replace(/[^a-z0-9-]/gi, "-").slice(-36)}`.toLowerCase();
}

function assertDockerAvailable(runDockerCommand) {
  const result = runDockerCommand(["version", "--format", "{{.Server.Version}}"]);
  if (result.error || result.status !== 0 || !String(result.stdout || "").trim()) {
    throw new Error("Docker indisponivel ou sem permissao para consultar o daemon.");
  }
}

function startContainer({ image, containerName, volumeName }, runDockerCommand, password) {
  const args = [
    "run",
    "--detach",
    "--name",
    containerName,
    "--label",
    "com.crm.postgres-real=true",
    "--label",
    `com.crm.postgres-real.run=${containerName}`,
    "--publish",
    "127.0.0.1::5432",
    "--volume",
    `${volumeName}:/var/lib/postgresql/data`,
    "--health-cmd=pg_isready -U crm_test -d crm_test",
    "--health-interval=2s",
    "--health-timeout=3s",
    "--health-retries=30",
    "--env",
    "POSTGRES_USER=crm_test",
    "--env",
    "POSTGRES_DB=crm_test",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    image,
  ];
  const result = runDockerCommand(args, { timeoutMs: 180000 });
  if (result.error || result.status !== 0 || !String(result.stdout || "").trim()) {
    throw new Error("O container PostgreSQL descartavel nao iniciou.");
  }
  return String(result.stdout).trim().split(/\s+/)[0];
}

function mappedPort(containerName, runDockerCommand) {
  const result = runDockerCommand(["port", containerName, "5432/tcp"]);
  if (result.error || result.status !== 0) throw new Error("Docker nao informou a porta PostgreSQL descartavel.");
  const match = String(result.stdout || "").match(/:(\d+)\s*$/m);
  if (!match) throw new Error("Porta PostgreSQL descartavel invalida.");
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Porta PostgreSQL descartavel invalida.");
  return port;
}

async function waitForHealthy(containerName, runDockerCommand, options = {}) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : defaultHealthTimeoutMs;
  const intervalMs = Number.isInteger(options.intervalMs) ? options.intervalMs : defaultHealthIntervalMs;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const result = runDockerCommand(["inspect", "--format={{.State.Health.Status}}", containerName]);
    const status = String(result.stdout || "").trim().toLowerCase();
    if (status === "healthy") return;
    if (status === "unhealthy") throw new Error("O healthcheck do PostgreSQL descartavel falhou.");
    await sleep(intervalMs);
  }
  throw new Error("O healthcheck do PostgreSQL descartavel excedeu o tempo limite.");
}

function databaseUrlForPort(port, password) {
  return `postgresql://crm_test:${encodeURIComponent(password)}@127.0.0.1:${port}/crm_test`;
}

function cleanupContainer({ containerName, volumeName }, runDockerCommand, log) {
  let ok = true;
  if (containerName) {
    try {
      const removed = runDockerCommand(["rm", "--force", "--volumes", containerName]);
      const alreadyGone = /no such container|not found/i.test(String(removed?.stderr || ""));
      const status = removed?.status === 0 || alreadyGone ? "ok" : "failed";
      log.push(`cleanup container status=${status}`);
      ok = ok && status === "ok";
    } catch (error) {
      ok = false;
      log.push(`cleanup container error=${sanitizeLogText(error.message)}`);
    }
  }
  if (volumeName) {
    try {
      const removed = runDockerCommand(["volume", "rm", "--force", volumeName]);
      const alreadyGone = /no such volume|not found/i.test(String(removed?.stderr || ""));
      const status = removed?.status === 0 || alreadyGone ? "ok" : "failed";
      log.push(`cleanup volume status=${status}`);
      ok = ok && status === "ok";
    } catch (error) {
      ok = false;
      log.push(`cleanup volume error=${sanitizeLogText(error.message)}`);
    }
  }
  return ok;
}

function dockerLogs(containerName, runDockerCommand, secrets) {
  if (!containerName) return "";
  const result = runDockerCommand(["logs", containerName]);
  return sanitizeLogText(`${result.stdout || ""}\n${result.stderr || ""}`, secrets);
}

function writeEvidence(runId, evidence) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const logPath = path.join(evidenceRoot, `${runId}.log`);
  const manifestPath = path.join(evidenceRoot, `${runId}.json`);
  const logText = evidence.log.endsWith("\n") ? evidence.log : `${evidence.log}\n`;
  fs.writeFileSync(logPath, logText, "utf8");
  const manifest = {
    event: "postgres_real_test_evidence",
    runId,
    status: evidence.status,
    mode: evidence.mode,
    image: evidence.image,
    suite: pgSuite,
    harnessTests: pgHarnessTestCount,
    sourceManifestSha256: evidence.sourceManifestSha256,
    logsSha256: sha256(logText),
    logPath,
    cleanup: evidence.cleanup,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { logPath, manifestPath, logsSha256: manifest.logsSha256 };
}

function helpText() {
  return [
    "Uso: npm run test:postgres:real [-- --dry-run]",
    "",
    "Executa migrations e a suite PostgreSQL em container descartavel local.",
    `Imagem padrao pinada: ${defaultImage} (POSTGRES_TEST_IMAGE permite outra tag numerica).`,
    "",
    "POSTGRES_TEST_DATABASE_URL e opcional. Se informado, exige:",
    "CRM_POSTGRES_REAL_CONFIRM=disposable-external",
    "e nunca pode apontar para banco oficial/producao.",
  ].join("\n");
}

async function main(options = {}) {
  const args = parseArguments(options.args || process.argv.slice(2));
  if (args.help) return { status: "help", text: helpText() };
  const env = options.env || process.env;
  const image = imageFromEnv(env);
  const externalUrl = externalDatabaseUrlFromEnv(env);
  const runId = safeRunId(options.runId || makeRunId());
  const containerName = externalUrl ? null : makeResourceName("crm-pg-real", runId);
  const volumeName = externalUrl ? null : makeResourceName("crm-pg-real-vol", runId);
  const runDockerCommand = options.runDocker || runDocker;
  const executeSuite = options.runSuite || ((url) => runSuite(url, { env }));
  const sourceHash = sourceManifestHash();
  const log = [`event=postgres_real_start mode=${externalUrl ? "external" : "container"} image=${image}`, `sourceManifestSha256=${sourceHash}`];
  const secrets = [];
  let cleanupState = "not-required";
  let containerAttempted = false;
  let testsResult = null;
  let evidence = null;
  let failure = null;
  const context = { containerName, volumeName };

  if (args.dryRun) {
    return {
      status: "dry-run",
      mode: externalUrl ? "external" : "container",
      image,
      suite: pgSuite,
      harnessTests: pgHarnessTestCount,
      container: externalUrl ? null : { name: "<random>", volume: "<temporary>", port: "<docker-assigned>" },
      cleanup: ["docker rm --force --volumes <container>", "docker volume rm --force <volume>"],
      sourceManifestSha256: sourceHash,
    };
  }

  try {
    let databaseUrl = externalUrl;
    if (!databaseUrl) {
      assertDockerAvailable(runDockerCommand);
      const password = crypto.randomBytes(24).toString("hex");
      secrets.push(password);
      containerAttempted = true;
      startContainer({ image, containerName, volumeName }, runDockerCommand, password);
      await waitForHealthy(containerName, runDockerCommand, {
        timeoutMs: Number(env.POSTGRES_TEST_HEALTH_TIMEOUT_MS) || defaultHealthTimeoutMs,
        intervalMs: Number(env.POSTGRES_TEST_HEALTH_INTERVAL_MS) || defaultHealthIntervalMs,
        sleep: options.sleep,
      });
      const port = mappedPort(containerName, runDockerCommand);
      databaseUrl = databaseUrlForPort(port, password);
      log.push(`container=started port=${port}`);
    } else {
      log.push("external_url=confirmed");
    }
    testsResult = executeSuite(databaseUrl);
    if (testsResult && typeof testsResult.then === "function") testsResult = await testsResult;
    const suiteOutput = sanitizeLogText(`${testsResult?.stdout || ""}\n${testsResult?.stderr || ""}`, secrets);
    if (suiteOutput.trim()) log.push(`suite_logs\n${suiteOutput}`);
    if (testsResult?.error || testsResult?.status !== 0) {
      log.push(`suite=status_failed code=${testsResult?.status ?? "unknown"}`);
      throw new Error("A suite PostgreSQL real falhou.");
    }
    log.push("suite=status_ok");
  } catch (error) {
    failure = error;
    log.push(`failure=${sanitizeLogText(error.message, secrets)}`);
  } finally {
    if (containerAttempted) {
      try {
        const containerOutput = dockerLogs(containerName, runDockerCommand, secrets);
        if (containerOutput) log.push(`docker_logs\n${containerOutput}`);
      } catch (error) {
        log.push(`docker_logs_error=${sanitizeLogText(error.message, secrets)}`);
      }
      try {
        cleanupState = cleanupContainer(context, runDockerCommand, log) ? "attempted" : "failed";
      } catch (error) {
        cleanupState = "failed";
        log.push(`cleanup_error=${sanitizeLogText(error.message, secrets)}`);
      }
    }
    if (!failure && cleanupState === "failed") {
      failure = new Error("A limpeza do container PostgreSQL descartavel falhou.");
      log.push("failure=cleanup_failed");
    }
    if (!args.dryRun) {
      const status = failure ? "failed" : "passed";
      evidence = writeEvidence(runId, {
        status,
        mode: externalUrl ? "external" : "container",
        image,
        sourceManifestSha256: sourceHash,
        cleanup: cleanupState,
        log: sanitizeLogText(log.join("\n"), secrets),
      });
    }
  }

  if (failure) {
    const error = new Error(failure.message);
    error.safeDetails = {
      code: "POSTGRES_REAL_TEST_FAILED",
      message: sanitizeLogText(failure.message, secrets),
      evidence: evidence ? { logPath: evidence.logPath, manifestPath: evidence.manifestPath, logsSha256: evidence.logsSha256 } : null,
    };
    throw error;
  }
  return {
    status: "passed",
    mode: externalUrl ? "external" : "container",
    image,
    suite: pgSuite,
    harnessTests: pgHarnessTestCount,
    sourceManifestSha256: sourceHash,
    evidence,
    cleanup: cleanupState,
  };
}

if (require.main === module) {
  main()
    .then((result) => {
      if (result.status === "help") console.log(result.text);
      else console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      const details = error.safeDetails || { code: "POSTGRES_REAL_TEST_FAILED" };
      console.error(JSON.stringify({ event: "postgres_real_tests", safe: false, ...details }));
      process.exitCode = 1;
    });
}

module.exports = {
  databaseUrlForPort,
  defaultImage,
  externalDatabaseUrlFromEnv,
  imageFromEnv,
  isOfficialDatabaseUrl,
  main,
  mappedPort,
  parseArguments,
  pgSuite,
  pgHarnessTestCount,
  safeRunId,
  sanitizeLogText,
  sourceManifestHash,
  waitForHealthy,
};
