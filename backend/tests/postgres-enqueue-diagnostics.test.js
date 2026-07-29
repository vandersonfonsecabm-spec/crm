const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPostgresEnqueueDiagnostic,
  withPostgresEnqueueDiagnostics,
} = require("../src/automations/postgres-enqueue-diagnostics");
const { createAutomationService } = require("../src/automations/service");

const MALICIOUS_VALUES = [
  "postgresql://user:secret@database.internal:5432/crm",
  "Bearer secret-token",
  "person@example.test",
  "+55 11 99999-8888",
  "SELECT * FROM Usuario WHERE email = $1",
  "private payload value",
];

test("diagnostico allowlisted preserva codigos seguros e remove SQL, secrets e PII", () => {
  const error = Object.assign(new Error(MALICIOUS_VALUES.join(" ")), {
    code: "P2010",
    meta: {
      code: "22P02",
      message: `ERROR: invalid input value for enum "AcaoAutomacao": "${MALICIOUS_VALUES.join(" ")}"`,
      constraint: "AutomacaoAcaoJob_tipo_check",
      database_error: {
        message: MALICIOUS_VALUES.join(" "),
        query: "INSERT INTO AutomacaoAcaoJob VALUES ($1)",
        parameters: ["secret"],
      },
      payload: { email: "person@example.test" },
    },
    cause: {
      message: MALICIOUS_VALUES.join(" "),
      stack: "secret stack",
      request: { authorization: "Bearer secret-token" },
    },
  });

  const diagnostic = createPostgresEnqueueDiagnostic({
    operation: "INSERT_AUTOMATION_JOB",
    context: {
      actionType: "UPDATE_NEXT_FOLLOW_UP_PROJECTION",
      entityType: "LEAD",
      tenantId: 42,
      occurrenceKey: "commercial-occurrence-key",
      actionKey: "commercial-action-key",
      payload: { email: "person@example.test" },
    },
    error,
  });
  const serialized = JSON.stringify(diagnostic);

  assert.deepEqual(Object.keys(diagnostic).sort(), [
    "actionRef",
    "actionType",
    "constraint",
    "entityType",
    "occurrenceRef",
    "operation",
    "postgresCode",
    "postgresMessage",
    "prismaCode",
    "tenantRef",
  ]);
  assert.equal(diagnostic.prismaCode, "P2010");
  assert.equal(diagnostic.postgresCode, "22P02");
  assert.equal(diagnostic.postgresMessage, "invalid input value for enum");
  assert.equal(diagnostic.constraint, "AutomacaoAcaoJob_tipo_check");
  assert.equal(diagnostic.actionType, "UPDATE_NEXT_FOLLOW_UP_PROJECTION");
  assert.equal(diagnostic.entityType, "LEAD");
  for (const value of MALICIOUS_VALUES) assert.equal(serialized.includes(value), false);
  for (const forbidden of ["query", "parameters", "payload", "stack", "request", "cause", "meta"]) {
    assert.equal(Object.hasOwn(diagnostic, forbidden), false);
  }
});

test("wrapper relanca o mesmo erro depois de registrar envelope seguro", async () => {
  const error = Object.assign(new Error("unsafe@example.test"), {
    code: "P2010",
    meta: { code: "23505", message: 'duplicate key value violates unique constraint "safe_unique"' },
  });
  const lines = [];

  await assert.rejects(
    withPostgresEnqueueDiagnostics({
      operation: "INSERT_AUTOMATION_EXECUTION",
      context: { tenantId: 7, occurrenceKey: "sensitive-key" },
      logger: { error: (line) => lines.push(line) },
    }, async () => {
      throw error;
    }),
    (caught) => caught === error,
  );

  assert.equal(lines.length, 1);
  const diagnostic = JSON.parse(lines[0]);
  assert.equal(diagnostic.operation, "INSERT_AUTOMATION_EXECUTION");
  assert.equal(diagnostic.prismaCode, "P2010");
  assert.equal(diagnostic.postgresCode, "23505");
  assert.equal(diagnostic.postgresMessage, "duplicate key");
  assert.equal(diagnostic.constraint, "safe_unique");
  assert.equal(lines[0].includes("unsafe@example.test"), false);
  assert.equal(lines[0].includes("sensitive-key"), false);
});

test("insertExecutionPostgres registra a operacao e preserva o erro original", async () => {
  const error = postgresError("22P02", 'invalid input value for enum "EntidadeAutomacao"');
  const harness = enqueueHarness({ failureAt: 1, error });

  await assert.rejects(
    harness.service.enqueueLeadCreated({
      tx: harness.client,
      empresaId: 17,
      leadId: 91,
      originalEventId: "diagnostic-execution",
      occurredAt: new Date("2026-07-29T12:00:00.000Z"),
    }),
    (caught) => caught === error,
  );

  assert.equal(harness.lines.length, 1);
  const diagnostic = JSON.parse(harness.lines[0]);
  assert.equal(diagnostic.operation, "INSERT_AUTOMATION_EXECUTION");
  assert.equal(diagnostic.actionType, "UPDATE_NEXT_FOLLOW_UP_PROJECTION");
  assert.equal(diagnostic.entityType, "LEAD");
});

test("insertJobPostgres registra a operacao e preserva o erro original", async () => {
  const error = postgresError("22P02", 'invalid input value for enum "AcaoAutomacao"');
  const harness = enqueueHarness({ failureAt: 2, error });

  await assert.rejects(
    harness.service.enqueueLeadCreated({
      tx: harness.client,
      empresaId: 17,
      leadId: 91,
      originalEventId: "diagnostic-job",
      occurredAt: new Date("2026-07-29T12:00:00.000Z"),
    }),
    (caught) => caught === error,
  );

  assert.equal(harness.lines.length, 1);
  const diagnostic = JSON.parse(harness.lines[0]);
  assert.equal(diagnostic.operation, "INSERT_AUTOMATION_JOB");
  assert.equal(diagnostic.actionType, "UPDATE_NEXT_FOLLOW_UP_PROJECTION");
  assert.equal(diagnostic.entityType, "LEAD");
});

function enqueueHarness({ failureAt, error }) {
  let rawCall = 0;
  const lines = [];
  const execution = { id: 301, jobs: [] };
  const client = {
    empresaFuncionalidade: {
      findUnique: async () => ({ habilitada: true }),
    },
    automacaoRegra: {
      findMany: async () => [{
        id: 201,
        empresaId: 17,
        nome: "Technical projection",
        gatilho: "LEAD_CREATED",
        prioridade: 1,
        timezone: "America/Sao_Paulo",
        condicoesJson: "[]",
        acoesJson: JSON.stringify([{ tipo: "UPDATE_NEXT_FOLLOW_UP_PROJECTION" }]),
        janelaJson: null,
        versao: 1,
        ativa: true,
        activatedAt: new Date("2026-07-29T11:00:00.000Z"),
      }],
    },
    lead: {
      findFirst: async () => ({
        id: 91,
        empresaId: 17,
        status: "NOVO",
        origem: "PILOT",
        responsavelId: null,
        createdAt: new Date("2026-07-29T11:30:00.000Z"),
      }),
    },
    automacaoExecucao: {
      findUnique: async () => execution,
    },
    $executeRaw: async () => {
      rawCall += 1;
      if (rawCall === failureAt) throw error;
      return 1;
    },
  };
  const service = createAutomationService({
    prisma: client,
    env: {
      AUTOMATIONS_ENABLED: "true",
      CRM_TEST_DATABASE_PROVIDER: "postgresql",
    },
    logger: { error: (line) => lines.push(line) },
  });
  return { client, lines, service };
}

function postgresError(sqlState, message) {
  return Object.assign(new Error("raw SQL failed"), {
    code: "P2010",
    meta: { code: sqlState, message },
  });
}
