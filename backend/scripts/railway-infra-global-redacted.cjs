const { execFileSync } = require("node:child_process");

const candidateTokens = [
  "d22addf0-538b-4532-a288-b98a0a66ecae",
  "c10e8f8d-8eaf-4ec8-8344-a485823051e9",
  "postgres.railway.internal",
  "postgres-mpw9.railway.internal",
  "postgres-uyi.railway.internal",
  "e9d8a6b8-507b-45fb-92a8-3ab016f865a2",
];

function runJson(command) {
  return JSON.parse(execFileSync("cmd.exe", ["/c", command], { encoding: "utf8", windowsHide: true }));
}

function listVariables(projectId, environmentId, serviceId) {
  const data = runJson(`railway variable list --project ${projectId} --environment ${environmentId} --service ${serviceId} --json`);
  const values = Array.isArray(data) ? data : (data.variables || data);
  const entries = Array.isArray(values)
    ? values.map((item) => [item.name || item.key, String(item.value ?? "")])
    : Object.entries(values).map(([name, value]) => [name, String(value ?? "")]);
  return Object.fromEntries(entries);
}

function summarizeUrl(value) {
  if (!value) return { present: false };
  try {
    const url = new URL(value);
    return {
      present: true,
      parseable: true,
      scheme: url.protocol,
      host: url.hostname,
      port: url.port || null,
      database: url.pathname,
      user: decodeURIComponent(url.username),
      passwordPresent: Boolean(url.password),
      references: {
        exactTokens: Object.fromEntries(candidateTokens.map((token) => [token, String(value).toLowerCase().includes(token.toLowerCase())])),
        railwayPostgresInterpolation: /\$\{\{\s*Postgres(?:\.|\s)/i.test(String(value)),
        railwayPostgresMpW9Interpolation: /\$\{\{\s*Postgres-MpW9(?:\.|\s)/i.test(String(value)),
      },
    };
  } catch {
    return {
      present: true,
      parseable: false,
      references: {
        exactTokens: Object.fromEntries(candidateTokens.map((token) => [token, String(value).toLowerCase().includes(token.toLowerCase())])),
        railwayPostgresInterpolation: /\$\{\{\s*Postgres(?:\.|\s)/i.test(String(value)),
        railwayPostgresMpW9Interpolation: /\$\{\{\s*Postgres-MpW9(?:\.|\s)/i.test(String(value)),
      },
    };
  }
}

function serviceSummary(projectId, environmentId, service) {
  let variables;
  try {
    variables = listVariables(projectId, environmentId, service.id);
  } catch (error) {
    return { service, variableRead: { status: "failed", code: error.code || "VARIABLE_READ_FAILED" } };
  }
  const urlKeys = Object.keys(variables).filter((key) => /^(DATABASE_URL|DATABASE_PUBLIC_URL|POSTGRES_DATABASE_URL)$/i.test(key)).sort();
  const connectionMetadata = {};
  for (const key of urlKeys) connectionMetadata[key] = summarizeUrl(variables[key]);
  const allVariableText = Object.values(variables).join("\n");
  const allValueReferences = {
    candidatePostgresService: {
      exactId: allVariableText.includes("d22addf0-538b-4532-a288-b98a0a66ecae"),
      privateHost: allVariableText.toLowerCase().includes("postgres.railway.internal"),
      railwayInterpolation: /\$\{\{\s*Postgres\./i.test(allVariableText),
    },
    candidateMpW9Service: {
      exactId: allVariableText.includes("c10e8f8d-8eaf-4ec8-8344-a485823051e9"),
      privateHost: allVariableText.toLowerCase().includes("postgres-mpw9.railway.internal"),
      railwayInterpolation: /\$\{\{\s*Postgres-MpW9\./i.test(allVariableText),
    },
    officialPostgresService: {
      exactId: allVariableText.includes("e9d8a6b8-507b-45fb-92a8-3ab016f865a2"),
      privateHost: allVariableText.toLowerCase().includes("postgres-uyi.railway.internal"),
      railwayInterpolation: /\$\{\{\s*Postgres-u_yI\./i.test(allVariableText) || /\$\{\{\s*Postgres-uyi\./i.test(allVariableText),
    },
  };
  return {
    service: { id: service.id, name: service.name, status: service.status, deploymentId: service.deploymentId, deploymentStopped: service.deploymentStopped, volumes: service.volumes || [] },
    variableRead: { status: "passed", variableNames: Object.keys(variables).sort(), connectionMetadata, allValueReferences },
  };
}

const projects = runJson("railway project list --json");
const graph = [];
for (const project of projects) {
  const environments = project.environments?.edges?.map((edge) => edge.node) || [];
  for (const environment of environments) {
    const services = runJson(`railway service list --project ${project.id} --environment ${environment.id} --json`);
    graph.push({ project: { id: project.id, name: project.name }, environment, services: services.map((service) => serviceSummary(project.id, environment.id, service)) });
  }
}

console.log(JSON.stringify({ status: "passed", scope: "all accessible Railway projects/environments", projects: graph }, null, 2));
