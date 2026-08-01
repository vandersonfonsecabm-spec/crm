-- Fail closed before rebuilding tables if legacy tenant relations are incompatible.
CREATE TEMP TABLE "__tenant_relation_preflight" ("violations" INTEGER NOT NULL CHECK ("violations" = 0));
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Nota" c LEFT JOIN "Cliente" p ON p."id" = c."clienteId" WHERE c."clienteId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "Cliente" p ON p."id" = c."clienteId" WHERE c."clienteId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "Lead" p ON p."id" = c."leadId" WHERE c."leadId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "ConversaCanal" p ON p."id" = c."conversaCanalId" WHERE c."conversaCanalId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "Negocio" p ON p."id" = c."negocioId" WHERE c."negocioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "PropostaComercial" p ON p."id" = c."propostaComercialId" WHERE c."propostaComercialId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelId" WHERE c."responsavelId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "Usuario" p ON p."id" = c."autorId" WHERE c."autorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "Usuario" p ON p."id" = c."concluidoPorId" WHERE c."concluidoPorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Acompanhamento" c LEFT JOIN "Usuario" p ON p."id" = c."canceladoPorId" WHERE c."canceladoPorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAcompanhamento" c LEFT JOIN "Acompanhamento" p ON p."id" = c."acompanhamentoId" WHERE c."acompanhamentoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAcompanhamento" c LEFT JOIN "Usuario" p ON p."id" = c."autorId" WHERE c."autorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAcompanhamento" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelAnteriorId" WHERE c."responsavelAnteriorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAcompanhamento" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelNovoId" WHERE c."responsavelNovoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "IntegracaoOAuthState" c LEFT JOIN "Usuario" p ON p."id" = c."usuarioId" WHERE c."usuarioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "SincronizacaoIntegracao" c LEFT JOIN "Integracao" p ON p."id" = c."integracaoId" WHERE c."integracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ErroIntegracao" c LEFT JOIN "Integracao" p ON p."id" = c."integracaoId" WHERE c."integracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ErroIntegracao" c LEFT JOIN "SincronizacaoIntegracao" p ON p."id" = c."sincronizacaoId" WHERE c."sincronizacaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ProdutoExterno" c LEFT JOIN "Integracao" p ON p."id" = c."integracaoId" WHERE c."integracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "EstoqueExterno" c LEFT JOIN "Integracao" p ON p."id" = c."integracaoId" WHERE c."integracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "EstoqueExterno" c LEFT JOIN "ProdutoExterno" p ON p."id" = c."produtoExternoId" WHERE c."produtoExternoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PrecoExterno" c LEFT JOIN "Integracao" p ON p."id" = c."integracaoId" WHERE c."integracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PrecoExterno" c LEFT JOIN "ProdutoExterno" p ON p."id" = c."produtoExternoId" WHERE c."produtoExternoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "CondicaoPagamentoExterna" c LEFT JOIN "Integracao" p ON p."id" = c."integracaoId" WHERE c."integracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ImportacaoDados" c LEFT JOIN "Integracao" p ON p."id" = c."integracaoId" WHERE c."integracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ImportacaoDados" c LEFT JOIN "Usuario" p ON p."id" = c."createdByUsuarioId" WHERE c."createdByUsuarioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "EmailMailboxAddress" c LEFT JOIN "CanalIntegracao" p ON p."id" = c."canalIntegracaoId" WHERE c."canalIntegracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ContatoCanal" c LEFT JOIN "CanalIntegracao" p ON p."id" = c."canalIntegracaoId" WHERE c."canalIntegracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ContatoCanal" c LEFT JOIN "Cliente" p ON p."id" = c."clienteId" WHERE c."clienteId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ConversaCanal" c LEFT JOIN "CanalIntegracao" p ON p."id" = c."canalIntegracaoId" WHERE c."canalIntegracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ConversaCanal" c LEFT JOIN "ContatoCanal" p ON p."id" = c."contatoCanalId" WHERE c."contatoCanalId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ConversaCanal" c LEFT JOIN "Lead" p ON p."id" = c."leadId" WHERE c."leadId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ConversaCanal" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelId" WHERE c."responsavelId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "ConversaCanal" c LEFT JOIN "Usuario" p ON p."id" = c."respostaReservadaPorId" WHERE c."respostaReservadaPorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "MensagemCanal" c LEFT JOIN "CanalIntegracao" p ON p."id" = c."canalIntegracaoId" WHERE c."canalIntegracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "MensagemCanal" c LEFT JOIN "ConversaCanal" p ON p."id" = c."conversaCanalId" WHERE c."conversaCanalId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "MensagemCanal" c LEFT JOIN "Usuario" p ON p."id" = c."autorUsuarioId" WHERE c."autorUsuarioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "EmailMessageMetadata" c LEFT JOIN "MensagemCanal" p ON p."id" = c."mensagemCanalId" WHERE c."mensagemCanalId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Lead" c LEFT JOIN "Cliente" p ON p."id" = c."clienteId" WHERE c."clienteId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Lead" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelId" WHERE c."responsavelId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Negocio" c LEFT JOIN "Cliente" p ON p."id" = c."clienteId" WHERE c."clienteId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Negocio" c LEFT JOIN "Cliente" p ON p."id" = c."legacyClienteId" WHERE c."legacyClienteId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Negocio" c LEFT JOIN "Lead" p ON p."id" = c."leadId" WHERE c."leadId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Negocio" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelId" WHERE c."responsavelId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "Negocio" c LEFT JOIN "Usuario" p ON p."id" = c."convertidoPorId" WHERE c."convertidoPorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "NotaInternaConversa" c LEFT JOIN "ConversaCanal" p ON p."id" = c."conversaCanalId" WHERE c."conversaCanalId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "NotaInternaConversa" c LEFT JOIN "Usuario" p ON p."id" = c."autorId" WHERE c."autorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAtribuicao" c LEFT JOIN "Lead" p ON p."id" = c."leadId" WHERE c."leadId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAtribuicao" c LEFT JOIN "ConversaCanal" p ON p."id" = c."conversaCanalId" WHERE c."conversaCanalId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAtribuicao" c LEFT JOIN "Negocio" p ON p."id" = c."negocioId" WHERE c."negocioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAtribuicao" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelAnteriorId" WHERE c."responsavelAnteriorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAtribuicao" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelNovoId" WHERE c."responsavelNovoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoAtribuicao" c LEFT JOIN "Usuario" p ON p."id" = c."alteradoPorId" WHERE c."alteradoPorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoQualificacaoConversa" c LEFT JOIN "ConversaCanal" p ON p."id" = c."conversaCanalId" WHERE c."conversaCanalId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoQualificacaoConversa" c LEFT JOIN "Cliente" p ON p."id" = c."clienteId" WHERE c."clienteId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoQualificacaoConversa" c LEFT JOIN "Lead" p ON p."id" = c."leadId" WHERE c."leadId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoQualificacaoConversa" c LEFT JOIN "Negocio" p ON p."id" = c."negocioId" WHERE c."negocioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoQualificacaoConversa" c LEFT JOIN "Usuario" p ON p."id" = c."autorId" WHERE c."autorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PropostaComercial" c LEFT JOIN "Cliente" p ON p."id" = c."clienteId" WHERE c."clienteId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PropostaComercial" c LEFT JOIN "Negocio" p ON p."id" = c."negocioId" WHERE c."negocioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PropostaComercial" c LEFT JOIN "Lead" p ON p."id" = c."leadId" WHERE c."leadId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PropostaComercial" c LEFT JOIN "Usuario" p ON p."id" = c."responsavelId" WHERE c."responsavelId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PropostaComercial" c LEFT JOIN "Usuario" p ON p."id" = c."autorId" WHERE c."autorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PropostaComercial" c LEFT JOIN "PropostaComercial" p ON p."id" = c."propostaOrigemId" WHERE c."propostaOrigemId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoPropostaComercial" c LEFT JOIN "PropostaComercial" p ON p."id" = c."propostaId" WHERE c."propostaId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "HistoricoPropostaComercial" c LEFT JOIN "Usuario" p ON p."id" = c."autorId" WHERE c."autorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "EventoWebhook" c LEFT JOIN "CanalIntegracao" p ON p."id" = c."canalIntegracaoId" WHERE c."canalIntegracaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoRegra" c LEFT JOIN "Usuario" p ON p."id" = c."createdById" WHERE c."createdById" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoRegra" c LEFT JOIN "Usuario" p ON p."id" = c."updatedById" WHERE c."updatedById" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoExecucao" c LEFT JOIN "AutomacaoRegra" p ON p."id" = c."regraId" WHERE c."regraId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoExecucao" c LEFT JOIN "Lead" p ON p."id" = c."leadId" WHERE c."leadId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoExecucao" c LEFT JOIN "Negocio" p ON p."id" = c."negocioId" WHERE c."negocioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoAcaoJob" c LEFT JOIN "AutomacaoExecucao" p ON p."id" = c."execucaoId" WHERE c."execucaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoRoundRobinEstado" c LEFT JOIN "AutomacaoRegra" p ON p."id" = c."regraId" WHERE c."regraId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoRoundRobinEstado" c LEFT JOIN "Usuario" p ON p."id" = c."ultimoResponsavelId" WHERE c."ultimoResponsavelId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoEventoInterno" c LEFT JOIN "AutomacaoExecucao" p ON p."id" = c."execucaoId" WHERE c."execucaoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoEventoInterno" c LEFT JOIN "Lead" p ON p."id" = c."leadId" WHERE c."leadId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoEventoInterno" c LEFT JOIN "Negocio" p ON p."id" = c."negocioId" WHERE c."negocioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoEventoInterno" c LEFT JOIN "Acompanhamento" p ON p."id" = c."acompanhamentoId" WHERE c."acompanhamentoId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoEventoInterno" c LEFT JOIN "Usuario" p ON p."id" = c."autorId" WHERE c."autorId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "EmpresaFuncionalidade" c LEFT JOIN "Usuario" p ON p."id" = c."habilitadoPorUsuarioId" WHERE c."habilitadoPorUsuarioId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AuditoriaFuncionalidade" c LEFT JOIN "EmpresaFuncionalidade" p ON p."id" = c."funcionalidadeId" WHERE c."funcionalidadeId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."empresaId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "PlatformTenantAudit" c LEFT JOIN "Usuario" p ON p."id" = c."adminUserId" WHERE c."adminUserId" IS NOT NULL AND (p."id" IS NULL OR p."empresaId" <> c."tenantId");
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoExecucao" e LEFT JOIN "Lead" p ON p."id" = e."entidadeId" WHERE e."entidadeTipo" = 'LEAD' AND NOT (e."entidadeTipo" = 'LEAD' AND e."leadId" IS NULL AND e."negocioId" IS NULL AND e."resumoJson" LIKE '%"sourceType":"PILOT_SYNTHETIC"%' AND e."resumoJson" LIKE '%"synthetic":true%') AND (p."id" IS NULL OR p."empresaId" <> e."empresaId" OR e."leadId" IS NULL OR e."leadId" <> e."entidadeId" OR e."negocioId" IS NOT NULL);
INSERT INTO "__tenant_relation_preflight" SELECT COUNT(*) FROM "AutomacaoExecucao" e LEFT JOIN "Negocio" p ON p."id" = e."entidadeId" WHERE e."entidadeTipo" = 'NEGOCIO' AND (p."id" IS NULL OR p."empresaId" <> e."empresaId" OR e."negocioId" IS NULL OR e."negocioId" <> e."entidadeId" OR e."leadId" IS NOT NULL);
DROP TABLE "__tenant_relation_preflight";
-- DropForeignKey
ALTER TABLE "Nota" DROP CONSTRAINT "Nota_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_leadId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_conversaCanalId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_negocioId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_propostaComercialId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_responsavelId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_autorId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_concluidoPorId_fkey";

-- DropForeignKey
ALTER TABLE "Acompanhamento" DROP CONSTRAINT "Acompanhamento_canceladoPorId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAcompanhamento" DROP CONSTRAINT "HistoricoAcompanhamento_acompanhamentoId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAcompanhamento" DROP CONSTRAINT "HistoricoAcompanhamento_autorId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAcompanhamento" DROP CONSTRAINT "HistoricoAcompanhamento_responsavelAnteriorId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAcompanhamento" DROP CONSTRAINT "HistoricoAcompanhamento_responsavelNovoId_fkey";

-- DropForeignKey
ALTER TABLE "IntegracaoOAuthState" DROP CONSTRAINT "IntegracaoOAuthState_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "SincronizacaoIntegracao" DROP CONSTRAINT "SincronizacaoIntegracao_integracaoId_fkey";

-- DropForeignKey
ALTER TABLE "ErroIntegracao" DROP CONSTRAINT "ErroIntegracao_integracaoId_fkey";

-- DropForeignKey
ALTER TABLE "ErroIntegracao" DROP CONSTRAINT "ErroIntegracao_sincronizacaoId_fkey";

-- DropForeignKey
ALTER TABLE "ProdutoExterno" DROP CONSTRAINT "ProdutoExterno_integracaoId_fkey";

-- DropForeignKey
ALTER TABLE "EstoqueExterno" DROP CONSTRAINT "EstoqueExterno_integracaoId_fkey";

-- DropForeignKey
ALTER TABLE "EstoqueExterno" DROP CONSTRAINT "EstoqueExterno_produtoExternoId_fkey";

-- DropForeignKey
ALTER TABLE "PrecoExterno" DROP CONSTRAINT "PrecoExterno_integracaoId_fkey";

-- DropForeignKey
ALTER TABLE "PrecoExterno" DROP CONSTRAINT "PrecoExterno_produtoExternoId_fkey";

-- DropForeignKey
ALTER TABLE "CondicaoPagamentoExterna" DROP CONSTRAINT "CondicaoPagamentoExterna_integracaoId_fkey";

-- DropForeignKey
ALTER TABLE "ImportacaoDados" DROP CONSTRAINT "ImportacaoDados_integracaoId_fkey";

-- DropForeignKey
ALTER TABLE "ImportacaoDados" DROP CONSTRAINT "ImportacaoDados_createdByUsuarioId_fkey";

-- DropForeignKey
ALTER TABLE "EmailMailboxAddress" DROP CONSTRAINT "EmailMailboxAddress_canalIntegracaoId_fkey";

-- DropForeignKey
ALTER TABLE "ContatoCanal" DROP CONSTRAINT "ContatoCanal_canalIntegracaoId_fkey";

-- DropForeignKey
ALTER TABLE "ContatoCanal" DROP CONSTRAINT "ContatoCanal_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "ConversaCanal" DROP CONSTRAINT "ConversaCanal_canalIntegracaoId_fkey";

-- DropForeignKey
ALTER TABLE "ConversaCanal" DROP CONSTRAINT "ConversaCanal_contatoCanalId_fkey";

-- DropForeignKey
ALTER TABLE "ConversaCanal" DROP CONSTRAINT "ConversaCanal_leadId_fkey";

-- DropForeignKey
ALTER TABLE "ConversaCanal" DROP CONSTRAINT "ConversaCanal_responsavelId_fkey";

-- DropForeignKey
ALTER TABLE "ConversaCanal" DROP CONSTRAINT "ConversaCanal_respostaReservadaPorId_fkey";

-- DropForeignKey
ALTER TABLE "MensagemCanal" DROP CONSTRAINT "MensagemCanal_canalIntegracaoId_fkey";

-- DropForeignKey
ALTER TABLE "MensagemCanal" DROP CONSTRAINT "MensagemCanal_conversaCanalId_fkey";

-- DropForeignKey
ALTER TABLE "MensagemCanal" DROP CONSTRAINT "MensagemCanal_autorUsuarioId_fkey";

-- DropForeignKey
ALTER TABLE "EmailMessageMetadata" DROP CONSTRAINT "EmailMessageMetadata_mensagemCanalId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_responsavelId_fkey";

-- DropForeignKey
ALTER TABLE "Negocio" DROP CONSTRAINT "Negocio_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "Negocio" DROP CONSTRAINT "Negocio_legacyClienteId_fkey";

-- DropForeignKey
ALTER TABLE "Negocio" DROP CONSTRAINT "Negocio_leadId_fkey";

-- DropForeignKey
ALTER TABLE "Negocio" DROP CONSTRAINT "Negocio_responsavelId_fkey";

-- DropForeignKey
ALTER TABLE "Negocio" DROP CONSTRAINT "Negocio_convertidoPorId_fkey";

-- DropForeignKey
ALTER TABLE "NotaInternaConversa" DROP CONSTRAINT "NotaInternaConversa_conversaCanalId_fkey";

-- DropForeignKey
ALTER TABLE "NotaInternaConversa" DROP CONSTRAINT "NotaInternaConversa_autorId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAtribuicao" DROP CONSTRAINT "HistoricoAtribuicao_leadId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAtribuicao" DROP CONSTRAINT "HistoricoAtribuicao_conversaCanalId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAtribuicao" DROP CONSTRAINT "HistoricoAtribuicao_negocioId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAtribuicao" DROP CONSTRAINT "HistoricoAtribuicao_responsavelAnteriorId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAtribuicao" DROP CONSTRAINT "HistoricoAtribuicao_responsavelNovoId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoAtribuicao" DROP CONSTRAINT "HistoricoAtribuicao_alteradoPorId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" DROP CONSTRAINT "HistoricoQualificacaoConversa_conversaCanalId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" DROP CONSTRAINT "HistoricoQualificacaoConversa_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" DROP CONSTRAINT "HistoricoQualificacaoConversa_leadId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" DROP CONSTRAINT "HistoricoQualificacaoConversa_negocioId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" DROP CONSTRAINT "HistoricoQualificacaoConversa_autorId_fkey";

-- DropForeignKey
ALTER TABLE "PropostaComercial" DROP CONSTRAINT "PropostaComercial_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "PropostaComercial" DROP CONSTRAINT "PropostaComercial_negocioId_fkey";

-- DropForeignKey
ALTER TABLE "PropostaComercial" DROP CONSTRAINT "PropostaComercial_leadId_fkey";

-- DropForeignKey
ALTER TABLE "PropostaComercial" DROP CONSTRAINT "PropostaComercial_responsavelId_fkey";

-- DropForeignKey
ALTER TABLE "PropostaComercial" DROP CONSTRAINT "PropostaComercial_autorId_fkey";

-- DropForeignKey
ALTER TABLE "PropostaComercial" DROP CONSTRAINT "PropostaComercial_propostaOrigemId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoPropostaComercial" DROP CONSTRAINT "HistoricoPropostaComercial_propostaId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoPropostaComercial" DROP CONSTRAINT "HistoricoPropostaComercial_autorId_fkey";

-- DropForeignKey
ALTER TABLE "EventoWebhook" DROP CONSTRAINT "EventoWebhook_canalIntegracaoId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoRegra" DROP CONSTRAINT "AutomacaoRegra_createdById_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoRegra" DROP CONSTRAINT "AutomacaoRegra_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoExecucao" DROP CONSTRAINT "AutomacaoExecucao_regraId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoExecucao" DROP CONSTRAINT "AutomacaoExecucao_leadId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoExecucao" DROP CONSTRAINT "AutomacaoExecucao_negocioId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoAcaoJob" DROP CONSTRAINT "AutomacaoAcaoJob_execucaoId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoRoundRobinEstado" DROP CONSTRAINT "AutomacaoRoundRobinEstado_regraId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoEventoInterno" DROP CONSTRAINT "AutomacaoEventoInterno_execucaoId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoEventoInterno" DROP CONSTRAINT "AutomacaoEventoInterno_leadId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoEventoInterno" DROP CONSTRAINT "AutomacaoEventoInterno_negocioId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoEventoInterno" DROP CONSTRAINT "AutomacaoEventoInterno_acompanhamentoId_fkey";

-- DropForeignKey
ALTER TABLE "AutomacaoEventoInterno" DROP CONSTRAINT "AutomacaoEventoInterno_autorId_fkey";

-- DropForeignKey
ALTER TABLE "EmpresaFuncionalidade" DROP CONSTRAINT "EmpresaFuncionalidade_habilitadoPorUsuarioId_fkey";

-- DropForeignKey
ALTER TABLE "AuditoriaFuncionalidade" DROP CONSTRAINT "AuditoriaFuncionalidade_funcionalidadeId_fkey";

-- DropForeignKey

-- DropForeignKey
ALTER TABLE "PlatformTenantAudit" DROP CONSTRAINT "PlatformTenantAudit_adminUserId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_empresaId_id_key" ON "Cliente"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Acompanhamento_empresaId_id_key" ON "Acompanhamento"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_empresaId_id_key" ON "Usuario"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Integracao_empresaId_id_key" ON "Integracao"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SincronizacaoIntegracao_empresaId_id_key" ON "SincronizacaoIntegracao"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoExterno_empresaId_id_key" ON "ProdutoExterno"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CanalIntegracao_empresaId_id_key" ON "CanalIntegracao"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContatoCanal_empresaId_id_key" ON "ContatoCanal"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ConversaCanal_empresaId_id_key" ON "ConversaCanal"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MensagemCanal_empresaId_id_key" ON "MensagemCanal"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessageMetadata_empresaId_mensagemCanalId_key" ON "EmailMessageMetadata"("empresaId", "mensagemCanalId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_empresaId_id_key" ON "Lead"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_empresaId_id_key" ON "Negocio"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PropostaComercial_empresaId_id_key" ON "PropostaComercial"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AutomacaoRegra_empresaId_id_key" ON "AutomacaoRegra"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AutomacaoExecucao_empresaId_id_key" ON "AutomacaoExecucao"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaFuncionalidade_empresaId_id_key" ON "EmpresaFuncionalidade"("empresaId", "id");

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_propostaComercialId_fkey" FOREIGN KEY ("empresaId", "propostaComercialId") REFERENCES "PropostaComercial"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_concluidoPorId_fkey" FOREIGN KEY ("empresaId", "concluidoPorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Acompanhamento" ADD CONSTRAINT "Acompanhamento_empresaId_canceladoPorId_fkey" FOREIGN KEY ("empresaId", "canceladoPorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_empresaId_acompanhamentoId_fkey" FOREIGN KEY ("empresaId", "acompanhamentoId") REFERENCES "Acompanhamento"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_empresaId_responsavelAnteriorId_fkey" FOREIGN KEY ("empresaId", "responsavelAnteriorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAcompanhamento" ADD CONSTRAINT "HistoricoAcompanhamento_empresaId_responsavelNovoId_fkey" FOREIGN KEY ("empresaId", "responsavelNovoId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "IntegracaoOAuthState" ADD CONSTRAINT "IntegracaoOAuthState_empresaId_usuarioId_fkey" FOREIGN KEY ("empresaId", "usuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SincronizacaoIntegracao" ADD CONSTRAINT "SincronizacaoIntegracao_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ErroIntegracao" ADD CONSTRAINT "ErroIntegracao_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ErroIntegracao" ADD CONSTRAINT "ErroIntegracao_empresaId_sincronizacaoId_fkey" FOREIGN KEY ("empresaId", "sincronizacaoId") REFERENCES "SincronizacaoIntegracao"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProdutoExterno" ADD CONSTRAINT "ProdutoExterno_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstoqueExterno" ADD CONSTRAINT "EstoqueExterno_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstoqueExterno" ADD CONSTRAINT "EstoqueExterno_empresaId_produtoExternoId_fkey" FOREIGN KEY ("empresaId", "produtoExternoId") REFERENCES "ProdutoExterno"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PrecoExterno" ADD CONSTRAINT "PrecoExterno_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PrecoExterno" ADD CONSTRAINT "PrecoExterno_empresaId_produtoExternoId_fkey" FOREIGN KEY ("empresaId", "produtoExternoId") REFERENCES "ProdutoExterno"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CondicaoPagamentoExterna" ADD CONSTRAINT "CondicaoPagamentoExterna_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ImportacaoDados" ADD CONSTRAINT "ImportacaoDados_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ImportacaoDados" ADD CONSTRAINT "ImportacaoDados_empresaId_createdByUsuarioId_fkey" FOREIGN KEY ("empresaId", "createdByUsuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EmailMailboxAddress" ADD CONSTRAINT "EmailMailboxAddress_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContatoCanal" ADD CONSTRAINT "ContatoCanal_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContatoCanal" ADD CONSTRAINT "ContatoCanal_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_empresaId_contatoCanalId_fkey" FOREIGN KEY ("empresaId", "contatoCanalId") REFERENCES "ContatoCanal"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversaCanal" ADD CONSTRAINT "ConversaCanal_empresaId_respostaReservadaPorId_fkey" FOREIGN KEY ("empresaId", "respostaReservadaPorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MensagemCanal" ADD CONSTRAINT "MensagemCanal_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MensagemCanal" ADD CONSTRAINT "MensagemCanal_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MensagemCanal" ADD CONSTRAINT "MensagemCanal_empresaId_autorUsuarioId_fkey" FOREIGN KEY ("empresaId", "autorUsuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EmailMessageMetadata" ADD CONSTRAINT "EmailMessageMetadata_empresaId_mensagemCanalId_fkey" FOREIGN KEY ("empresaId", "mensagemCanalId") REFERENCES "MensagemCanal"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_empresaId_legacyClienteId_fkey" FOREIGN KEY ("empresaId", "legacyClienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_empresaId_convertidoPorId_fkey" FOREIGN KEY ("empresaId", "convertidoPorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NotaInternaConversa" ADD CONSTRAINT "NotaInternaConversa_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NotaInternaConversa" ADD CONSTRAINT "NotaInternaConversa_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_empresaId_responsavelAnteriorId_fkey" FOREIGN KEY ("empresaId", "responsavelAnteriorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_empresaId_responsavelNovoId_fkey" FOREIGN KEY ("empresaId", "responsavelNovoId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoAtribuicao" ADD CONSTRAINT "HistoricoAtribuicao_empresaId_alteradoPorId_fkey" FOREIGN KEY ("empresaId", "alteradoPorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoQualificacaoConversa" ADD CONSTRAINT "HistoricoQualificacaoConversa_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PropostaComercial" ADD CONSTRAINT "PropostaComercial_empresaId_propostaOrigemId_fkey" FOREIGN KEY ("empresaId", "propostaOrigemId") REFERENCES "PropostaComercial"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoPropostaComercial" ADD CONSTRAINT "HistoricoPropostaComercial_empresaId_propostaId_fkey" FOREIGN KEY ("empresaId", "propostaId") REFERENCES "PropostaComercial"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HistoricoPropostaComercial" ADD CONSTRAINT "HistoricoPropostaComercial_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EventoWebhook" ADD CONSTRAINT "EventoWebhook_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoRegra" ADD CONSTRAINT "AutomacaoRegra_empresaId_createdById_fkey" FOREIGN KEY ("empresaId", "createdById") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoRegra" ADD CONSTRAINT "AutomacaoRegra_empresaId_updatedById_fkey" FOREIGN KEY ("empresaId", "updatedById") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoExecucao" ADD CONSTRAINT "AutomacaoExecucao_empresaId_regraId_fkey" FOREIGN KEY ("empresaId", "regraId") REFERENCES "AutomacaoRegra"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoExecucao" ADD CONSTRAINT "AutomacaoExecucao_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoExecucao" ADD CONSTRAINT "AutomacaoExecucao_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoAcaoJob" ADD CONSTRAINT "AutomacaoAcaoJob_empresaId_execucaoId_fkey" FOREIGN KEY ("empresaId", "execucaoId") REFERENCES "AutomacaoExecucao"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoRoundRobinEstado" ADD CONSTRAINT "AutomacaoRoundRobinEstado_empresaId_regraId_fkey" FOREIGN KEY ("empresaId", "regraId") REFERENCES "AutomacaoRegra"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoRoundRobinEstado" ADD CONSTRAINT "AutomacaoRoundRobinEstado_empresaId_ultimoResponsavelId_fkey" FOREIGN KEY ("empresaId", "ultimoResponsavelId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_empresaId_execucaoId_fkey" FOREIGN KEY ("empresaId", "execucaoId") REFERENCES "AutomacaoExecucao"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_empresaId_acompanhamentoId_fkey" FOREIGN KEY ("empresaId", "acompanhamentoId") REFERENCES "Acompanhamento"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AutomacaoEventoInterno" ADD CONSTRAINT "AutomacaoEventoInterno_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EmpresaFuncionalidade" ADD CONSTRAINT "EmpresaFuncionalidade_empresaId_habilitadoPorUsuarioId_fkey" FOREIGN KEY ("empresaId", "habilitadoPorUsuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditoriaFuncionalidade" ADD CONSTRAINT "AuditoriaFuncionalidade_empresaId_funcionalidadeId_fkey" FOREIGN KEY ("empresaId", "funcionalidadeId") REFERENCES "EmpresaFuncionalidade"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "PlatformTenantAudit" ADD CONSTRAINT "PlatformTenantAudit_tenantId_adminUserId_fkey" FOREIGN KEY ("tenantId", "adminUserId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
