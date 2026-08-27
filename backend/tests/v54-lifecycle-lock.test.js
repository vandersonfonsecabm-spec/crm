process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const lockSource = fs.readFileSync(path.join(root, "src", "shared", "clientLifecycleLock.js"), "utf8");
const writerFiles = [
  "src/agenda/service.js",
  "src/leads-communication/services.js",
  "src/leads-communication/commercialQualification.js",
  "src/negocios-kanban/services.js",
  "src/commercial-proposals/service.js",
  "src/automations/service.js",
  "src/customer-360/service.js",
  "src/site-leads/service.js",
  "src/channels/whatsapp/simulationService.js",
  "src/integrations/emailInboundProcessor.js",
  "src/integrations/whatsappWebhookProcessor.js",
  "src/integrations/messengerWebhookProcessor.js",
  "src/integrations/instagramWebhookProcessor.js",
];

test("V54 lifecycle lock is shared, tenant-scoped and ordered", () => {
  assert.match(lockSource, /FOR UPDATE/);
  assert.match(lockSource, /empresaId/);
  assert.match(lockSource, /sort\(\(a, b\) => a - b\)/);
  for (const relative of writerFiles) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(source, /clientLifecycleLock/, `${relative} must import the lifecycle helper`);
  }
  const automationSource = fs.readFileSync(path.join(root, "src", "automations", "service.js"), "utf8");
  assert.match(automationSource, /prisma\.\$transaction\(async \(tx\) => \{[\s\S]{0,1200}lockActiveClienteRow\(tx, empresaId/,
    "temporal lead enqueue must lock the client inside its final transaction");
  assert.match(automationSource, /currentBusiness[\s\S]{0,500}lockActiveClienteRow\(tx, empresaId/,
    "temporal business enqueue must lock the client inside its final transaction");
});

test("V54 PostgreSQL concurrency proof runs only with an explicit disposable URL", { skip: !/^postgres(?:ql)?:/i.test(String(process.env.CRM_TEST_DATABASE_URL || "")) || process.env.CRM_TEST_POSTGRES_ALLOW !== "true" }, async () => {
  const { PrismaClient } = require("@prisma/client");
  const { lockClientIdentity } = require("../src/shared/clientLifecycleLock");
  const first = new PrismaClient({ datasourceUrl: process.env.CRM_TEST_DATABASE_URL });
  const second = new PrismaClient({ datasourceUrl: process.env.CRM_TEST_DATABASE_URL });
  const suffix = `${process.pid}-${Date.now()}`;
  let empresa;
  try {
    empresa = await first.empresa.create({ data: { nome: `V54 lock ${suffix}`, slug: `v54-lock-${suffix}` } });
    await first.$transaction((tx) => lockClientIdentity(tx, empresa.id, `email:lock-${suffix}@example.test`));
    const client = await first.cliente.create({ data: { empresaId: empresa.id, nome: "V54 synthetic lock", telefone: "5511999999999", status: "Lead" } });
    const holder = first.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Cliente" WHERE "empresaId" = ${empresa.id} AND id = ${client.id} FOR UPDATE`;
      await new Promise((resolve) => setTimeout(resolve, 600));
      await tx.nota.create({ data: { empresaId: empresa.id, clienteId: client.id, texto: "V54 lock proof", tipo: "sistema" } });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const started = Date.now();
    await second.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Cliente" WHERE "empresaId" = ${empresa.id} AND id = ${client.id} FOR UPDATE`;
      await tx.cliente.update({ where: { id: client.id }, data: { arquivadoEm: new Date(), statusAntesDeArquivar: "Lead", status: "Arquivado" } });
    });
    await holder;
    assert.ok(Date.now() - started >= 400, "archive must wait for the writer lock");
    const preserved = await first.nota.count({ where: { empresaId: empresa.id, clienteId: client.id } });
    assert.equal(preserved, 1);
    await assert.rejects(second.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT "arquivadoEm" FROM "Cliente" WHERE "empresaId" = ${empresa.id} AND id = ${client.id} FOR UPDATE`;
      if (locked[0]?.arquivadoEm) throw Object.assign(new Error("CLIENT_ARCHIVED_READ_ONLY"), { code: "CLIENT_ARCHIVED_READ_ONLY" });
      await tx.nota.create({ data: { empresaId: empresa.id, clienteId: client.id, texto: "must not write", tipo: "sistema" } });
    }), /CLIENT_ARCHIVED_READ_ONLY/);
  } finally {
    if (empresa) await first.empresa.delete({ where: { id: empresa.id } }).catch(() => {});
    await first.$disconnect();
    await second.$disconnect();
  }
});
