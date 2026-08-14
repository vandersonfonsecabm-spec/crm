const REMINDER_TITLE = "Lembrar conversa";
const REMINDER_TYPE = "RETORNO";
const { reconcileClientProjections } = require("../follow-up-projection");
const { domainError } = require("./policy");
const SYSTEM_ACTOR_EMAIL = "sistema@crm.internal";

/**
 * Applies the shared operational meaning of a newly persisted inbound message.
 * Integration processors already run inside their provider transaction; this
 * helper deliberately performs only local DB work and never calls a provider.
 */
async function applyInboundConversationActivity(tx, conversation, messageTime, receivedAt = new Date()) {
  if (!conversation?.id || !(messageTime instanceof Date) || Number.isNaN(messageTime.getTime())) return;
  if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) throw new Error("INBOUND_RECEIPT_TIME_INVALID");

  // The provider timestamp is chronology only. Operational SLA/reopen/reminder
  // state must use the server receipt time, so delayed webhooks cannot backdate
  // the queue or make a conversation look older than it really is.
  const current = await tx.conversaCanal.findFirst({
    where: { id: conversation.id, empresaId: conversation.empresaId },
    select: {
      id: true,
      empresaId: true,
      status: true,
      responsavelId: true,
      primeiraMensagemEm: true,
      ultimaMensagemEm: true,
      encerradaEm: true,
    },
  });
  if (!current) throw new Error("CONVERSATION_INBOUND_NOT_FOUND");

  const first = current.primeiraMensagemEm
    ? new Date(Math.min(new Date(current.primeiraMensagemEm).getTime(), messageTime.getTime()))
    : messageTime;
  const last = current.ultimaMensagemEm
    ? new Date(Math.max(new Date(current.ultimaMensagemEm).getTime(), messageTime.getTime()))
    : messageTime;
  const nextStatus = current.responsavelId === null ? "AGUARDANDO_ATENDIMENTO" : "EM_ATENDIMENTO";
  const data = {
    primeiraMensagemEm: first,
    ultimaMensagemEm: last,
    status: nextStatus,
    aguardandoDesde: receivedAt,
    ...(current.status === "ENCERRADA" ? { encerradaEm: null, reabertaEm: receivedAt } : {}),
  };

  const links = await tx.conversaCanal.findUnique({
    where: { id: conversation.id },
    select: {
      contatoCanal: { select: { clienteId: true } },
      lead: { select: { clienteId: true } },
    },
  });
  const clientIds = [...new Set([links?.contatoCanal?.clienteId, links?.lead?.clienteId].filter(Number.isInteger))];

  if (current.status === "PENDENTE") {
    const reminders = await tx.acompanhamento.findMany({
      where: { empresaId: current.empresaId, conversaCanalId: current.id, titulo: REMINDER_TITLE, tipo: REMINDER_TYPE, status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
      select: { id: true, status: true, revisao: true, clienteId: true },
    });
    const auditActorId = reminders.length > 0 ? await ensureSystemActor(tx, current.empresaId) : null;
    for (const reminder of reminders) {
      const canceled = await tx.acompanhamento.updateMany({
        where: {
          id: reminder.id,
          empresaId: current.empresaId,
          revisao: reminder.revisao,
          status: reminder.status,
          conversaCanalId: current.id,
          titulo: REMINDER_TITLE,
          tipo: REMINDER_TYPE,
        },
        data: { status: "CANCELADO", canceladoEm: receivedAt, canceladoPorId: auditActorId, concluidoEm: null, concluidoPorId: null, revisao: { increment: 1 } },
      });
      if (canceled.count !== 1) {
        throw domainError(409, "REMINDER_CONFLICT", "O lembrete foi alterado por outra operacao. O evento sera processado novamente.");
      }
      await tx.historicoAcompanhamento.create({
        data: {
          empresaId: current.empresaId,
          acompanhamentoId: reminder.id,
          autorId: auditActorId,
          acao: "CANCELAR",
          statusAnterior: reminder.status,
          statusNovo: "CANCELADO",
          observacao: "Lembrete cancelado automaticamente pelo sistema por nova mensagem recebida.",
        },
      });
    }
  }

  const updated = await tx.conversaCanal.updateMany({
    where: { id: current.id, empresaId: current.empresaId, status: current.status, responsavelId: current.responsavelId },
    data,
  });
  if (updated.count !== 1) throw new Error("CONVERSATION_INBOUND_CONFLICT");

  if (clientIds.length > 0) {
    await reconcileClientProjections({ tx, empresaId: current.empresaId, clienteIds: clientIds });
  }
}

async function ensureSystemActor(tx, empresaId) {
  const existing = await tx.usuario.findFirst({
    where: { empresaId, email: SYSTEM_ACTOR_EMAIL, nome: "Sistema" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.usuario.create({
    data: {
      empresaId,
      nome: "Sistema",
      email: SYSTEM_ACTOR_EMAIL,
      senhaHash: "$system-disabled$",
      papel: "ADMIN",
      ativo: false,
    },
    select: { id: true },
  });
  return created.id;
}

module.exports = { REMINDER_TITLE, REMINDER_TYPE, applyInboundConversationActivity };
