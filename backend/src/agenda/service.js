const { domainError, isManager, notFound } = require("../leads-communication/policy");

const ACTIVE_STATUSES = ["PENDENTE", "EM_ANDAMENTO"];
const STATUSES = new Set([...ACTIVE_STATUSES, "CONCLUIDO", "CANCELADO"]);
const PRIORITIES = new Set(["BAIXA", "MEDIA", "ALTA", "URGENTE", "CRITICA"]);
const TYPES = new Set(["TAREFA", "RETORNO", "REUNIAO", "LIGACAO", "VISITA", "OUTRO", "WHATSAPP", "EMAIL"]);
const VIEWS = new Set(["TODOS", "HOJE", "PROXIMOS", "ATRASADOS", "CONCLUIDOS", "MINHA", "EQUIPE"]);

function createAgendaService({ prisma, clock = () => new Date() }) {
  async function list(context, query = {}) {
    rejectTenantAuthority(query);
    const page = integer(query.page, "page", { fallback: 1, max: 100000 });
    const limit = integer(query.limit, "limit", { fallback: 20, max: 100 });
    const where = await listWhere(context, query);
    const [rows, total] = await prisma.$transaction([
      prisma.acompanhamento.findMany({ where, include: itemInclude(), orderBy: [{ dataHora: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      prisma.acompanhamento.count({ where }),
    ]);
    return { data: rows.map((row) => present(context, row, clock())), pagination: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 } };
  }

  async function summary(context, query = {}) {
    rejectTenantAuthority(query);
    const now = clock();
    const { start, end } = dayRange(now);
    const access = visibilityWhere(context);
    const base = { empresaId: context.empresaId, ...access };
    const [pendentes, paraHoje, atrasados, urgentes, concluidosPeriodo, proximos, porTipo] = await prisma.$transaction([
      prisma.acompanhamento.count({ where: { ...base, status: { in: ACTIVE_STATUSES } } }),
      prisma.acompanhamento.count({ where: { ...base, status: { in: ACTIVE_STATUSES }, dataHora: { gte: start, lte: end } } }),
      prisma.acompanhamento.count({ where: { ...base, status: { in: ACTIVE_STATUSES }, dataHora: { lt: now } } }),
      prisma.acompanhamento.count({ where: { ...base, status: { in: ACTIVE_STATUSES }, prioridade: { in: ["URGENTE", "CRITICA"] } } }),
      prisma.acompanhamento.count({ where: { ...base, status: "CONCLUIDO", concluidoEm: { gte: start, lte: end } } }),
      prisma.acompanhamento.findMany({ where: { ...base, status: { in: ACTIVE_STATUSES }, dataHora: { gte: now } }, include: itemInclude(), orderBy: [{ dataHora: "asc" }, { id: "asc" }], take: 6 }),
      prisma.acompanhamento.groupBy({ by: ["tipo"], where: { ...base, status: { in: ACTIVE_STATUSES } }, _count: { _all: true } }),
    ]);
    return {
      indicadores: { pendentes, paraHoje, atrasados, criticos: urgentes, concluidosPeriodo },
      proximos: proximos.map((row) => present(context, row, now)),
      porTipo: porTipo.map((row) => ({ tipo: row.tipo, total: row._count._all })),
    };
  }

  async function get(context, id) {
    return present(context, await loadItem(context, id), clock());
  }

  async function team(context) {
    const where = { empresaId: context.empresaId, ativo: true, ...(isManager(context) ? {} : { id: context.usuarioId }) };
    const rows = await prisma.usuario.findMany({ where, select: { id: true, nome: true, papel: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] });
    return { data: rows, podeVerEquipe: isManager(context) };
  }

  async function history(context, id) {
    const item = await loadItem(context, id);
    const rows = await prisma.historicoAcompanhamento.findMany({
      where: { empresaId: context.empresaId, acompanhamentoId: item.id },
      include: {
        autor: { select: { id: true, nome: true } },
        responsavelAnterior: { select: { id: true, nome: true } },
        responsavelNovo: { select: { id: true, nome: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return { data: rows };
  }

  async function options(context) {
    const manager = isManager(context);
    const responsible = context.usuarioId;
    const [usuarios, clientes, leads, negocios, conversas, propostas] = await prisma.$transaction([
      prisma.usuario.findMany({ where: { empresaId: context.empresaId, ativo: true, ...(manager ? {} : { id: responsible }) }, select: { id: true, nome: true, papel: true }, orderBy: [{ nome: "asc" }, { id: "asc" }] }),
      prisma.cliente.findMany({ where: { empresaId: context.empresaId, ...(manager ? {} : { OR: [{ leads: { some: { responsavelId: responsible } } }, { negocios: { some: { responsavelId: responsible } } }] }) }, select: { id: true, nome: true, empresa: true }, orderBy: [{ nome: "asc" }, { id: "asc" }], take: 200 }),
      prisma.lead.findMany({ where: { empresaId: context.empresaId, ...(manager ? {} : { responsavelId: responsible }) }, select: { id: true, interesse: true, status: true, cliente: { select: { nome: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 200 }),
      prisma.negocio.findMany({ where: { empresaId: context.empresaId, ...(manager ? {} : { responsavelId: responsible }) }, select: { id: true, titulo: true, etapa: true, cliente: { select: { nome: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 200 }),
      prisma.conversaCanal.findMany({ where: { empresaId: context.empresaId, ...(manager ? {} : { responsavelId: responsible }) }, select: { id: true, status: true, contatoCanal: { select: { nome: true, cliente: { select: { nome: true } } } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 200 }),
      prisma.propostaComercial.findMany({ where: { empresaId: context.empresaId, ...(manager ? {} : { negocio: { responsavelId: responsible } }) }, select: { id: true, codigo: true, titulo: true, status: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 200 }),
    ]);
    return { usuarios, clientes, leads, negocios, conversas, propostas, podeVerEquipe: manager };
  }

  async function create(context, input) {
    const body = objectInput(input);
    rejectTenantAuthority(body);
    rejectUnknown(body, ["clienteId", "leadId", "negocioId", "conversaCanalId", "propostaComercialId", "titulo", "descricao", "dataHora", "prioridade", "tipo", "responsavelId", "responsavel", "observacao"]);
    const responsavel = await requestedUser(context, body);
    const links = await resolveLinks(context, body);
    const data = {
      ...links,
      empresaId: context.empresaId,
      autorId: context.usuarioId,
      responsavelId: responsavel.id,
      responsavel: responsavel.nome,
      titulo: requiredText(body.titulo, "titulo", 120),
      descricao: optionalText(body.descricao, "descricao", 500),
      dataHora: requiredDate(body.dataHora, "dataHora"),
      prioridade: enumValue(body.prioridade ?? "MEDIA", "prioridade", PRIORITIES),
      tipo: enumValue(body.tipo ?? "TAREFA", "tipo", TYPES),
      status: "PENDENTE",
    };
    const observacao = optionalText(body.observacao, "observacao", 500);
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.acompanhamento.create({ data });
      await writeHistory(tx, context, item.id, "CRIAR", { statusNovo: "PENDENTE", responsavelNovoId: responsavel.id, dataHoraNova: data.dataHora, observacao });
      return item;
    });
    return get(context, created.id);
  }

  async function update(context, id, input) {
    const body = objectInput(input);
    rejectTenantAuthority(body);
    rejectUnknown(body, ["clienteId", "leadId", "negocioId", "conversaCanalId", "propostaComercialId", "titulo", "descricao", "dataHora", "prioridade", "tipo", "responsavelId", "responsavel", "observacao", "revisao"]);
    const current = await loadItem(context, id);
    requireWrite(context, current);
    const revision = expectedRevision(body.revisao, current.revisao);
    const responsavelId = has(body, "responsavelId") ? nullableId(body.responsavelId, "responsavelId") : current.responsavelId;
    const responsavel = responsavelId ? await assignedUser(context, responsavelId) : await requestedUser(context, body);
    const linkInput = {
      clienteId: has(body, "clienteId") ? body.clienteId : current.clienteId,
      leadId: has(body, "leadId") ? body.leadId : current.leadId,
      negocioId: has(body, "negocioId") ? body.negocioId : current.negocioId,
      conversaCanalId: has(body, "conversaCanalId") ? body.conversaCanalId : current.conversaCanalId,
      propostaComercialId: has(body, "propostaComercialId") ? body.propostaComercialId : current.propostaComercialId,
    };
    const links = await resolveLinks(context, linkInput);
    const nextDate = has(body, "dataHora") ? requiredDate(body.dataHora, "dataHora") : current.dataHora;
    const data = {
      ...links,
      responsavelId: responsavel.id,
      responsavel: responsavel.nome,
      ...(has(body, "titulo") ? { titulo: requiredText(body.titulo, "titulo", 120) } : {}),
      ...(has(body, "descricao") ? { descricao: optionalText(body.descricao, "descricao", 500) } : {}),
      ...(has(body, "dataHora") ? { dataHora: nextDate } : {}),
      ...(has(body, "prioridade") ? { prioridade: enumValue(body.prioridade, "prioridade", PRIORITIES) } : {}),
      ...(has(body, "tipo") ? { tipo: enumValue(body.tipo, "tipo", TYPES) } : {}),
      revisao: { increment: 1 },
    };
    const observacao = optionalText(body.observacao, "observacao", 500);
    await prisma.$transaction(async (tx) => {
      const result = await tx.acompanhamento.updateMany({ where: { id: current.id, empresaId: context.empresaId, revisao: revision }, data });
      if (result.count !== 1) conflict();
      const events = [];
      if (current.responsavelId !== responsavel.id) events.push(["ALTERAR_RESPONSAVEL", { responsavelAnteriorId: current.responsavelId, responsavelNovoId: responsavel.id, observacao }]);
      if (current.dataHora.getTime() !== nextDate.getTime()) events.push(["REAGENDAR", { dataHoraAnterior: current.dataHora, dataHoraNova: nextDate, observacao }]);
      if (events.length === 0 || changedBusinessFields(body)) events.push(["EDITAR", { statusAnterior: current.status, statusNovo: current.status, observacao }]);
      for (const [action, details] of events) await writeHistory(tx, context, current.id, action, details);
    });
    return get(context, current.id);
  }

  async function start(context, id, input) {
    return changeStatus(context, id, input, "EM_ANDAMENTO", "INICIAR");
  }

  async function complete(context, id, input) {
    return changeStatus(context, id, input, "CONCLUIDO", "CONCLUIR");
  }

  async function cancel(context, id, input) {
    return changeStatus(context, id, input, "CANCELADO", "CANCELAR");
  }

  async function reopen(context, id, input) {
    return changeStatus(context, id, input, "PENDENTE", "REABRIR");
  }

  async function changeStatus(context, id, input, nextStatus, action) {
    const body = objectInput(input || {});
    rejectTenantAuthority(body);
    rejectUnknown(body, ["revisao", "observacao"]);
    const current = await loadItem(context, id);
    requireWrite(context, current);
    if (current.status === nextStatus && ["CONCLUIDO", "CANCELADO", "EM_ANDAMENTO"].includes(nextStatus)) return present(context, current, clock());
    assertTransition(current.status, nextStatus);
    const revision = expectedRevision(body.revisao, current.revisao);
    const timestamp = clock();
    const data = {
      status: nextStatus,
      revisao: { increment: 1 },
      ...(nextStatus === "CONCLUIDO" ? { concluidoEm: timestamp, concluidoPorId: context.usuarioId, canceladoEm: null, canceladoPorId: null } : {}),
      ...(nextStatus === "CANCELADO" ? { canceladoEm: timestamp, canceladoPorId: context.usuarioId, concluidoEm: null, concluidoPorId: null } : {}),
      ...(nextStatus === "PENDENTE" ? { concluidoEm: null, concluidoPorId: null, canceladoEm: null, canceladoPorId: null } : {}),
    };
    const observacao = optionalText(body.observacao, "observacao", 500);
    await prisma.$transaction(async (tx) => {
      const result = await tx.acompanhamento.updateMany({ where: { id: current.id, empresaId: context.empresaId, revisao: revision, status: current.status }, data });
      if (result.count !== 1) conflict();
      await writeHistory(tx, context, current.id, action, { statusAnterior: current.status, statusNovo: nextStatus, observacao });
    });
    return get(context, current.id);
  }

  async function listWhere(context, query) {
    const where = { empresaId: context.empresaId, AND: [] };
    const visibility = visibilityWhere(context);
    if (visibility.OR) where.AND.push({ OR: visibility.OR });
    const view = enumValue(query.visao ?? "TODOS", "visao", VIEWS);
    if (view === "EQUIPE" && !isManager(context)) forbidden();
    if (view === "MINHA" || !isManager(context)) where.responsavelId = context.usuarioId;
    const now = clock();
    if (view === "HOJE") {
      const { start, end } = dayRange(now);
      where.status = { in: ACTIVE_STATUSES };
      where.dataHora = { gte: start, lte: end };
    } else if (view === "PROXIMOS") {
      where.status = { in: ACTIVE_STATUSES };
      where.dataHora = { gte: now };
    } else if (view === "ATRASADOS") {
      where.status = { in: ACTIVE_STATUSES };
      where.dataHora = { lt: now };
    } else if (view === "CONCLUIDOS") {
      where.status = "CONCLUIDO";
    }
    const status = optionalEnum(query.status, "status", STATUSES);
    const prioridade = optionalEnum(query.prioridade, "prioridade", PRIORITIES);
    const tipo = optionalEnum(query.tipo, "tipo", TYPES);
    if (status) where.status = status;
    if (prioridade) where.prioridade = prioridade;
    if (tipo) where.tipo = tipo;
    const responsavelId = optionalId(query.responsavelId, "responsavelId");
    if (responsavelId) {
      if (!isManager(context) && responsavelId !== context.usuarioId) forbidden();
      where.responsavelId = responsavelId;
    }
    for (const field of ["clienteId", "leadId", "negocioId", "conversaCanalId", "propostaComercialId"]) {
      const id = optionalId(query[field], field);
      if (id) where[field] = id;
    }
    const from = optionalDate(query.dataInicial, "dataInicial");
    const to = optionalDate(query.dataFinal, "dataFinal");
    if (from || to) where.dataHora = { ...(where.dataHora || {}), ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const search = optionalText(query.busca || query.search, "busca", 120);
    if (search) where.AND.push({ OR: [{ titulo: { contains: search } }, { cliente: { nome: { contains: search } } }, { negocio: { titulo: { contains: search } } }, { propostaComercial: { codigo: { contains: search } } }] });
    if (where.AND.length === 0) delete where.AND;
    return where;
  }

  async function loadItem(context, id) {
    const parsedId = integer(id, "id", { max: Number.MAX_SAFE_INTEGER });
    const row = await prisma.acompanhamento.findFirst({ where: { id: parsedId, empresaId: context.empresaId }, include: itemInclude() });
    if (!row) throw notFound("Acompanhamento nao encontrado.");
    if (!isManager(context) && !sellerCanAccess(context, row)) throw notFound("Acompanhamento nao encontrado.");
    return row;
  }

  async function assignedUser(context, value) {
    const id = integer(value, "responsavelId", { max: Number.MAX_SAFE_INTEGER });
    if (!isManager(context) && id !== context.usuarioId) forbidden();
    const user = await prisma.usuario.findFirst({ where: { id, empresaId: context.empresaId, ativo: true }, select: { id: true, nome: true, papel: true } });
    if (!user) throw notFound("Responsavel nao encontrado.");
    return user;
  }

  async function requestedUser(context, body, fallbackId = context.usuarioId) {
    if (body.responsavelId !== undefined && body.responsavelId !== null && body.responsavelId !== "") return assignedUser(context, body.responsavelId);
    const legacyName = optionalText(body.responsavel, "responsavel", 120);
    if (legacyName && isManager(context)) {
      const matches = await prisma.usuario.findMany({ where: { empresaId: context.empresaId, ativo: true, nome: legacyName }, select: { id: true }, take: 2 });
      if (matches.length === 1) return assignedUser(context, matches[0].id);
    }
    return assignedUser(context, fallbackId);
  }

  async function resolveLinks(context, input) {
    const ids = {};
    for (const field of ["clienteId", "leadId", "negocioId", "conversaCanalId", "propostaComercialId"]) ids[field] = nullableId(input[field], field);
    const [cliente, lead, negocio, conversa, proposta] = await Promise.all([
      ids.clienteId ? prisma.cliente.findFirst({ where: { id: ids.clienteId, empresaId: context.empresaId }, select: { id: true } }) : null,
      ids.leadId ? prisma.lead.findFirst({ where: { id: ids.leadId, empresaId: context.empresaId }, select: { id: true, clienteId: true } }) : null,
      ids.negocioId ? prisma.negocio.findFirst({ where: { id: ids.negocioId, empresaId: context.empresaId }, select: { id: true, clienteId: true, leadId: true } }) : null,
      ids.conversaCanalId ? prisma.conversaCanal.findFirst({ where: { id: ids.conversaCanalId, empresaId: context.empresaId }, select: { id: true, leadId: true, contatoCanal: { select: { clienteId: true } } } }) : null,
      ids.propostaComercialId ? prisma.propostaComercial.findFirst({ where: { id: ids.propostaComercialId, empresaId: context.empresaId }, select: { id: true, clienteId: true, leadId: true, negocioId: true } }) : null,
    ]);
    if (ids.clienteId && !cliente) throw notFound("Cliente nao encontrado.");
    if (ids.leadId && !lead) throw notFound("Lead nao encontrado.");
    if (ids.negocioId && !negocio) throw notFound("Negocio nao encontrado.");
    if (ids.conversaCanalId && !conversa) throw notFound("Conversa nao encontrada.");
    if (ids.propostaComercialId && !proposta) throw notFound("Proposta nao encontrada.");
    const clientIds = unique([ids.clienteId, lead?.clienteId, negocio?.clienteId, conversa?.contatoCanal?.clienteId, proposta?.clienteId]);
    const leadIds = unique([ids.leadId, negocio?.leadId, conversa?.leadId, proposta?.leadId]);
    const businessIds = unique([ids.negocioId, proposta?.negocioId]);
    if (clientIds.length > 1 || leadIds.length > 1 || businessIds.length > 1) throw domainError(409, "AGENDA_CONTEXT_CONFLICT", "Os vinculos comerciais informados nao pertencem ao mesmo contexto.");
    return {
      clienteId: clientIds[0] ?? null,
      leadId: leadIds[0] ?? null,
      negocioId: businessIds[0] ?? null,
      conversaCanalId: ids.conversaCanalId,
      propostaComercialId: ids.propostaComercialId,
    };
  }

  return { cancel, complete, create, get, history, list, options, reopen, start, summary, team, update };
}

function itemInclude() {
  return {
    cliente: { select: { id: true, nome: true, empresa: true, telefone: true, email: true, status: true, valor: true } },
    lead: { select: { id: true, interesse: true, status: true, responsavelId: true } },
    negocio: { select: { id: true, titulo: true, etapa: true, responsavelId: true } },
    conversaCanal: { select: { id: true, status: true, responsavelId: true, contatoCanal: { select: { clienteId: true, nome: true } } } },
    propostaComercial: { select: { id: true, codigo: true, titulo: true, status: true, negocioId: true } },
    responsavelUsuario: { select: { id: true, nome: true, papel: true } },
    autor: { select: { id: true, nome: true } },
    concluidoPor: { select: { id: true, nome: true } },
    canceladoPor: { select: { id: true, nome: true } },
  };
}

function present(context, row, now) {
  return {
    ...row,
    atrasado: ACTIVE_STATUSES.includes(row.status) && row.dataHora < now,
    responsavelUsuario: row.responsavelUsuario || (row.responsavel ? { id: null, nome: row.responsavel, papel: null } : null),
    permissoes: {
      editar: isManager(context) || row.responsavelId === context.usuarioId,
      concluir: isManager(context) || row.responsavelId === context.usuarioId,
      cancelar: isManager(context) || row.responsavelId === context.usuarioId,
      reabrir: isManager(context) || row.responsavelId === context.usuarioId,
      verEquipe: isManager(context),
    },
  };
}

function visibilityWhere(context) {
  if (isManager(context)) return {};
  return { OR: [{ responsavelId: context.usuarioId }, { autorId: context.usuarioId }, { lead: { responsavelId: context.usuarioId } }, { negocio: { responsavelId: context.usuarioId } }, { conversaCanal: { responsavelId: context.usuarioId } }] };
}

function sellerCanAccess(context, row) {
  return row.responsavelId === context.usuarioId || row.autorId === context.usuarioId || row.lead?.responsavelId === context.usuarioId || row.negocio?.responsavelId === context.usuarioId || row.conversaCanal?.responsavelId === context.usuarioId;
}

function requireWrite(context, row) {
  if (!isManager(context) && row.responsavelId !== context.usuarioId) forbidden();
}

function assertTransition(current, next) {
  const allowed = {
    PENDENTE: new Set(["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]),
    EM_ANDAMENTO: new Set(["CONCLUIDO", "CANCELADO"]),
    CONCLUIDO: new Set(["PENDENTE"]),
    CANCELADO: new Set(["PENDENTE"]),
  };
  if (!allowed[current]?.has(next)) invalid("Transicao de status invalida.", "AGENDA_STATUS_INVALID");
}

async function writeHistory(tx, context, acompanhamentoId, acao, details = {}) {
  await tx.historicoAcompanhamento.create({ data: { empresaId: context.empresaId, acompanhamentoId, autorId: context.usuarioId, acao, ...details } });
}

function dayRange(value) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function changedBusinessFields(body) {
  return ["clienteId", "leadId", "negocioId", "conversaCanalId", "propostaComercialId", "titulo", "descricao", "prioridade", "tipo"].some((field) => has(body, field));
}

function expectedRevision(value, current) {
  if (value === undefined || value === null || value === "") return current;
  const revision = integer(value, "revisao", { max: Number.MAX_SAFE_INTEGER });
  if (revision !== current) conflict();
  return revision;
}

function objectInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Payload invalido.");
  return value;
}

function rejectTenantAuthority(value) {
  if (has(value, "empresaId") || has(value, "tenantId")) throw domainError(400, "TENANT_INPUT_FORBIDDEN", "O tenant vem da sessao autenticada.");
}

function rejectUnknown(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) invalid(`Campos nao permitidos: ${unknown.join(", ")}.`);
}

function requiredText(value, field, max) {
  const text = sanitized(value);
  if (!text) invalid(`${field} e obrigatorio.`);
  if (text.length > max) invalid(`${field} deve ter no maximo ${max} caracteres.`);
  return text;
}

function optionalText(value, field, max) {
  if (value === undefined || value === null || value === "") return null;
  const text = sanitized(value);
  if (text.length > max) invalid(`${field} deve ter no maximo ${max} caracteres.`);
  return text || null;
}

function sanitized(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function requiredDate(value, field) {
  if (typeof value !== "string" && !(value instanceof Date)) invalid(`${field} invalida.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(`${field} invalida.`);
  return date;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return requiredDate(value, field);
}

function enumValue(value, field, allowed) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!allowed.has(normalized)) invalid(`${field} invalido.`);
  return normalized;
}

function optionalEnum(value, field, allowed) {
  if (value === undefined || value === null || value === "") return null;
  return enumValue(value, field, allowed);
}

function integer(value, field, { fallback, max = Number.MAX_SAFE_INTEGER } = {}) {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) invalid(`${field} invalido.`);
  return parsed;
}

function optionalId(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return integer(value, field);
}

function nullableId(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return integer(value, field);
}

function unique(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value)))];
}

function has(value, field) {
  return Object.prototype.hasOwnProperty.call(value || {}, field);
}

function invalid(message, code = "AGENDA_VALIDATION_ERROR") {
  throw domainError(422, code, message);
}

function forbidden() {
  throw domainError(403, "AGENDA_FORBIDDEN", "Acesso negado.");
}

function conflict() {
  throw domainError(409, "AGENDA_REVISION_CONFLICT", "Este item foi alterado por outro usuario. Atualize e tente novamente.");
}

module.exports = { ACTIVE_STATUSES, createAgendaService };
