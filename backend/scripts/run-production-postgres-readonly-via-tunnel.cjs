"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const project = "ddfbf66c-e274-47b1-9493-286232d2f426";
const environment = "production";
const databaseService = "Postgres-u_yI";
const backendDir = path.resolve(__dirname, "..");
const preflightScript = path.join(backendDir, "scripts", "production-postgres-readonly-preflight.cjs");
const railwayCli = path.join(String(process.env.APPDATA || ""), "npm", "node_modules", "@railway", "cli", "bin", "railway.js");

async function main() {
  const tunnel = spawn(process.execPath, [railwayCli,
    "connect",
    databaseService,
    "--project",
    project,
    "--environment",
    environment,
    "--tunnel-only",
    "--ssh",
  ], { cwd: backendDir, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: false });
  let stdout = "";
  let stderr = "";
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`RAILWAY_TUNNEL_TIMEOUT stdout=${stdout.length} stderr=${stderr.length}`)), 60000);
    const inspect = () => {
      const match = stdout.match(/URL:\s+(postgres(?:ql)?:\/\/[^\r\n]+)/i);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1].trim());
    };
    tunnel.stdout.on("data", (chunk) => { stdout += String(chunk); inspect(); });
    tunnel.stderr.on("data", (chunk) => { stderr += String(chunk); });
    tunnel.on("error", () => { clearTimeout(timeout); reject(new Error("RAILWAY_TUNNEL_START_FAILED")); });
    tunnel.on("exit", (code) => {
      if (code && !stdout.includes("PostgreSQL tunnel open")) {
        clearTimeout(timeout);
        reject(new Error("RAILWAY_TUNNEL_EXITED"));
      }
    });
  });
  let databaseUrl = null;
  try {
    databaseUrl = await ready;
    const result = await runPreflight(databaseUrl);
    process.stdout.write(result.stdout);
    if (result.stderr.trim()) process.stderr.write("[preflight stderr sanitized]\n");
    if (result.status !== 0) process.exitCode = result.status || 1;
  } finally {
    tunnel.kill();
  }
}

function runPreflight(databaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [preflightScript], {
      cwd: backendDir,
      env: {
        ...process.env,
        CRM_DATABASE_PROVIDER: "postgresql",
        CRM_TEST_DATABASE_PROVIDER: "postgresql",
        CRM_TEST_POSTGRES_ALLOW: "true",
        DATABASE_URL: databaseUrl,
        POSTGRES_DATABASE_URL: databaseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", () => reject(new Error("PRODUCTION_PREFLIGHT_START_FAILED")));
    child.on("exit", (status) => resolve({ status: status || 0, stdout, stderr }));
  });
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", code: error.code || "PRODUCTION_TUNNEL_PREFLIGHT_FAILED", message: error.message }));
  process.exitCode = 1;
});
