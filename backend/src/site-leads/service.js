const crypto = require("node:crypto");
const { normalizePhone } = require("../channels/phoneNormalizer");
const { validateIntegrationCreate, validateIntegrationPatch, validateSubmission } = require("./validation");

const PROVIDER = "SITE_FORM";

function createSiteLeadService({ prisma }) {
  async function listIntegrations(context) {
    requireAdmin(context);
    const items = await prisma.canalIntegracao.findMany({ where: { empresaId: context.empresaId, tipo: "SITE_FORM" }, orderBy: [{ ativo: "desc" }, { createdAt: "desc" }] });
    return items.map(presentIntegration);
  }

  async function createIntegration(context, input) {
    requireAdmin(context);
    const data = validateIntegrationCreate(input);
    const publicId = crypto.randomUUID();
    const integration = await prisma.canalIntegracao.create({ data: { empresaId: context.empresaId, tipo: "SITE_FORM", nome: data.nome, chaveInterna: `site-form-${publicId}`, publicId, configuracaoJson: configurationJson(data), status: data.ativo ? "ATIVO" : "INATIVO", modoTeste: true, ativo: data.ativo } });
    return presentIntegration(integration);
  }

  async function updateIntegration(context, id, input) {
    requireAdmin(context);
    const patch = validateIntegrationPatch(input);
    const current = await getOwnedIntegration(context, id);
    const config = readConfiguration(current);
    const nextConfig = { ...config, ...pick(patch, ["identificacao", "origensPermitidas", "politicaPrivacidade"]) };
    const data = { configuracaoJson: JSON.stringify(nextConfig) };
    if (patch.nome !== undefined) data.nome = patch.nome;
    if (patch.ativo !== undefined) Object.assign(data, { ativo: patch.ativo, status: patch.ativo ? "ATIVO" : "INATIVO" });
    return presentIntegration(await prisma.canalIntegracao.update({ where: { id: current.id }, data }));
  }

  async function rotatePublicId(context, id) {
    requireAdmin(context);
    const current = await getOwnedIntegration(context, id);
    const publicId = crypto.randomUUID();
    return presentIntegration(await prisma.canalIntegracao.update({ where: { id: current.id }, data: { publicId, chaveInterna: `site-form-${publicId}` } }));
  }

  async function getPublicIntegration(publicId) {
    if (!isEnabled()) return null;
    if (!isUuid(publicId)) return null;
    return prisma.canalIntegracao.findFirst({ where: { publicId: publicId.toLowerCase(), tipo: "SITE_FORM", ativo: true, status: "ATIVO" } });
  }

  function isOriginAllowed(integration, origin) {
    if (!origin) return false;
    let normalized;
    try { normalized = new URL(origin).origin; } catch { return false; }
    return readConfiguration(integration).origensPermitidas.includes(normalized);
  }

  async function capture(integration, input) {
    const payload = validateSubmission(input);
    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    try {
      await prisma.$transaction(async (tx) => {
        const event = await tx.eventoWebhook.create({ data: { empresaId: integration.empresaId, canalIntegracaoId: integration.id, provedor: PROVIDER, externalEventId: payload.submissionId, tipoEvento: "SITE_LEAD_SUBMITTED", payloadHash, statusProcessamento: "PROCESSANDO", tentativas: 1 } });
        const identity = await resolveClient(tx, integration, payload);
        const lead = await tx.lead.create({ data: { empresaId: integration.empresaId, clienteId: identity.cliente.id, status: "NOVO", origem: "SITE", campanha: payload.campanha, interesse: payload.produtoInteresse, paginaOrigem: payload.paginaOrigem, aceitePoliticaPrivacidade: true, versaoPoliticaPrivacidade: payload.versaoPoliticaPrivacidade, aceitePoliticaEm: new Date() } });
        const contact = await resolveChannelContact(tx, integration, identity, payload);
        const now = new Date();
        const conversation = await tx.conversaCanal.create({ data: { empresaId: integration.empresaId, canalIntegracaoId: integration.id, contatoCanalId: contact.id, leadId: lead.id, responsavelId: null, status: "AGUARDANDO_ATENDIMENTO", chaveAberta: `site:${integration.id}:submission:${payload.submissionId}`, primeiraMensagemEm: now, ultimaMensagemEm: now, aguardandoDesde: now } });
        await tx.mensagemCanal.create({ data: { empresaId: integration.empresaId, canalIntegracaoId: integration.id, conversaCanalId: conversation.id, autorUsuarioId: null, externalId: payload.submissionId, direcao: "ENTRADA", tipo: "TEXTO", texto: messageText(payload), status: "RECEBIDA", statusEntrega: "RECEBIDA", simulada: false } });
        if (identity.ambiguous) await createAmbiguityNote(tx, integration.empresaId, conversation.id);
        await tx.eventoWebhook.update({ where: { id: event.id }, data: { statusProcessamento: "PROCESSADO", processadoEm: new Date() } });
      });
      return { accepted: true, submissionId: payload.submissionId, idempotent: false };
    } catch (error) {
      if (error?.code === "P2002") {
        const existing = await prisma.eventoWebhook.findUnique({ where: { empresaId_canalIntegracaoId_provedor_externalEventId: { empresaId: integration.empresaId, canalIntegracaoId: integration.id, provedor: PROVIDER, externalEventId: payload.submissionId } } });
        if (existing) return { accepted: true, submissionId: payload.submissionId, idempotent: true };
      }
      throw error;
    }
  }

  async function resolveClient(tx, integration, payload) {
    let phone = null;
    if (payload.telefone) { try { phone = normalizePhone(payload.telefone, { defaultCountryCode: "55" }); } catch { throw validationError("Telefone invalido.", { telefone: "Telefone invalido." }); } }
    const clients = await tx.cliente.findMany({ where: { empresaId: integration.empresaId }, orderBy: { id: "asc" } });
    const matches = new Map();
    for (const client of clients) {
      let clientPhone = null;
      if (phone && client.telefone) { try { clientPhone = normalizePhone(client.telefone, { defaultCountryCode: "55" }); } catch {} }
      if ((phone && clientPhone === phone) || (payload.email && String(client.email || "").trim().toLowerCase() === payload.email)) matches.set(client.id, client);
    }
    const candidates = [...matches.values()];
    if (candidates.length === 1) {
      const client = candidates[0];
      const updates = {};
      if (!client.telefone && phone) updates.telefone = phone;
      if (!client.email && payload.email) updates.email = payload.email;
      if (!client.empresa && payload.empresa) updates.empresa = payload.empresa;
      if (!client.interesse && payload.produtoInteresse) updates.interesse = payload.produtoInteresse;
      return { cliente: Object.keys(updates).length ? await tx.cliente.update({ where: { id: client.id }, data: updates }) : client, ambiguous: false, phone };
    }
    const cliente = await tx.cliente.create({ data: { empresaId: integration.empresaId, nome: payload.nome, telefone: phone || "", email: payload.email || "", empresa: payload.empresa || "", interesse: payload.produtoInteresse || "", origem: "Site" } });
    return { cliente, ambiguous: candidates.length > 1, phone };
  }

  async function resolveChannelContact(tx, integration, identity, payload) {
    const seed = identity.ambiguous ? payload.submissionId : `${identity.phone || ""}|${payload.email || ""}`;
    const externalId = `site-contact-${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 40)}`;
    const existing = await tx.contatoCanal.findUnique({ where: { canalIntegracaoId_externalId: { canalIntegracaoId: integration.id, externalId } } });
    if (existing && existing.clienteId && existing.clienteId !== identity.cliente.id) return tx.contatoCanal.create({ data: { empresaId: integration.empresaId, canalIntegracaoId: integration.id, clienteId: identity.cliente.id, externalId: `${externalId}-${payload.submissionId}`, telefoneNormalizado: identity.phone, nome: payload.nome } });
    return tx.contatoCanal.upsert({ where: { canalIntegracaoId_externalId: { canalIntegracaoId: integration.id, externalId } }, create: { empresaId: integration.empresaId, canalIntegracaoId: integration.id, clienteId: identity.cliente.id, externalId, telefoneNormalizado: identity.phone, nome: payload.nome }, update: { clienteId: identity.cliente.id, telefoneNormalizado: identity.phone || existing?.telefoneNormalizado, nome: existing?.nome || payload.nome } });
  }

  async function createAmbiguityNote(tx, empresaId, conversaCanalId) {
    const admin = await tx.usuario.findFirst({ where: { empresaId, papel: "ADMIN", ativo: true }, orderBy: { id: "asc" } });
    if (!admin) return;
    await tx.notaInternaConversa.create({ data: { empresaId, conversaCanalId, autorId: admin.id, sistema: true, conteudo: "Possivel duplicidade de cadastro identificada na captacao do Site. Revise os dados antes de consolidar o Cliente." } });
  }

  async function getOwnedIntegration(context, id) { const item = await prisma.canalIntegracao.findFirst({ where: { id, empresaId: context.empresaId, tipo: "SITE_FORM" } }); if (!item) throw notFound(); return item; }
  return { capture, createIntegration, getPublicIntegration, isOriginAllowed, listIntegrations, rotatePublicId, updateIntegration };
}

function isEnabled(env = process.env) { return env.LEADS_COMMUNICATION_ENABLED === "true" && env.SITE_LEAD_CAPTURE_ENABLED === "true"; }
function readConfiguration(integration) { try { const value = JSON.parse(integration.configuracaoJson || "{}"); return { identificacao: String(value.identificacao || ""), origensPermitidas: Array.isArray(value.origensPermitidas) ? value.origensPermitidas.map(String) : [], politicaPrivacidade: String(value.politicaPrivacidade || ""), permitirSemOrigin: false }; } catch { return { identificacao: "", origensPermitidas: [], politicaPrivacidade: "", permitirSemOrigin: false }; } }
function configurationJson(data) { return JSON.stringify({ identificacao: data.identificacao, origensPermitidas: data.origensPermitidas, politicaPrivacidade: data.politicaPrivacidade, permitirSemOrigin: false }); }
function presentIntegration(item) { const config = readConfiguration(item); return { id: item.id, nome: item.nome, tipo: item.tipo, status: item.status, ativo: item.ativo, publicId: item.publicId, identificacao: config.identificacao, origensPermitidas: config.origensPermitidas, politicaPrivacidade: config.politicaPrivacidade, endpointPath: item.publicId ? `/public/site-leads/${item.publicId}` : null, createdAt: item.createdAt, updatedAt: item.updatedAt }; }
function messageText(payload) { if (payload.mensagem) return payload.mensagem; const details = [payload.produtoInteresse ? `interesse: ${payload.produtoInteresse}` : null, payload.cidade ? `cidade: ${payload.cidade}${payload.estado ? `/${payload.estado}` : ""}` : null].filter(Boolean); return `Novo contato pelo formulario${details.length ? ` - ${details.join("; ")}` : ""}.`; }
function pick(value, fields) { return Object.fromEntries(fields.filter((field) => value[field] !== undefined).map((field) => [field, value[field]])); }
function requireAdmin(context) { if (context.papel !== "ADMIN") { const error = new Error("Acesso negado."); error.status = 403; error.codigo = "SITE_INTEGRATION_FORBIDDEN"; throw error; } }
function notFound() { const error = new Error("Integracao nao encontrada."); error.status = 404; error.codigo = "SITE_INTEGRATION_NOT_FOUND"; return error; }
function validationError(message, campos) { const error = new Error(message); error.status = 400; error.codigo = "VALIDATION_ERROR"; error.campos = campos; return error; }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }

module.exports = { createSiteLeadService, isEnabled, presentIntegration, readConfiguration };
