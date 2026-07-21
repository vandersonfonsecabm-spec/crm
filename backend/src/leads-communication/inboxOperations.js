const SLA_STATUSES = {
  DENTRO_PRAZO: { label: "Dentro do prazo", level: 0 },
  ATENCAO: { label: "Atencao", level: 1 },
  ATRASADO: { label: "Atrasado", level: 2 },
  CRITICO: { label: "Critico", level: 3 },
};

const SLA_RESOLVED_STATES = new Set(["AGUARDANDO_CLIENTE", "ENCERRADA"]);

function calculateConversationSla(conversation, now = new Date()) {
  if (!conversation?.aguardandoDesde || SLA_RESOLVED_STATES.has(conversation.status)) return null;
  const startedAt = new Date(conversation.aguardandoDesde);
  if (!Number.isFinite(startedAt.getTime())) return null;
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60000));
  const status = elapsedMinutes > 30
    ? "CRITICO"
    : elapsedMinutes > 15
      ? "ATRASADO"
      : elapsedMinutes > 10
        ? "ATENCAO"
        : "DENTRO_PRAZO";
  return {
    status,
    label: SLA_STATUSES[status].label,
    level: SLA_STATUSES[status].level,
    elapsedMinutes,
    startedAt,
  };
}

function slaFilterWhere(filter, now = new Date()) {
  if (!filter) return null;
  const activeStates = { notIn: ["AGUARDANDO_CLIENTE", "ENCERRADA"] };
  if (filter === "ATENCAO") {
    return {
      status: activeStates,
      aguardandoDesde: {
        lt: new Date(now.getTime() - 10 * 60000),
        gte: new Date(now.getTime() - 30 * 60000),
      },
    };
  }
  if (filter === "CRITICO") {
    return {
      status: activeStates,
      aguardandoDesde: { lt: new Date(now.getTime() - 30 * 60000) },
    };
  }
  return null;
}

module.exports = { calculateConversationSla, slaFilterWhere };
