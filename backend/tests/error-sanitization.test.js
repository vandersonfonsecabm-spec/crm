const assert = require("node:assert/strict");
const test = require("node:test");
const { _private: channelErrors } = require("../src/channels/channelRoutes");
const { _private: simulationErrors } = require("../src/channels/whatsapp/simulationRoutes");
const { _private: integrationErrors } = require("../src/integrations/routes");

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test("preserva erros de dominio controlados em 400, 404, 409 e 422", () => {
  for (const status of [400, 404, 409, 422]) {
    const response = responseRecorder();
    const error = Object.assign(new Error(`Mensagem controlada ${status}`), {
      status,
      codigo: `DOMAIN_${status}`,
    });
    channelErrors.handleError(response, error, "Falha generica.", "CHANNEL_ERROR");
    assert.equal(response.statusCode, status);
    assert.deepEqual(response.body, {
      erro: `Mensagem controlada ${status}`,
      codigo: `DOMAIN_${status}`,
    });
  }
});

test("remove detalhes internos de erros inesperados nos modulos ativos auditados", () => {
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    const internal = Object.assign(
      new Error("SQLITE_ERROR at C:\\secret\\database.db SELECT access_token"),
      { code: "P2028" },
    );

    const channelResponse = responseRecorder();
    channelErrors.handleError(channelResponse, internal, "Nao foi possivel listar.", "CHANNEL_LIST_ERROR");
    assert.deepEqual(channelResponse.body, {
      erro: "Nao foi possivel listar.",
      codigo: "CHANNEL_LIST_ERROR",
    });

    const simulationResponse = responseRecorder();
    simulationErrors.handleError(simulationResponse, internal);
    assert.deepEqual(simulationResponse.body, {
      erro: "Nao foi possivel simular a mensagem.",
      codigo: "WHATSAPP_SIMULATION_ERROR",
    });

    const integrationResponse = responseRecorder();
    integrationErrors.integrationError(integrationResponse, internal, "Nao foi possivel integrar.");
    assert.deepEqual(integrationResponse.body, {
      erro: "Nao foi possivel integrar.",
      codigo: "INTEGRATION_ERROR",
    });
  } finally {
    console.error = originalError;
  }

  const serializedLogs = JSON.stringify(logs);
  assert.doesNotMatch(serializedLogs, /secret|database\.db|SELECT|access_token/);
  assert.match(serializedLogs, /P2028/);
});
