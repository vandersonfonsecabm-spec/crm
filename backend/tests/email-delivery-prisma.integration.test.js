"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

process.env.NODE_ENV = "test";
process.env.SECURITY_EMAIL_DELIVERY_ENCRYPTION_KEY = "email-delivery-prisma-test-key-with-at-least-32-bytes";
process.env.SECURITY_EMAIL_PUBLIC_APP_URL = "https://crm-staging.example.test";
process.env.DATABASE_URL = requiredTestDatabaseUrl();

const { PrismaClient } = require("@prisma/client");
const { createEmailDeliveryService } = require("../src/email-delivery/service");

let prisma;
let empresa;
let inviter;

before(async () => {
  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  empresa = await prisma.empresa.create({ data: { nome: "Email Delivery QA", slug: `email-delivery-${Date.now()}` } });
  inviter = await prisma.usuario.create({ data: { empresaId: empresa.id, nome: "Admin QA", email: `admin-${Date.now()}@email.test`, senhaHash: "test", papel: "ADMIN" } });
});

after(async () => {
  if (prisma) await prisma.$disconnect();
});

test("Prisma persiste outbox tenant-scoped, CAS de claim e receipt idempotente", async () => {
  const invite = await prisma.conviteUsuario.create({
    data: {
      empresaId: empresa.id,
      convidadoPorId: inviter.id,
      nomeConvidado: "Pessoa Convidada",
      emailNormalizado: "convidado@email.test",
      tokenHash: "hash-email-delivery-prisma",
      expiraEm: new Date(Date.now() + 60_000),
    },
  });
  const sent = [];
  const service = createEmailDeliveryService({
    prisma,
    env: process.env,
    port: { configured: true, async send(message) { sent.push(message); return { providerMessageId: "provider-prisma-1" }; } },
    logger: { warn() {}, info() {}, error() {} },
  });
  const queued = await prisma.$transaction((tx) => service.enqueue({
    tx,
    empresaId: empresa.id,
    kind: "USER_INVITE",
    sourceId: invite.id,
    expectedRevision: invite.deliveryRevision,
    recipient: invite.emailNormalizado,
    token: "raw-prisma-token",
    expiresAt: invite.expiraEm,
    correlationId: "prisma-email-test",
  }));
  const stored = await prisma.emailDeliveryOutbox.findUniqueOrThrow({ where: { id: queued.id } });
  assert.equal(stored.payloadCiphertext.includes("raw-prisma-token"), false);
  assert.equal((await prisma.conviteUsuario.findUniqueOrThrow({ where: { id: invite.id } })).deliveryRevision, 1);

  const claimNow = new Date(Date.now() + 100);
  const claims = await Promise.all([
    service.claimDue({ now: claimNow, leaseOwner: "worker-prisma-a", limit: 1 }),
    service.claimDue({ now: claimNow, leaseOwner: "worker-prisma-b", limit: 1 }),
  ]);
  assert.equal(claims[0].length + claims[1].length, 1);
  const claimed = claims.flat()[0];
  await prisma.emailDeliveryOutbox.update({
    where: { id: claimed.id },
    data: { status: "PENDING", attempts: 0, leaseOwner: null, leaseToken: null, leaseExpiresAt: null },
  });
  const processed = await service.processDue({ now: new Date(claimNow.getTime() + 100), leaseOwner: "worker-prisma-final" });
  assert.equal(processed.delivered, 1);
  assert.equal(sent.length, 1);
  const delivered = await prisma.emailDeliveryOutbox.findUniqueOrThrow({ where: { id: queued.id } });
  assert.equal(delivered.status, "DELIVERED");
  assert.equal(delivered.payloadCiphertext, null);

  const receipt = await service.recordProviderEvent({
    empresaId: empresa.id,
    deliveryId: queued.id,
    providerEventId: "provider-event-prisma-1",
    providerOccurredAt: new Date(),
    status: "BOUNCED",
    providerMessageId: "provider-prisma-1",
    metadata: { category: "hard", secret: "not-persisted" },
  });
  assert.equal(receipt.applied, true);
  const duplicate = await service.recordProviderEvent({
    empresaId: empresa.id,
    deliveryId: queued.id,
    providerEventId: "provider-event-prisma-1",
    providerOccurredAt: new Date(),
    status: "BOUNCED",
    providerMessageId: "provider-prisma-1",
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal((await prisma.emailDeliveryOutbox.findUniqueOrThrow({ where: { id: queued.id } })).status, "BOUNCED");
});

function requiredTestDatabaseUrl() {
  const value = String(process.env.CRM_TEST_DATABASE_URL || "").trim();
  if (process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql" && /^postgres(ql)?:\/\//i.test(value)) return value;
  if (!value.startsWith("file:")) throw new Error("CRM_TEST_DATABASE_URL absoluta e obrigatoria.");
  const databasePath = path.resolve(value.slice("file:".length));
  const testRoot = path.join(os.tmpdir(), "crm-prisma-tests");
  const relative = path.relative(testRoot, databasePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("O teste deve usar somente %TEMP%\\crm-prisma-tests.");
  return `file:${databasePath.replace(/\\/g, "/")}`;
}
