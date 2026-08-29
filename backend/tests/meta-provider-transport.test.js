const assert = require("node:assert/strict");
const test = require("node:test");
const { createMetaProviderTransport, createPrismaMetaChannelResolver } = require("../src/integrations/metaProviderTransport");

function channel(type, fields = {}) {
  return { id: 10, empresaId: 20, tipo: type, chaveInterna: type === "WHATSAPP_META" ? "whatsapp-meta-inbound-real" : "messenger-meta-inbound-real", metaAppId: "app-test", providerEnvironment: "test", ativo: true, status: "ATIVO", modoTeste: false, ...fields };
}

const whatsappEnv = (extra = {}) => ({ NODE_ENV: "test", META_INBOUND_WORKER_ENABLED: "true", WHATSAPP_INTEGRATION_ENABLED: "true", WHATSAPP_INBOUND_ENABLED: "true", WHATSAPP_APP_SECRET: "whatsapp-secret", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "whatsapp-verify", WHATSAPP_META_APP_ID: "app-test", WHATSAPP_PROVIDER_ENVIRONMENT: "test", ...extra });
const messengerEnv = (extra = {}) => ({ NODE_ENV: "test", META_INBOUND_WORKER_ENABLED: "true", MESSENGER_INTEGRATION_ENABLED: "true", MESSENGER_INBOUND_ENABLED: "true", MESSENGER_APP_SECRET: "messenger-secret", MESSENGER_WEBHOOK_VERIFY_TOKEN: "messenger-verify", MESSENGER_META_APP_ID: "app-test", MESSENGER_PROVIDER_ENVIRONMENT: "test", ...extra });

function resolver(expected) {
  return async ({ empresaId, canalIntegracaoId }) => (
    empresaId === expected.empresaId && canalIntegracaoId === expected.id ? expected : null
  );
}

const authorize = async () => true;

test("transportes Meta falham fechados sem network externa, provider ou credencial", async () => {
  let calls = 0;
  const transport = createMetaProviderTransport({
    env: whatsappEnv({ META_EXTERNAL_NETWORK_ENABLED: "false", WHATSAPP_OUTBOUND_ENABLED: "true" }),
    fetchImpl: async () => { calls += 1; throw new Error("network must not be called"); },
    credentialResolver: async () => ({ credentials: { accessToken: "never-used" } }),
    authorizationResolver: authorize,
    channelResolver: resolver(channel("WHATSAPP_META", { phoneNumberId: "phone-test" })),
  });
  await assert.rejects(
    () => transport.sendWhatsAppText({ empresaId: 20, canalIntegracaoId: 10, recipient: "5511999999999", text: "oi" }),
    (error) => error.codigo === "META_EXTERNAL_NETWORK_DISABLED",
  );
  assert.equal(calls, 0);
});

test("transport exige autorização tenant/destino antes de credencial ou network", async () => {
  let credentialCalls = 0;
  let fetchCalls = 0;
  const transport = createMetaProviderTransport({
    env: whatsappEnv({ META_EXTERNAL_NETWORK_ENABLED: "true", WHATSAPP_OUTBOUND_ENABLED: "true", META_GRAPH_API_VERSION: "v23.0" }),
    authorizationResolver: async ({ recipient }) => recipient !== "blocked",
    credentialResolver: async () => { credentialCalls += 1; return { credentials: { accessToken: "never-used" } }; },
    channelResolver: resolver(channel("WHATSAPP_META", { phoneNumberId: "phone-test" })),
    fetchImpl: async () => { fetchCalls += 1; throw new Error("network must not be called"); },
  });
  await assert.rejects(
    () => transport.sendWhatsAppText({ empresaId: 20, canalIntegracaoId: 10, recipient: "blocked", text: "oi" }),
    (error) => error.codigo === "META_PROVIDER_TENANT_CAPABILITY_REQUIRED",
  );
  assert.equal(credentialCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("transport WhatsApp usa host, timeout e payload oficiais somente após gates", async () => {
  let request;
  const transport = createMetaProviderTransport({
    env: whatsappEnv({ META_EXTERNAL_NETWORK_ENABLED: "true", WHATSAPP_OUTBOUND_ENABLED: "true", META_GRAPH_API_VERSION: "v23.0" }),
    credentialResolver: async () => ({ credentials: { accessToken: "provider-token" } }),
    authorizationResolver: authorize,
    channelResolver: resolver(channel("WHATSAPP_META", { phoneNumberId: "phone-test" })),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.test" }] }) };
    },
  });
  const result = await transport.sendWhatsAppText({ empresaId: 20, canalIntegracaoId: 10, recipient: "5511999999999", text: "oi" });
  assert.equal(result.providerMessageId, "wamid.test");
  assert.equal(request.url, "https://graph.facebook.com/v23.0/phone-test/messages");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer provider-token");
  assert.match(request.options.body, /messaging_product/);
});

test("transport Messenger mantém binding de página e não aceita canal errado", async () => {
  const transport = createMetaProviderTransport({
    env: messengerEnv({ META_EXTERNAL_NETWORK_ENABLED: "false", MESSENGER_OUTBOUND_ENABLED: "true" }),
    fetchImpl: async () => { throw new Error("network must not be called"); },
    credentialResolver: async () => ({ credentials: { accessToken: "never-used" } }),
    authorizationResolver: authorize,
    channelResolver: resolver(channel("WHATSAPP_META", { messengerPageId: "page-test" })),
  });
  await assert.rejects(
    () => transport.sendMessengerText({ empresaId: 20, canalIntegracaoId: 10, recipient: "psid", text: "oi" }),
    (error) => error.codigo === "META_PROVIDER_CHANNEL_MISMATCH",
  );
});

test("transport Messenger usa Page ID, messaging_type RESPONSE e valida resposta", async () => {
  let request;
  const messengerChannel = channel("MESSENGER_META", { messengerPageId: "page-test" });
  const transport = createMetaProviderTransport({
    env: messengerEnv({ META_EXTERNAL_NETWORK_ENABLED: "true", MESSENGER_OUTBOUND_ENABLED: "true", META_GRAPH_API_VERSION: "v23.0" }),
    credentialResolver: async () => ({ credentials: { accessToken: "page-token" } }),
    authorizationResolver: authorize,
    channelResolver: resolver(messengerChannel),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ message_id: "mid.test", recipient_id: "psid" }) };
    },
  });
  const result = await transport.sendMessengerText({ empresaId: 20, canalIntegracaoId: 10, recipient: "psid", text: "oi" });
  assert.equal(result.providerMessageId, "mid.test");
  assert.equal(request.url, "https://graph.facebook.com/v23.0/page-test/messages");
  assert.match(request.options.body, /messaging_type/);
  const recipientOnly = createMetaProviderTransport({
    env: messengerEnv({ META_EXTERNAL_NETWORK_ENABLED: "true", MESSENGER_OUTBOUND_ENABLED: "true", META_GRAPH_API_VERSION: "v23.0" }),
    credentialResolver: async () => ({ credentials: { accessToken: "page-token" } }),
    authorizationResolver: authorize,
    channelResolver: resolver(messengerChannel),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ recipient_id: "psid" }) }),
  });
  await assert.rejects(() => recipientOnly.sendMessengerText({ empresaId: 20, canalIntegracaoId: 10, recipient: "psid", text: "oi" }), (error) => error.codigo === "META_PROVIDER_RESPONSE_INVALID");
});

test("transport rejeita credencial ausente e resposta sem ID", async () => {
  const whatsappChannel = channel("WHATSAPP_META", { phoneNumberId: "phone-test" });
  const base = {
    env: whatsappEnv({ META_EXTERNAL_NETWORK_ENABLED: "true", WHATSAPP_OUTBOUND_ENABLED: "true", META_GRAPH_API_VERSION: "v23.0" }),
    channelResolver: resolver(whatsappChannel),
    authorizationResolver: authorize,
  };
  const missing = createMetaProviderTransport({ ...base, credentialResolver: async () => null, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  await assert.rejects(() => missing.sendWhatsAppText({ empresaId: 20, canalIntegracaoId: 10, recipient: "5511999999999", text: "oi" }), (error) => error.codigo === "META_PROVIDER_CREDENTIAL_REQUIRED");
  const invalid = createMetaProviderTransport({ ...base, credentialResolver: async () => ({ credentials: { accessToken: "token" } }), fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  await assert.rejects(() => invalid.sendWhatsAppText({ empresaId: 20, canalIntegracaoId: 10, recipient: "5511999999999", text: "oi" }), (error) => error.codigo === "META_PROVIDER_RESPONSE_INVALID");
});

test("transport rejeita binding de tenant, gate de provider e resposta de formato incorreto", async () => {
  let calls = 0;
  const channelResolver = async () => channel("WHATSAPP_META", { phoneNumberId: "phone-test" });
  const base = {
    env: whatsappEnv({ META_EXTERNAL_NETWORK_ENABLED: "true", WHATSAPP_OUTBOUND_ENABLED: "true", META_GRAPH_API_VERSION: "v23.0" }),
    credentialResolver: async () => ({ credentials: { accessToken: "token" } }),
    authorizationResolver: authorize,
    channelResolver,
    fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ message_id: "wrong-provider-shape" }) }; },
  };
  const transport = createMetaProviderTransport(base);
  await assert.rejects(
    () => transport.sendWhatsAppText({ empresaId: 21, canalIntegracaoId: 10, recipient: "5511999999999", text: "oi" }),
    (error) => error.codigo === "META_PROVIDER_CHANNEL_BINDING_INVALID",
  );
  assert.equal(calls, 0);

  const disabled = createMetaProviderTransport({
    ...base,
    env: { ...base.env, WHATSAPP_OUTBOUND_ENABLED: "false" },
  });
  await assert.rejects(
    () => disabled.sendWhatsAppText({ empresaId: 20, canalIntegracaoId: 10, recipient: "5511999999999", text: "oi" }),
    (error) => error.codigo === "WHATSAPP_OUTBOUND_DISABLED",
  );
  assert.equal(calls, 0);

  await assert.rejects(
    () => transport.sendWhatsAppText({ empresaId: 20, canalIntegracaoId: 10, recipient: "5511999999999", text: "oi" }),
    (error) => error.codigo === "META_PROVIDER_RESPONSE_INVALID",
  );
});

test("transport converte falha HTTP e timeout em erros sanitizados e finitos", async () => {
  const channelResolver = resolver(channel("MESSENGER_META", { messengerPageId: "page-test" }));
  const base = {
    env: messengerEnv({ META_EXTERNAL_NETWORK_ENABLED: "true", MESSENGER_OUTBOUND_ENABLED: "true", META_GRAPH_API_VERSION: "v23.0" }),
    credentialResolver: async () => ({ credentials: { accessToken: "token" } }),
    authorizationResolver: authorize,
    channelResolver,
  };
  const failed = createMetaProviderTransport({
    ...base,
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "private provider detail" } }) }),
  });
  await assert.rejects(
    () => failed.sendMessengerText({ empresaId: 20, canalIntegracaoId: 10, recipient: "psid", text: "oi" }),
    (error) => error.codigo === "META_PROVIDER_REQUEST_FAILED" && !String(error.message).includes("private"),
  );

  const timedOut = createMetaProviderTransport({
    ...base,
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  });
  await assert.rejects(
    () => timedOut.sendMessengerText({ empresaId: 20, canalIntegracaoId: 10, recipient: "psid", text: "oi" }),
    (error) => error.codigo === "META_PROVIDER_TIMEOUT",
  );
});

test("resolver Prisma fixa tenant, canal e tipo do provider antes do transporte", async () => {
  let query;
  const resolver = createPrismaMetaChannelResolver({
    prisma: {
      canalIntegracao: {
        findFirst: async (args) => { query = args; return channel("MESSENGER_META", { messengerPageId: "page-test" }); },
      },
    },
  });
  const result = await resolver({ empresaId: 20, canalIntegracaoId: 10, provider: "META_MESSENGER" });
  assert.equal(result.messengerPageId, "page-test");
  assert.deepEqual(query.where, { id: 10, empresaId: 20, tipo: "MESSENGER_META", chaveInterna: "messenger-meta-inbound-real" });
  assert.equal(query.select.accessTokenRef, undefined);
});
