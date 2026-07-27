const TRIGGERS = Object.freeze(["LEAD_CREATED", "LEAD_WITHOUT_FOLLOW_UP", "DEAL_STALLED"]);
const ACTIONS = Object.freeze(["ASSIGN_OWNER", "ASSIGN_ROUND_ROBIN", "CREATE_FOLLOW_UP", "CREATE_INTERNAL_EVENT", "UPDATE_NEXT_FOLLOW_UP_PROJECTION"]);
const CONDITION_FIELDS = Object.freeze([
  "etapa",
  "origem",
  "responsavelId",
  "semResponsavel",
  "tempoSemAcompanhamentoMinutos",
  "tempoParadoMinutos",
  "diaSemana",
  "janela",
  "timezone",
]);
const STAGE_VALUES = Object.freeze(["NOVO", "CONTATO", "PROPOSTA", "FECHADO", "PERDIDO"]);
const WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
const MAX_CONDITIONS = 8;
const MAX_ACTIONS = 6;
const MAX_PAYLOAD_CHARS = 12000;
const MAX_PILOT_PAYLOAD_CHARS = 2000;
const DEFAULT_PRIORITY = 100;

function validateRulePayload(input = {}, { partial = false } = {}) {
  const body = object(input, "payload");
  rejectUnknown(body, ["nome", "descricao", "prioridade", "gatilho", "condicoes", "acoes", "timezone", "janela"]);
  const data = {};
  if (!partial || Object.hasOwn(body, "nome")) data.nome = requiredText(body.nome, "nome", 120);
  if (Object.hasOwn(body, "descricao")) data.descricao = optionalText(body.descricao, "descricao", 500);
  if (!partial || Object.hasOwn(body, "prioridade")) data.prioridade = integer(body.prioridade ?? DEFAULT_PRIORITY, "prioridade", { min: 1, max: 999 });
  if (!partial || Object.hasOwn(body, "gatilho")) data.gatilho = enumValue(body.gatilho, "gatilho", TRIGGERS);
  if (!partial || Object.hasOwn(body, "timezone")) data.timezone = timezone(body.timezone);
  if (Object.hasOwn(body, "janela")) data.janela = validateWindow(body.janela);
  if (!partial || Object.hasOwn(body, "condicoes")) data.condicoes = validateConditions(body.condicoes ?? [], data.gatilho || body.gatilho);
  if (!partial || Object.hasOwn(body, "acoes")) data.acoes = validateActions(body.acoes ?? []);

  const size = JSON.stringify({ condicoes: data.condicoes ?? body.condicoes, acoes: data.acoes ?? body.acoes, janela: data.janela ?? body.janela }).length;
  if (size > MAX_PAYLOAD_CHARS) throw invalid("Configuracao da automacao excede o limite seguro.", "AUTOMATION_PAYLOAD_TOO_LARGE");
  return data;
}

function validatePilotEventPayload(input = {}) {
  const body = object(input, "payload");
  rejectUnknown(body, ["eventType", "sourceType", "sourceId", "idempotencyKey", "occurredAt", "payload"]);
  const eventType = enumValue(body.eventType, "eventType", ["LEAD_CREATED"]);
  const sourceType = enumValue(body.sourceType, "sourceType", ["PILOT_SYNTHETIC"]);
  const sourceId = safeIdentifier(body.sourceId, "sourceId", 160);
  const idempotencyKey = safeIdentifier(body.idempotencyKey, "idempotencyKey", 180);
  const occurredAt = optionalDate(body.occurredAt);
  const payload = object(body.payload || {}, "payload.payload");
  rejectUnknown(payload, ["name", "origin"]);
  const data = {
    eventType,
    sourceType,
    sourceId,
    idempotencyKey,
    occurredAt,
    payload: {
      name: requiredText(payload.name, "payload.name", 120),
      origin: optionalText(payload.origin, "payload.origin", 80) || "PILOT",
    },
  };
  if (JSON.stringify(data).length > MAX_PILOT_PAYLOAD_CHARS) {
    throw invalid("Evento piloto excede o limite seguro.", "PILOT_EVENT_PAYLOAD_TOO_LARGE");
  }
  return data;
}

function validateConditions(value, trigger) {
  const list = array(value, "condicoes", MAX_CONDITIONS);
  return list.map((item, index) => {
    const condition = object(item, `condicoes[${index}]`);
    rejectUnknown(condition, ["campo", "operador", "valor"]);
    const campo = enumValue(condition.campo, "campo", CONDITION_FIELDS);
    const operador = enumValue(condition.operador, "operador", operatorsFor(campo));
    const valor = valueForCondition(campo, condition.valor);
    assertConditionTrigger(campo, trigger);
    return { campo, operador, valor };
  });
}

function validateActions(value) {
  const list = array(value, "acoes", MAX_ACTIONS);
  if (list.length < 1) throw invalid("Informe ao menos uma acao.", "AUTOMATION_ACTION_REQUIRED");
  return list.map((item, index) => {
    const action = object(item, `acoes[${index}]`);
    rejectUnknown(action, ["tipo", "usuarioId", "usuarioIds", "titulo", "descricao", "delayMinutos", "prioridade", "tipoAcompanhamento", "eventoTipo", "resumo"]);
    const tipo = enumValue(action.tipo, "tipo", ACTIONS);
    if (tipo === "ASSIGN_OWNER") return { tipo, usuarioId: integer(action.usuarioId, "usuarioId", { min: 1 }) };
    if (tipo === "ASSIGN_ROUND_ROBIN") {
      const usuarioIds = array(action.usuarioIds, "usuarioIds", 20).map((id) => integer(id, "usuarioIds", { min: 1 }));
      if (usuarioIds.length < 1) throw invalid("Round-robin exige ao menos um usuario.", "AUTOMATION_ROUND_ROBIN_EMPTY");
      return { tipo, usuarioIds: [...new Set(usuarioIds)].sort((a, b) => a - b) };
    }
    if (tipo === "CREATE_FOLLOW_UP") {
      return {
        tipo,
        titulo: requiredText(action.titulo, "titulo", 160),
        descricao: optionalText(action.descricao, "descricao", 500),
        delayMinutos: integer(action.delayMinutos ?? 60, "delayMinutos", { min: 1, max: 60 * 24 * 30 }),
        prioridade: enumValue(action.prioridade || "MEDIA", "prioridade", ["BAIXA", "MEDIA", "ALTA", "URGENTE", "CRITICA"]),
        tipoAcompanhamento: enumValue(action.tipoAcompanhamento || "RETORNO", "tipoAcompanhamento", ["TAREFA", "RETORNO", "LIGACAO", "REUNIAO", "VISITA", "OUTRO"]),
      };
    }
    if (tipo === "CREATE_INTERNAL_EVENT") return { tipo, eventoTipo: requiredText(action.eventoTipo, "eventoTipo", 80), resumo: requiredText(action.resumo, "resumo", 240) };
    return { tipo };
  });
}

function validateWindow(value) {
  if (value === null || value === undefined || value === "") return null;
  const window = object(value, "janela");
  rejectUnknown(window, ["inicio", "fim", "diasSemana"]);
  const inicio = timeOfDay(window.inicio, "inicio");
  const fim = timeOfDay(window.fim, "fim");
  const diasSemana = array(window.diasSemana ?? WEEKDAYS, "diasSemana", 7).map((day) => integer(day, "diasSemana", { min: 0, max: 6 }));
  return { inicio, fim, diasSemana: [...new Set(diasSemana)].sort((a, b) => a - b) };
}

function presentRule(row) {
  return {
    ...row,
    condicoes: safeJson(row.condicoesJson, []),
    acoes: safeJson(row.acoesJson, []),
    janela: row.janelaJson ? safeJson(row.janelaJson, null) : null,
    condicoesJson: undefined,
    acoesJson: undefined,
    janelaJson: undefined,
  };
}

function snapshotRule(rule) {
  return {
    id: rule.id,
    nome: rule.nome,
    gatilho: rule.gatilho,
    prioridade: rule.prioridade,
    timezone: rule.timezone,
    condicoes: safeJson(rule.condicoesJson, []),
    acoes: safeJson(rule.acoesJson, []),
    janela: rule.janelaJson ? safeJson(rule.janelaJson, null) : null,
    versao: rule.versao,
  };
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function operatorsFor(field) {
  if (["semResponsavel"].includes(field)) return ["EQUALS"];
  if (["tempoSemAcompanhamentoMinutos", "tempoParadoMinutos"].includes(field)) return ["GTE"];
  if (["diaSemana"].includes(field)) return ["IN"];
  return ["EQUALS", "IN", "NOT_EQUALS"];
}

function valueForCondition(field, value) {
  if (field === "etapa") return enumOrList(value, "etapa", STAGE_VALUES);
  if (field === "responsavelId") return value === null ? null : integer(value, "responsavelId", { min: 1 });
  if (field === "semResponsavel") return Boolean(value);
  if (field === "tempoSemAcompanhamentoMinutos" || field === "tempoParadoMinutos") return integer(value, field, { min: 1, max: 60 * 24 * 365 });
  if (field === "diaSemana") return array(value, "diaSemana", 7).map((day) => integer(day, "diaSemana", { min: 0, max: 6 }));
  if (field === "timezone") return timezone(value);
  if (field === "janela") return validateWindow(value);
  return requiredText(value, field, 160);
}

function assertConditionTrigger(field, trigger) {
  if (field === "tempoParadoMinutos" && trigger !== "DEAL_STALLED") throw invalid("Condicao de tempo parado exige gatilho DEAL_STALLED.", "AUTOMATION_CONDITION_TRIGGER_INVALID");
  if (field === "tempoSemAcompanhamentoMinutos" && trigger !== "LEAD_WITHOUT_FOLLOW_UP") throw invalid("Condicao de tempo sem acompanhamento exige gatilho LEAD_WITHOUT_FOLLOW_UP.", "AUTOMATION_CONDITION_TRIGGER_INVALID");
  if (field === "etapa" && trigger !== "DEAL_STALLED") throw invalid("Etapa exige gatilho DEAL_STALLED.", "AUTOMATION_CONDITION_TRIGGER_INVALID");
}

function enumOrList(value, field, allowed) {
  if (Array.isArray(value)) return array(value, field, 20).map((item) => enumValue(item, field, allowed));
  return enumValue(value, field, allowed);
}

function timezone(value) {
  const text = requiredText(value, "timezone", 80);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: text }).format(new Date());
  } catch {
    throw invalid("Timezone invalido.", "AUTOMATION_TIMEZONE_INVALID");
  }
  return text;
}

function timeOfDay(value, field) {
  const text = requiredText(value, field, 5);
  if (!/^\d{2}:\d{2}$/.test(text)) throw invalid("Horario invalido.", "AUTOMATION_WINDOW_INVALID");
  const [hour, minute] = text.split(":").map(Number);
  if (hour > 23 || minute > 59) throw invalid("Horario invalido.", "AUTOMATION_WINDOW_INVALID");
  return text;
}

function rejectUnknown(body, allowed) {
  const extra = Object.keys(body || {}).filter((key) => !allowed.includes(key));
  if (extra.length) throw invalid(`Campos nao permitidos: ${extra.join(", ")}.`, "VALIDATION_ERROR");
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(`${field} invalido.`, "VALIDATION_ERROR");
  return value;
}

function array(value, field, max) {
  if (!Array.isArray(value)) throw invalid(`${field} deve ser uma lista.`, "VALIDATION_ERROR");
  if (value.length > max) throw invalid(`${field} excede o limite permitido.`, "VALIDATION_ERROR");
  return value;
}

function requiredText(value, field, max) {
  const text = String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ");
  if (!text || text.length > max) throw invalid(`${field} invalido.`, "VALIDATION_ERROR");
  return text;
}

function optionalText(value, field, max) {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, field, max);
}

function integer(value, field, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw invalid(`${field} invalido.`, "VALIDATION_ERROR");
  return number;
}

function enumValue(value, field, allowed) {
  const raw = String(value || "").trim();
  if (allowed.includes(raw)) return raw;
  const text = raw.toUpperCase();
  if (!allowed.includes(text)) throw invalid(`${field} invalido.`, "VALIDATION_ERROR");
  return text;
}

function safeIdentifier(value, field, max) {
  const text = requiredText(value, field, max);
  if (!/^[A-Za-z0-9._:-]+$/.test(text)) throw invalid(`${field} invalido.`, "VALIDATION_ERROR");
  return text;
}

function optionalDate(value) {
  if (value === undefined || value === null || value === "") return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw invalid("occurredAt invalido.", "VALIDATION_ERROR");
  return date;
}

function invalid(message, codigo) {
  const error = new Error(message);
  error.status = codigo === "VALIDATION_ERROR" ? 422 : 409;
  error.codigo = codigo;
  return error;
}

module.exports = {
  ACTIONS,
  TRIGGERS,
  presentRule,
  safeJson,
  snapshotRule,
  validatePilotEventPayload,
  validateActions,
  validateConditions,
  validateRulePayload,
  validateWindow,
};
