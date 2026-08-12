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
  databasePath = path.join(runDir, "instagram-inbound-provisioning", `provisioning-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "instagram-inbound-provisioning-test-secret-with-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  INSTAGRAM_META_APP_ID: "000GLOBAL_INSTAGRAM_APP",
  INSTAGRAM_PROVIDER_ENVIRONMENT: "INSTAGRAM_TEST",
  INSTAGRAM_INTEGRATION_ENABLED: "true",
  INSTAGRAM_INBOUND_ENABLED: "true",
  INSTAGRAM_APP_SECRET: "test-instagram-app-secret",
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "test-instagram-verify-token",
});
delete process.env.PLATFORM_ADMIN_EMAILS;

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

test("provisiona Instagram inbound inativo com RBAC, allowlist e resposta sanitizada", async () => {
  const operator = await register("Operadora Instagram", "Operadora", uniqueEmail("operator"));
  const target = await register("Tenant Instagram", "Admin Alvo", uniqueEmail("target"));
  const manager = await createUser(target, "Gerente Alvo", uniqueEmail("manager"), "GERENTE");
  const seller = await createUser(target, "Vendedor Alvo", uniqueEmail("seller"), "VENDEDOR");
  process.env.PLATFORM_ADMIN_EMAILS = operator.email.toUpperCase();

  assert.equal((await put(target.empresaId, validCreation(), target.token)).status, 403);
  assert.equal((await put(target.empresaId, validCreation(), manager.token)).status, 403);
  assert.equal((await put(target.empresaId, validCreation(), seller.token)).status, 403);
  assert.equal((await put(999999999, validCreation(), operator.token)).status, 404);

  const appId = process.env.INSTAGRAM_META_APP_ID;
  const environment = process.env.INSTAGRAM_PROVIDER_ENVIRONMENT;
  delete process.env.INSTAGRAM_META_APP_ID;
  let response = await put(target.empresaId, validCreation(), operator.token);
  assert.equal(response.status, 503);
  assert.equal(response.body.codigo, "INSTAGRAM_GLOBAL_CONFIGURATION_INVALID");
  process.env.INSTAGRAM_META_APP_ID = appId;
  process.env.INSTAGRAM_PROVIDER_ENVIRONMENT = "ambiente invalido";
  response = await put(target.empresaId, validCreation(), operator.token);
  assert.equal(response.status, 503);
  process.env.INSTAGRAM_PROVIDER_ENVIRONMENT = environment;

  for (const field of [
    "empresaId",
    "tipo",
    "chaveInterna",
    "modoTeste",
    "ativo",
    "status",
    "accessToken",
    "accessTokenRef",
    "appSecret",
    "verifyToken",
    "capability",
    "capabilities",
    "connectedAt",
    "verifiedAt",
    "lastWebhookAt",
    "lastFailureAt",
    "lastFailureCode",
    "configuracaoJson",
    "providerEnvironment",
    "metaAppId",
    "wabaId",
    "phoneNumberId",
    "pageId",
    "campoDesconhecido",
  ]) {
    const forbidden = await put(
      target.empresaId,
      { ...validCreation(), [field]: "nao-permitido" },
      operator.token,
    );
    assert.equal(forbidden.status, 422, field);
    assert.equal(forbidden.body.codigo, "INSTAGRAM_PROVISIONING_INVALID", field);
  }
  const unmaskedUsername = await put(target.empresaId, {
    ...validCreation(),
    instagramUsernameMasked: "@handle_completo",
  }, operator.token);
  assert.equal(unmaskedUsername.status, 422);
  assert.equal(unmaskedUsername.body.codigo, "INSTAGRAM_PROVISIONING_INVALID");

  const testChannel = await prisma.canalIntegracao.create({
    data: {
      empresaId: target.empresaId,
      tipo: "INSTAGRAM_META",
      nome: "Instagram de teste",
      chaveInterna: "instagram-meta-test",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
      instagramBusinessAccountId: `TEST_INSTAGRAM_${suffix}`,
    },
  });
  const whatsapp = await prisma.canalIntegracao.create({
    data: {
      empresaId: target.empresaId,
      tipo: "WHATSAPP_META",
      nome: "WhatsApp coexistente",
      chaveInterna: "whatsapp-test-coexistente",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
    },
  });
  const siteForm = await prisma.canalIntegracao.create({
    data: {
      empresaId: target.empresaId,
      tipo: "SITE_FORM",
      nome: "Site coexistente",
      chaveInterna: "site-form-coexistente",
      status: "ATIVO",
      modoTeste: false,
      ativo: true,
    },
  });
  const effectsBefore = await effectCounts(target.empresaId);
  const auditLines = [];
  const originalInfo = console.info;
  console.info = (line) => auditLines.push(String(line));
  try {
    response = await put(target.empresaId, {
      ...validCreation(),
      reason: [
        "Provisionamento controlado",
        "instagramBusinessAccountId=000INSTAGRAM_F1",
        "accessTokenRef=env:INSTAGRAM_TOKEN",
        "telefone=+55 11 99999-0000",
      ].join("\n"),
    }, operator.token, { "x-correlation-id": "instagram-create" });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(response.status, 201);
  assert.equal(response.body.changed, true);
  assert.equal(response.body.state, "CONFIGURED_INACTIVE");
  assert.equal(response.body.configured, true);
  assert.equal(response.body.tipo, "INSTAGRAM_META");
  assert.equal(response.body.ativo, false);
  assert.equal(response.body.status, "INATIVO");
  assert.equal(response.body.name, "Instagram inbound real");
  assert.equal(response.body.instagramBusinessAccountIdMasked, "****M_F1");
  assert.equal(response.body.instagramUsernameMasked, "@conta_****");
  assert.deepEqual(response.body.capabilities, { integration: false, inbound: false });
  assert.equal(response.body.connectedAt, null);
  assert.equal(response.body.verifiedAt, null);
  assert.equal(response.body.lastWebhookAt, null);
  assert.equal(response.body.nextRequirement, "ACTIVATE_INSTAGRAM_INBOUND");
  assert.equal(JSON.stringify(response.body).includes("000INSTAGRAM_F1"), false);
  assert.equal(JSON.stringify(response.body).includes(appId), false);

  const channel = await prisma.canalIntegracao.findUnique({
    where: {
      empresaId_chaveInterna: {
        empresaId: target.empresaId,
        chaveInterna: "instagram-meta-inbound-real",
      },
    },
  });
  assert.ok(channel);
  assert.equal(channel.instagramBusinessAccountId, "000INSTAGRAM_F1");
  assert.equal(channel.providerEnvironment, environment);
  assert.equal(channel.metaAppId, appId);
  assert.equal(channel.ativo, false);
  assert.equal(channel.status, "INATIVO");
  assert.equal(channel.modoTeste, false);
  assert.equal(channel.accessTokenRef, null);
  assert.equal(channel.connectedAt, null);
  assert.equal(channel.verifiedAt, null);
  assert.equal(channel.lastWebhookAt, null);
  assert.equal(channel.lastFailureAt, null);
  assert.equal(channel.lastFailureCode, null);
  assert.equal(await instagramCapabilityCount(target.empresaId), 0);
  assert.deepEqual(await effectCounts(target.empresaId), effectsBefore);

  assert.equal(auditLines.length, 1);
  const audit = JSON.parse(auditLines[0]);
  assert.equal(audit.event, "instagram_inbound_channel_provisioning");
  assert.equal(audit.action, "CREATED");
  assert.equal(audit.previousState, "NOT_CONFIGURED");
  assert.equal(audit.newState, "CONFIGURED_INACTIVE");
  assert.deepEqual(audit.changedFields, ["name", "instagramUsernameMasked", "verifiedDisplayName"]);
  assert.equal(audit.correlationId, "instagram-create");
  assert.match(audit.channelRef, /^[a-f0-9]{16}$/);
  assert.notEqual(audit.channelRef, channel.publicId);
  for (const sensitive of [
    operator.email,
    "000INSTAGRAM_F1",
    "env:INSTAGRAM_TOKEN",
    "+55 11 99999-0000",
    channel.publicId,
  ]) {
    assert.equal(auditLines[0].includes(sensitive), false, sensitive);
  }

  const blockedPatch = await request(
    "PATCH",
    `/canais/${channel.id}`,
    { nome: "Bypass de canal real", ativo: true },
    target.token,
  );
  assert.equal(blockedPatch.status, 403);
  assert.equal(blockedPatch.body.codigo, "CHANNEL_PLATFORM_MANAGED");
  assert.deepEqual(await prisma.canalIntegracao.findUnique({ where: { id: channel.id } }), channel);

  const testPatch = await request(
    "PATCH",
    `/canais/${testChannel.id}`,
    { nome: "Instagram teste atualizado" },
    target.token,
  );
  assert.equal(testPatch.status, 200);
  assert.equal(testPatch.body.nome, "Instagram teste atualizado");
  assert.equal((await prisma.canalIntegracao.findUnique({ where: { id: whatsapp.id } })).nome, whatsapp.nome);
  const sitePatch = await request(
    "PATCH",
    `/canais/${siteForm.id}`,
    { nome: "Site atualizado" },
    target.token,
  );
  assert.equal(sitePatch.status, 200);
  assert.equal(sitePatch.body.nome, "Site atualizado");

  const status = await getStatus(target.empresaId, operator.token);
  assert.equal(status.status, 200);
  assert.equal(status.body.state, "CONFIGURED_INACTIVE");
  assert.equal(status.body.instagramBusinessAccountIdMasked, "****M_F1");
  assert.equal(JSON.stringify(status.body).includes("000INSTAGRAM_F1"), false);
  assert.deepEqual(status.body.capabilities, { integration: false, inbound: false });

  const emptyTenant = await register("Tenant Sem Instagram", "Admin Vazio", uniqueEmail("empty"));
  const emptyStatus = await getStatus(emptyTenant.empresaId, operator.token);
  assert.equal(emptyStatus.status, 200);
  assert.equal(emptyStatus.body.state, "NOT_CONFIGURED");
  assert.equal(emptyStatus.body.configured, false);
  assert.equal(emptyStatus.body.nextRequirement, "PROVISION_INSTAGRAM_INBOUND");
});

test("preserva idempotencia, identidade imutavel e CAS sem mutacao parcial", async () => {
  const operator = await register("Operadora CAS", "Operadora CAS", uniqueEmail("operator-cas"));
  const target = await register("Tenant CAS", "Admin CAS", uniqueEmail("target-cas"));
  process.env.PLATFORM_ADMIN_EMAILS = operator.email;

  const created = await put(target.empresaId, {
    ...validCreation(),
    instagramBusinessAccountId: `000INSTAGRAM_CAS_${suffix}`,
  }, operator.token);
  assert.equal(created.status, 201);

  const replay = await put(target.empresaId, {
    name: "Instagram inbound real",
    instagramBusinessAccountId: `000INSTAGRAM_CAS_${suffix}`,
    instagramUsernameMasked: "@conta_****",
    verifiedDisplayName: "Conta Tecnica",
  }, operator.token);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.changed, false);
  assert.equal(await realInstagramCount(target.empresaId), 1);

  const original = await canonicalChannel(target.empresaId);
  const missingReason = await put(target.empresaId, { name: "Nome atualizado" }, operator.token);
  assert.equal(missingReason.status, 422);
  assert.equal(missingReason.body.codigo, "INSTAGRAM_REASON_REQUIRED");
  const missingVersion = await put(target.empresaId, {
    name: "Nome atualizado",
    reason: "Atualizar metadata",
  }, operator.token);
  assert.equal(missingVersion.status, 422);
  assert.equal(missingVersion.body.codigo, "INSTAGRAM_EXPECTED_UPDATED_AT_REQUIRED");

  const immutable = await put(target.empresaId, {
    instagramBusinessAccountId: `OUTRA_IDENTIDADE_${suffix}`,
  }, operator.token);
  assert.equal(immutable.status, 409);
  assert.equal(immutable.body.codigo, "INSTAGRAM_IDENTITY_IMMUTABLE");
  assert.deepEqual(await canonicalChannel(target.empresaId), original);

  const concurrentBodies = [
    {
      name: "Nome concorrente A",
      reason: "CAS concorrente A",
      expectedUpdatedAt: created.body.updatedAt,
    },
    {
      name: "Nome concorrente B",
      reason: "CAS concorrente B",
      expectedUpdatedAt: created.body.updatedAt,
    },
  ];
  const concurrent = await Promise.all(
    concurrentBodies.map((body) => put(target.empresaId, body, operator.token)),
  );
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409]);
  assert.equal(concurrent.find((result) => result.status === 409).body.codigo, "INSTAGRAM_CHANNEL_CONFLICT");

  const afterCas = await canonicalChannel(target.empresaId);
  assert.ok(["Nome concorrente A", "Nome concorrente B"].includes(afterCas.nome));
  const metadataUpdate = await put(target.empresaId, {
    instagramUsernameMasked: "@novo_****",
    verifiedDisplayName: "Nova Conta Tecnica",
    reason: "Atualizar metadata permitida",
    expectedUpdatedAt: afterCas.updatedAt.toISOString(),
  }, operator.token);
  assert.equal(metadataUpdate.status, 200);
  assert.equal(metadataUpdate.body.changed, true);
  assert.equal(metadataUpdate.body.instagramUsernameMasked, "@novo_****");
  assert.equal(metadataUpdate.body.verifiedDisplayName, "Nova Conta Tecnica");
  const afterMetadataUpdate = await canonicalChannel(target.empresaId);
  assert.equal(afterMetadataUpdate.instagramBusinessAccountId, original.instagramBusinessAccountId);
  assert.equal(afterMetadataUpdate.ativo, false);
  assert.equal(afterMetadataUpdate.status, "INATIVO");
  const stale = await put(target.empresaId, {
    name: "Nome stale",
    reason: "CAS stale",
    expectedUpdatedAt: created.body.updatedAt,
  }, operator.token);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.codigo, "INSTAGRAM_CHANNEL_CONFLICT");
  assert.deepEqual(await canonicalChannel(target.empresaId), afterMetadataUpdate);
  assert.equal(await realInstagramCount(target.empresaId), 1);
  assert.equal(await instagramCapabilityCount(target.empresaId), 0);
});

test("fecha conflitos de tenant, slot, identidade e legado sem promover canal de teste", async () => {
  const operator = await register("Operadora Conflito", "Operadora", uniqueEmail("operator-conflict"));
  const owner = await register("Tenant Dono", "Admin Dono", uniqueEmail("owner"));
  const other = await register("Tenant Outro", "Admin Outro", uniqueEmail("other"));
  process.env.PLATFORM_ADMIN_EMAILS = operator.email;

  const identity = `000INSTAGRAM_SHARED_${suffix}`;
  const ownerCreated = await put(owner.empresaId, {
    ...validCreation(),
    instagramBusinessAccountId: identity,
  }, operator.token);
  assert.equal(ownerCreated.status, 201);

  const crossTenant = await put(other.empresaId, {
    ...validCreation(),
    instagramBusinessAccountId: identity,
  }, operator.token);
  assert.equal(crossTenant.status, 409);
  assert.equal(crossTenant.body.codigo, "INSTAGRAM_IDENTITY_CONFLICT");
  assert.equal(JSON.stringify(crossTenant.body).includes(identity), false);
  assert.equal(await realInstagramCount(other.empresaId), 0);

  const divergentSameTenant = await put(owner.empresaId, {
    ...validCreation(),
    instagramBusinessAccountId: `DIVERGENT_${suffix}`,
  }, operator.token);
  assert.equal(divergentSameTenant.status, 409);
  assert.equal(divergentSameTenant.body.codigo, "INSTAGRAM_IDENTITY_IMMUTABLE");
  assert.equal(await realInstagramCount(owner.empresaId), 1);

  const legacyTenant = await register("Tenant Legado", "Admin Legado", uniqueEmail("legacy"));
  const legacy = await prisma.canalIntegracao.create({
    data: {
      empresaId: legacyTenant.empresaId,
      tipo: "INSTAGRAM_META",
      nome: "Instagram legado",
      chaveInterna: "instagram-legado-real",
      status: "INATIVO",
      modoTeste: false,
      ativo: false,
      instagramBusinessAccountId: `LEGACY_INSTAGRAM_${suffix}`,
    },
  });
  const legacyBlocked = await put(legacyTenant.empresaId, {
    ...validCreation(),
    instagramBusinessAccountId: `NEW_INSTAGRAM_${suffix}`,
  }, operator.token);
  assert.equal(legacyBlocked.status, 409);
  assert.equal(legacyBlocked.body.codigo, "INSTAGRAM_LEGACY_CHANNEL_CONFLICT");
  assert.deepEqual(await prisma.canalIntegracao.findUnique({ where: { id: legacy.id } }), legacy);
  assert.equal(await realInstagramCount(legacyTenant.empresaId), 1);

  const activeTenant = await register("Tenant Ativo Incoerente", "Admin Ativo", uniqueEmail("active"));
  const activeChannel = await prisma.canalIntegracao.create({
    data: {
      empresaId: activeTenant.empresaId,
      tipo: "INSTAGRAM_META",
      nome: "Instagram ativo incoerente",
      chaveInterna: "instagram-meta-inbound-real",
      status: "ATIVO",
      modoTeste: false,
      ativo: true,
      providerEnvironment: process.env.INSTAGRAM_PROVIDER_ENVIRONMENT,
      metaAppId: process.env.INSTAGRAM_META_APP_ID,
      instagramBusinessAccountId: `ACTIVE_INSTAGRAM_${suffix}`,
    },
  });
  const activeBlocked = await put(activeTenant.empresaId, {
    name: activeChannel.nome,
    instagramBusinessAccountId: activeChannel.instagramBusinessAccountId,
  }, operator.token);
  assert.equal(activeBlocked.status, 409);
  assert.equal(activeBlocked.body.codigo, "INSTAGRAM_CHANNEL_STATE_CONFLICT");
  assert.deepEqual(
    await prisma.canalIntegracao.findUnique({ where: { id: activeChannel.id } }),
    activeChannel,
  );

  const capabilityTenant = await register(
    "Tenant Capability Incoerente",
    "Admin Capability",
    uniqueEmail("capability"),
  );
  await prisma.empresaFuncionalidade.create({
    data: {
      empresaId: capabilityTenant.empresaId,
      chave: "INSTAGRAM_INBOUND",
      habilitada: true,
      habilitadoEm: new Date(),
    },
  });
  const capabilityBlocked = await put(capabilityTenant.empresaId, {
    ...validCreation(),
    instagramBusinessAccountId: `CAPABILITY_INSTAGRAM_${suffix}`,
  }, operator.token);
  assert.equal(capabilityBlocked.status, 409);
  assert.equal(capabilityBlocked.body.codigo, "INSTAGRAM_CHANNEL_STATE_CONFLICT");
  assert.equal(await realInstagramCount(capabilityTenant.empresaId), 0);

  const testOnlyTenant = await register("Tenant Teste", "Admin Teste", uniqueEmail("test-only"));
  const testChannel = await prisma.canalIntegracao.create({
    data: {
      empresaId: testOnlyTenant.empresaId,
      tipo: "INSTAGRAM_META",
      nome: "Canal de teste isolado",
      chaveInterna: "instagram-meta-test-only",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
      instagramBusinessAccountId: `SYNTHETIC_TEST_${suffix}`,
    },
  });
  const realCreated = await put(testOnlyTenant.empresaId, {
    ...validCreation(),
    instagramBusinessAccountId: `REAL_AFTER_TEST_${suffix}`,
  }, operator.token);
  assert.equal(realCreated.status, 201);
  assert.equal((await prisma.canalIntegracao.findUnique({ where: { id: testChannel.id } })).modoTeste, true);
  assert.equal(await realInstagramCount(testOnlyTenant.empresaId), 1);
  assert.equal(await instagramCapabilityCount(testOnlyTenant.empresaId), 0);
});

test("nao mascara unique inesperada e preserva commit quando auditoria falha", async () => {
  const {
    classifyCanalUniqueConflictTarget,
    createInstagramInboundProvisioningService,
  } = require("../src/platform/instagramInboundProvisioning");
  assert.equal(classifyCanalUniqueConflictTarget({
    code: "P2002",
    meta: { target: ["empresaId", "chaveInterna"] },
  }), "TENANT_KEY");
  assert.equal(classifyCanalUniqueConflictTarget({
    code: "P2002",
    meta: { target: "CanalIntegracao_instagramBusinessAccountId_key" },
  }), "GLOBAL_IDENTITY");
  assert.equal(classifyCanalUniqueConflictTarget({
    code: "P2002",
    meta: { target: { constraint: { fields: ["instagramBusinessAccountId"] } } },
  }), "GLOBAL_IDENTITY");
  assert.equal(classifyCanalUniqueConflictTarget({
    code: "P2002",
    meta: { target: ["publicId"] },
  }), "UNKNOWN");

  const unexpected = Object.assign(new Error("synthetic publicId collision"), {
    code: "P2002",
    meta: { target: ["publicId"] },
  });
  await assert.rejects(
    createInstagramInboundProvisioningService({
      prisma: {
        empresa: { findUnique: async () => ({ id: 901 }) },
        empresaFuncionalidade: { findMany: async () => [] },
        canalIntegracao: {
          findMany: async () => [],
          findFirst: async () => null,
          findUnique: async () => null,
          create: async () => { throw unexpected; },
        },
      },
      logger: { info() {} },
    }).provision({
      tenantId: 901,
      actorUserId: 902,
      body: {
        name: "Instagram tecnico",
        instagramBusinessAccountId: "INSTAGRAM_PUBLIC_ID_COLLISION",
        reason: "Teste de unique inesperada",
      },
    }),
    (error) => error === unexpected,
  );

  const tenant = await register("Tenant Logger Instagram", "Admin Logger", uniqueEmail("logger"));
  const body = {
    name: "Instagram com logger indisponivel",
    instagramBusinessAccountId: `INSTAGRAM_LOGGER_${suffix}`,
    instagramUsernameMasked: "@logger_****",
    reason: [
      "Provisionamento auditavel",
      `instagramBusinessAccountId=${`INSTAGRAM_LOGGER_${suffix}`}`,
      "token=valor-sensivel",
      "payload={\"contato\":\"privado\"}",
    ].join("\n"),
  };
  const service = createInstagramInboundProvisioningService({
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
  assert.equal(JSON.stringify(created).includes(body.instagramBusinessAccountId), false);
  assert.equal(await realInstagramCount(tenant.empresaId), 1);

  const replay = await service.provision({
    tenantId: tenant.empresaId,
    actorUserId: tenant.usuarioId,
    body,
  });
  assert.equal(replay.created, false);
  assert.equal(replay.body.changed, false);
  assert.equal(await realInstagramCount(tenant.empresaId), 1);
});

test("classifica corridas reais com dois PrismaClient independentes", async () => {
  const sameTenant = await register("Tenant Corrida Replay", "Admin Corrida", uniqueEmail("race-same"));
  const sameBody = {
    ...validCreation(),
    instagramBusinessAccountId: `INSTAGRAM_SAME_${suffix}`,
  };
  const sameRace = await runRealProvisioningRace([
    { tenantId: sameTenant.empresaId, actorUserId: sameTenant.usuarioId, body: sameBody },
    { tenantId: sameTenant.empresaId, actorUserId: sameTenant.usuarioId, body: sameBody },
  ]);
  assert.deepEqual(
    sameRace.results.map((result) => ({
      status: result.status,
      created: result.value?.created,
    })).sort(sortRaceResults),
    [
      { status: "fulfilled", created: false },
      { status: "fulfilled", created: true },
    ],
  );
  assert.equal(sameRace.uniqueErrors.length, 1);
  assertKnownConstraintTargetOneOf(sameRace.uniqueErrors[0], [
    ["empresaId", "chaveInterna"],
    ["instagramBusinessAccountId"],
  ]);
  assert.equal(await realInstagramCount(sameTenant.empresaId), 1);

  const slotTenant = await register("Tenant Corrida Slot", "Admin Slot", uniqueEmail("race-slot"));
  const slotRace = await runRealProvisioningRace([
    {
      tenantId: slotTenant.empresaId,
      actorUserId: slotTenant.usuarioId,
      body: {
        ...validCreation(),
        instagramBusinessAccountId: `INSTAGRAM_SLOT_A_${suffix}`,
      },
    },
    {
      tenantId: slotTenant.empresaId,
      actorUserId: slotTenant.usuarioId,
      body: {
        ...validCreation(),
        instagramBusinessAccountId: `INSTAGRAM_SLOT_B_${suffix}`,
      },
    },
  ]);
  assert.equal(slotRace.results.filter((result) => result.status === "fulfilled").length, 1);
  const slotRejected = slotRace.results.find((result) => result.status === "rejected");
  assert.ok(slotRejected);
  assert.equal(slotRejected.reason.status, 409);
  assert.ok([
    "INSTAGRAM_IDENTITY_IMMUTABLE",
    "INSTAGRAM_CHANNEL_CONFLICT",
  ].includes(slotRejected.reason.code));
  assert.equal(slotRace.uniqueErrors.length, 1);
  assertKnownConstraintTarget(slotRace.uniqueErrors[0], ["empresaId", "chaveInterna"]);
  assert.equal(await realInstagramCount(slotTenant.empresaId), 1);

  const tenantA = await register("Tenant Corrida A", "Admin A", uniqueEmail("race-a"));
  const tenantB = await register("Tenant Corrida B", "Admin B", uniqueEmail("race-b"));
  const sharedBody = {
    ...validCreation(),
    instagramBusinessAccountId: `INSTAGRAM_CROSS_${suffix}`,
  };
  const crossRace = await runRealProvisioningRace([
    { tenantId: tenantA.empresaId, actorUserId: tenantA.usuarioId, body: sharedBody },
    { tenantId: tenantB.empresaId, actorUserId: tenantB.usuarioId, body: sharedBody },
  ]);
  assert.equal(crossRace.results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = crossRace.results.find((result) => result.status === "rejected");
  assert.ok(rejected);
  assert.equal(rejected.reason.code, "INSTAGRAM_IDENTITY_CONFLICT");
  assert.equal(rejected.reason.status, 409);
  assert.equal(crossRace.uniqueErrors.length, 1);
  assertKnownConstraintTarget(crossRace.uniqueErrors[0], ["instagramBusinessAccountId"]);
  assert.equal(await prisma.canalIntegracao.count({
    where: { instagramBusinessAccountId: sharedBody.instagramBusinessAccountId },
  }), 1);
});

async function runRealProvisioningRace(calls) {
  const {
    createInstagramInboundProvisioningService,
  } = require("../src/platform/instagramInboundProvisioning");
  const { PrismaClient } = require("@prisma/client");
  const barrier = createBarrier(calls.length);
  const uniqueErrors = [];
  const clients = calls.map(() => new PrismaClient());
  try {
    await Promise.all(clients.map((client) => client.$connect()));
    const services = clients.map((client) => createInstagramInboundProvisioningService({
      prisma: prismaWithCreateBarrier(client, barrier, uniqueErrors),
      logger: { info() {} },
    }));
    const results = await Promise.allSettled(
      calls.map((call, index) => services[index].provision(call)),
    );
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
    empresaFuncionalidade: {
      findMany: (query) => basePrisma.empresaFuncionalidade.findMany(query),
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

function validCreation() {
  return {
    name: "Instagram inbound real",
    instagramBusinessAccountId: " 000INSTAGRAM_F1 ",
    instagramUsernameMasked: "@conta_****",
    verifiedDisplayName: "Conta Tecnica",
    reason: "Provisionamento controlado Instagram",
  };
}

async function register(empresaNome, adminNome, email) {
  const senha = "SenhaInstagramSegura123";
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
  const senha = "SenhaInstagramUsuario123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token };
}

async function put(tenantId, body, token, headers) {
  return request(
    "PUT",
    `/platform/tenants/${tenantId}/integrations/instagram/inbound`,
    body,
    token,
    headers,
  );
}

async function getStatus(tenantId, token) {
  return request(
    "GET",
    `/platform/tenants/${tenantId}/integrations/instagram/inbound/status`,
    undefined,
    token,
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

async function canonicalChannel(empresaId) {
  return prisma.canalIntegracao.findUnique({
    where: {
      empresaId_chaveInterna: {
        empresaId,
        chaveInterna: "instagram-meta-inbound-real",
      },
    },
  });
}

async function realInstagramCount(empresaId) {
  return prisma.canalIntegracao.count({
    where: { empresaId, tipo: "INSTAGRAM_META", modoTeste: false },
  });
}

async function instagramCapabilityCount(empresaId) {
  return prisma.empresaFuncionalidade.count({
    where: {
      empresaId,
      chave: { in: ["INSTAGRAM_INTEGRATION", "INSTAGRAM_INBOUND"] },
    },
  });
}

async function effectCounts(empresaId) {
  const [events, messages, clients, leads, conversations, contacts, jobs, executions] = await Promise.all([
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
