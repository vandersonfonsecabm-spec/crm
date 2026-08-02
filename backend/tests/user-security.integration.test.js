const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createUserSecurity, hashToken, refreshRequestOriginAllowed } = require("../src/user-security");

test("refresh sem cookie responde barato e nao compartilha bucket global entre IPs", async () => {
  let refreshHandler;
  let lookups = 0;
  const security = createUserSecurity({
    prisma: {
      sessaoRefreshToken: {
        findUnique: async () => {
          lookups += 1;
          return null;
        },
      },
    },
    jwt: {},
    bcrypt: {},
    config: {},
    securityDelivery: {},
  });
  security.mountRoutes({
    post(pathname, handler) {
      if (pathname === "/auth/refresh") refreshHandler = handler;
    },
    get() {},
    patch() {},
  }, {
    authenticate: () => {},
    requireRole: () => () => {},
    publicUser: (user) => user,
    publicUserSelect: {},
  });

  assert.equal(typeof refreshHandler, "function");
  const responses = [];
  for (let index = 1; index <= 9; index += 1) {
    const result = {};
    await refreshHandler({ headers: {}, socket: { remoteAddress: `192.0.2.${index}` } }, {
      set() { return this; },
      status(status) {
        result.status = status;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    });
    responses.push(result);
  }

  assert.deepEqual(responses.map((result) => result.status), Array(9).fill(401));
  assert.deepEqual(responses.map((result) => result.body?.codigo), Array(9).fill("AUTH_REFRESH_INVALID"));
  assert.equal(lookups, 0);
});

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
  delete globalThis.__CRM_TEST_AUTH_AFTER_PASSWORD_COMPARE;
  delete globalThis.__CRM_TEST_SECURITY_AFTER_INVITE_READ;
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

  const recoveryUnknown = await request("POST", "/auth/forgot-password", { email: "nao-existe@seguranca.example", empresaSlug: registration.body.empresa.slug });
  const recoveryKnown = await request("POST", "/auth/forgot-password", { email: "admin@seguranca.example", empresaSlug: registration.body.empresa.slug });
  assert.equal(recoveryUnknown.status, 200);
  assert.equal(recoveryKnown.status, 200);
  assert.deepEqual(recoveryKnown.body, recoveryUnknown.body);
  const resetMessage = lastMessage("PASSWORD_RESET");
  assert.ok(resetMessage);
  const reset = await request("POST", "/auth/reset-password", { token: resetMessage.token, novaSenha: "SenhaAdminNova123" });
  assert.equal(reset.status, 200);
  const resetReplay = await request("POST", "/auth/reset-password", { token: resetMessage.token, novaSenha: "SenhaAdminOutra123" });
  assert.equal(resetReplay.status, 400);
  const resetInvalid = await request("POST", "/auth/reset-password", { token: "token-de-reset-invalido", novaSenha: "SenhaAdminOutra123" });
  assert.equal(resetInvalid.status, 400);
  await request("POST", "/auth/forgot-password", { email: "admin@seguranca.example", empresaSlug: registration.body.empresa.slug });
  const expiredResetMessage = lastMessage("PASSWORD_RESET");
  await prisma.tokenRecuperacaoSenha.update({ where: { tokenHash: hashToken(expiredResetMessage.token) }, data: { expiraEm: new Date(Date.now() - 1_000) } });
  const resetExpired = await request("POST", "/auth/reset-password", { token: expiredResetMessage.token, novaSenha: "SenhaAdminOutra123" });
  assert.equal(resetExpired.status, 400);

  const adminAfterReset = await request("POST", "/auth/login", { email: "admin@seguranca.example", senha: "SenhaAdminNova123" });
  assert.equal(adminAfterReset.status, 200);
  const adminTokenAfterReset = adminAfterReset.body.access_token;

  const rotatingInvite = await request("POST", "/usuarios", {
    nome: "Convite em Rotacao",
    email: "rotacao@seguranca.example",
    papel: "VENDEDOR",
  }, adminTokenAfterReset);
  assert.equal(rotatingInvite.status, 202);
  const oldRotatingMessage = lastMessage("USER_INVITE");
  const rotationRace = await runInviteRotationRace({
    startAcceptance: () => request("POST", "/auth/accept-invite", {
      token: oldRotatingMessage.token,
      nome: "Convite em Rotacao",
      senha: "SenhaRotacaoInicial123",
    }, undefined, { connection: "close" }),
    rotate: () => request("POST", `/usuarios/convites/${rotatingInvite.body.invite.id}/reenvia`, undefined, adminTokenAfterReset, { connection: "close" }),
  });
  assert.equal(rotationRace.rotation.status, 202);
  assert.equal(rotationRace.acceptance.status, 400);
  assert.equal(rotationRace.acceptance.body.codigo, "INVITE_INVALID");
  assert.equal(await prisma.usuario.count({ where: { empresaId: registration.body.empresa.id, email: "rotacao@seguranca.example" } }), 0);
  const newRotatingMessage = lastMessage("USER_INVITE");
  assert.notEqual(newRotatingMessage.token, oldRotatingMessage.token);
  const acceptedRotatingInvite = await request("POST", "/auth/accept-invite", {
    token: newRotatingMessage.token,
    nome: "Convite em Rotacao",
    senha: "SenhaRotacaoInicial123",
  });
  assert.equal(acceptedRotatingInvite.status, 201);

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
  const acceptedReplay = await request("POST", "/auth/accept-invite", {
    token: inviteMessage.token,
    nome: "Gerente Seguranca",
    senha: "SenhaGerenteInicial123",
  });
  assert.equal(acceptedReplay.status, 400);
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
  const revokedInvite = await request("POST", "/auth/accept-invite", {
    token: revocableMessage.token,
    nome: "Convite Revogavel",
    senha: "SenhaRevogadaInicial123",
  });
  assert.equal(revokedInvite.status, 400);
  const recreatedInvite = await request("POST", "/usuarios", {
    nome: "Convite Revogavel Novamente",
    email: "revogavel@seguranca.example",
    papel: "VENDEDOR",
  }, adminTokenAfterReset);
  assert.equal(recreatedInvite.status, 202);
  const expiringInvite = await request("POST", "/usuarios", {
    nome: "Convite Expirado",
    email: "expirado@seguranca.example",
    papel: "VENDEDOR",
  }, adminTokenAfterReset);
  assert.equal(expiringInvite.status, 202);
  const expiredInviteMessage = lastMessage("USER_INVITE");
  await prisma.conviteUsuario.update({ where: { id: expiringInvite.body.invite.id }, data: { expiraEm: new Date(Date.now() - 1_000) } });
  const expiredInvite = await request("POST", "/auth/accept-invite", {
    token: expiredInviteMessage.token,
    nome: "Convite Expirado",
    senha: "SenhaExpiradaInicial123",
  });
  assert.equal(expiredInvite.status, 400);

  const profile = await request("GET", "/perfil", undefined, adminTokenAfterReset);
  assert.equal(profile.status, 200);
  const profileUpdate = await request("PATCH", "/perfil", { nome: "Admin Segurança Atualizado" }, adminTokenAfterReset);
  assert.equal(profileUpdate.status, 200);
  const passwordChange = await request("POST", "/auth/change-password", {
    senhaAtual: "SenhaAdminNova123",
    novaSenha: "SenhaAdminFinal123",
  }, adminTokenAfterReset);
  assert.equal(passwordChange.status, 200);
  const sessionsBeforePasswordRace = await prisma.sessaoUsuario.count({ where: { empresaId: registration.body.empresa.id } });
  const passwordRace = await runLoginMutationRace({
    startLogin: () => request("POST", "/auth/login", { email: "admin@seguranca.example", senha: "SenhaAdminFinal123" }, undefined, { connection: "close" }),
    mutate: () => request("POST", "/auth/change-password", {
      senhaAtual: "SenhaAdminFinal123",
      novaSenha: "SenhaAdminRaceChanged123",
    }, adminTokenAfterReset, { connection: "close" }),
  });
  assert.equal(passwordRace.mutation.status, 200);
  assert.equal(passwordRace.login.status, 401);
  assert.equal(passwordRace.login.body.codigo, "AUTH_CREDENTIAL_CHANGED");
  assert.equal(await prisma.sessaoUsuario.count({ where: { empresaId: registration.body.empresa.id } }), sessionsBeforePasswordRace);

  const managerLogin = await request("POST", "/auth/login", { email: "gerente@seguranca.example", senha: "SenhaGerenteReset123" });
  assert.equal(managerLogin.status, 200);
  const managerCreateAttempt = await request("POST", "/usuarios", { nome: "Nao Permitido", email: "nao-permitido@seguranca.example", papel: "VENDEDOR" }, managerLogin.body.access_token);
  assert.equal(managerCreateAttempt.status, 403);
  const managerAuditAttempt = await request("GET", "/seguranca/auditoria", undefined, managerLogin.body.access_token);
  assert.equal(managerAuditAttempt.status, 403);
  let managerCookie = cookiePair(managerLogin);
  assert.ok(managerCookie);

  const managerSessions = await request("GET", "/auth/sessions", undefined, managerLogin.body.access_token);
  assert.equal(managerSessions.status, 200);
  const managerSessionId = managerSessions.body.data.find((session) => session.current)?.id;
  assert.ok(managerSessionId);
  const crossUserSessionRevoke = await request("POST", `/auth/sessions/${managerSessionId}/revoke`, undefined, adminTokenAfterReset);
  assert.equal(crossUserSessionRevoke.status, 404);
  const managerRefreshAfterRejectedRevoke = await request("POST", "/auth/refresh", undefined, undefined, { cookie: managerCookie });
  assert.equal(managerRefreshAfterRejectedRevoke.status, 200);
  managerCookie = cookiePair(managerRefreshAfterRejectedRevoke);

  const otherRegistration = await request("POST", "/auth/register-company", {
    empresaNome: "Empresa Seguranca Isolada",
    adminNome: "Outro Admin",
    email: "outro-admin@isolada.example",
    senha: "SenhaOutroAdmin123",
  });
  assert.equal(otherRegistration.status, 201);
  const otherAdminLogin = await request("POST", "/auth/login", {
    email: "outro-admin@isolada.example",
    senha: "SenhaOutroAdmin123",
  });
  assert.equal(otherAdminLogin.status, 200);
  const limitedInvite = await request("POST", "/usuarios", {
    nome: "Convite Limitado",
    email: "limitado@isolada.example",
    papel: "VENDEDOR",
  }, otherAdminLogin.body.access_token);
  assert.equal(limitedInvite.status, 202);
  const resendAttempts = [];
  const resendHandler = createFreshResendHandler();
  for (let index = 0; index < 9; index += 1) {
    resendAttempts.push(await invokeResendHandler(resendHandler, {
      inviteId: limitedInvite.body.invite.id,
      empresaId: otherRegistration.body.empresa.id,
      usuarioId: otherRegistration.body.usuario.id,
    }));
  }
  assert.deepEqual(resendAttempts.slice(0, 8).map((attempt) => attempt.status), Array(8).fill(202));
  assert.equal(resendAttempts[8].status, 429);
  assert.equal(resendAttempts[8].body.codigo, "AUTH_RATE_LIMITED");
  assert.ok(Number(resendAttempts[8].headers.get("retry-after")) > 0);
  const duplicateEmailUser = await prisma.usuario.create({
    data: {
      empresaId: otherRegistration.body.empresa.id,
      nome: "Admin Seguranca Duplicado",
      email: "admin@seguranca.example",
      senhaHash: await bcrypt.hash("SenhaOutroTenant123", 12),
      papel: "ADMIN",
    },
  });
  const resetCountBeforeAmbiguousRequest = await prisma.tokenRecuperacaoSenha.count({ where: { usuarioId: duplicateEmailUser.id } });
  const ambiguousRecovery = await request("POST", "/auth/forgot-password", { email: "admin@seguranca.example" });
  const invalidTenantRecovery = await request("POST", "/auth/forgot-password", { email: "admin@seguranca.example", empresaSlug: "empresa-inexistente" });
  assert.equal(ambiguousRecovery.status, 200);
  assert.deepEqual(ambiguousRecovery.body, invalidTenantRecovery.body);
  assert.equal(await prisma.tokenRecuperacaoSenha.count({ where: { usuarioId: duplicateEmailUser.id } }), resetCountBeforeAmbiguousRequest);
  const isolatedRecovery = await request("POST", "/auth/forgot-password", { email: "admin@seguranca.example", empresaSlug: otherRegistration.body.empresa.slug });
  assert.equal(isolatedRecovery.status, 200);
  const isolatedResetMessage = lastMessage("PASSWORD_RESET");
  const isolatedResetToken = await prisma.tokenRecuperacaoSenha.findUnique({ where: { tokenHash: hashToken(isolatedResetMessage.token) } });
  assert.equal(isolatedResetToken.empresaId, otherRegistration.body.empresa.id);
  assert.equal(isolatedResetToken.usuarioId, duplicateEmailUser.id);
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

  const sessionsBeforeDeactivationRace = await prisma.sessaoUsuario.count({ where: { empresaId: registration.body.empresa.id } });
  const deactivationRace = await runLoginMutationRace({
    startLogin: () => request("POST", "/auth/login", { email: "gerente@seguranca.example", senha: "SenhaGerenteReset123" }, undefined, { connection: "close" }),
    mutate: () => request("POST", `/usuarios/${accepted.body.usuario.id}/desativar`, undefined, adminTokenAfterReset, { connection: "close" }),
  });
  assert.equal(deactivationRace.mutation.status, 200);
  assert.equal(deactivationRace.login.status, 401);
  assert.equal(deactivationRace.login.body.codigo, "AUTH_CREDENTIAL_CHANGED");
  assert.equal(await prisma.sessaoUsuario.count({ where: { empresaId: registration.body.empresa.id } }), sessionsBeforeDeactivationRace);
  const managerRefreshAfterDeactivation = await request("POST", "/auth/refresh", undefined, undefined, { cookie: managerCookie });
  assert.equal(managerRefreshAfterDeactivation.status, 401);

  const staleAdmin = await prisma.usuario.findFirst({
    where: { id: registration.body.usuario.id, empresaId: registration.body.empresa.id },
    include: { empresa: true },
  });
  const recoveryBeforeResetRace = await request("POST", "/auth/forgot-password", {
    email: "admin@seguranca.example",
    empresaSlug: registration.body.empresa.slug,
  });
  assert.equal(recoveryBeforeResetRace.status, 200);
  const raceResetMessage = lastMessage("PASSWORD_RESET");
  const sessionsBeforeResetRace = await prisma.sessaoUsuario.count({ where: { empresaId: registration.body.empresa.id } });
  const resetRace = await request("POST", "/auth/reset-password", { token: raceResetMessage.token, novaSenha: "SenhaAdminAfterRace123" });
  assert.equal(resetRace.status, 200);
  const staleLoginSecurity = createUserSecurity({
    prisma,
    jwt,
    bcrypt,
    config: {
      signAccessToken: ({ usuario, sessionId }) => jwt.sign({ empresaId: usuario.empresaId, papel: usuario.papel, sid: sessionId }, process.env.JWT_SECRET, { subject: String(usuario.id), expiresIn: "15m" }),
      jwtDecode: (token) => jwt.decode(token),
    },
    production: false,
    securityDelivery: globalThis.__CRM_TEST_SECURITY_DELIVERY,
  });
  await assert.rejects(
    staleLoginSecurity.createLoginSession({ usuario: staleAdmin, expectedPasswordHash: staleAdmin.senhaHash, req: { headers: {} } }),
    (error) => error?.code === "AUTH_CREDENTIAL_CHANGED",
  );
  assert.equal(await prisma.sessaoUsuario.count({ where: { empresaId: registration.body.empresa.id } }), sessionsBeforeResetRace);

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

async function runLoginMutationRace({ startLogin, mutate }) {
  let releaseLogin;
  let markCompareReached;
  const compareReached = new Promise((resolve) => {
    markCompareReached = resolve;
  });
  const loginReleased = new Promise((resolve) => {
    releaseLogin = resolve;
  });

  globalThis.__CRM_TEST_AUTH_AFTER_PASSWORD_COMPARE = async () => {
    markCompareReached();
    await loginReleased;
  };

  try {
    const loginPromise = startLogin();
    await compareReached;
    const mutation = await mutate();
    releaseLogin();
    return { login: await loginPromise, mutation };
  } finally {
    releaseLogin();
    delete globalThis.__CRM_TEST_AUTH_AFTER_PASSWORD_COMPARE;
  }
}

async function runInviteRotationRace({ startAcceptance, rotate }) {
  let releaseAcceptance;
  let markInviteRead;
  const inviteRead = new Promise((resolve) => {
    markInviteRead = resolve;
  });
  const acceptanceReleased = new Promise((resolve) => {
    releaseAcceptance = resolve;
  });

  globalThis.__CRM_TEST_SECURITY_AFTER_INVITE_READ = async () => {
    markInviteRead();
    await acceptanceReleased;
  };

  try {
    const acceptancePromise = startAcceptance();
    await inviteRead;
    const rotation = await rotate();
    releaseAcceptance();
    return { acceptance: await acceptancePromise, rotation };
  } finally {
    releaseAcceptance();
    delete globalThis.__CRM_TEST_SECURITY_AFTER_INVITE_READ;
  }
}

function createFreshResendHandler() {
  let resendHandler;
  const security = createUserSecurity({
    prisma,
    jwt,
    bcrypt,
    config: {},
    production: false,
    securityDelivery: globalThis.__CRM_TEST_SECURITY_DELIVERY,
  });
  security.mountRoutes({
    post(pathname, ...handlers) {
      if (pathname === "/usuarios/convites/:id/reenvia") resendHandler = handlers.at(-1);
    },
    get() {},
    patch() {},
  }, {
    authenticate: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    publicUser: (user) => user,
    publicUserSelect: {},
  });
  assert.equal(typeof resendHandler, "function");
  return resendHandler;
}

async function invokeResendHandler(handler, { inviteId, empresaId, usuarioId }) {
  const result = { status: 200, body: null, headers: new Headers() };
  const response = {
    set(name, value) {
      result.headers.set(name, value);
      return this;
    },
    status(status) {
      result.status = status;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await handler({
    params: { id: inviteId },
    auth: { empresaId, usuarioId },
    headers: {},
    socket: { remoteAddress: "192.0.2.200" },
  }, response);
  return result;
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
