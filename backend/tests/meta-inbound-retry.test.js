const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  FAILURE_STATE,
  calculateBackoffWithJitter,
  claimMetaInboundWebhook,
  normalizeRetryPolicy,
  recordMetaInboundFailure,
} = require("../src/integrations/metaInboundRetry");

const PROVIDERS = ["WHATSAPP", "INSTAGRAM", "MESSENGER"];
const POLICY = Object.freeze({
  maxAttempts: 3,
  leaseMs: 1_000,
  baseDelayMs: 10,
  maxDelayMs: 80,
});

test("claim CAS e lease expirado preservam uma unica posse para os tres provedores", async () => {
  for (const provider of PROVIDERS) {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const { prisma, row } = createFakePrisma(eventRow(provider, now));

    const first = await claimMetaInboundWebhook({
      prisma,
      eventoWebhookId: row.id,
      provider,
      clock: () => now,
      policy: POLICY,
    });
    assert.equal(first.state, "CLAIMED");
    assert.equal(row.statusProcessamento, "PROCESSANDO");
    assert.equal(row.tentativas, 1);

    const active = await claimMetaInboundWebhook({
      prisma,
      eventoWebhookId: row.id,
      provider,
      clock: () => new Date(now.getTime() + 999),
      policy: POLICY,
    });
    assert.equal(active.state, "LEASE_ACTIVE");

    const recovered = await claimMetaInboundWebhook({
      prisma,
      eventoWebhookId: row.id,
      provider,
      clock: () => new Date(now.getTime() + 1_001),
      policy: POLICY,
    });
    assert.equal(recovered.state, "CLAIMED");
    assert.equal(recovered.recoveredLease, true);
    assert.equal(row.tentativas, 2);

    const late = await recordMetaInboundFailure({
      prisma,
      eventoWebhookId: row.id,
      provider,
      lease: first.lease,
      error: retryableError(),
      channel: channel(provider),
      clock: () => now,
      policy: POLICY,
    });
    assert.deepEqual(late, { state: "LEASE_LOST", recorded: false });
    assert.equal(row.statusProcessamento, "PROCESSANDO");
  }
});

test("retry P2028 usa backoff exponencial com jitter e encerra somente no limite", async () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const { prisma, row } = createFakePrisma(eventRow("WHATSAPP", now));
  const leases = [];

  for (let index = 0; index < 3; index += 1) {
    const claim = await claimMetaInboundWebhook({
      prisma,
      eventoWebhookId: row.id,
      provider: "WHATSAPP",
      clock: () => new Date(now.getTime() + index * 2_000),
      policy: POLICY,
    });
    assert.equal(claim.state, "CLAIMED");
    leases.push(claim.lease);
    const recorded = await recordMetaInboundFailure({
      prisma,
      eventoWebhookId: row.id,
      provider: "WHATSAPP",
      lease: claim.lease,
      error: retryableError(),
      channel: channel("WHATSAPP"),
      clock: () => now,
      policy: POLICY,
    });
    assert.equal(recorded.state, index === 2 ? FAILURE_STATE.EXHAUSTED : FAILURE_STATE.RETRYABLE);
  }

  assert.equal(row.statusProcessamento, "FALHOU");
  assert.equal(row.erroResumo, FAILURE_STATE.EXHAUSTED);
  assert.equal(row.tentativas, 3);
  assert.equal(row.erroCodigo, "P2028");
  assert.notEqual(leases[0].updatedAt.getTime(), leases[1].updatedAt.getTime());
  assert.equal(calculateBackoffWithJitter({ attempt: 1, policy: POLICY, random: () => 0 }), 0);
  assert.equal(calculateBackoffWithJitter({ attempt: 2, policy: POLICY, random: () => 0.5 }), 10);
  assert.equal(calculateBackoffWithJitter({ attempt: 4, policy: POLICY, random: () => 0.5 }), 40);
});

test("payload permanente nao e reaberto e nao atualiza estado por uma posse perdida", async () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const { prisma, row, channelRow } = createFakePrisma(eventRow("MESSENGER", now));
  const claim = await claimMetaInboundWebhook({
    prisma,
    eventoWebhookId: row.id,
    provider: "MESSENGER",
    clock: () => now,
    policy: POLICY,
  });
  const permanent = new Error("payload invalido");
  permanent.code = "MESSENGER_EVENT_PAYLOAD_INVALID";
  permanent.retryable = false;

  const result = await recordMetaInboundFailure({
    prisma,
    eventoWebhookId: row.id,
    provider: "MESSENGER",
    lease: claim.lease,
    error: permanent,
    channel: channel("MESSENGER"),
    clock: () => now,
    policy: POLICY,
  });

  assert.deepEqual(result, { state: FAILURE_STATE.PERMANENT, recorded: true, attempt: 1 });
  assert.equal(row.statusProcessamento, "FALHOU");
  assert.equal(row.erroResumo, FAILURE_STATE.PERMANENT);
  assert.equal(row.tentativas, 1);
  assert.equal(channelRow.lastFailureCode, "MESSENGER_EVENT_PAYLOAD_INVALID");
});

test("contenção tem orçamento separado do retry de erro", () => {
  const policy = normalizeRetryPolicy({ maxAttempts: 3, maxContentionAttempts: 10 });
  assert.equal(policy.maxAttempts, 3);
  assert.equal(policy.maxContentionAttempts, 10);
});

function retryableError() {
  const error = new Error("timeout transitório");
  error.code = "P2028";
  return error;
}

function eventRow(provider, now) {
  return {
    id: 11,
    empresaId: 7,
    canalIntegracaoId: 13,
    provedor: provider,
    statusProcessamento: "RECEBIDO",
    tentativas: 0,
    processadoEm: null,
    erroCodigo: null,
    erroResumo: null,
    updatedAt: new Date(now),
  };
}

function channel(provider) {
  return {
    type: `${provider}_META`,
    key: `${provider.toLowerCase()}-meta-inbound-real`,
    failureFallback: `${provider}_EVENT_PROCESSING_UNAVAILABLE`,
  };
}

function createFakePrisma(initialRow) {
  const row = { ...initialRow, updatedAt: new Date(initialRow.updatedAt) };
  const channelRow = {
    id: row.canalIntegracaoId,
    empresaId: row.empresaId,
    ativo: true,
    status: "ATIVO",
    modoTeste: false,
    tipo: `${row.provedor}_META`,
    chaveInterna: `${row.provedor.toLowerCase()}-meta-inbound-real`,
    lastFailureAt: null,
    lastFailureCode: null,
  };
  const eventoWebhook = {
    async findUnique({ where }) {
      return where.id === row.id ? cloneRow(row) : null;
    },
    async updateMany({ where, data }) {
      if (!matches(row, where)) return { count: 0 };
      apply(row, data);
      return { count: 1 };
    },
  };
  const canalIntegracao = {
    async updateMany({ where, data }) {
      if (!matches(channelRow, where)) return { count: 0 };
      apply(channelRow, data);
      return { count: 1 };
    },
  };
  const prisma = {
    eventoWebhook,
    canalIntegracao,
    async $transaction(callback) {
      return callback({ eventoWebhook, canalIntegracao });
    },
  };
  return { prisma, row, channelRow };
}

function matches(record, where) {
  return Object.entries(where).every(([key, expected]) => {
    const actual = record[key];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    return actual === expected;
  });
}

function apply(record, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "increment")) {
      record[key] += value.increment;
    } else {
      record[key] = value instanceof Date ? new Date(value) : value;
    }
  }
}

function cloneRow(row) {
  return { ...row, updatedAt: new Date(row.updatedAt) };
}
