const crypto = require("node:crypto");

const META_OAUTH_PROVIDER = "META_INSTAGRAM";
const META_INSTAGRAM_FLOW = "INSTAGRAM_LOGIN";
const STATE_TTL_MS = 10 * 60 * 1000;

function hashState(rawState) {
  return crypto.createHash("sha256").update(String(rawState || ""), "utf8").digest("hex");
}

function assertPositiveInt(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} invalido.`);
}

function createMetaOAuthState({ prisma, empresaId, usuarioId, canalIntegracaoId, fluxo = META_INSTAGRAM_FLOW, provedor = META_OAUTH_PROVIDER, now = new Date() }) {
  if (!prisma) throw new Error("Prisma e obrigatorio.");
  assertPositiveInt(empresaId, "empresaId");
  assertPositiveInt(usuarioId, "usuarioId");
  assertPositiveInt(canalIntegracaoId, "canalIntegracaoId");
  if (!String(fluxo).trim() || !String(provedor).trim()) throw new Error("Contexto OAuth invalido.");
  const rawState = crypto.randomBytes(32).toString("base64url");
  return prisma.integracaoOAuthState.create({
    data: {
      empresaId,
      usuarioId,
      canalIntegracaoId,
      fluxo,
      provedor,
      stateHash: hashState(rawState),
      expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    },
  }).then(() => rawState);
}

async function consumeMetaOAuthState({ prisma, rawState, empresaId, canalIntegracaoId, fluxo = META_INSTAGRAM_FLOW, provedor = META_OAUTH_PROVIDER, now = new Date(), validateContext }) {
  if (!prisma || typeof rawState !== "string" || rawState.length < 20 || rawState.length > 256) return null;
  assertPositiveInt(empresaId, "empresaId");
  assertPositiveInt(canalIntegracaoId, "canalIntegracaoId");
  const stateHash = hashState(rawState);
  return prisma.$transaction(async (tx) => {
    const stored = await tx.integracaoOAuthState.findUnique({ where: { stateHash } });
    if (!stored || stored.empresaId !== empresaId || stored.canalIntegracaoId !== canalIntegracaoId || stored.fluxo !== fluxo || stored.provedor !== provedor || stored.usedAt || stored.expiresAt <= now) return null;
    if (validateContext && !(await validateContext(tx, stored))) return null;
    const claimed = await tx.integracaoOAuthState.updateMany({
      where: { id: stored.id, stateHash, empresaId, canalIntegracaoId, fluxo, provedor, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return claimed.count === 1 ? stored : null;
  });
}

async function peekMetaOAuthState({ prisma, rawState }) {
  if (!prisma || typeof rawState !== "string" || rawState.length < 20 || rawState.length > 256) return null;
  return prisma.integracaoOAuthState.findUnique({ where: { stateHash: hashState(rawState) } });
}

module.exports = {
  META_OAUTH_PROVIDER,
  META_INSTAGRAM_FLOW,
  STATE_TTL_MS,
  hashState,
  createMetaOAuthState,
  consumeMetaOAuthState,
  peekMetaOAuthState,
};
