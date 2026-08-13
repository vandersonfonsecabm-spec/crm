const crypto = require("node:crypto");
const { encryptCredentialsWithContext, decryptCredentialsWithContext } = require("./crypto");
const { domainError } = require("../leads-communication/policy");

const SUPPORTED_PROVIDERS = new Map([
  ["META_INSTAGRAM", "INSTAGRAM_META"],
  ["META_WHATSAPP", "WHATSAPP_META"],
  ["META_MESSENGER", "MESSENGER_META"],
]);
const ACTIVE_STATUS = "ATIVA";
const CREDENTIAL_FIELDS = new Set(["accessToken", "expiresAt", "userId", "scopes", "tokenType"]);

/**
 * Dedicated, server-side persistence boundary for Meta credentials.
 *
 * The caller supplies only authenticated tenant/channel context and a
 * credential payload. The payload is encrypted before persistence and is
 * never returned by create/replace. Resolution requires the current channel
 * bridge, so a reference by itself can never select a credential.
 */
function createMetaCredentialStore({ prisma, encrypt = encryptCredentialsWithContext, decrypt = decryptCredentialsWithContext, referenceFactory = () => crypto.randomUUID() } = {}) {
  if (!prisma) throw new Error("Prisma e obrigatorio para o MetaCredentialStore.");

  async function createLocalCredential(input) {
    const context = normalizeContext(input);
    const provider = normalizeProvider(input?.provider);
    const validateContext = typeof input?.validateContext === "function" ? input.validateContext : null;
    const credentials = credentialPayload(input?.credentials);
    const reference = opaqueReference(referenceFactory());
    const ciphertext = encrypt(credentials, { ...context, provider, reference, revision: 1 });
    if (!ciphertext) throw metaError(422, "META_CREDENTIAL_ENCRYPTION_FAILED", "Nao foi possivel proteger a credencial.");

    return runCredentialTransaction(prisma, async (tx) => {
      const channel = await loadChannel(tx, context, provider);
      if (validateContext && (await validateContext(tx, { ...context, provider, channel })) === false) {
        throw metaError(409, "META_OAUTH_CONTEXT_INVALID", "O contexto autorizado nao esta mais ativo.");
      }
      if (channel.accessTokenRef) throw metaError(409, "META_CREDENTIAL_ALREADY_ACTIVE", "O canal ja possui uma credencial Meta ativa.");

      const active = await tx.metaCredential.findFirst({
        where: { empresaId: context.empresaId, canalIntegracaoId: context.canalIntegracaoId, provider, status: ACTIVE_STATUS },
      });
      if (active) throw metaError(409, "META_CREDENTIAL_ALREADY_ACTIVE", "O canal ja possui uma credencial Meta ativa.");

      const row = await tx.metaCredential.create({
        data: {
          empresaId: context.empresaId,
          canalIntegracaoId: context.canalIntegracaoId,
          provider,
          reference,
          ciphertext,
          status: ACTIVE_STATUS,
          revision: 1,
        },
      });
      const linked = await tx.canalIntegracao.updateMany({
        where: {
          id: context.canalIntegracaoId,
          empresaId: context.empresaId,
          accessTokenRef: null,
          tipo: channel.tipo,
          modoTeste: channel.modoTeste,
          ativo: channel.ativo,
          status: channel.status,
          instagramBusinessAccountId: channel.instagramBusinessAccountId,
          metaAppId: channel.metaAppId,
          providerEnvironment: channel.providerEnvironment,
        },
        data: { accessTokenRef: reference },
      });
      if (linked.count !== 1) throw casConflict();
      return present(row);
    });
  }

  async function resolveCurrentCredential(input) {
    const context = normalizeContext(input);
    const provider = normalizeProvider(input?.provider);
    const channel = await loadChannel(prisma, context, provider);
    if (!channel.accessTokenRef) return null;
    const row = await prisma.metaCredential.findFirst({
      where: {
        empresaId: context.empresaId,
        canalIntegracaoId: context.canalIntegracaoId,
        provider,
        reference: channel.accessTokenRef,
        status: ACTIVE_STATUS,
      },
    });
    if (!row) throw bindingConflict();
    let credentials;
    try {
      credentials = credentialPayload(decrypt(row.ciphertext, {
        empresaId: row.empresaId,
        canalIntegracaoId: row.canalIntegracaoId,
        provider: row.provider,
        reference: row.reference,
        revision: row.revision,
      }));
    } catch {
      throw metaError(500, "META_CREDENTIAL_DECRYPTION_FAILED", "A credencial Meta nao pode ser resolvida com seguranca.");
    }
    return { ...present(row), credentials };
  }

  async function replaceLocalCredential(input) {
    const context = normalizeContext(input);
    const provider = normalizeProvider(input?.provider);
    const expectedRevision = requiredRevision(input?.expectedRevision);
    const credentials = credentialPayload(input?.credentials);
    const validateContext = typeof input?.validateContext === "function" ? input.validateContext : null;
    const nextReference = opaqueReference(referenceFactory());
    const ciphertext = encrypt(credentials, { ...context, provider, reference: nextReference, revision: expectedRevision + 1 });
    if (!ciphertext) throw metaError(422, "META_CREDENTIAL_ENCRYPTION_FAILED", "Nao foi possivel proteger a credencial.");

    return runCredentialTransaction(prisma, async (tx) => {
      const channel = await loadChannel(tx, context, provider);
      if (validateContext && (await validateContext(tx, { ...context, provider, channel })) === false) {
        throw metaError(409, "META_OAUTH_CONTEXT_INVALID", "O contexto autorizado nao esta mais ativo.");
      }
      if (!channel.accessTokenRef) throw notFound();
      const current = await loadCurrent(tx, context, provider, channel.accessTokenRef);
      if (current.revision !== expectedRevision) throw casConflict();

      const next = await tx.metaCredential.create({
        data: {
          empresaId: context.empresaId,
          canalIntegracaoId: context.canalIntegracaoId,
          provider,
          reference: nextReference,
          ciphertext,
          status: ACTIVE_STATUS,
          revision: expectedRevision + 1,
        },
      });
      const linked = await tx.canalIntegracao.updateMany({
        where: { id: context.canalIntegracaoId, empresaId: context.empresaId, accessTokenRef: current.reference },
        data: { accessTokenRef: nextReference },
      });
      if (linked.count !== 1) throw casConflict();
      const removed = await tx.metaCredential.deleteMany({
        where: { id: current.id, empresaId: context.empresaId, canalIntegracaoId: context.canalIntegracaoId, provider, reference: current.reference, revision: expectedRevision, status: ACTIVE_STATUS },
      });
      if (removed.count !== 1) throw casConflict();
      return present(next);
    });
  }

  async function removeLocalCredential(input) {
    const context = normalizeContext(input);
    const provider = normalizeProvider(input?.provider);
    const expectedRevision = requiredRevision(input?.expectedRevision);
    const validateContext = typeof input?.validateContext === "function" ? input.validateContext : null;

    await runCredentialTransaction(prisma, async (tx) => {
      const channel = await loadChannel(tx, context, provider);
      if (validateContext && (await validateContext(tx, { ...context, provider, channel })) === false) {
        throw metaError(409, "META_OAUTH_CONTEXT_INVALID", "O contexto autorizado nao esta mais ativo.");
      }
      if (!channel.accessTokenRef) throw notFound();
      const current = await loadCurrent(tx, context, provider, channel.accessTokenRef);
      if (current.revision !== expectedRevision) throw casConflict();

      const unlinked = await tx.canalIntegracao.updateMany({
        where: { id: context.canalIntegracaoId, empresaId: context.empresaId, accessTokenRef: current.reference },
        data: { accessTokenRef: null },
      });
      if (unlinked.count !== 1) throw casConflict();
      const removed = await tx.metaCredential.deleteMany({
        where: { id: current.id, empresaId: context.empresaId, canalIntegracaoId: context.canalIntegracaoId, provider, reference: current.reference, revision: expectedRevision, status: ACTIVE_STATUS },
      });
      if (removed.count !== 1) throw casConflict();
    });
    return { removed: true };
  }

  async function markLocalCredentialError(input) {
    const context = normalizeContext(input);
    const provider = normalizeProvider(input?.provider);
    const reference = opaqueReference(input?.reference);
    await runCredentialTransaction(prisma, async (tx) => {
      await tx.metaCredential.updateMany({
        where: { empresaId: context.empresaId, canalIntegracaoId: context.canalIntegracaoId, provider, reference, status: ACTIVE_STATUS },
        data: { status: "ERRO" },
      });
      await tx.canalIntegracao.updateMany({
        where: { id: context.canalIntegracaoId, empresaId: context.empresaId, accessTokenRef: reference },
        data: { accessTokenRef: null, lastFailureCode: "META_SUBSCRIPTION_FAILED", lastFailureAt: new Date() },
      });
    });
    return { marked: true };
  }

  return { createLocalCredential, removeLocalCredential, replaceLocalCredential, resolveCurrentCredential, markLocalCredentialError };
}

async function loadChannel(db, context, provider) {
  const channel = await db.canalIntegracao.findFirst({
    where: { id: context.canalIntegracaoId, empresaId: context.empresaId },
    select: {
      id: true,
      empresaId: true,
      tipo: true,
      modoTeste: true,
      ativo: true,
      status: true,
      chaveInterna: true,
      wabaId: true,
      phoneNumberId: true,
      messengerPageId: true,
      instagramBusinessAccountId: true,
      metaAppId: true,
      providerEnvironment: true,
      accessTokenRef: true,
    },
  });
  if (!channel) throw notFound("Canal de integracao nao encontrado.");
  if (SUPPORTED_PROVIDERS.get(provider) !== channel.tipo) throw metaError(409, "META_CREDENTIAL_CHANNEL_MISMATCH", "O provider Meta nao pertence a este canal.");
  return channel;
}

async function runCredentialTransaction(prisma, callback) {
  const databaseUrl = String(process.env.CRM_TEST_DATABASE_URL || process.env.DATABASE_URL || "");
  const postgres = /^postgres(?:ql)?:/i.test(databaseUrl);
  const attempts = postgres ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, postgres
        ? { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 }
        : undefined);
    } catch (error) {
      if (!postgres || attempt >= attempts || !isSerializationConflict(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
    }
  }
  throw metaError(409, "META_CHANNEL_READINESS_CONFLICT", "O estado do canal mudou durante a autorizacao.");
}

function isSerializationConflict(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "P2034" || message.includes("serialization") || message.includes("deadlock detected") || message.includes("could not serialize");
}

async function loadCurrent(db, context, provider, reference) {
  const row = await db.metaCredential.findFirst({
    where: { empresaId: context.empresaId, canalIntegracaoId: context.canalIntegracaoId, provider, reference, status: ACTIVE_STATUS },
  });
  if (!row) throw bindingConflict();
  return row;
}

function normalizeContext(value) {
  const empresaId = positiveInteger(value?.empresaId, "empresaId");
  const canalIntegracaoId = positiveInteger(value?.canalIntegracaoId, "canalIntegracaoId");
  return { empresaId, canalIntegracaoId };
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toUpperCase();
  if (!SUPPORTED_PROVIDERS.has(provider)) throw metaError(422, "META_CREDENTIAL_PROVIDER_UNSUPPORTED", "Provider Meta nao suportado neste store.");
  return provider;
}

function credentialPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", "Payload de credencial invalido.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", "Payload de credencial invalido.");
  const keys = Object.keys(value);
  if (keys.some((key) => !CREDENTIAL_FIELDS.has(key))) throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", "Payload de credencial contem campos nao permitidos.");

  const accessToken = safeCredentialText(value.accessToken, "accessToken", 4096, true);
  const normalized = { accessToken };
  if (value.expiresAt !== undefined) {
    const expiresAt = safeCredentialText(value.expiresAt, "expiresAt", 80, true);
    if (!Number.isFinite(Date.parse(expiresAt))) throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", "expiresAt invalido.");
    normalized.expiresAt = expiresAt;
  }
  if (value.userId !== undefined) normalized.userId = safeCredentialText(value.userId, "userId", 200, true);
  if (value.tokenType !== undefined) {
    const tokenType = safeCredentialText(value.tokenType, "tokenType", 40, true);
    if (tokenType.toLowerCase() !== "bearer") throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", "tokenType invalido.");
    normalized.tokenType = tokenType;
  }
  if (value.scopes !== undefined) {
    if (!Array.isArray(value.scopes) || value.scopes.length > 50 || value.scopes.some((scope) => typeof scope !== "string")) {
      throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", "scopes invalido.");
    }
    normalized.scopes = value.scopes.map((scope) => safeCredentialText(scope, "scope", 120, true));
  }
  return normalized;
}

function safeCredentialText(value, field, max, required) {
  if (value === undefined || value === null || value === "") {
    if (required) throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", `${field} obrigatorio.`);
    return null;
  }
  if (typeof value !== "string") throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", `${field} invalido.`);
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u001F\u007F]/.test(text)) throw metaError(422, "META_CREDENTIAL_PAYLOAD_INVALID", `${field} invalido.`);
  return text;
}

function opaqueReference(value) {
  const reference = String(value || "").trim();
  if (!reference || reference.length > 200 || /[\u0000-\u001F\u007F]/.test(reference)) throw metaError(500, "META_CREDENTIAL_REFERENCE_INVALID", "Referencia opaca invalida.");
  return reference;
}

function requiredRevision(value) {
  return positiveInteger(value, "expectedRevision");
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw metaError(422, "META_CREDENTIAL_VALIDATION_ERROR", `${field} invalido.`);
  return number;
}

function present(row) {
  return {
    id: row.id,
    empresaId: row.empresaId,
    canalIntegracaoId: row.canalIntegracaoId,
    provider: row.provider,
    reference: row.reference,
    status: row.status,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function notFound(message = "Credencial Meta nao encontrada.") {
  return metaError(404, "META_CREDENTIAL_NOT_FOUND", message);
}

function bindingConflict() {
  return metaError(409, "META_CREDENTIAL_BINDING_INVALID", "A ponte da credencial Meta esta inconsistente.");
}

function casConflict() {
  return metaError(409, "META_CREDENTIAL_REVISION_CONFLICT", "A credencial Meta foi alterada por outra operacao.");
}

function metaError(status, codigo, message) {
  return domainError(status, codigo, message);
}

module.exports = { ACTIVE_STATUS, SUPPORTED_PROVIDERS, createMetaCredentialStore };
