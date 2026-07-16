const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-leads-services-b1");
const databasePath = path.join(auditDir, `feature-flag-${process.pid}.db`);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "leads-feature-flag-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "leads-feature-flag-test-encryption-key-32";
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
delete process.env.LEADS_COMMUNICATION_ENABLED;

let api;
let server;
let baseUrl;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  migrate();
  api = require("../src/server");
  await new Promise((resolve) => { server = api.app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (api?.prisma) await api.prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  removeDatabase(databasePath);
});

test("flag fica desligada por padrao e somente o valor exato true habilita as rotas", async () => {
  const beforeCount = await api.prisma.lead.count();
  for (const value of [undefined, "false", "TRUE", "1", " true "]) {
    if (value === undefined) delete process.env.LEADS_COMMUNICATION_ENABLED;
    else process.env.LEADS_COMMUNICATION_ENABLED = value;
    const response = await request("POST", "/leads", { clienteId: 1 });
    assert.equal(response.status, 404);
    assert.equal(response.body.codigo, "NOT_FOUND");
    assert.equal((await request("POST", "/conversas/1/reserva-resposta", {})).status, 404);
  }
  assert.equal(await api.prisma.lead.count(), beforeCount);

  process.env.LEADS_COMMUNICATION_ENABLED = "true";
  const enabled = await request("GET", "/leads");
  assert.equal(enabled.status, 401);
});

function migrate() {
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });
}

async function request(method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
