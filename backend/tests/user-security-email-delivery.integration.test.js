"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "email-delivery-user-security-test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.SECURITY_EMAIL_DELIVERY_FOUNDATION_ENABLED = "true";
process.env.SECURITY_EMAIL_DELIVERY_WORKER_ENABLED = "false";
process.env.SECURITY_EMAIL_DELIVERY_ENCRYPTION_KEY = "user-security-email-delivery-key-with-32-bytes";
process.env.SECURITY_EMAIL_PUBLIC_APP_URL = "https://crm-staging.example.test";
process.env.DATABASE_URL = requiredTestDatabaseUrl();

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => { server = api.app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("convite e reset enfileiram entrega durável sem provider ou outbound", async () => {
  const email = `admin-${Date.now()}@email-delivery.test`;
  const registration = await request("POST", "/auth/register-company", { empresaNome: "Tenant Email Delivery", adminNome: "Admin", email, senha: "SenhaEmailDelivery123" });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaEmailDelivery123" });
  assert.equal(login.status, 200);
  const inviteEmail = `convidado-${Date.now()}@email-delivery.test`;
  const inviteResponse = await request("POST", "/usuarios", { nome: "Convidado", email: inviteEmail, papel: "VENDEDOR" }, login.body.access_token);
  assert.equal(inviteResponse.status, 202);
  assert.equal(inviteResponse.body.invite.deliveryStatus, "PENDING");
  const invite = await prisma.conviteUsuario.findFirstOrThrow({ where: { empresaId: registration.body.empresa.id, emailNormalizado: inviteEmail } });
  assert.equal(invite.deliveryRevision, 1);
  const inviteDelivery = await prisma.emailDeliveryOutbox.findFirstOrThrow({ where: { empresaId: registration.body.empresa.id, sourceType: "USER_INVITE", sourceId: invite.id } });
  assert.equal(inviteDelivery.status, "PENDING");
  assert.equal(inviteDelivery.recipientNormalized, inviteEmail);
  assert.ok(inviteDelivery.payloadCiphertext);

  const recovery = await request("POST", "/auth/forgot-password", { email, empresaSlug: registration.body.empresa.slug });
  assert.equal(recovery.status, 200);
  assert.equal(recovery.body.ok, true);
  const resetToken = await prisma.tokenRecuperacaoSenha.findFirstOrThrow({ where: { empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id, revogadoEm: null } });
  assert.equal(resetToken.deliveryRevision, 1);
  const resetDelivery = await prisma.emailDeliveryOutbox.findFirstOrThrow({ where: { empresaId: registration.body.empresa.id, sourceType: "PASSWORD_RESET", sourceId: resetToken.id } });
  assert.equal(resetDelivery.status, "PENDING");
  assert.equal(resetDelivery.recipientNormalized, email);
  assert.equal(await prisma.emailDeliveryOutbox.count({ where: { empresaId: registration.body.empresa.id } }), 2);

  const concurrentRecovery = await Promise.all([
    request("POST", "/auth/forgot-password", { email, empresaSlug: registration.body.empresa.slug }),
    request("POST", "/auth/forgot-password", { email, empresaSlug: registration.body.empresa.slug }),
  ]);
  assert.deepEqual(concurrentRecovery.map((item) => item.status), [200, 200]);
  const activeTokens = await prisma.tokenRecuperacaoSenha.findMany({ where: { empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id, revogadoEm: null, usadoEm: null } });
  assert.equal(activeTokens.length, 1);
  assert.equal(await prisma.emailDeliveryOutbox.count({ where: { empresaId: registration.body.empresa.id, sourceType: "PASSWORD_RESET", sourceId: activeTokens[0].id, status: "PENDING" } }), 1);
  assert.equal(await prisma.emailDeliveryOutbox.count({ where: { empresaId: registration.body.empresa.id, sourceType: "PASSWORD_RESET", status: "CANCELLED" } }), 2);
});

async function request(method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

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
