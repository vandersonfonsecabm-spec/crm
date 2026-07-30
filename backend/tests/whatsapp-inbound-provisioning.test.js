const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";
const suffix = `${Date.now()}-${process.pid}`;
const createdTenantIds = [];
let databasePath;

if (!postgres) {
  const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
  databasePath = path.join(runDir, "whatsapp-inbound-provisioning", `provisioning-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "whatsapp-inbound-provisioning-test-secret-with-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  WHATSAPP_INTEGRATION_ENABLED: "false",
  WHATSAPP_INBOUND_ENABLED: "false",
  WHATSAPP_OUTBOUND_ENABLED: "false",
  WHATSAPP_META_APP_ID: "000GLOBAL_APP_F1C1",
  WHATSAPP_PROVIDER_ENVIRONMENT: "F1C1_TEST",
});
delete process.env.PLATFORM_ADMIN_EMAILS;
delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
delete process.env.WHATSAPP_APP_SECRET;

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
  delete process.env.PLATFORM_ADMIN_EMAILS;
  let cleanupError;
  try {
    if (prisma && createdTenantIds.length) {
      await prisma.canalIntegracao.deleteMany({ where: { empresaId: { in: createdTenantIds } } });
      await prisma.usuario.deleteMany({ where: { empresaId: { in: createdTenantIds } } });
      await prisma.empresa.deleteMany({ where: { id: { in: createdTenantIds } } });
    }
  } catch (error) {
    cleanupError = error;
  } finally {
    if (server) {
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (prisma) await prisma.$disconnect();
    if (databasePath) removeDatabase(databasePath);
  }
  if (cleanupError) throw cleanupError;
});

test("F1C-1 provisiona um unico canal WhatsApp inbound real com contrato fechado", async () => {
  const operator = await register("Operadora F1C1", "Operadora", uniqueEmail("operator"));
  const target = await register("Tenant Alvo F1C1", "Admin Alvo", uniqueEmail("target"));
  const manager = await createUser(target, "Gerente Alvo", uniqueEmail("manager"), "GERENTE");
  const seller = await createUser(target, "Vendedor Alvo", uniqueEmail("seller"), "VENDEDOR");
  process.env.PLATFORM_ADMIN_EMAILS = operator.email.toUpperCase();

  assert.equal((await put(target.empresaId, validCreation(), target.token)).status, 403);
  assert.equal((await put(target.empresaId, validCreation(), manager.token)).status, 403);
  assert.equal((await put(target.empresaId, validCreation(), seller.token)).status, 403);
  assert.equal((await put(999999999, validCreation(), operator.token)).status, 404);

  const appId = process.env.WHATSAPP_META_APP_ID;
  const environment = process.env.WHATSAPP_PROVIDER_ENVIRONMENT;
  delete process.env.WHATSAPP_META_APP_ID;
  let response = await put(target.empresaId, validCreation(), operator.token);
  assert.equal(response.status, 503);
  assert.equal(response.body.codigo, "WHATSAPP_GLOBAL_CONFIGURATION_INVALID");
  process.env.WHATSAPP_META_APP_ID = appId;
  process.env.WHATSAPP_PROVIDER_ENVIRONMENT = "ambiente invalido";
  response = await put(target.empresaId, validCreation(), operator.token);
  assert.equal(response.status, 503);
  process.env.WHATSAPP_PROVIDER_ENVIRONMENT = environment;

  for (const field of [
    "accessToken",
    "accessTokenRef",
    "appSecret",
    "verifyToken",
    "metaAppId",
    "metaBusinessId",
    "providerEnvironment",
    "graphApiVersion",
    "onboardingMethod",
    "ativo",
    "status",
    "credentialStatus",
    "connectedAt",
    "verifiedAt",
    "lastWebhookAt",
    "lastFailureAt",
    "lastFailureCode",
    "empresaId",
    "tipo",
    "modoTeste",
    "chaveInterna",
    "campoDesconhecido",
  ]) {
    const forbidden = await put(target.empresaId, { ...validCreation(), [field]: "nao-permitido" }, operator.token);
    assert.equal(forbidden.status, 422, field);
    assert.equal(forbidden.body.codigo, "WHATSAPP_PROVISIONING_INVALID", field);
  }
  const reflectedField = "attacker@example.test";
  const reflected = await put(target.empresaId, {
    ...validCreation(),
    [reflectedField]: "nao-permitido",
  }, operator.token);
  assert.equal(reflected.status, 422);
  assert.equal(JSON.stringify(reflected.body).includes(reflectedField), false);
  assert.equal((await put(target.empresaId, {
    ...validCreation(),
    displayPhoneMasked: "+55 * 11 99999-0000",
  }, operator.token)).status, 422);

  const testChannel = await prisma.canalIntegracao.create({
    data: {
      empresaId: target.empresaId,
      tipo: "WHATSAPP_META",
      nome: "Canal de teste preservado",
      chaveInterna: "whatsapp-meta-test",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
    },
  });
  const countsBefore = await effectCounts(target.empresaId);
  const auditLines = [];
  const originalInfo = console.info;
  console.info = (line) => auditLines.push(String(line));
  try {
    response = await put(target.empresaId, {
      ...validCreation(),
      reason: "Provisionar operator@example.test +55 11 99999-0000 CPF 123.456.789-00 token=abc 123e4567-e89b-12d3-a456-426614174000",
    }, operator.token, { "x-correlation-id": "f1c1-create" });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(response.status, 201);
  assert.equal(response.body.changed, true);
  assert.equal(response.body.tipo, "WHATSAPP_META");
  assert.equal(response.body.ativo, false);
  assert.equal(response.body.modoTeste, false);
  assert.equal(response.body.state, "NOT_CONFIGURED");
  assert.equal(response.body.metadata.name, "WhatsApp inbound real");
  assert.equal(response.body.metadata.displayPhoneMasked, "+55 ** *****-0000");
  assert.match(response.body.identity.wabaHash, /^[a-f0-9]{16}$/);
  assert.match(response.body.identity.phoneNumberHash, /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(response.body).includes("000WABA_F1C1"), false);
  assert.equal(JSON.stringify(response.body).includes("000PHONE_F1C1"), false);
  assert.equal(JSON.stringify(response.body).includes(appId), false);

  const channel = await prisma.canalIntegracao.findUnique({
    where: {
      empresaId_chaveInterna: {
        empresaId: target.empresaId,
        chaveInterna: "whatsapp-meta-inbound-real",
      },
    },
  });
  assert.ok(channel);
  assert.equal(channel.wabaId, "000WABA_F1C1");
  assert.equal(channel.phoneNumberId, "000PHONE_F1C1");
  assert.equal(channel.metaAppId, appId);
  assert.equal(channel.providerEnvironment, environment);
  assert.equal(channel.status, "INATIVO");
  assert.equal(channel.ativo, false);
  assert.equal(channel.modoTeste, false);
  assert.equal(channel.accessTokenRef, null);
  assert.equal(channel.credentialStatus, null);
  assert.equal(channel.connectedAt, null);
  assert.equal(channel.verifiedAt, null);
  assert.equal(channel.lastWebhookAt, null);
  assert.equal(channel.lastFailureAt, null);
  assert.equal(channel.lastFailureCode, null);

  const tenantAdminPatch = await request(
    "PATCH",
    `/canais/${channel.id}`,
    { nome: "Tentativa de bypass", ativo: true },
    target.token,
  );
  assert.equal(tenantAdminPatch.status, 403);
  assert.equal(tenantAdminPatch.body.codigo, "CHANNEL_PLATFORM_MANAGED");
  const channelAfterTenantPatch = await prisma.canalIntegracao.findUnique({
    where: { id: channel.id },
  });
  assert.equal(channelAfterTenantPatch.nome, channel.nome);
  assert.equal(channelAfterTenantPatch.ativo, false);
  assert.equal(channelAfterTenantPatch.status, "INATIVO");
  assert.equal(channelAfterTenantPatch.updatedAt.toISOString(), channel.updatedAt.toISOString());

  assert.equal(await prisma.canalIntegracao.count({ where: { empresaId: target.empresaId } }), 2);
  assert.deepEqual(
    await prisma.canalIntegracao.findUnique({ where: { id: testChannel.id } }),
    testChannel,
  );
  const testChannelPatch = await request(
    "PATCH",
    `/canais/${testChannel.id}`,
    { nome: "Canal de teste atualizado" },
    target.token,
  );
  assert.equal(testChannelPatch.status, 200);
  assert.equal(testChannelPatch.body.nome, "Canal de teste atualizado");
  assert.equal(testChannelPatch.body.modoTeste, true);
  assert.deepEqual(await effectCounts(target.empresaId), countsBefore);
  assert.equal(await prisma.empresaFuncionalidade.count({ where: { empresaId: target.empresaId } }), 0);

  assert.equal(auditLines.length, 1);
  const audit = JSON.parse(auditLines[0]);
  assert.equal(audit.event, "whatsapp_inbound_channel_provisioning");
  assert.equal(audit.action, "CREATED");
  assert.deepEqual(audit.changedFields, ["name", "displayPhoneMasked", "verifiedDisplayName"]);
  assert.equal(audit.correlationId, "f1c1-create");
  assert.equal(auditLines[0].includes(operator.email), false);
  assert.equal(auditLines[0].includes("000WABA_F1C1"), false);
  assert.equal(auditLines[0].includes("000PHONE_F1C1"), false);
  assert.equal(auditLines[0].includes("operator@example.test"), false);
  assert.equal(auditLines[0].includes("99999-0000"), false);
  assert.equal(auditLines[0].includes("123.456.789-00"), false);
  assert.equal(auditLines[0].includes("token=abc"), false);
  assert.equal(auditLines[0].includes("123e4567-e89b-12d3-a456-426614174000"), false);

  const replay = await put(target.empresaId, {
    name: "WhatsApp inbound real",
    wabaId: "000WABA_F1C1",
    phoneNumberId: "000PHONE_F1C1",
    displayPhoneMasked: "+55 ** *****-0000",
    verifiedDisplayName: "Empresa Tecnica",
  }, operator.token);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.changed, false);
  assert.equal(await prisma.canalIntegracao.count({
    where: { empresaId: target.empresaId, modoTeste: false, tipo: "WHATSAPP_META" },
  }), 1);

  const missingReason = await put(target.empresaId, { name: "Nome atualizado" }, operator.token);
  assert.equal(missingReason.status, 422);
  assert.equal(missingReason.body.codigo, "WHATSAPP_REASON_REQUIRED");
  const missingVersion = await put(target.empresaId, {
    name: "Nome atualizado",
    reason: "Atualizar metadata",
  }, operator.token);
  assert.equal(missingVersion.status, 422);
  assert.equal(missingVersion.body.codigo, "WHATSAPP_EXPECTED_UPDATED_AT_REQUIRED");

  const updateAuditLines = [];
  console.info = (line) => updateAuditLines.push(String(line));
  let updated;
  try {
    updated = await put(target.empresaId, {
      name: "Nome atualizado",
      displayPhoneMasked: "+55 ** ****-1111",
      expectedUpdatedAt: response.body.updatedAt,
      reason: "Atualizar metadata segura",
    }, operator.token);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(updated.status, 200);
  assert.equal(updated.body.changed, true);
  assert.equal(updated.body.metadata.name, "Nome atualizado");
  assert.equal(updateAuditLines.length, 1);
  const stale = await put(target.empresaId, {
    name: "Nome concorrente",
    expectedUpdatedAt: response.body.updatedAt,
    reason: "Teste de CAS",
  }, operator.token);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.codigo, "WHATSAPP_CHANNEL_CONFLICT");

  const immutableWaba = await put(target.empresaId, {
    wabaId: "OUTRA_WABA",
    phoneNumberId: "000PHONE_F1C1",
  }, operator.token);
  assert.equal(immutableWaba.status, 409);
  assert.equal(immutableWaba.body.codigo, "WHATSAPP_IDENTITY_IMMUTABLE");
  const immutablePhone = await put(target.empresaId, {
    wabaId: "000WABA_F1C1",
    phoneNumberId: "OUTRO_PHONE",
  }, operator.token);
  assert.equal(immutablePhone.status, 409);
  assert.equal(immutablePhone.body.codigo, "WHATSAPP_IDENTITY_IMMUTABLE");

  const otherTenant = await register("Outro Tenant F1C1", "Admin Outro", uniqueEmail("other"));
  const identityConflict = await put(otherTenant.empresaId, validCreation(), operator.token);
  assert.equal(identityConflict.status, 409);
  assert.equal(identityConflict.body.codigo, "WHATSAPP_IDENTITY_CONFLICT");
  const differentWabaConflict = await put(otherTenant.empresaId, {
    ...validCreation(),
    wabaId: "WABA_DIVERGENTE",
  }, operator.token);
  assert.equal(differentWabaConflict.status, 409);
  assert.equal(differentWabaConflict.body.codigo, "WHATSAPP_IDENTITY_CONFLICT");

  const legacyTenant = await register("Legado Tenant F1C1", "Admin Legado", uniqueEmail("legacy"));
  await prisma.canalIntegracao.create({
    data: {
      empresaId: legacyTenant.empresaId,
      tipo: "WHATSAPP_META",
      nome: "Legado divergente",
      chaveInterna: "legado-real-divergente",
      status: "INATIVO",
      modoTeste: false,
      ativo: false,
      providerEnvironment: "LEGACY_ENV",
      metaAppId: "LEGACY_APP",
      wabaId: "LEGACY_WABA",
      phoneNumberId: "LEGACY_PHONE",
    },
  });
  const legacyBlocked = await put(legacyTenant.empresaId, {
    ...validCreation(),
    wabaId: "LEGACY_TARGET_WABA",
    phoneNumberId: "LEGACY_TARGET_PHONE",
  }, operator.token);
  assert.equal(legacyBlocked.status, 409);
  assert.equal(legacyBlocked.body.codigo, "WHATSAPP_LEGACY_CHANNEL_CONFLICT");

  await withTimeout(
    assertConstraintRaceHandling(target.empresaId, operator.usuarioId),
    10_000,
    "tratamento deterministico de corrida",
  );

  const beforeChallenge = await effectCounts(target.empresaId);
  const challenge = await request("GET", "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=none&hub.challenge=123");
  assert.equal(challenge.status, 404);
  const webhook = await request("POST", "/webhooks/whatsapp", { object: "whatsapp_business_account" });
  assert.equal(webhook.status, 404);
  assert.deepEqual(await effectCounts(target.empresaId), beforeChallenge);
});

test("F1C-1 nao mascara P2002 de unique inesperada", async () => {
  const {
    classifyCanalUniqueConflictTarget,
    createWhatsappInboundProvisioningService,
  } = require("../src/platform/whatsappInboundProvisioning");
  assert.equal(classifyCanalUniqueConflictTarget({
    code: "P2002",
    meta: { target: ["empresaId", "chaveInterna"] },
  }), "TENANT_KEY");
  assert.equal(classifyCanalUniqueConflictTarget({
    code: "P2002",
    meta: {
      target: "CanalIntegracao_tipo_providerEnvironment_metaAppId_phoneNumberId_key",
    },
  }), "GLOBAL_IDENTITY");
  assert.equal(classifyCanalUniqueConflictTarget({
    code: "P2002",
    meta: {
      target: {
        constraint: {
          fields: ["tipo", "providerEnvironment", "metaAppId", "phoneNumberId"],
        },
      },
    },
  }), "GLOBAL_IDENTITY");
  assert.equal(classifyCanalUniqueConflictTarget({
    code: "P2002",
    meta: { target: ["publicId"] },
  }), "UNKNOWN");
  const unexpected = Object.assign(new Error("synthetic publicId collision"), {
    code: "P2002",
    meta: { target: ["publicId"] },
  });
  const fakePrisma = {
    empresa: { findUnique: async () => ({ id: 901 }) },
    canalIntegracao: {
      findMany: async () => [],
      create: async () => { throw unexpected; },
      findUnique: async () => null,
    },
  };
  await assert.rejects(
    createWhatsappInboundProvisioningService({
      prisma: fakePrisma,
      logger: { info() {} },
    }).provision({
      tenantId: 901,
      actorUserId: 902,
      body: {
        name: "Canal tecnico",
        wabaId: "WABA_PUBLIC_ID_COLLISION",
        phoneNumberId: "PHONE_PUBLIC_ID_COLLISION",
        reason: "Teste controlado de unique inesperada",
      },
    }),
    (error) => error === unexpected,
  );

  const collisionOwner = await register(
    "Tenant PublicId Origem F1C1",
    "Admin PublicId Origem",
    uniqueEmail("public-id-owner"),
  );
  const collisionTarget = await register(
    "Tenant PublicId Alvo F1C1",
    "Admin PublicId Alvo",
    uniqueEmail("public-id-target"),
  );
  const repeatedPublicId = `public-id-collision-${suffix}`;
  await prisma.canalIntegracao.create({
    data: {
      empresaId: collisionOwner.empresaId,
      tipo: "WHATSAPP_META",
      nome: "Fixture de colisao publicId",
      chaveInterna: "whatsapp-meta-test-public-id",
      publicId: repeatedPublicId,
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
    },
  });
  await assert.rejects(
    createWhatsappInboundProvisioningService({
      prisma,
      logger: { info() {} },
      randomUUID: () => repeatedPublicId,
    }).provision({
      tenantId: collisionTarget.empresaId,
      actorUserId: collisionTarget.usuarioId,
      body: {
        name: "Canal com colisao real",
        wabaId: `WABA_PUBLIC_REAL_${suffix}`,
        phoneNumberId: `PHONE_PUBLIC_REAL_${suffix}`,
        reason: "Teste real de unique publicId",
      },
    }),
    (error) => {
      assert.equal(error?.code, "P2002");
      assertKnownConstraintTarget(error, ["publicId"]);
      return true;
    },
  );
  assert.equal(await prisma.canalIntegracao.count({
    where: {
      empresaId: collisionTarget.empresaId,
      modoTeste: false,
      tipo: "WHATSAPP_META",
    },
  }), 0);
});

test("F1C-1 sanitiza reason nao confiavel sem perder contexto operacional", async () => {
  const {
    createWhatsappInboundProvisioningService,
  } = require("../src/platform/whatsappInboundProvisioning");
  const channel = fakeChannel({
    empresaId: 911,
    wabaId: "WABA_COMPLETE_IDENTIFIER_911",
    phoneNumberId: "PHONE_COMPLETE_IDENTIFIER_911",
  });
  const lines = [];
  const service = createWhatsappInboundProvisioningService({
    prisma: {
      empresa: { findUnique: async () => ({ id: 911 }) },
      canalIntegracao: {
        findMany: async () => [],
        create: async () => channel,
      },
    },
    logger: { info: (line) => lines.push(String(line)) },
  });
  const result = await service.provision({
    tenantId: 911,
    actorUserId: 912,
    correlationId: "reason-redaction",
    body: {
      name: channel.nome,
      wabaId: channel.wabaId,
      phoneNumberId: channel.phoneNumberId,
      reason: [
        "troca solicitada",
        "accessTokenRef=env:WHATSAPP_ACCESS_TOKEN_X",
        "token: bearer-value",
        "payload={\"lead\":\"sensitive\"}",
        `wabaId=${channel.wabaId}`,
        `phoneNumberId: ${channel.phoneNumberId}`,
        "telefone=+55 11 99999-0000",
        "linha nova",
        "\u0001controle",
      ].join("\n"),
    },
  });
  assert.equal(result.created, true);
  assert.equal(lines.length, 1);
  const logged = lines[0];
  for (const sensitive of [
    "env:WHATSAPP_ACCESS_TOKEN_X",
    "bearer-value",
    "{\"lead\":\"sensitive\"}",
    channel.wabaId,
    channel.phoneNumberId,
    "+55 11 99999-0000",
    "\u0001",
    "\n",
  ]) {
    assert.equal(logged.includes(sensitive), false, sensitive);
  }
  assert.match(logged, /troca solicitada/);
  assert.match(logged, /accessTokenRef=\[REDACTED\]/);
  assert.match(logged, /phoneNumberId=\[REDACTED\]/);

  await assert.rejects(
    service.provision({
      tenantId: 911,
      actorUserId: 912,
      body: {
        name: "Canal tecnico",
        wabaId: "WABA_LONG_REASON",
        phoneNumberId: "PHONE_LONG_REASON",
        reason: "x".repeat(501),
      },
    }),
    (error) => error.code === "WHATSAPP_PROVISIONING_INVALID" && error.status === 422,
  );
});

test("F1C-1 preserva persistencia quando logger falha depois do commit", async () => {
  const {
    createWhatsappInboundProvisioningService,
  } = require("../src/platform/whatsappInboundProvisioning");
  const tenant = await register("Tenant Logger F1C1", "Admin Logger", uniqueEmail("logger"));
  const body = {
    name: "Canal com logger indisponivel",
    wabaId: `WABA_LOGGER_${suffix}`,
    phoneNumberId: `PHONE_LOGGER_${suffix}`,
    reason: "Provisionamento com falha controlada do logger",
  };
  const service = createWhatsappInboundProvisioningService({
    prisma,
    logger: { info() { throw new Error("synthetic logger failure"); } },
  });
  const created = await service.provision({
    tenantId: tenant.empresaId,
    actorUserId: tenant.usuarioId,
    body,
  });
  assert.equal(created.created, true);
  assert.equal(created.body.changed, true);
  assert.equal(JSON.stringify(created).includes("synthetic logger failure"), false);
  assert.equal(await prisma.canalIntegracao.count({
    where: {
      empresaId: tenant.empresaId,
      chaveInterna: "whatsapp-meta-inbound-real",
    },
  }), 1);

  const replay = await service.provision({
    tenantId: tenant.empresaId,
    actorUserId: tenant.usuarioId,
    body,
  });
  assert.equal(replay.created, false);
  assert.equal(replay.body.changed, false);
  assert.equal(await prisma.canalIntegracao.count({
    where: {
      empresaId: tenant.empresaId,
      chaveInterna: "whatsapp-meta-inbound-real",
    },
  }), 1);
});

test("F1C-1 classifica corridas reais de chave e identidade", async () => {
  const sameTenant = await register("Tenant Corrida F1C1", "Admin Corrida", uniqueEmail("race-same"));
  const sameBody = {
    name: "Canal concorrente no tenant",
    wabaId: `WABA_SAME_${suffix}`,
    phoneNumberId: `PHONE_SAME_${suffix}`,
    reason: "Corrida real na chave do tenant",
  };
  const sameRace = await runRealProvisioningRace([
    { tenantId: sameTenant.empresaId, actorUserId: sameTenant.usuarioId, body: sameBody },
    { tenantId: sameTenant.empresaId, actorUserId: sameTenant.usuarioId, body: sameBody },
  ]);
  assert.deepEqual(
    sameRace.results.map((result) => ({ status: result.status, created: result.value?.created })).sort(sortRaceResults),
    [
      { status: "fulfilled", created: false },
      { status: "fulfilled", created: true },
    ],
  );
  assert.equal(sameRace.uniqueErrors.length, 1);
  assertKnownConstraintTargetOneOf(sameRace.uniqueErrors[0], [
    ["empresaId", "chaveInterna"],
    ["tipo", "providerEnvironment", "metaAppId", "phoneNumberId"],
  ]);
  assert.equal(await prisma.canalIntegracao.count({
    where: {
      empresaId: sameTenant.empresaId,
      chaveInterna: "whatsapp-meta-inbound-real",
    },
  }), 1);

  const tenantKeyRaceTenant = await register(
    "Tenant Chave F1C1",
    "Admin Chave",
    uniqueEmail("race-key"),
  );
  const tenantKeyRace = await runRealProvisioningRace([
    {
      tenantId: tenantKeyRaceTenant.empresaId,
      actorUserId: tenantKeyRaceTenant.usuarioId,
      body: {
        name: "Canal concorrente A",
        wabaId: `WABA_KEY_A_${suffix}`,
        phoneNumberId: `PHONE_KEY_A_${suffix}`,
        reason: "Corrida real na chave do tenant A",
      },
    },
    {
      tenantId: tenantKeyRaceTenant.empresaId,
      actorUserId: tenantKeyRaceTenant.usuarioId,
      body: {
        name: "Canal concorrente B",
        wabaId: `WABA_KEY_B_${suffix}`,
        phoneNumberId: `PHONE_KEY_B_${suffix}`,
        reason: "Corrida real na chave do tenant B",
      },
    },
  ]);
  assert.equal(tenantKeyRace.results.filter((result) => result.status === "fulfilled").length, 1);
  const tenantKeyRejected = tenantKeyRace.results.find((result) => result.status === "rejected");
  assert.ok(tenantKeyRejected);
  assert.equal(tenantKeyRejected.reason.status, 409);
  assert.ok([
    "WHATSAPP_IDENTITY_IMMUTABLE",
    "WHATSAPP_CHANNEL_CONFLICT",
  ].includes(tenantKeyRejected.reason.code));
  assert.equal(tenantKeyRace.uniqueErrors.length, 1);
  assertKnownConstraintTarget(tenantKeyRace.uniqueErrors[0], ["empresaId", "chaveInterna"]);
  assert.equal(await prisma.canalIntegracao.count({
    where: {
      empresaId: tenantKeyRaceTenant.empresaId,
      chaveInterna: "whatsapp-meta-inbound-real",
    },
  }), 1);

  const tenantA = await register("Tenant Corrida A F1C1", "Admin Corrida A", uniqueEmail("race-a"));
  const tenantB = await register("Tenant Corrida B F1C1", "Admin Corrida B", uniqueEmail("race-b"));
  const sharedBody = {
    name: "Identidade concorrente entre tenants",
    wabaId: `WABA_CROSS_${suffix}`,
    phoneNumberId: `PHONE_CROSS_${suffix}`,
    reason: "Corrida real de identidade global",
  };
  const crossRace = await runRealProvisioningRace([
    { tenantId: tenantA.empresaId, actorUserId: tenantA.usuarioId, body: sharedBody },
    { tenantId: tenantB.empresaId, actorUserId: tenantB.usuarioId, body: sharedBody },
  ]);
  assert.equal(crossRace.results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = crossRace.results.find((result) => result.status === "rejected");
  assert.ok(rejected);
  assert.equal(rejected.reason.code, "WHATSAPP_IDENTITY_CONFLICT");
  assert.equal(rejected.reason.status, 409);
  assert.equal(crossRace.uniqueErrors.length, 1);
  assertKnownConstraintTarget(crossRace.uniqueErrors[0], [
    "tipo",
    "providerEnvironment",
    "metaAppId",
    "phoneNumberId",
  ]);
  assert.equal(await prisma.canalIntegracao.count({
    where: {
      tipo: "WHATSAPP_META",
      providerEnvironment: process.env.WHATSAPP_PROVIDER_ENVIRONMENT,
      metaAppId: process.env.WHATSAPP_META_APP_ID,
      phoneNumberId: sharedBody.phoneNumberId,
    },
  }), 1);
});

async function assertConstraintRaceHandling(tenantId, actorUserId) {
  const {
    createWhatsappInboundProvisioningService,
  } = require("../src/platform/whatsappInboundProvisioning");
  const body = {
    name: "Identidade concorrente",
    wabaId: `WABA_RACE_${suffix}`,
    phoneNumberId: `PHONE_RACE_${suffix}`,
    reason: "Corrida controlada entre tenants",
  };
  const canonical = {
    id: 501,
    empresaId: tenantId,
    tipo: "WHATSAPP_META",
    nome: body.name,
    chaveInterna: "whatsapp-meta-inbound-real",
    publicId: "f1c1-race-public-id",
    status: "INATIVO",
    modoTeste: false,
    ativo: false,
    providerEnvironment: process.env.WHATSAPP_PROVIDER_ENVIRONMENT,
    metaAppId: process.env.WHATSAPP_META_APP_ID,
    wabaId: body.wabaId,
    phoneNumberId: body.phoneNumberId,
    displayPhoneMasked: null,
    verifiedDisplayName: null,
    updatedAt: new Date(),
  };
  const tenantKeyConflict = Object.assign(new Error("unique"), {
    code: "P2002",
    meta: { target: ["empresaId", "chaveInterna"] },
  });
  const sameTenantPrisma = {
    empresa: { findUnique: async () => ({ id: tenantId }) },
    canalIntegracao: {
      findMany: async () => [],
      create: async () => { throw tenantKeyConflict; },
      findUnique: async () => canonical,
    },
  };
  const sameTenant = await createWhatsappInboundProvisioningService({
    prisma: sameTenantPrisma,
    logger: { info() {} },
  }).provision({ tenantId, actorUserId, body });
  assert.equal(sameTenant.created, false);
  assert.equal(sameTenant.body.changed, false);

  let identityReads = 0;
  const identityConflict = Object.assign(new Error("unique"), {
    code: "P2002",
    meta: {
      target: "CanalIntegracao_tipo_providerEnvironment_metaAppId_phoneNumberId_key",
    },
  });
  const crossTenantPrisma = {
    empresa: { findUnique: async () => ({ id: tenantId }) },
    canalIntegracao: {
      findMany: async (query) => {
        if (Object.hasOwn(query.where, "empresaId")) return [];
        identityReads += 1;
        return identityReads === 1 ? [] : [{ ...canonical, id: 777, empresaId: tenantId + 1 }];
      },
      create: async () => { throw identityConflict; },
      findUnique: async () => null,
    },
  };
  await assert.rejects(
    createWhatsappInboundProvisioningService({
      prisma: crossTenantPrisma,
      logger: { info() {} },
    }).provision({ tenantId, actorUserId, body }),
    (error) => error.code === "WHATSAPP_IDENTITY_CONFLICT" && error.status === 409,
  );
}

async function runRealProvisioningRace(calls) {
  const {
    createWhatsappInboundProvisioningService,
  } = require("../src/platform/whatsappInboundProvisioning");
  const { PrismaClient } = require("@prisma/client");
  const barrier = createBarrier(calls.length);
  const uniqueErrors = [];
  const clients = calls.map(() => new PrismaClient());
  try {
    await Promise.all(clients.map((client) => client.$connect()));
    const services = clients.map((client) => createWhatsappInboundProvisioningService({
      prisma: prismaWithCreateBarrier(client, barrier, uniqueErrors),
      logger: { info() {} },
    }));
    const results = await Promise.allSettled(calls.map((call, index) => services[index].provision(call)));
    return { results, uniqueErrors };
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
}

function prismaWithCreateBarrier(basePrisma, barrier, uniqueErrors) {
  return {
    empresa: {
      findUnique: (query) => basePrisma.empresa.findUnique(query),
    },
    canalIntegracao: {
      findMany: (query) => basePrisma.canalIntegracao.findMany(query),
      findUnique: (query) => basePrisma.canalIntegracao.findUnique(query),
      findFirst: (query) => basePrisma.canalIntegracao.findFirst(query),
      updateMany: (query) => basePrisma.canalIntegracao.updateMany(query),
      create: async (query) => {
        await barrier();
        try {
          return await basePrisma.canalIntegracao.create(query);
        } catch (error) {
          if (error?.code === "P2002") uniqueErrors.push(error);
          throw error;
        }
      },
    },
  };
}

function createBarrier(expected) {
  let arrived = 0;
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived === expected) release();
    await ready;
  };
}

function assertKnownConstraintTarget(error, expectedFields) {
  assert.equal(error?.code, "P2002");
  const target = JSON.stringify(error?.meta?.target || "");
  for (const field of expectedFields) {
    assert.match(target, new RegExp(field, "i"));
  }
}

function assertKnownConstraintTargetOneOf(error, expectedTargets) {
  assert.equal(error?.code, "P2002");
  const target = JSON.stringify(error?.meta?.target || "");
  assert.equal(expectedTargets.some((fields) => (
    fields.every((field) => new RegExp(field, "i").test(target))
  )), true, target);
}

function sortRaceResults(left, right) {
  return Number(left.created) - Number(right.created);
}

function fakeChannel({ empresaId, wabaId, phoneNumberId }) {
  return {
    id: 1,
    empresaId,
    tipo: "WHATSAPP_META",
    nome: "Canal tecnico",
    chaveInterna: "whatsapp-meta-inbound-real",
    publicId: "fake-public-channel-id",
    status: "INATIVO",
    modoTeste: false,
    ativo: false,
    providerEnvironment: process.env.WHATSAPP_PROVIDER_ENVIRONMENT,
    metaAppId: process.env.WHATSAPP_META_APP_ID,
    wabaId,
    phoneNumberId,
    displayPhoneMasked: null,
    verifiedDisplayName: null,
    updatedAt: new Date(),
  };
}

function validCreation() {
  return {
    name: "WhatsApp inbound real",
    wabaId: " 000WABA_F1C1 ",
    phoneNumberId: " 000PHONE_F1C1 ",
    displayPhoneMasked: "+55 ** *****-0000",
    verifiedDisplayName: "Empresa Tecnica",
    reason: "Provisionamento controlado F1C-1",
  };
}

async function register(empresaNome, adminNome, email) {
  const senha = "SenhaF1C1Segura123";
  const registration = await request("POST", "/auth/register-company", {
    empresaNome: `${empresaNome} ${suffix}`,
    adminNome,
    email,
    senha,
  });
  assert.equal(registration.status, 201);
  createdTenantIds.push(registration.body.empresa.id);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return {
    token: login.body.access_token,
    email,
    empresaId: registration.body.empresa.id,
    usuarioId: registration.body.usuario.id,
  };
}

async function createUser(admin, nome, email, papel) {
  const senha = "SenhaF1C1Usuario123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token };
}

async function put(tenantId, body, token, headers) {
  return request(
    "PUT",
    `/platform/tenants/${tenantId}/integrations/whatsapp/inbound`,
    body,
    token,
    headers,
  );
}

async function request(method, pathname, body, token, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return {
    status: response.status,
    body: text && contentType.includes("application/json") ? JSON.parse(text) : text || null,
  };
}

async function effectCounts(empresaId) {
  const [
    events,
    messages,
    clients,
    leads,
    conversations,
    contacts,
    jobs,
    executions,
  ] = await Promise.all([
    prisma.eventoWebhook.count({ where: { empresaId } }),
    prisma.mensagemCanal.count({ where: { empresaId } }),
    prisma.cliente.count({ where: { empresaId } }),
    prisma.lead.count({ where: { empresaId } }),
    prisma.conversaCanal.count({ where: { empresaId } }),
    prisma.contatoCanal.count({ where: { empresaId } }),
    prisma.automacaoAcaoJob.count({ where: { empresaId } }),
    prisma.automacaoExecucao.count({ where: { empresaId } }),
  ]);
  return { events, messages, clients, leads, conversations, contacts, jobs, executions };
}

function uniqueEmail(label) {
  return `${label}-${suffix}@platform.test`;
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}

function removeDatabase(file) {
  for (const ending of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${ending}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timeout em ${label}.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
