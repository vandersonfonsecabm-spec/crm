"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const project = "ddfbf66c-e274-47b1-9493-286232d2f426";
const environment = "production";
const dumpImage = "postgres:18.6";
const defaultOutput = path.join(os.tmpdir(), "crm-v1-official-backup-20260826", "production.dump");

async function main() {
  const outputPath = path.resolve(process.argv[2] || defaultOutput);
  if (fs.existsSync(outputPath)) throw new Error("BACKUP_DESTINATION_ALREADY_EXISTS");
  const api = railwayVariables("api");
  const database = railwayVariables("Postgres-u_yI");
  const apiUrl = parsePostgresUrl(api.DATABASE_URL);
  const publicUrl = parsePostgresUrl(database.DATABASE_PUBLIC_URL);
  if (!apiUrl.password) throw new Error("API_DATABASE_PASSWORD_MISSING");
  if (!publicUrl.hostname || !publicUrl.port) throw new Error("DATABASE_PUBLIC_ENDPOINT_MISSING");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const args = [
    "run", "--rm", "--env", "PGPASSWORD", dumpImage, "pg_dump",
    "--host", publicUrl.hostname,
    "--port", publicUrl.port,
    "--username", publicUrl.username,
    "--dbname", publicUrl.pathname.slice(1),
    "--format=custom",
    "--no-owner",
    "--no-acl",
  ];
  const result = await runDockerDump(args, { PGPASSWORD: apiUrl.password }, outputPath);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
  console.log(JSON.stringify({
    status: "passed",
    outputPath,
    bytes: fs.statSync(outputPath).size,
    sha256: digest,
    image: dumpImage,
    source: "production Postgres via API credential + public TCP proxy",
  }, null, 2));
  return result;
}

function railwayVariables(service) {
  const raw = execFileSync("cmd.exe", ["/c", `railway variable list --project ${project} --environment ${environment} --service ${service} --json`], { encoding: "utf8" });
  const data = JSON.parse(raw);
  const variables = Array.isArray(data) ? data : (data.variables || data);
  const entries = Array.isArray(variables) ? variables.map((item) => [item.name || item.key, item.value]) : Object.entries(variables);
  return Object.fromEntries(entries);
}

function parsePostgresUrl(value) {
  const url = new URL(String(value || ""));
  if (!/^postgres(?:ql)?:$/i.test(url.protocol)) throw new Error("POSTGRES_URL_REQUIRED");
  return {
    hostname: url.hostname,
    port: url.port || "5432",
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    pathname: url.pathname,
  };
}

function runDockerDump(args, envValues, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: path.dirname(outputPath),
      env: { ...process.env, ...envValues },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const output = fs.createWriteStream(outputPath, { flags: "wx" });
    let stderrBytes = 0;
    let childCode = null;
    let streamFinished = false;
    const finalize = () => {
      if (!streamFinished || childCode === null) return;
      if (childCode !== 0) {
        try { fs.rmSync(outputPath, { force: true }); } catch {}
        reject(new Error(`PG_DUMP_FAILED_${childCode}_${stderrBytes}`));
        return;
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        try { fs.rmSync(outputPath, { force: true }); } catch {}
        reject(new Error("PG_DUMP_EMPTY"));
        return;
      }
      resolve({ status: "passed" });
    };
    child.stdout.pipe(output);
    child.stderr.on("data", (chunk) => { stderrBytes += Buffer.byteLength(chunk); });
    child.on("error", (error) => {
      output.destroy();
      try { fs.rmSync(outputPath, { force: true }); } catch {}
      reject(new Error(error.code === "ENOENT" ? "DOCKER_NOT_FOUND" : "DOCKER_DUMP_START_FAILED"));
    });
    output.on("finish", () => { streamFinished = true; finalize(); });
    child.on("close", (code) => { childCode = code; finalize(); });
  });
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", code: error.code || "PRODUCTION_BACKUP_FAILED", message: error.message }));
  process.exitCode = 1;
});
