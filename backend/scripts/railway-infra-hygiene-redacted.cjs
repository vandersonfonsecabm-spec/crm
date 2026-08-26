const { execFileSync } = require("node:child_process");

const project = "ddfbf66c-e274-47b1-9493-286232d2f426";
const environment = "production";
const services = ["api", "crm", "Postgres-u_yI", "Postgres", "Postgres-MpW9"];
const knownHosts = ["postgres-uyi.railway.internal", "postgres.railway.internal", "postgres-mpw9.railway.internal"];

function readVariables(service) {
  const raw = execFileSync("cmd.exe", ["/c", `railway variable list --project ${project} --environment ${environment} --service ${service} --json`], { encoding: "utf8" });
  const parsed = JSON.parse(raw);
  const values = Array.isArray(parsed) ? parsed : (parsed.variables || parsed);
  const entries = Array.isArray(values)
    ? values.map((item) => [item.name || item.key, item.value])
    : Object.entries(values);
  return Object.fromEntries(entries);
}

function summarize(value) {
  if (!value) return { present: false };
  try {
    const url = new URL(String(value));
    return {
      present: true,
      scheme: url.protocol,
      host: url.hostname,
      port: url.port || null,
      database: url.pathname,
      user: decodeURIComponent(url.username),
      passwordPresent: Boolean(url.password),
    };
  } catch {
    return { present: true, validUrl: false };
  }
}

function references(value) {
  const text = String(value || "").toLowerCase();
  return Object.fromEntries(knownHosts.map((host) => [host, text.includes(host)]));
}

const result = services.map((service) => {
  const vars = readVariables(service);
  const urlKeys = Object.keys(vars).filter((key) => /^(DATABASE_URL|DATABASE_PUBLIC_URL|POSTGRES_DATABASE_URL)$/i.test(key)).sort();
  const metadata = {};
  for (const key of urlKeys) {
    const value = vars[key];
    metadata[key] = { ...summarize(value), references: references(value) };
  }
  return { service, variableNames: Object.keys(vars).sort(), connectionMetadata: metadata };
});

console.log(JSON.stringify({ status: "passed", project, environment, services: result }, null, 2));
