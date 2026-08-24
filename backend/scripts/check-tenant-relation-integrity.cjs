const { Client } = require("pg");
const {
  classifyPolymorphicRows,
  POLYMORPHIC_ROWS_QUERY,
} = require("./tenant-isolation-verifier-utils.cjs");

const relationSpecs = Object.freeze([
  ["commercial", "Nota", "clienteId", "Cliente"],
  ["commercial", "Acompanhamento", "clienteId", "Cliente"],
  ["commercial", "Acompanhamento", "leadId", "Lead"],
  ["commercial", "Acompanhamento", "conversaCanalId", "ConversaCanal"],
  ["commercial", "Acompanhamento", "negocioId", "Negocio"],
  ["commercial", "Acompanhamento", "propostaComercialId", "PropostaComercial"],
  ["commercial", "Acompanhamento", "responsavelId", "Usuario"],
  ["commercial", "Acompanhamento", "autorId", "Usuario"],
  ["commercial", "Acompanhamento", "concluidoPorId", "Usuario"],
  ["commercial", "Acompanhamento", "canceladoPorId", "Usuario"],
  ["notifications", "Notificacao", "destinatarioId", "Usuario"],
  ["notifications", "PreferenciaNotificacaoUsuario", "usuarioId", "Usuario"],
  ["commercial", "HistoricoAcompanhamento", "acompanhamentoId", "Acompanhamento"],
  ["commercial", "HistoricoAcompanhamento", "autorId", "Usuario"],
  ["commercial", "HistoricoAcompanhamento", "responsavelAnteriorId", "Usuario"],
  ["commercial", "HistoricoAcompanhamento", "responsavelNovoId", "Usuario"],
  ["integration", "IntegracaoOAuthState", "usuarioId", "Usuario"],
  ["integration", "IntegracaoOAuthState", "canalIntegracaoId", "CanalIntegracao"],
  ["integration", "MetaCredential", "canalIntegracaoId", "CanalIntegracao"],
  ["integration", "SincronizacaoIntegracao", "integracaoId", "Integracao"],
  ["integration", "ErroIntegracao", "integracaoId", "Integracao"],
  ["integration", "ErroIntegracao", "sincronizacaoId", "SincronizacaoIntegracao"],
  ["integration", "ProdutoExterno", "integracaoId", "Integracao"],
  ["integration", "EstoqueExterno", "integracaoId", "Integracao"],
  ["integration", "EstoqueExterno", "produtoExternoId", "ProdutoExterno"],
  ["integration", "PrecoExterno", "integracaoId", "Integracao"],
  ["integration", "PrecoExterno", "produtoExternoId", "ProdutoExterno"],
  ["integration", "CondicaoPagamentoExterna", "integracaoId", "Integracao"],
  ["integration", "ImportacaoDados", "integracaoId", "Integracao"],
  ["integration", "ImportacaoDados", "createdByUsuarioId", "Usuario"],
  ["security", "SessaoUsuario", "usuarioId", "Usuario"],
  ["security", "SessaoRefreshToken", "sessaoId", "SessaoUsuario"],
  ["security", "TokenRecuperacaoSenha", "usuarioId", "Usuario"],
  ["security", "ConviteUsuario", "convidadoPorId", "Usuario"],
  ["shared-channel", "EmailMailboxAddress", "canalIntegracaoId", "CanalIntegracao"],
  ["shared-channel", "ContatoCanal", "canalIntegracaoId", "CanalIntegracao"],
  ["shared-channel", "ContatoCanal", "clienteId", "Cliente"],
  ["shared-channel", "ConversaCanal", "canalIntegracaoId", "CanalIntegracao"],
  ["shared-channel", "ConversaCanal", "contatoCanalId", "ContatoCanal"],
  ["shared-channel", "ConversaCanal", "leadId", "Lead"],
  ["shared-channel", "ConversaCanal", "responsavelId", "Usuario"],
  ["shared-channel", "ConversaCanal", "respostaReservadaPorId", "Usuario"],
  ["shared-channel", "MensagemCanal", "canalIntegracaoId", "CanalIntegracao"],
  ["shared-channel", "MensagemCanal", "conversaCanalId", "ConversaCanal"],
  ["shared-channel", "MensagemCanal", "autorUsuarioId", "Usuario"],
  ["shared-channel", "EmailMessageMetadata", "mensagemCanalId", "MensagemCanal"],
  ["commercial", "Lead", "clienteId", "Cliente"],
  ["commercial", "Lead", "responsavelId", "Usuario"],
  ["commercial", "Negocio", "clienteId", "Cliente"],
  ["commercial", "Negocio", "legacyClienteId", "Cliente"],
  ["commercial", "Negocio", "leadId", "Lead"],
  ["commercial", "Negocio", "responsavelId", "Usuario"],
  ["commercial", "Negocio", "convertidoPorId", "Usuario"],
  ["commercial", "NotaInternaConversa", "conversaCanalId", "ConversaCanal"],
  ["commercial", "NotaInternaConversa", "autorId", "Usuario"],
  ["commercial", "HistoricoAtribuicao", "leadId", "Lead"],
  ["commercial", "HistoricoAtribuicao", "conversaCanalId", "ConversaCanal"],
  ["commercial", "HistoricoAtribuicao", "negocioId", "Negocio"],
  ["commercial", "HistoricoAtribuicao", "responsavelAnteriorId", "Usuario"],
  ["commercial", "HistoricoAtribuicao", "responsavelNovoId", "Usuario"],
  ["commercial", "HistoricoAtribuicao", "alteradoPorId", "Usuario"],
  ["commercial", "HistoricoQualificacaoConversa", "conversaCanalId", "ConversaCanal"],
  ["commercial", "HistoricoQualificacaoConversa", "clienteId", "Cliente"],
  ["commercial", "HistoricoQualificacaoConversa", "leadId", "Lead"],
  ["commercial", "HistoricoQualificacaoConversa", "negocioId", "Negocio"],
  ["commercial", "HistoricoQualificacaoConversa", "autorId", "Usuario"],
  ["commercial", "PropostaComercial", "clienteId", "Cliente"],
  ["commercial", "PropostaComercial", "negocioId", "Negocio"],
  ["commercial", "PropostaComercial", "leadId", "Lead"],
  ["commercial", "PropostaComercial", "responsavelId", "Usuario"],
  ["commercial", "PropostaComercial", "autorId", "Usuario"],
  ["commercial", "PropostaComercial", "propostaOrigemId", "PropostaComercial"],
  ["commercial", "HistoricoPropostaComercial", "propostaId", "PropostaComercial"],
  ["commercial", "HistoricoPropostaComercial", "autorId", "Usuario"],
  ["shared-channel", "EventoWebhook", "canalIntegracaoId", "CanalIntegracao"],
  ["automation", "AutomacaoRegra", "createdById", "Usuario"],
  ["automation", "AutomacaoRegra", "updatedById", "Usuario"],
  ["automation", "AutomacaoExecucao", "regraId", "AutomacaoRegra"],
  ["automation", "AutomacaoExecucao", "leadId", "Lead"],
  ["automation", "AutomacaoExecucao", "negocioId", "Negocio"],
  ["automation", "AutomacaoAcaoJob", "execucaoId", "AutomacaoExecucao"],
  ["automation", "AutomacaoRoundRobinEstado", "regraId", "AutomacaoRegra"],
  ["automation", "AutomacaoRoundRobinEstado", "ultimoResponsavelId", "Usuario"],
  ["automation", "AutomacaoEventoInterno", "execucaoId", "AutomacaoExecucao"],
  ["automation", "AutomacaoEventoInterno", "leadId", "Lead"],
  ["automation", "AutomacaoEventoInterno", "negocioId", "Negocio"],
  ["automation", "AutomacaoEventoInterno", "acompanhamentoId", "Acompanhamento"],
  ["automation", "AutomacaoEventoInterno", "autorId", "Usuario"],
  ["governance", "EmpresaFuncionalidade", "habilitadoPorUsuarioId", "Usuario"],
  ["governance", "AuditoriaFuncionalidade", "funcionalidadeId", "EmpresaFuncionalidade"],
  ["governance", "PlatformTenantAudit", "adminUserId", "Usuario", "tenantId"],
  ["stock", "CapacidadeFonteEstoque", "fonteId", "FonteEstoque"],
  ["stock", "ExecucaoSincronizacaoEstoque", "fonteId", "FonteEstoque"],
  ["stock", "CheckpointSincronizacaoEstoque", "fonteId", "FonteEstoque"],
  ["stock", "MapeamentoProdutoExterno", "fonteId", "FonteEstoque"],
  ["stock", "MapeamentoProdutoExterno", "produtoEstoqueId", "ProdutoEstoque"],
  ["stock", "LocalEstoque", "fonteId", "FonteEstoque"],
  ["stock", "LocalEstoque", "parentId", "LocalEstoque"],
  ["stock", "LoteEstoque", "produtoEstoqueId", "ProdutoEstoque"],
  ["stock", "LoteEstoque", "fonteId", "FonteEstoque"],
  ["stock", "SaldoEstoque", "produtoEstoqueId", "ProdutoEstoque"],
  ["stock", "SaldoEstoque", "loteId", "LoteEstoque"],
  ["stock", "SaldoEstoque", "localId", "LocalEstoque"],
  ["stock", "SaldoEstoque", "fonteAutoritativaId", "FonteEstoque"],
  ["stock", "ObservacaoEstoque", "fonteId", "FonteEstoque"],
  ["stock", "ObservacaoEstoque", "syncRunId", "ExecucaoSincronizacaoEstoque"],
  ["stock", "ProblemaQualidadeEstoque", "fonteId", "FonteEstoque"],
  ["stock", "ProblemaQualidadeEstoque", "syncRunId", "ExecucaoSincronizacaoEstoque"],
  ["stock", "EventoAuditoriaEstoque", "actorUsuarioId", "Usuario"],
  ["stock", "ImportacaoEstoque", "fonteId", "FonteEstoque"],
  ["stock", "ImportacaoEstoque", "actorUsuarioId", "Usuario"],
  ["stock", "ImportacaoEstoque", "syncRunId", "ExecucaoSincronizacaoEstoque"],
  ["stock", "LinhaImportacaoEstoque", "importacaoId", "ImportacaoEstoque"],
  ["stock", "AvaliacaoRegraEstoque", "produtoEstoqueId", "ProdutoEstoque"],
  ["stock", "AvaliacaoRegraEstoque", "loteEstoqueId", "LoteEstoque"],
  ["stock", "AvaliacaoRegraEstoque", "localEstoqueId", "LocalEstoque"],
  ["stock", "AvaliacaoRegraEstoque", "sourceConnectionId", "FonteEstoque"],
  ["ai-commerce", "CommercialCatalogProduct", "stockProductId", "ProdutoEstoque"],
  ["ai-commerce", "ProductOffer", "conversationId", "ConversaCanal"],
  ["ai-commerce", "ProductOffer", "customerId", "Cliente"],
  ["ai-commerce", "ProductOffer", "catalogProductId", "CommercialCatalogProduct"],
  ["ai-commerce", "ProductOffer", "stockProductId", "ProdutoEstoque"],
  ["ai-commerce", "AICommerceSettings", "actorUsuarioId", "Usuario"],
  ["ai-commerce", "AICommerceRun", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommerceRun", "triggerMessageId", "MensagemCanal"],
  ["ai-commerce", "AICommerceTurn", "runId", "AICommerceRun"],
  ["ai-commerce", "AICommerceTurn", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommerceToolInvocation", "runId", "AICommerceRun"],
  ["ai-commerce", "AICommerceToolInvocation", "turnId", "AICommerceTurn"],
  ["ai-commerce", "AICommerceToolInvocation", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommerceDecision", "runId", "AICommerceRun"],
  ["ai-commerce", "AICommerceDecision", "turnId", "AICommerceTurn"],
  ["ai-commerce", "AICommerceDecision", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommerceDraft", "runId", "AICommerceRun"],
  ["ai-commerce", "AICommerceDraft", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommerceDraft", "decisionId", "AICommerceDecision"],
  ["ai-commerce", "AICommerceDraft", "actorUsuarioId", "Usuario"],
  ["ai-commerce", "AICommercePolicyDecision", "runId", "AICommerceRun"],
  ["ai-commerce", "AICommercePolicyDecision", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommercePolicyDecision", "draftId", "AICommerceDraft"],
  ["ai-commerce", "AICommercePolicyDecision", "actorUsuarioId", "Usuario"],
  ["ai-commerce", "AICommerceHandoff", "runId", "AICommerceRun"],
  ["ai-commerce", "AICommerceHandoff", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommerceHandoff", "draftId", "AICommerceDraft"],
  ["ai-commerce", "AICommerceHandoff", "opportunityDraftId", "AICommerceOpportunityDraft"],
  ["ai-commerce", "AICommerceHandoff", "offerId", "ProductOffer"],
  ["ai-commerce", "AICommerceHandoff", "actorUsuarioId", "Usuario"],
  ["ai-commerce", "AICommerceProductInterest", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommerceProductInterest", "customerId", "Cliente"],
  ["ai-commerce", "AICommerceProductInterest", "offerId", "ProductOffer"],
  ["ai-commerce", "AICommerceProductInterest", "catalogProductId", "CommercialCatalogProduct"],
  ["ai-commerce", "AICommerceProductInterest", "actorUsuarioId", "Usuario"],
  ["ai-commerce", "AICommerceOpportunityDraft", "conversationId", "ConversaCanal"],
  ["ai-commerce", "AICommerceOpportunityDraft", "customerId", "Cliente"],
  ["ai-commerce", "AICommerceOpportunityDraft", "primaryOfferId", "ProductOffer"],
  ["ai-commerce", "AICommerceOpportunityDraft", "catalogProductId", "CommercialCatalogProduct"],
  ["ai-commerce", "AICommerceOpportunityDraft", "actorUsuarioId", "Usuario"],
]);

function ident(value) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error("PREFLIGHT_IDENTIFIER_INVALID");
  return `"${value}"`;
}

function databaseUrl(env) {
  const value = String(env.POSTGRES_DATABASE_URL || env.DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error("PREFLIGHT_POSTGRES_REQUIRED");
  return value;
}

async function relationCount(client, spec) {
  const [category, child, foreignKey, parent, tenantKey = "empresaId"] = spec;
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE p."id" IS NULL)::int AS orphaned,
      COUNT(*) FILTER (WHERE p."id" IS NOT NULL AND p."empresaId" <> c.${ident(tenantKey)})::int AS crossed
    FROM ${ident(child)} c
    LEFT JOIN ${ident(parent)} p ON p."id" = c.${ident(foreignKey)}
    WHERE c.${ident(foreignKey)} IS NOT NULL`;
  const row = (await client.query(sql)).rows[0];
  return {
    category,
    relation: `${child}.${foreignKey}->${parent}`,
    orphaned: Number(row.orphaned || 0),
    crossed: Number(row.crossed || 0),
  };
}

async function polymorphicCount(client) {
  const result = await client.query(POLYMORPHIC_ROWS_QUERY);
  return classifyPolymorphicRows(result.rows);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl(process.env), statement_timeout: 30000 });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const relations = [];
    for (const spec of relationSpecs) relations.push(await relationCount(client, spec));
    const polymorphic = await polymorphicCount(client);
    await client.query("ROLLBACK");
    const totals = relations.reduce(
      (sum, item) => ({ orphaned: sum.orphaned + item.orphaned, crossed: sum.crossed + item.crossed }),
      { orphaned: 0, crossed: 0 },
    );
    const affected = relations.filter((item) => item.orphaned > 0 || item.crossed > 0);
    console.log(JSON.stringify({
      event: "tenant_relation_preflight",
      checkedRelations: relations.length,
      totals: { ...totals, polymorphic },
      affected,
      safe: totals.orphaned === 0
        && totals.crossed === 0
        && polymorphic.orphaned_lead === 0
        && polymorphic.invalid_pilot_synthetic === 0
        && polymorphic.crossed_lead === 0
        && polymorphic.incoherent_lead === 0
        && polymorphic.orphaned_business === 0
        && polymorphic.crossed_business === 0
        && polymorphic.incoherent_business === 0,
    }));
  } finally {
    await client.end();
  }
}

module.exports = { relationSpecs };

if (require.main === module) {
  require("./tenant-isolation-gate.cjs").runCli({ defaultMode: "production-readonly" });
}
