function isTestSimulationChannel(channel) {
  return channel?.tipo === "WHATSAPP_META" && channel.modoTeste === true;
}

function assertTestSimulationChannel(channel) {
  if (isTestSimulationChannel(channel)) return;
  const error = new Error("Canal nao permite mensagens simuladas nesta release.");
  error.status = 409;
  error.codigo = "CHANNEL_SIMULATION_UNAVAILABLE";
  throw error;
}

module.exports = { assertTestSimulationChannel, isTestSimulationChannel };
