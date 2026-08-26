"use strict";

const { execFileSync } = require("node:child_process");

const project = "ddfbf66c-e274-47b1-9493-286232d2f426";
const environment = "production";
const serviceNames = ["api", "Postgres-u_yI"];

function readVariables(service) {
  const command = `railway variable list --project ${project} --environment ${environment} --service ${service} --json`;
  const raw = execFileSync("cmd.exe", ["/c", command], { encoding: "utf8" });
  const data = JSON.parse(raw);
  const variables = Array.isArray(data) ? data : (data.variables || data);
  if (Array.isArray(variables)) {
    return Object.fromEntries(variables.map((item) => [item.name || item.key, String(item.value ?? "")]));
  }
  return Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, String(value ?? "")]));
}

function parsePostgresUrl(value) {
  try {
    const url = new URL(value);
    if (!/^postgres(?:ql)?:$/i.test(url.protocol)) return { parseable: false };
    const decode = (component) => decodeURIComponent(component);
    return {
      parseable: true,
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname,
      user: decode(url.username),
      password: decode(url.password),
    };
  } catch {
    return { parseable: false };
  }
}

function compareUrls(left, right) {
  const a = parsePostgresUrl(left);
  const b = parsePostgresUrl(right);
  if (!a.parseable || !b.parseable) {
    return {
      bothParseable: false,
      endpointMatch: false,
      databaseMatch: false,
      userMatch: false,
      passwordMatch: false,
    };
  }
  return {
    bothParseable: true,
    endpointMatch: a.host === b.host && a.port === b.port,
    databaseMatch: a.database === b.database,
    userMatch: a.user === b.user,
    passwordMatch: a.password === b.password,
  };
}

function summarize(service, variables) {
  const runtimeSource = service === "api"
    ? (variables.POSTGRES_DATABASE_URL ? "POSTGRES_DATABASE_URL" : variables.DATABASE_URL ? "DATABASE_URL" : "NONE")
    : "DATABASE_URL";
  const runtimeUrl = service === "api"
    ? (variables.POSTGRES_DATABASE_URL || variables.DATABASE_URL || "")
    : (variables.DATABASE_URL || "");
  const parsedRuntime = parsePostgresUrl(runtimeUrl);
  return {
    service,
    variableNames: Object.keys(variables).sort(),
    runtimeSource,
    runtimeUrlPresent: Boolean(runtimeUrl),
    runtimeUrlParseable: parsedRuntime.parseable,
    databasePublicUrlPresent: Boolean(variables.DATABASE_PUBLIC_URL),
    databasePublicUrlParseable: parsePostgresUrl(variables.DATABASE_PUBLIC_URL || "").parseable,
    pgFieldsPresent: {
      host: Boolean(variables.PGHOST),
      port: Boolean(variables.PGPORT),
      database: Boolean(variables.PGDATABASE),
      user: Boolean(variables.PGUSER),
      password: Boolean(variables.PGPASSWORD),
    },
    maintenanceReadOnly: variables.CRM_MAINTENANCE_READ_ONLY || "absent",
    automationWorkerEnabled: variables.AUTOMATION_WORKER_ENABLED || "absent",
    runtimeUrl,
  };
}

function compareEffectiveUrlToDatabaseFields(effectiveUrl, variables) {
  const parsed = parsePostgresUrl(effectiveUrl);
  if (!parsed.parseable) {
    return { parseable: false, userMatchesEnv: false, passwordMatchesEnv: false, databaseMatchesEnv: false };
  }
  const users = [variables.PGUSER, variables.POSTGRES_USER].filter(Boolean);
  const passwords = [variables.PGPASSWORD, variables.POSTGRES_PASSWORD].filter(Boolean);
  const databases = [variables.PGDATABASE, variables.POSTGRES_DB].filter(Boolean);
  return {
    parseable: true,
    userMatchesEnv: users.length > 0 && users.includes(parsed.user),
    passwordMatchesEnv: passwords.length > 0 && passwords.includes(parsed.password),
    databaseMatchesEnv: databases.length > 0 && databases.includes(parsed.database.replace(/^\//, "")),
  };
}

const snapshots = Object.fromEntries(serviceNames.map((service) => [service, readVariables(service)]));
const api = summarize("api", snapshots.api);
const postgres = summarize("Postgres-u_yI", snapshots["Postgres-u_yI"]);
const comparison = compareUrls(api.runtimeUrl, postgres.runtimeUrl);
const publicVsRuntime = compareUrls(snapshots.api.DATABASE_PUBLIC_URL || "", api.runtimeUrl);
const effectiveVsPostgresFields = compareEffectiveUrlToDatabaseFields(api.runtimeUrl, snapshots["Postgres-u_yI"]);

// Deliberately emit only booleans, enum-like names, and variable names.
// Never emit URL components, usernames, passwords, or raw variable values.
console.log(JSON.stringify({
  projectIdVerified: project === "ddfbf66c-e274-47b1-9493-286232d2f426",
  environmentVerified: environment === "production",
  services: [
    { ...api, runtimeUrl: undefined },
    { ...postgres, runtimeUrl: undefined },
  ],
  effectiveRuntimeVsPostgresService: comparison,
  effectiveRuntimeVsPostgresEnvironmentFields: effectiveVsPostgresFields,
  apiPublicUrlVsEffectiveRuntime: publicVsRuntime,
  runtimeSourceContract: "backend/scripts/prisma-runtime.cjs: PostgreSQL uses POSTGRES_DATABASE_URL || DATABASE_URL",
  preflightSourceDivergence: Boolean(snapshots.api.DATABASE_PUBLIC_URL) && api.runtimeSource !== "DATABASE_PUBLIC_URL",
}, null, 2));
