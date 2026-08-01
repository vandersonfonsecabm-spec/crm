const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { refreshRequestOriginAllowed } = require("../src/user-security");

const testDatabaseUrl = requiredTestDatabaseUrl();

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "user-security-integration-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "15m";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.AUTH_TEST_CAPTURE = "true";
process.env.PLATFORM_ADMIN_EMAILS = "reserved@platform.example";
process.env.DATABASE_URL = testDatabaseUrl;

const capturedSecurityMessages = [];
globalThis.__CRM_TEST_SECURITY_DELIVERY = {
  async deliver(message) {
    capturedSecurityMessages.push({ ...message });
    return { status: "TEST_CAPTURED" };
  },
};

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  delete globalThis.__CRM_TEST_SECURITY_DELIVERY;
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("gestao de usuarios, sessoes, senhas, convites e auditoria permanece tenant-scoped", async () => {
  assert.equal(refreshRequestOriginAllowed({ headers: { origin: "https://malicious.example" } }, ["http://localhost:5173"], true), false);
  assert.equal(refreshRequestOriginAllowed({ headers: { origin: "http://localhost:5173" } }, ["http://localhost:5173"], true), true);
  assert.equal(refreshRequestOriginAllowed({ headers: {} }, ["http://localhost:5173"], true), false);

  const registration = await request("POST", "/auth/register-company", {
    empresaNome: "Empresa Seguranca Focal",
    adminNome: "Admin Seguranca",
    email: "admin@seguranca.example",
    senha: "SenhaAdminInicial123",
  });
  assert.equal(registration.status, 201);

  const login = await request("POST", "/auth/login", {
    email: "admin@seguranca.example",
    senha: "SenhaAdminInicial123",
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.access_token);
  const adminToken = login.body.access_token;
  const firstCookie = cookiePair(login);
  assert.ok(firstCookie);

  const csrfRejected = await request("POST", "/auth/refresh", undefined, undefined, {
    cookie: firstCookie,
    origin: "https://malicious.example",
  });
  assert.equal(csrfRejected.status, 403);

  const initialSessions = await request("GET", "/auth/sessions", undefined, adminToken);
  assert.equal(initialSessions.status, 200);
  assert.equal(initialSessions.body.data.filter((session) => session.active).length, 1);

  const refresh = await request("POST", "/auth/refresh", undefined, undefined, { cookie: firstCookie });
  assert.equal(refresh.status, 200);
  const rotatedCookie = cookiePair(refresh);
  assert.ok(rotatedCookie);
  assert.notEqual(rotatedCookie, firstCookie);

  const replay = await request("POST", "/auth/refresh", undefined, undefined, { cookie: firstCookie });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.codigo, "AUTH_REFRESH_REUSED");
  const rotatedAfterReplay = await request("POST", "/auth/refresh", undefined, undefined, { cookie: rotatedCookie });
  assert.equal(rotatedAfterReplay.status, 401);

  const freshLogin = await request("POST", "/auth/login", {
    email: "admin@seguranca.example",
    senha: "SenhaAdminInicial123",
  });
  assert.equal(freshLogin.status, 200);
  const freshAdminToken = freshLogin.body.access_token;

  const recoveryUnknown = await request("POST", "/auth/forgot-password", { email: "nao-existe@seguranca.example" });
  const recoveryKnown = await request("POST", "/auth/forgot-password", { email: "admin@seguranca.example" });
  assert.equal(recoveryUnknown.status, 200);
  assert.equal(recoveryKnown.status, 200);
  assert.deepEqual(recoveryKnown.body, recoveryUnknown.body);
  const resetMessage = lastMessage("PASSWORD_RESET");
  assert.ok(resetMessage);
  const reset = await request("POST", "/auth/reset-password", { token: resetMessage.token, novaSenha: "SenhaAdminNova123" });
  assert.equal(reset.status, 200);
  const resetReplay = await request("POST", "/auth/reset-password", { token: resetMessage.token, novaSenha: "SenhaAdminOutra123" });
  assert.equal(resetReplay.status, 400);

  const adminAfterReset = await request("POST", "/auth/login", { email: "admin@seguranca.example", senha: "SenhaAdminNova123" });
  assert.equal(adminAfterReset.status, 200);
  const adminTokenAfterReset = adminAfterReset.body.access_token;

  const invite = await request("POST", "/usuarios", {
    nome: "Gerente Seguranca",
    email: "gerente@seguranca.example",
    papel: "GERENTE",
  }, adminTokenAfterReset);
  assert.equal(invite.status, 202);
  const inviteMessage = lastMessage("USER_INVITE");
  assert.ok(inviteMessage);

  const reservedInvite = await request("POST", "/usuarios", {
    nome: "Operador reservado",
    email: "reserved@platform.example",
    papel: "ADMIN",
  }, adminTokenAfterReset);
  assert.equal(reservedInvite.status, 409);
  assert.equal(reservedInvite.body.codigo, "RESERVED_PLATFORM_EMAIL");

  const accepted = await request("POST", "/auth/accept-invite", {
    token: inviteMessage.token,
    nome: "Gerente Seguranca",
    senha: "SenhaGerenteInicial123",
  });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.usuario.senhaHash, undefined);
  const adminReset = await request("POST", `/usuarios/${accepted.body.usuario.id}/iniciar-reset-senha`, undefined, adminTokenAfterReset);
  assert.equal(adminReset.status, 202);
  assert.equal(adminReset.body.token, undefined);
  const adminResetMessage = lastMessage("PASSWORD_RESET");
  assert.ok(adminResetMessage);
  const adminResetCompletion = await request("POST", "/auth/reset-password", { token: adminResetMessage.token, novaSenha: "SenhaGerenteReset123" });
  assert.equal(adminResetCompletion.status, 200);

  const duplicateInvite = await request("POST", "/usuarios", {
    nome: "Gerente Duplicado",
    email: "gerente@seguranca.example",
    papel: "GERENTE",
  }, adminTokenAfterReset);
  assert.equal(duplicateInvite.status, 409);

  const revocableInvite = await request("POST", "/usuarios", {
    nome: "Convite Revogavel",
    email: "revogavel@seguranca.example",
    papel: "VENDEDOR",
  }, adminTokenAfterReset);
  assert.equal(revocableInvite.status, 202);
  const revocableMessage = lastMessage("USER_INVITE");
  const revokeInvite = await request("POST", `/usuarios/convites/${revocableInvite.body.invite.id}/revoga`, undefined, adminTokenAfterReset);
  assert.equal(revokeInvite.status, 200);
  const recreatedInvite = await request("POST", "/usuarios", {
    nome: "Convite Revogavel Novamente",
    email: "revogavel@seguranca.example",
    papel: "VENDEDOR",
  }, adminTokenAfterReset);
  assert.equal(recreatedInvite.status, 202);

  const profile = await request("GET", "/perfil", undefined, adminTokenAfterReset);
  assert.equal(profile.status, 200);
  const profileUpdate = await request("PATCH", "/perfil", { nome: "Admin Segurança Atualizado" }, adminTokenAfterReset);
  assert.equal(profileUpdate.status, 200);
  const passwordChange = await request("POST", "/auth/change-password", {
    senhaAtual: "SenhaAdminNova123",
    novaSenha: "SenhaAdminFinal123",
  }, adminTokenAfterReset);
  assert.equal(passwordChange.status, 200);

  const managerLogin = await request("POST", "/auth/login", { email: "gerente@seguranca.example", senha: "SenhaGerenteReset123" });
  assert.equal(managerLogin.status, 200);
  const managerCreateAttempt = await request("POST", "/usuarios", { nome: "Nao Permitido", email: "nao-permitido@seguranca.example", papel: "VENDEDOR" }, managerLogin.body.access_token);
  assert.equal(managerCreateAttempt.status, 403);
  const managerAuditAttempt = await request("GET", "/seguranca/auditoria", undefined, managerLogin.body.access_token);
  assert.equal(managerAuditAttempt.status, 403);
  const managerCookie = cookiePair(managerLogin);
  assert.ok(managerCookie);

  const otherRegistration = await request("POST", "/auth/register-company", {
    empresaNome: "Empresa Seguranca Isolada",
    adminNome: "Outro Admin",
    email: "outro-admin@isolada.example",
    senha: "SenhaOutroAdmin123",
  });
  assert.equal(otherRegistration.status, 201);
  const crossTenantRead = await request("GET", `/usuarios/${otherRegistration.body.usuario.id}`, undefined, adminTokenAfterReset);
  assert.equal(crossTenantRead.status, 404);

  const auditRead = await request("GET", "/seguranca/auditoria?limit=20", undefined, adminTokenAfterReset);
  assert.equal(auditRead.status, 200);
  assert.ok(Array.isArray(auditRead.body.data));
  assert.equal(JSON.stringify(auditRead.body).includes(resetMessage.token), false);
  assert.equal(JSON.stringify(auditRead.body).includes(inviteMessage.token), false);
  assert.equal(JSON.stringify(auditRead.body).includes(adminResetMessage.token), false);

  const audits = await prisma.auditoriaSeguranca.findMany({ where: { empresaId: registration.body.empresa.id } });
  assert.ok(audits.length >= 6);
  const auditText = JSON.stringify(audits);
  assert.equal(auditText.includes(resetMessage.token), false);
  assert.equal(auditText.includes(inviteMessage.token), false);
  assert.equal(auditText.includes(adminResetMessage.token), false);

  const deactivatedManager = await request("POST", `/usuarios/${accepted.body.usuario.id}/desativar`, undefined, adminTokenAfterReset);
  assert.equal(deactivatedManager.status, 200);
  const managerRefreshAfterDeactivation = await request("POST", "/auth/refresh", undefined, undefined, { cookie: managerCookie });
  assert.equal(managerRefreshAfterDeactivation.status, 401);

  const userRows = await prisma.usuario.findMany({ where: { empresaId: registration.body.empresa.id }, select: { senhaHash: true } });
  assert.equal(userRows.every((row) => !row.senhaHash.includes("Senha")), true);
  const tokenRows = await prisma.tokenRecuperacaoSenha.findMany({ where: { empresaId: registration.body.empresa.id }, select: { tokenHash: true } });
  assert.equal(tokenRows.every((row) => ![resetMessage.token, adminResetMessage.token].includes(row.tokenHash)), true);
  assert.equal(await prisma.sessaoUsuario.count({ where: { empresaId: registration.body.empresa.id } }) > 0, true);
  assert.equal(await prisma.sessaoRefreshToken.count({ where: { empresaId: registration.body.empresa.id } }) > 0, true);
});

function lastMessage(kind) {
  return [...capturedSecurityMessages].reverse().find((message) => message.kind === kind);
}

function cookiePair(response) {
  const value = response.headers.get("set-cookie") || "";
  return value.split(";")[0] || "";
}

async function request(method, pathname, body, token, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...extraHeaders,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
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
