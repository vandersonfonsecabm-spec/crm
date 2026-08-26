"use strict";

const { execFileSync } = require("node:child_process");

const project = "ddfbf66c-e274-47b1-9493-286232d2f426";
const environment = "production";
const snapshots = new Map();

for (const service of ["api", "Postgres-u_yI"]) {
  const raw = execFileSync("cmd.exe", ["/c", `railway variable list --project ${project} --environment ${environment} --service ${service} --json`], { encoding: "utf8" });
  const data = JSON.parse(raw);
  const vars = Array.isArray(data) ? data : (data.variables || data);
  const entries = Array.isArray(vars) ? vars.map((item) => [item.name || item.key, item.value]) : Object.entries(vars);
  snapshots.set(service, entries);
  const get = (key) => entries.find(([name]) => name === key)?.[1] || "";
  const describeUrl = (value) => {
    try {
      const url = new URL(value);
      return { scheme: url.protocol, host: url.hostname, port: url.port || "5432", database: url.pathname, user: decodeURIComponent(url.username), passwordPresent: Boolean(url.password) };
    } catch {
      return value ? { present: true, validUrl: false } : { present: false };
    }
  };
  console.log(JSON.stringify({
    service,
    databaseUrl: describeUrl(get("DATABASE_URL")),
    publicUrl: describeUrl(get("DATABASE_PUBLIC_URL")),
    pgHost: get("PGHOST") || null,
    pgPort: get("PGPORT") || null,
    pgDatabase: get("PGDATABASE") || null,
    proxyHost: get("RAILWAY_TCP_PROXY_DOMAIN") || null,
    proxyPort: get("RAILWAY_TCP_PROXY_PORT") || null,
    pgUser: get("PGUSER") || null,
    passwordPresent: Boolean(get("PGPASSWORD")),
    maintenanceReadOnly: get("CRM_MAINTENANCE_READ_ONLY") || "absent",
    automationWorkerEnabled: get("AUTOMATION_WORKER_ENABLED") || "absent",
  }, null, 2));
}

const apiUrl = snapshots.get("api")?.find(([name]) => name === "DATABASE_URL")?.[1] || "";
const dbUrl = snapshots.get("Postgres-u_yI")?.find(([name]) => name === "DATABASE_URL")?.[1] || "";
try {
  const api = new URL(apiUrl);
  const db = new URL(dbUrl);
  console.log(JSON.stringify({
    apiDbEndpoint: `${api.hostname}:${api.port || "5432"}${api.pathname}`,
    postgresDbEndpoint: `${db.hostname}:${db.port || "5432"}${db.pathname}`,
    endpointMatch: api.hostname === db.hostname && (api.port || "5432") === (db.port || "5432") && api.pathname === db.pathname,
    credentialMatch: api.username === db.username && api.password === db.password,
  }, null, 2));
} catch {
  console.log(JSON.stringify({ endpointMatch: false, credentialMatch: false, parseable: false }, null, 2));
}
