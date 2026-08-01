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
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Acompanhamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER,
    "leadId" INTEGER,
    "conversaCanalId" INTEGER,
    "negocioId" INTEGER,
    "propostaComercialId" INTEGER,
    "responsavelId" INTEGER,
    "autorId" INTEGER,
    "concluidoPorId" INTEGER,
    "canceladoPorId" INTEGER,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataHora" DATETIME NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'MEDIA',
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tipo" TEXT NOT NULL DEFAULT 'LIGACAO',
    "responsavel" TEXT,
    "concluidoEm" DATETIME,
    "canceladoEm" DATETIME,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Acompanhamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Acompanhamento_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Acompanhamento_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Acompanhamento_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Acompanhamento_empresaId_propostaComercialId_fkey" FOREIGN KEY ("empresaId", "propostaComercialId") REFERENCES "PropostaComercial" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Acompanhamento_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Acompanhamento_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Acompanhamento_empresaId_concluidoPorId_fkey" FOREIGN KEY ("empresaId", "concluidoPorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Acompanhamento_empresaId_canceladoPorId_fkey" FOREIGN KEY ("empresaId", "canceladoPorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_Acompanhamento" ("autorId", "canceladoEm", "canceladoPorId", "clienteId", "concluidoEm", "concluidoPorId", "conversaCanalId", "createdAt", "dataHora", "descricao", "empresaId", "id", "leadId", "negocioId", "prioridade", "propostaComercialId", "responsavel", "responsavelId", "revisao", "status", "tipo", "titulo", "updatedAt") SELECT "autorId", "canceladoEm", "canceladoPorId", "clienteId", "concluidoEm", "concluidoPorId", "conversaCanalId", "createdAt", "dataHora", "descricao", "empresaId", "id", "leadId", "negocioId", "prioridade", "propostaComercialId", "responsavel", "responsavelId", "revisao", "status", "tipo", "titulo", "updatedAt" FROM "Acompanhamento";
DROP TABLE "Acompanhamento";
ALTER TABLE "new_Acompanhamento" RENAME TO "Acompanhamento";
CREATE INDEX "Acompanhamento_empresaId_idx" ON "Acompanhamento"("empresaId");
CREATE INDEX "Acompanhamento_clienteId_idx" ON "Acompanhamento"("clienteId");
CREATE INDEX "Acompanhamento_empresaId_clienteId_idx" ON "Acompanhamento"("empresaId", "clienteId");
CREATE INDEX "Acompanhamento_empresaId_dataHora_idx" ON "Acompanhamento"("empresaId", "dataHora");
CREATE INDEX "Acompanhamento_empresaId_status_idx" ON "Acompanhamento"("empresaId", "status");
CREATE INDEX "Acompanhamento_empresaId_prioridade_idx" ON "Acompanhamento"("empresaId", "prioridade");
CREATE INDEX "Acompanhamento_empresaId_tipo_idx" ON "Acompanhamento"("empresaId", "tipo");
CREATE INDEX "Acompanhamento_empresaId_leadId_idx" ON "Acompanhamento"("empresaId", "leadId");
CREATE INDEX "Acompanhamento_empresaId_conversaCanalId_idx" ON "Acompanhamento"("empresaId", "conversaCanalId");
CREATE INDEX "Acompanhamento_empresaId_negocioId_idx" ON "Acompanhamento"("empresaId", "negocioId");
CREATE INDEX "Acompanhamento_empresaId_propostaComercialId_idx" ON "Acompanhamento"("empresaId", "propostaComercialId");
CREATE INDEX "Acompanhamento_empresaId_responsavelId_status_idx" ON "Acompanhamento"("empresaId", "responsavelId", "status");
CREATE INDEX "Acompanhamento_empresaId_autorId_createdAt_idx" ON "Acompanhamento"("empresaId", "autorId", "createdAt");
CREATE UNIQUE INDEX "Acompanhamento_empresaId_id_key" ON "Acompanhamento"("empresaId", "id");
CREATE TABLE "new_AuditoriaFuncionalidade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "funcionalidadeId" INTEGER,
    "chave" TEXT NOT NULL,
    "valorAnterior" BOOLEAN,
    "valorNovo" BOOLEAN NOT NULL,
    "operadoPor" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "motivo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditoriaFuncionalidade_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditoriaFuncionalidade_empresaId_funcionalidadeId_fkey" FOREIGN KEY ("empresaId", "funcionalidadeId") REFERENCES "EmpresaFuncionalidade" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AuditoriaFuncionalidade_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditoriaFuncionalidade" ("chave", "createdAt", "empresaId", "funcionalidadeId", "id", "motivo", "operadoPor", "usuarioId", "valorAnterior", "valorNovo") SELECT "chave", "createdAt", "empresaId", "funcionalidadeId", "id", "motivo", "operadoPor", "usuarioId", "valorAnterior", "valorNovo" FROM "AuditoriaFuncionalidade";
DROP TABLE "AuditoriaFuncionalidade";
ALTER TABLE "new_AuditoriaFuncionalidade" RENAME TO "AuditoriaFuncionalidade";
CREATE INDEX "AuditoriaFuncionalidade_empresaId_chave_createdAt_idx" ON "AuditoriaFuncionalidade"("empresaId", "chave", "createdAt");
CREATE INDEX "AuditoriaFuncionalidade_funcionalidadeId_createdAt_idx" ON "AuditoriaFuncionalidade"("funcionalidadeId", "createdAt");
CREATE INDEX "AuditoriaFuncionalidade_usuarioId_createdAt_idx" ON "AuditoriaFuncionalidade"("usuarioId", "createdAt");
CREATE TABLE "new_AutomacaoAcaoJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "execucaoId" INTEGER NOT NULL,
    "indice" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "resultadoJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomacaoAcaoJob_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoAcaoJob_empresaId_execucaoId_fkey" FOREIGN KEY ("empresaId", "execucaoId") REFERENCES "AutomacaoExecucao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_AutomacaoAcaoJob" ("actionKey", "createdAt", "empresaId", "erroCodigo", "erroResumo", "execucaoId", "id", "indice", "leaseExpiresAt", "leaseOwner", "nextAttemptAt", "resultadoJson", "status", "tentativas", "tipo", "updatedAt") SELECT "actionKey", "createdAt", "empresaId", "erroCodigo", "erroResumo", "execucaoId", "id", "indice", "leaseExpiresAt", "leaseOwner", "nextAttemptAt", "resultadoJson", "status", "tentativas", "tipo", "updatedAt" FROM "AutomacaoAcaoJob";
DROP TABLE "AutomacaoAcaoJob";
ALTER TABLE "new_AutomacaoAcaoJob" RENAME TO "AutomacaoAcaoJob";
CREATE INDEX "AutomacaoAcaoJob_empresaId_status_nextAttemptAt_idx" ON "AutomacaoAcaoJob"("empresaId", "status", "nextAttemptAt");
CREATE INDEX "AutomacaoAcaoJob_empresaId_execucaoId_indice_idx" ON "AutomacaoAcaoJob"("empresaId", "execucaoId", "indice");
CREATE INDEX "AutomacaoAcaoJob_empresaId_leaseExpiresAt_idx" ON "AutomacaoAcaoJob"("empresaId", "leaseExpiresAt");
CREATE UNIQUE INDEX "AutomacaoAcaoJob_empresaId_actionKey_key" ON "AutomacaoAcaoJob"("empresaId", "actionKey");
CREATE TABLE "new_AutomacaoEventoInterno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "execucaoId" INTEGER,
    "leadId" INTEGER,
    "negocioId" INTEGER,
    "acompanhamentoId" INTEGER,
    "autorId" INTEGER,
    "tipo" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "payloadJson" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomacaoEventoInterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoEventoInterno_empresaId_execucaoId_fkey" FOREIGN KEY ("empresaId", "execucaoId") REFERENCES "AutomacaoExecucao" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AutomacaoEventoInterno_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AutomacaoEventoInterno_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AutomacaoEventoInterno_empresaId_acompanhamentoId_fkey" FOREIGN KEY ("empresaId", "acompanhamentoId") REFERENCES "Acompanhamento" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AutomacaoEventoInterno_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_AutomacaoEventoInterno" ("acompanhamentoId", "autorId", "createdAt", "empresaId", "execucaoId", "id", "idempotencyKey", "leadId", "negocioId", "payloadJson", "resumo", "tipo") SELECT "acompanhamentoId", "autorId", "createdAt", "empresaId", "execucaoId", "id", "idempotencyKey", "leadId", "negocioId", "payloadJson", "resumo", "tipo" FROM "AutomacaoEventoInterno";
DROP TABLE "AutomacaoEventoInterno";
ALTER TABLE "new_AutomacaoEventoInterno" RENAME TO "AutomacaoEventoInterno";
CREATE INDEX "AutomacaoEventoInterno_empresaId_createdAt_idx" ON "AutomacaoEventoInterno"("empresaId", "createdAt");
CREATE INDEX "AutomacaoEventoInterno_empresaId_leadId_idx" ON "AutomacaoEventoInterno"("empresaId", "leadId");
CREATE INDEX "AutomacaoEventoInterno_empresaId_negocioId_idx" ON "AutomacaoEventoInterno"("empresaId", "negocioId");
CREATE INDEX "AutomacaoEventoInterno_empresaId_acompanhamentoId_idx" ON "AutomacaoEventoInterno"("empresaId", "acompanhamentoId");
CREATE UNIQUE INDEX "AutomacaoEventoInterno_empresaId_idempotencyKey_key" ON "AutomacaoEventoInterno"("empresaId", "idempotencyKey");
CREATE TABLE "new_AutomacaoExecucao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "regraId" INTEGER NOT NULL,
    "regraVersao" INTEGER NOT NULL,
    "regraSnapshotJson" TEXT NOT NULL,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "negocioId" INTEGER,
    "occurrenceKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEm" DATETIME,
    "concluidaEm" DATETIME,
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "resumoJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomacaoExecucao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoExecucao_empresaId_regraId_fkey" FOREIGN KEY ("empresaId", "regraId") REFERENCES "AutomacaoRegra" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "AutomacaoExecucao_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AutomacaoExecucao_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_AutomacaoExecucao" ("concluidaEm", "createdAt", "empresaId", "entidadeId", "entidadeTipo", "erroCodigo", "erroResumo", "id", "idempotencyKey", "iniciadaEm", "leadId", "negocioId", "occurrenceKey", "regraId", "regraSnapshotJson", "regraVersao", "resumoJson", "status", "tentativas", "updatedAt") SELECT "concluidaEm", "createdAt", "empresaId", "entidadeId", "entidadeTipo", "erroCodigo", "erroResumo", "id", "idempotencyKey", "iniciadaEm", "leadId", "negocioId", "occurrenceKey", "regraId", "regraSnapshotJson", "regraVersao", "resumoJson", "status", "tentativas", "updatedAt" FROM "AutomacaoExecucao";
DROP TABLE "AutomacaoExecucao";
ALTER TABLE "new_AutomacaoExecucao" RENAME TO "AutomacaoExecucao";
CREATE INDEX "AutomacaoExecucao_empresaId_status_createdAt_idx" ON "AutomacaoExecucao"("empresaId", "status", "createdAt");
CREATE INDEX "AutomacaoExecucao_empresaId_entidadeTipo_entidadeId_idx" ON "AutomacaoExecucao"("empresaId", "entidadeTipo", "entidadeId");
CREATE INDEX "AutomacaoExecucao_empresaId_leadId_idx" ON "AutomacaoExecucao"("empresaId", "leadId");
CREATE INDEX "AutomacaoExecucao_empresaId_negocioId_idx" ON "AutomacaoExecucao"("empresaId", "negocioId");
CREATE UNIQUE INDEX "AutomacaoExecucao_empresaId_regraId_occurrenceKey_key" ON "AutomacaoExecucao"("empresaId", "regraId", "occurrenceKey");
CREATE UNIQUE INDEX "AutomacaoExecucao_empresaId_id_key" ON "AutomacaoExecucao"("empresaId", "id");
CREATE UNIQUE INDEX "AutomacaoExecucao_empresaId_idempotencyKey_key" ON "AutomacaoExecucao"("empresaId", "idempotencyKey");
CREATE TABLE "new_AutomacaoRegra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "prioridade" INTEGER NOT NULL DEFAULT 100,
    "gatilho" TEXT NOT NULL,
    "condicoesJson" TEXT NOT NULL DEFAULT '[]',
    "acoesJson" TEXT NOT NULL DEFAULT '[]',
    "timezone" TEXT NOT NULL,
    "janelaJson" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "activatedAt" DATETIME,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomacaoRegra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoRegra_empresaId_createdById_fkey" FOREIGN KEY ("empresaId", "createdById") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AutomacaoRegra_empresaId_updatedById_fkey" FOREIGN KEY ("empresaId", "updatedById") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_AutomacaoRegra" ("acoesJson", "activatedAt", "ativa", "condicoesJson", "createdAt", "createdById", "descricao", "empresaId", "gatilho", "id", "janelaJson", "nome", "prioridade", "timezone", "updatedAt", "updatedById", "versao") SELECT "acoesJson", "activatedAt", "ativa", "condicoesJson", "createdAt", "createdById", "descricao", "empresaId", "gatilho", "id", "janelaJson", "nome", "prioridade", "timezone", "updatedAt", "updatedById", "versao" FROM "AutomacaoRegra";
DROP TABLE "AutomacaoRegra";
ALTER TABLE "new_AutomacaoRegra" RENAME TO "AutomacaoRegra";
CREATE INDEX "AutomacaoRegra_empresaId_ativa_prioridade_idx" ON "AutomacaoRegra"("empresaId", "ativa", "prioridade");
CREATE INDEX "AutomacaoRegra_empresaId_gatilho_ativa_idx" ON "AutomacaoRegra"("empresaId", "gatilho", "ativa");
CREATE INDEX "AutomacaoRegra_empresaId_activatedAt_idx" ON "AutomacaoRegra"("empresaId", "activatedAt");
CREATE UNIQUE INDEX "AutomacaoRegra_empresaId_id_key" ON "AutomacaoRegra"("empresaId", "id");
CREATE TABLE "new_AutomacaoRoundRobinEstado" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "regraId" INTEGER NOT NULL,
    "ultimoResponsavelId" INTEGER,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomacaoRoundRobinEstado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoRoundRobinEstado_empresaId_regraId_fkey" FOREIGN KEY ("empresaId", "regraId") REFERENCES "AutomacaoRegra" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "AutomacaoRoundRobinEstado_empresaId_ultimoResponsavelId_fkey" FOREIGN KEY ("empresaId", "ultimoResponsavelId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_AutomacaoRoundRobinEstado" ("empresaId", "id", "regraId", "revisao", "ultimoResponsavelId", "updatedAt") SELECT "empresaId", "id", "regraId", "revisao", "ultimoResponsavelId", "updatedAt" FROM "AutomacaoRoundRobinEstado";
DROP TABLE "AutomacaoRoundRobinEstado";
ALTER TABLE "new_AutomacaoRoundRobinEstado" RENAME TO "AutomacaoRoundRobinEstado";
CREATE UNIQUE INDEX "AutomacaoRoundRobinEstado_regraId_key" ON "AutomacaoRoundRobinEstado"("regraId");
CREATE INDEX "AutomacaoRoundRobinEstado_empresaId_ultimoResponsavelId_idx" ON "AutomacaoRoundRobinEstado"("empresaId", "ultimoResponsavelId");
CREATE UNIQUE INDEX "AutomacaoRoundRobinEstado_empresaId_regraId_key" ON "AutomacaoRoundRobinEstado"("empresaId", "regraId");
CREATE TABLE "new_CondicaoPagamentoExterna" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parcelas" INTEGER,
    "valorMinimoCentavos" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "sincronizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CondicaoPagamentoExterna_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CondicaoPagamentoExterna_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_CondicaoPagamentoExterna" ("ativo", "createdAt", "empresaId", "externalId", "id", "integracaoId", "nome", "parcelas", "sincronizadoEm", "updatedAt", "valorMinimoCentavos") SELECT "ativo", "createdAt", "empresaId", "externalId", "id", "integracaoId", "nome", "parcelas", "sincronizadoEm", "updatedAt", "valorMinimoCentavos" FROM "CondicaoPagamentoExterna";
DROP TABLE "CondicaoPagamentoExterna";
ALTER TABLE "new_CondicaoPagamentoExterna" RENAME TO "CondicaoPagamentoExterna";
CREATE INDEX "CondicaoPagamentoExterna_empresaId_idx" ON "CondicaoPagamentoExterna"("empresaId");
CREATE INDEX "CondicaoPagamentoExterna_integracaoId_idx" ON "CondicaoPagamentoExterna"("integracaoId");
CREATE INDEX "CondicaoPagamentoExterna_ativo_idx" ON "CondicaoPagamentoExterna"("ativo");
CREATE UNIQUE INDEX "CondicaoPagamentoExterna_integracaoId_externalId_key" ON "CondicaoPagamentoExterna"("integracaoId", "externalId");
CREATE TABLE "new_ContatoCanal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "clienteId" INTEGER,
    "externalId" TEXT NOT NULL,
    "telefoneNormalizado" TEXT,
    "nome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContatoCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContatoCanal_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "ContatoCanal_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_ContatoCanal" ("canalIntegracaoId", "clienteId", "createdAt", "empresaId", "externalId", "id", "nome", "telefoneNormalizado", "updatedAt") SELECT "canalIntegracaoId", "clienteId", "createdAt", "empresaId", "externalId", "id", "nome", "telefoneNormalizado", "updatedAt" FROM "ContatoCanal";
DROP TABLE "ContatoCanal";
ALTER TABLE "new_ContatoCanal" RENAME TO "ContatoCanal";
CREATE INDEX "ContatoCanal_empresaId_idx" ON "ContatoCanal"("empresaId");
CREATE INDEX "ContatoCanal_canalIntegracaoId_idx" ON "ContatoCanal"("canalIntegracaoId");
CREATE INDEX "ContatoCanal_empresaId_telefoneNormalizado_idx" ON "ContatoCanal"("empresaId", "telefoneNormalizado");
CREATE INDEX "ContatoCanal_empresaId_clienteId_idx" ON "ContatoCanal"("empresaId", "clienteId");
CREATE UNIQUE INDEX "ContatoCanal_canalIntegracaoId_externalId_key" ON "ContatoCanal"("canalIntegracaoId", "externalId");
CREATE UNIQUE INDEX "ContatoCanal_empresaId_id_key" ON "ContatoCanal"("empresaId", "id");
CREATE TABLE "new_ConversaCanal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "contatoCanalId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "responsavelId" INTEGER,
    "respostaReservadaPorId" INTEGER,
    "respostaReservadaAte" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "chaveAberta" TEXT,
    "emailThreadKey" TEXT,
    "emailSubject" TEXT,
    "primeiraMensagemEm" DATETIME,
    "ultimaMensagemEm" DATETIME,
    "primeiraRespostaHumanaEm" DATETIME,
    "aguardandoDesde" DATETIME,
    "encerradaEm" DATETIME,
    "reabertaEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConversaCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConversaCanal_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "ConversaCanal_empresaId_contatoCanalId_fkey" FOREIGN KEY ("empresaId", "contatoCanalId") REFERENCES "ContatoCanal" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "ConversaCanal_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ConversaCanal_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ConversaCanal_empresaId_respostaReservadaPorId_fkey" FOREIGN KEY ("empresaId", "respostaReservadaPorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_ConversaCanal" ("aguardandoDesde", "canalIntegracaoId", "chaveAberta", "contatoCanalId", "createdAt", "emailSubject", "emailThreadKey", "empresaId", "encerradaEm", "id", "leadId", "primeiraMensagemEm", "primeiraRespostaHumanaEm", "reabertaEm", "responsavelId", "respostaReservadaAte", "respostaReservadaPorId", "status", "ultimaMensagemEm", "updatedAt") SELECT "aguardandoDesde", "canalIntegracaoId", "chaveAberta", "contatoCanalId", "createdAt", "emailSubject", "emailThreadKey", "empresaId", "encerradaEm", "id", "leadId", "primeiraMensagemEm", "primeiraRespostaHumanaEm", "reabertaEm", "responsavelId", "respostaReservadaAte", "respostaReservadaPorId", "status", "ultimaMensagemEm", "updatedAt" FROM "ConversaCanal";
DROP TABLE "ConversaCanal";
ALTER TABLE "new_ConversaCanal" RENAME TO "ConversaCanal";
CREATE UNIQUE INDEX "ConversaCanal_chaveAberta_key" ON "ConversaCanal"("chaveAberta");
CREATE UNIQUE INDEX "ConversaCanal_emailThreadKey_key" ON "ConversaCanal"("emailThreadKey");
CREATE INDEX "ConversaCanal_empresaId_idx" ON "ConversaCanal"("empresaId");
CREATE INDEX "ConversaCanal_canalIntegracaoId_idx" ON "ConversaCanal"("canalIntegracaoId");
CREATE INDEX "ConversaCanal_contatoCanalId_idx" ON "ConversaCanal"("contatoCanalId");
CREATE INDEX "ConversaCanal_status_idx" ON "ConversaCanal"("status");
CREATE INDEX "ConversaCanal_ultimaMensagemEm_idx" ON "ConversaCanal"("ultimaMensagemEm");
CREATE INDEX "ConversaCanal_empresaId_status_aguardandoDesde_idx" ON "ConversaCanal"("empresaId", "status", "aguardandoDesde");
CREATE INDEX "ConversaCanal_empresaId_responsavelId_status_idx" ON "ConversaCanal"("empresaId", "responsavelId", "status");
CREATE INDEX "ConversaCanal_empresaId_respostaReservadaPorId_idx" ON "ConversaCanal"("empresaId", "respostaReservadaPorId");
CREATE INDEX "ConversaCanal_empresaId_respostaReservadaAte_idx" ON "ConversaCanal"("empresaId", "respostaReservadaAte");
CREATE INDEX "ConversaCanal_empresaId_leadId_idx" ON "ConversaCanal"("empresaId", "leadId");
CREATE INDEX "ConversaCanal_empresaId_emailThreadKey_idx" ON "ConversaCanal"("empresaId", "emailThreadKey");
CREATE UNIQUE INDEX "ConversaCanal_empresaId_id_key" ON "ConversaCanal"("empresaId", "id");
CREATE TABLE "new_EmailMailboxAddress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "addressNormalized" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "primarySlot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailMailboxAddress_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailMailboxAddress_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_EmailMailboxAddress" ("addressNormalized", "canalIntegracaoId", "createdAt", "empresaId", "id", "kind", "primarySlot", "updatedAt") SELECT "addressNormalized", "canalIntegracaoId", "createdAt", "empresaId", "id", "kind", "primarySlot", "updatedAt" FROM "EmailMailboxAddress";
DROP TABLE "EmailMailboxAddress";
ALTER TABLE "new_EmailMailboxAddress" RENAME TO "EmailMailboxAddress";
CREATE UNIQUE INDEX "EmailMailboxAddress_addressNormalized_key" ON "EmailMailboxAddress"("addressNormalized");
CREATE UNIQUE INDEX "EmailMailboxAddress_primarySlot_key" ON "EmailMailboxAddress"("primarySlot");
CREATE INDEX "EmailMailboxAddress_empresaId_idx" ON "EmailMailboxAddress"("empresaId");
CREATE INDEX "EmailMailboxAddress_canalIntegracaoId_idx" ON "EmailMailboxAddress"("canalIntegracaoId");
CREATE INDEX "EmailMailboxAddress_canalIntegracaoId_kind_idx" ON "EmailMailboxAddress"("canalIntegracaoId", "kind");
CREATE TABLE "new_EmailMessageMetadata" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "mensagemCanalId" INTEGER NOT NULL,
    "messageId" TEXT,
    "providerMessageId" TEXT,
    "providerThreadId" TEXT,
    "threadKey" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "referencesJson" TEXT NOT NULL DEFAULT '[]',
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toJson" TEXT NOT NULL DEFAULT '[]',
    "ccJson" TEXT NOT NULL DEFAULT '[]',
    "bccCount" INTEGER NOT NULL DEFAULT 0,
    "replyTo" TEXT,
    "subject" TEXT,
    "htmlSanitized" TEXT,
    "attachmentsJson" TEXT NOT NULL DEFAULT '[]',
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "rawSize" INTEGER NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessageMetadata_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailMessageMetadata_empresaId_mensagemCanalId_fkey" FOREIGN KEY ("empresaId", "mensagemCanalId") REFERENCES "MensagemCanal" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_EmailMessageMetadata" ("attachmentCount", "attachmentsJson", "bccCount", "ccJson", "createdAt", "empresaId", "fromAddress", "fromName", "htmlSanitized", "id", "inReplyTo", "mensagemCanalId", "messageId", "providerMessageId", "providerThreadId", "rawSize", "receivedAt", "referencesJson", "replyTo", "subject", "threadKey", "toJson") SELECT "attachmentCount", "attachmentsJson", "bccCount", "ccJson", "createdAt", "empresaId", "fromAddress", "fromName", "htmlSanitized", "id", "inReplyTo", "mensagemCanalId", "messageId", "providerMessageId", "providerThreadId", "rawSize", "receivedAt", "referencesJson", "replyTo", "subject", "threadKey", "toJson" FROM "EmailMessageMetadata";
DROP TABLE "EmailMessageMetadata";
ALTER TABLE "new_EmailMessageMetadata" RENAME TO "EmailMessageMetadata";
CREATE UNIQUE INDEX "EmailMessageMetadata_mensagemCanalId_key" ON "EmailMessageMetadata"("mensagemCanalId");
CREATE INDEX "EmailMessageMetadata_empresaId_idx" ON "EmailMessageMetadata"("empresaId");
CREATE INDEX "EmailMessageMetadata_empresaId_threadKey_idx" ON "EmailMessageMetadata"("empresaId", "threadKey");
CREATE INDEX "EmailMessageMetadata_empresaId_messageId_idx" ON "EmailMessageMetadata"("empresaId", "messageId");
CREATE INDEX "EmailMessageMetadata_empresaId_providerMessageId_idx" ON "EmailMessageMetadata"("empresaId", "providerMessageId");
CREATE INDEX "EmailMessageMetadata_empresaId_providerThreadId_idx" ON "EmailMessageMetadata"("empresaId", "providerThreadId");
CREATE UNIQUE INDEX "EmailMessageMetadata_empresaId_mensagemCanalId_key" ON "EmailMessageMetadata"("empresaId", "mensagemCanalId");
CREATE TABLE "new_EmpresaFuncionalidade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "habilitada" BOOLEAN NOT NULL DEFAULT false,
    "habilitadoEm" DATETIME,
    "habilitadoPorUsuarioId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmpresaFuncionalidade_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmpresaFuncionalidade_empresaId_habilitadoPorUsuarioId_fkey" FOREIGN KEY ("empresaId", "habilitadoPorUsuarioId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_EmpresaFuncionalidade" ("chave", "createdAt", "empresaId", "habilitada", "habilitadoEm", "habilitadoPorUsuarioId", "id", "updatedAt") SELECT "chave", "createdAt", "empresaId", "habilitada", "habilitadoEm", "habilitadoPorUsuarioId", "id", "updatedAt" FROM "EmpresaFuncionalidade";
DROP TABLE "EmpresaFuncionalidade";
ALTER TABLE "new_EmpresaFuncionalidade" RENAME TO "EmpresaFuncionalidade";
CREATE INDEX "EmpresaFuncionalidade_empresaId_habilitada_idx" ON "EmpresaFuncionalidade"("empresaId", "habilitada");
CREATE INDEX "EmpresaFuncionalidade_habilitadoPorUsuarioId_idx" ON "EmpresaFuncionalidade"("habilitadoPorUsuarioId");
CREATE UNIQUE INDEX "EmpresaFuncionalidade_empresaId_chave_key" ON "EmpresaFuncionalidade"("empresaId", "chave");
CREATE UNIQUE INDEX "EmpresaFuncionalidade_empresaId_id_key" ON "EmpresaFuncionalidade"("empresaId", "id");
CREATE TABLE "new_ErroIntegracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "sincronizacaoId" INTEGER,
    "codigo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "detalhesSanitizados" TEXT,
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ErroIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ErroIntegracao_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "ErroIntegracao_empresaId_sincronizacaoId_fkey" FOREIGN KEY ("empresaId", "sincronizacaoId") REFERENCES "SincronizacaoIntegracao" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_ErroIntegracao" ("codigo", "createdAt", "detalhesSanitizados", "empresaId", "id", "integracaoId", "mensagem", "resolvedAt", "resolvido", "sincronizacaoId") SELECT "codigo", "createdAt", "detalhesSanitizados", "empresaId", "id", "integracaoId", "mensagem", "resolvedAt", "resolvido", "sincronizacaoId" FROM "ErroIntegracao";
DROP TABLE "ErroIntegracao";
ALTER TABLE "new_ErroIntegracao" RENAME TO "ErroIntegracao";
CREATE INDEX "ErroIntegracao_empresaId_idx" ON "ErroIntegracao"("empresaId");
CREATE INDEX "ErroIntegracao_integracaoId_idx" ON "ErroIntegracao"("integracaoId");
CREATE INDEX "ErroIntegracao_sincronizacaoId_idx" ON "ErroIntegracao"("sincronizacaoId");
CREATE INDEX "ErroIntegracao_resolvido_idx" ON "ErroIntegracao"("resolvido");
CREATE INDEX "ErroIntegracao_codigo_idx" ON "ErroIntegracao"("codigo");
CREATE TABLE "new_EstoqueExterno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "produtoExternoId" INTEGER NOT NULL,
    "localExternalId" TEXT,
    "localNome" TEXT,
    "quantidade" DECIMAL NOT NULL DEFAULT 0,
    "reservado" DECIMAL,
    "disponivel" DECIMAL NOT NULL DEFAULT 0,
    "sincronizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EstoqueExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EstoqueExterno_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "EstoqueExterno_empresaId_produtoExternoId_fkey" FOREIGN KEY ("empresaId", "produtoExternoId") REFERENCES "ProdutoExterno" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_EstoqueExterno" ("createdAt", "disponivel", "empresaId", "id", "integracaoId", "localExternalId", "localNome", "produtoExternoId", "quantidade", "reservado", "sincronizadoEm", "updatedAt") SELECT "createdAt", "disponivel", "empresaId", "id", "integracaoId", "localExternalId", "localNome", "produtoExternoId", "quantidade", "reservado", "sincronizadoEm", "updatedAt" FROM "EstoqueExterno";
DROP TABLE "EstoqueExterno";
ALTER TABLE "new_EstoqueExterno" RENAME TO "EstoqueExterno";
CREATE INDEX "EstoqueExterno_empresaId_idx" ON "EstoqueExterno"("empresaId");
CREATE INDEX "EstoqueExterno_integracaoId_idx" ON "EstoqueExterno"("integracaoId");
CREATE INDEX "EstoqueExterno_produtoExternoId_idx" ON "EstoqueExterno"("produtoExternoId");
CREATE INDEX "EstoqueExterno_localExternalId_idx" ON "EstoqueExterno"("localExternalId");
CREATE TABLE "new_EventoWebhook" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "provedor" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "tipoEvento" TEXT,
    "payloadHash" TEXT,
    "payloadJson" TEXT,
    "statusProcessamento" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "recebidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" DATETIME,
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventoWebhook_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventoWebhook_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_EventoWebhook" ("canalIntegracaoId", "createdAt", "empresaId", "erroCodigo", "erroResumo", "externalEventId", "id", "payloadHash", "payloadJson", "processadoEm", "provedor", "recebidoEm", "statusProcessamento", "tentativas", "tipoEvento", "updatedAt") SELECT "canalIntegracaoId", "createdAt", "empresaId", "erroCodigo", "erroResumo", "externalEventId", "id", "payloadHash", "payloadJson", "processadoEm", "provedor", "recebidoEm", "statusProcessamento", "tentativas", "tipoEvento", "updatedAt" FROM "EventoWebhook";
DROP TABLE "EventoWebhook";
ALTER TABLE "new_EventoWebhook" RENAME TO "EventoWebhook";
CREATE INDEX "EventoWebhook_empresaId_statusProcessamento_recebidoEm_idx" ON "EventoWebhook"("empresaId", "statusProcessamento", "recebidoEm");
CREATE INDEX "EventoWebhook_empresaId_canalIntegracaoId_recebidoEm_idx" ON "EventoWebhook"("empresaId", "canalIntegracaoId", "recebidoEm");
CREATE UNIQUE INDEX "EventoWebhook_empresaId_canalIntegracaoId_provedor_externalEventId_key" ON "EventoWebhook"("empresaId", "canalIntegracaoId", "provedor", "externalEventId");
CREATE TABLE "new_HistoricoAcompanhamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "acompanhamentoId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "statusAnterior" TEXT,
    "statusNovo" TEXT,
    "responsavelAnteriorId" INTEGER,
    "responsavelNovoId" INTEGER,
    "dataHoraAnterior" DATETIME,
    "dataHoraNova" DATETIME,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoAcompanhamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAcompanhamento_empresaId_acompanhamentoId_fkey" FOREIGN KEY ("empresaId", "acompanhamentoId") REFERENCES "Acompanhamento" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoAcompanhamento_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoAcompanhamento_empresaId_responsavelAnteriorId_fkey" FOREIGN KEY ("empresaId", "responsavelAnteriorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoAcompanhamento_empresaId_responsavelNovoId_fkey" FOREIGN KEY ("empresaId", "responsavelNovoId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_HistoricoAcompanhamento" ("acao", "acompanhamentoId", "autorId", "createdAt", "dataHoraAnterior", "dataHoraNova", "empresaId", "id", "observacao", "responsavelAnteriorId", "responsavelNovoId", "statusAnterior", "statusNovo") SELECT "acao", "acompanhamentoId", "autorId", "createdAt", "dataHoraAnterior", "dataHoraNova", "empresaId", "id", "observacao", "responsavelAnteriorId", "responsavelNovoId", "statusAnterior", "statusNovo" FROM "HistoricoAcompanhamento";
DROP TABLE "HistoricoAcompanhamento";
ALTER TABLE "new_HistoricoAcompanhamento" RENAME TO "HistoricoAcompanhamento";
CREATE INDEX "HistoricoAcompanhamento_empresaId_acompanhamentoId_createdAt_idx" ON "HistoricoAcompanhamento"("empresaId", "acompanhamentoId", "createdAt");
CREATE INDEX "HistoricoAcompanhamento_empresaId_autorId_createdAt_idx" ON "HistoricoAcompanhamento"("empresaId", "autorId", "createdAt");
CREATE TABLE "new_HistoricoAtribuicao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "conversaCanalId" INTEGER,
    "negocioId" INTEGER,
    "responsavelAnteriorId" INTEGER,
    "responsavelNovoId" INTEGER,
    "alteradoPorId" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT 'ATRIBUIR',
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "acaoAtendimento" TEXT,
    "estadoAnterior" TEXT,
    "estadoNovo" TEXT,
    "etapaAnterior" TEXT,
    "etapaNova" TEXT,
    "etapaEntrouEm" DATETIME,
    "etapaSaiuEm" DATETIME,
    "duracaoEtapaSegundos" INTEGER,
    "duracaoEtapaEstimada" BOOLEAN,
    "motivo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoAtribuicao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAtribuicao_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoAtribuicao_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoAtribuicao_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoAtribuicao_empresaId_responsavelAnteriorId_fkey" FOREIGN KEY ("empresaId", "responsavelAnteriorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoAtribuicao_empresaId_responsavelNovoId_fkey" FOREIGN KEY ("empresaId", "responsavelNovoId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoAtribuicao_empresaId_alteradoPorId_fkey" FOREIGN KEY ("empresaId", "alteradoPorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_HistoricoAtribuicao" ("acaoAtendimento", "alteradoPorId", "conversaCanalId", "createdAt", "duracaoEtapaEstimada", "duracaoEtapaSegundos", "empresaId", "estadoAnterior", "estadoNovo", "etapaAnterior", "etapaEntrouEm", "etapaNova", "etapaSaiuEm", "id", "leadId", "motivo", "negocioId", "origem", "responsavelAnteriorId", "responsavelNovoId", "tipo") SELECT "acaoAtendimento", "alteradoPorId", "conversaCanalId", "createdAt", "duracaoEtapaEstimada", "duracaoEtapaSegundos", "empresaId", "estadoAnterior", "estadoNovo", "etapaAnterior", "etapaEntrouEm", "etapaNova", "etapaSaiuEm", "id", "leadId", "motivo", "negocioId", "origem", "responsavelAnteriorId", "responsavelNovoId", "tipo" FROM "HistoricoAtribuicao";
DROP TABLE "HistoricoAtribuicao";
ALTER TABLE "new_HistoricoAtribuicao" RENAME TO "HistoricoAtribuicao";
CREATE INDEX "HistoricoAtribuicao_empresaId_leadId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "leadId", "createdAt");
CREATE INDEX "HistoricoAtribuicao_empresaId_conversaCanalId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "conversaCanalId", "createdAt");
CREATE INDEX "HistoricoAtribuicao_empresaId_negocioId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "negocioId", "createdAt");
CREATE INDEX "HistoricoAtribuicao_empresaId_responsavelNovoId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "responsavelNovoId", "createdAt");
CREATE TABLE "new_HistoricoPropostaComercial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "propostaId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "statusAnterior" TEXT,
    "statusNovo" TEXT,
    "versao" INTEGER NOT NULL,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoPropostaComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoPropostaComercial_empresaId_propostaId_fkey" FOREIGN KEY ("empresaId", "propostaId") REFERENCES "PropostaComercial" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoPropostaComercial_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_HistoricoPropostaComercial" ("acao", "autorId", "createdAt", "empresaId", "id", "observacao", "propostaId", "statusAnterior", "statusNovo", "versao") SELECT "acao", "autorId", "createdAt", "empresaId", "id", "observacao", "propostaId", "statusAnterior", "statusNovo", "versao" FROM "HistoricoPropostaComercial";
DROP TABLE "HistoricoPropostaComercial";
ALTER TABLE "new_HistoricoPropostaComercial" RENAME TO "HistoricoPropostaComercial";
CREATE INDEX "HistoricoPropostaComercial_empresaId_propostaId_createdAt_idx" ON "HistoricoPropostaComercial"("empresaId", "propostaId", "createdAt");
CREATE INDEX "HistoricoPropostaComercial_empresaId_autorId_createdAt_idx" ON "HistoricoPropostaComercial"("empresaId", "autorId", "createdAt");
CREATE TABLE "new_HistoricoQualificacaoConversa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "conversaCanalId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "negocioId" INTEGER,
    "autorId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "interesse" TEXT,
    "prioridade" TEXT,
    "valorEstimado" INTEGER,
    "proximaAcao" TEXT,
    "dataRetorno" DATETIME,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoQualificacaoConversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoQualificacaoConversa_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoQualificacaoConversa_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoQualificacaoConversa_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoQualificacaoConversa_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "HistoricoQualificacaoConversa_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_HistoricoQualificacaoConversa" ("acao", "autorId", "clienteId", "conversaCanalId", "createdAt", "dataRetorno", "empresaId", "id", "interesse", "leadId", "negocioId", "observacao", "prioridade", "proximaAcao", "valorEstimado") SELECT "acao", "autorId", "clienteId", "conversaCanalId", "createdAt", "dataRetorno", "empresaId", "id", "interesse", "leadId", "negocioId", "observacao", "prioridade", "proximaAcao", "valorEstimado" FROM "HistoricoQualificacaoConversa";
DROP TABLE "HistoricoQualificacaoConversa";
ALTER TABLE "new_HistoricoQualificacaoConversa" RENAME TO "HistoricoQualificacaoConversa";
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_conversaCanalId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "conversaCanalId", "createdAt");
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_clienteId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "clienteId", "createdAt");
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_leadId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "leadId", "createdAt");
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_negocioId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "negocioId", "createdAt");
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_autorId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "autorId", "createdAt");
CREATE TABLE "new_ImportacaoDados" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER,
    "formato" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVIADO',
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "hashArquivo" TEXT NOT NULL,
    "tipoEntidade" TEXT NOT NULL,
    "mapeamentoJson" TEXT,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "linhasValidas" INTEGER NOT NULL DEFAULT 0,
    "linhasComErro" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEm" DATETIME,
    "finalizadaEm" DATETIME,
    "createdByUsuarioId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportacaoDados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImportacaoDados_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ImportacaoDados_empresaId_createdByUsuarioId_fkey" FOREIGN KEY ("empresaId", "createdByUsuarioId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_ImportacaoDados" ("createdAt", "createdByUsuarioId", "empresaId", "finalizadaEm", "formato", "hashArquivo", "id", "iniciadaEm", "integracaoId", "linhasComErro", "linhasValidas", "mapeamentoJson", "nomeArquivo", "status", "tamanhoBytes", "tipoEntidade", "totalLinhas", "updatedAt") SELECT "createdAt", "createdByUsuarioId", "empresaId", "finalizadaEm", "formato", "hashArquivo", "id", "iniciadaEm", "integracaoId", "linhasComErro", "linhasValidas", "mapeamentoJson", "nomeArquivo", "status", "tamanhoBytes", "tipoEntidade", "totalLinhas", "updatedAt" FROM "ImportacaoDados";
DROP TABLE "ImportacaoDados";
ALTER TABLE "new_ImportacaoDados" RENAME TO "ImportacaoDados";
CREATE INDEX "ImportacaoDados_empresaId_idx" ON "ImportacaoDados"("empresaId");
CREATE INDEX "ImportacaoDados_integracaoId_idx" ON "ImportacaoDados"("integracaoId");
CREATE INDEX "ImportacaoDados_createdByUsuarioId_idx" ON "ImportacaoDados"("createdByUsuarioId");
CREATE INDEX "ImportacaoDados_status_idx" ON "ImportacaoDados"("status");
CREATE INDEX "ImportacaoDados_formato_idx" ON "ImportacaoDados"("formato");
CREATE INDEX "ImportacaoDados_hashArquivo_idx" ON "ImportacaoDados"("hashArquivo");
CREATE TABLE "new_IntegracaoOAuthState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "provedor" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegracaoOAuthState_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntegracaoOAuthState_empresaId_usuarioId_fkey" FOREIGN KEY ("empresaId", "usuarioId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_IntegracaoOAuthState" ("createdAt", "empresaId", "expiresAt", "id", "provedor", "stateHash", "usedAt", "usuarioId") SELECT "createdAt", "empresaId", "expiresAt", "id", "provedor", "stateHash", "usedAt", "usuarioId" FROM "IntegracaoOAuthState";
DROP TABLE "IntegracaoOAuthState";
ALTER TABLE "new_IntegracaoOAuthState" RENAME TO "IntegracaoOAuthState";
CREATE UNIQUE INDEX "IntegracaoOAuthState_stateHash_key" ON "IntegracaoOAuthState"("stateHash");
CREATE INDEX "IntegracaoOAuthState_empresaId_idx" ON "IntegracaoOAuthState"("empresaId");
CREATE INDEX "IntegracaoOAuthState_usuarioId_idx" ON "IntegracaoOAuthState"("usuarioId");
CREATE INDEX "IntegracaoOAuthState_provedor_idx" ON "IntegracaoOAuthState"("provedor");
CREATE INDEX "IntegracaoOAuthState_expiresAt_idx" ON "IntegracaoOAuthState"("expiresAt");
CREATE TABLE "new_Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "responsavelId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NOVO',
    "origem" TEXT,
    "campanha" TEXT,
    "interesse" TEXT,
    "paginaOrigem" TEXT,
    "aceitePoliticaPrivacidade" BOOLEAN,
    "versaoPoliticaPrivacidade" TEXT,
    "aceitePoliticaEm" DATETIME,
    "motivoDesqualificacao" TEXT,
    "qualificadoEm" DATETIME,
    "desqualificadoEm" DATETIME,
    "convertidoEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Lead_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_Lead" ("aceitePoliticaEm", "aceitePoliticaPrivacidade", "campanha", "clienteId", "convertidoEm", "createdAt", "desqualificadoEm", "empresaId", "id", "interesse", "motivoDesqualificacao", "origem", "paginaOrigem", "qualificadoEm", "responsavelId", "status", "updatedAt", "versaoPoliticaPrivacidade") SELECT "aceitePoliticaEm", "aceitePoliticaPrivacidade", "campanha", "clienteId", "convertidoEm", "createdAt", "desqualificadoEm", "empresaId", "id", "interesse", "motivoDesqualificacao", "origem", "paginaOrigem", "qualificadoEm", "responsavelId", "status", "updatedAt", "versaoPoliticaPrivacidade" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE INDEX "Lead_empresaId_status_idx" ON "Lead"("empresaId", "status");
CREATE INDEX "Lead_empresaId_responsavelId_status_idx" ON "Lead"("empresaId", "responsavelId", "status");
CREATE INDEX "Lead_empresaId_clienteId_idx" ON "Lead"("empresaId", "clienteId");
CREATE INDEX "Lead_empresaId_createdAt_idx" ON "Lead"("empresaId", "createdAt");
CREATE UNIQUE INDEX "Lead_empresaId_id_key" ON "Lead"("empresaId", "id");
CREATE TABLE "new_MensagemCanal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "conversaCanalId" INTEGER NOT NULL,
    "autorUsuarioId" INTEGER,
    "externalId" TEXT NOT NULL,
    "direcao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'TEXTO',
    "texto" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDA',
    "statusEntrega" TEXT,
    "enviadaEm" DATETIME,
    "entregueEm" DATETIME,
    "lidaEm" DATETIME,
    "falhouEm" DATETIME,
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MensagemCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MensagemCanal_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "MensagemCanal_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "MensagemCanal_empresaId_autorUsuarioId_fkey" FOREIGN KEY ("empresaId", "autorUsuarioId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_MensagemCanal" ("autorUsuarioId", "canalIntegracaoId", "conversaCanalId", "createdAt", "direcao", "empresaId", "entregueEm", "enviadaEm", "erroCodigo", "erroResumo", "externalId", "falhouEm", "id", "lidaEm", "simulada", "status", "statusEntrega", "texto", "tipo", "updatedAt") SELECT "autorUsuarioId", "canalIntegracaoId", "conversaCanalId", "createdAt", "direcao", "empresaId", "entregueEm", "enviadaEm", "erroCodigo", "erroResumo", "externalId", "falhouEm", "id", "lidaEm", "simulada", "status", "statusEntrega", "texto", "tipo", "updatedAt" FROM "MensagemCanal";
DROP TABLE "MensagemCanal";
ALTER TABLE "new_MensagemCanal" RENAME TO "MensagemCanal";
CREATE INDEX "MensagemCanal_empresaId_idx" ON "MensagemCanal"("empresaId");
CREATE INDEX "MensagemCanal_canalIntegracaoId_idx" ON "MensagemCanal"("canalIntegracaoId");
CREATE INDEX "MensagemCanal_conversaCanalId_idx" ON "MensagemCanal"("conversaCanalId");
CREATE INDEX "MensagemCanal_status_idx" ON "MensagemCanal"("status");
CREATE INDEX "MensagemCanal_empresaId_statusEntrega_idx" ON "MensagemCanal"("empresaId", "statusEntrega");
CREATE INDEX "MensagemCanal_empresaId_conversaCanalId_autorUsuarioId_idx" ON "MensagemCanal"("empresaId", "conversaCanalId", "autorUsuarioId");
CREATE INDEX "MensagemCanal_createdAt_idx" ON "MensagemCanal"("createdAt");
CREATE UNIQUE INDEX "MensagemCanal_canalIntegracaoId_externalId_key" ON "MensagemCanal"("canalIntegracaoId", "externalId");
CREATE UNIQUE INDEX "MensagemCanal_empresaId_id_key" ON "MensagemCanal"("empresaId", "id");
CREATE TABLE "new_Negocio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "legacyClienteId" INTEGER,
    "leadId" INTEGER,
    "responsavelId" INTEGER,
    "convertidoPorId" INTEGER,
    "statusLeadAnterior" TEXT,
    "titulo" TEXT,
    "observacao" TEXT,
    "etapa" TEXT NOT NULL DEFAULT 'NOVO',
    "valor" INTEGER,
    "motivoPerda" TEXT,
    "fechadoEm" DATETIME,
    "perdidoEm" DATETIME,
    "etapaEntrouEm" DATETIME,
    "ultimaMovimentacaoEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Negocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negocio_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Negocio_empresaId_legacyClienteId_fkey" FOREIGN KEY ("empresaId", "legacyClienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Negocio_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Negocio_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Negocio_empresaId_convertidoPorId_fkey" FOREIGN KEY ("empresaId", "convertidoPorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_Negocio" ("clienteId", "convertidoPorId", "createdAt", "empresaId", "etapa", "etapaEntrouEm", "fechadoEm", "id", "leadId", "legacyClienteId", "motivoPerda", "observacao", "perdidoEm", "responsavelId", "statusLeadAnterior", "titulo", "ultimaMovimentacaoEm", "updatedAt", "valor") SELECT "clienteId", "convertidoPorId", "createdAt", "empresaId", "etapa", "etapaEntrouEm", "fechadoEm", "id", "leadId", "legacyClienteId", "motivoPerda", "observacao", "perdidoEm", "responsavelId", "statusLeadAnterior", "titulo", "ultimaMovimentacaoEm", "updatedAt", "valor" FROM "Negocio";
DROP TABLE "Negocio";
ALTER TABLE "new_Negocio" RENAME TO "Negocio";
CREATE UNIQUE INDEX "Negocio_legacyClienteId_key" ON "Negocio"("legacyClienteId");
CREATE UNIQUE INDEX "Negocio_leadId_key" ON "Negocio"("leadId");
CREATE INDEX "Negocio_empresaId_etapa_idx" ON "Negocio"("empresaId", "etapa");
CREATE INDEX "Negocio_empresaId_responsavelId_etapa_idx" ON "Negocio"("empresaId", "responsavelId", "etapa");
CREATE INDEX "Negocio_empresaId_clienteId_idx" ON "Negocio"("empresaId", "clienteId");
CREATE INDEX "Negocio_empresaId_leadId_idx" ON "Negocio"("empresaId", "leadId");
CREATE INDEX "Negocio_empresaId_legacyClienteId_idx" ON "Negocio"("empresaId", "legacyClienteId");
CREATE INDEX "Negocio_empresaId_convertidoPorId_createdAt_idx" ON "Negocio"("empresaId", "convertidoPorId", "createdAt");
CREATE UNIQUE INDEX "Negocio_empresaId_id_key" ON "Negocio"("empresaId", "id");
CREATE TABLE "new_Nota" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'nota',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clienteId" INTEGER NOT NULL,
    CONSTRAINT "Nota_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Nota_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_Nota" ("clienteId", "createdAt", "empresaId", "id", "texto", "tipo") SELECT "clienteId", "createdAt", "empresaId", "id", "texto", "tipo" FROM "Nota";
DROP TABLE "Nota";
ALTER TABLE "new_Nota" RENAME TO "Nota";
CREATE INDEX "Nota_empresaId_idx" ON "Nota"("empresaId");
CREATE INDEX "Nota_clienteId_idx" ON "Nota"("clienteId");
CREATE INDEX "Nota_empresaId_clienteId_idx" ON "Nota"("empresaId", "clienteId");
CREATE INDEX "Nota_empresaId_createdAt_idx" ON "Nota"("empresaId", "createdAt");
CREATE TABLE "new_NotaInternaConversa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "conversaCanalId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotaInternaConversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NotaInternaConversa_empresaId_conversaCanalId_fkey" FOREIGN KEY ("empresaId", "conversaCanalId") REFERENCES "ConversaCanal" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "NotaInternaConversa_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_NotaInternaConversa" ("autorId", "conteudo", "conversaCanalId", "createdAt", "empresaId", "id", "sistema", "updatedAt") SELECT "autorId", "conteudo", "conversaCanalId", "createdAt", "empresaId", "id", "sistema", "updatedAt" FROM "NotaInternaConversa";
DROP TABLE "NotaInternaConversa";
ALTER TABLE "new_NotaInternaConversa" RENAME TO "NotaInternaConversa";
CREATE INDEX "NotaInternaConversa_empresaId_conversaCanalId_createdAt_idx" ON "NotaInternaConversa"("empresaId", "conversaCanalId", "createdAt");
CREATE INDEX "NotaInternaConversa_empresaId_autorId_createdAt_idx" ON "NotaInternaConversa"("empresaId", "autorId", "createdAt");
CREATE TABLE "new_PlatformTenantAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "actorUserId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "adminUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformTenantAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlatformTenantAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlatformTenantAudit_tenantId_adminUserId_fkey" FOREIGN KEY ("tenantId", "adminUserId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_PlatformTenantAudit" ("action", "actorUserId", "adminUserId", "createdAt", "id", "tenantId", "tenantName", "tenantSlug") SELECT "action", "actorUserId", "adminUserId", "createdAt", "id", "tenantId", "tenantName", "tenantSlug" FROM "PlatformTenantAudit";
DROP TABLE "PlatformTenantAudit";
ALTER TABLE "new_PlatformTenantAudit" RENAME TO "PlatformTenantAudit";
CREATE INDEX "PlatformTenantAudit_tenantId_createdAt_idx" ON "PlatformTenantAudit"("tenantId", "createdAt");
CREATE INDEX "PlatformTenantAudit_actorUserId_createdAt_idx" ON "PlatformTenantAudit"("actorUserId", "createdAt");
CREATE INDEX "PlatformTenantAudit_action_createdAt_idx" ON "PlatformTenantAudit"("action", "createdAt");
CREATE TABLE "new_PrecoExterno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "produtoExternoId" INTEGER NOT NULL,
    "tabela" TEXT,
    "precoCentavos" INTEGER NOT NULL,
    "precoPromocionalCentavos" INTEGER,
    "inicioPromocao" DATETIME,
    "fimPromocao" DATETIME,
    "sincronizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrecoExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrecoExterno_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "PrecoExterno_empresaId_produtoExternoId_fkey" FOREIGN KEY ("empresaId", "produtoExternoId") REFERENCES "ProdutoExterno" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_PrecoExterno" ("createdAt", "empresaId", "fimPromocao", "id", "inicioPromocao", "integracaoId", "precoCentavos", "precoPromocionalCentavos", "produtoExternoId", "sincronizadoEm", "tabela", "updatedAt") SELECT "createdAt", "empresaId", "fimPromocao", "id", "inicioPromocao", "integracaoId", "precoCentavos", "precoPromocionalCentavos", "produtoExternoId", "sincronizadoEm", "tabela", "updatedAt" FROM "PrecoExterno";
DROP TABLE "PrecoExterno";
ALTER TABLE "new_PrecoExterno" RENAME TO "PrecoExterno";
CREATE INDEX "PrecoExterno_empresaId_idx" ON "PrecoExterno"("empresaId");
CREATE INDEX "PrecoExterno_integracaoId_idx" ON "PrecoExterno"("integracaoId");
CREATE INDEX "PrecoExterno_produtoExternoId_idx" ON "PrecoExterno"("produtoExternoId");
CREATE INDEX "PrecoExterno_tabela_idx" ON "PrecoExterno"("tabela");
CREATE TABLE "new_ProdutoExterno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "integracaoId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "sku" TEXT,
    "codigoBarras" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "marca" TEXT,
    "unidade" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dadosOriginaisJson" TEXT,
    "sincronizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProdutoExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProdutoExterno_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
INSERT INTO "new_ProdutoExterno" ("ativo", "categoria", "codigoBarras", "createdAt", "dadosOriginaisJson", "descricao", "empresaId", "externalId", "id", "integracaoId", "marca", "nome", "sincronizadoEm", "sku", "unidade", "updatedAt") SELECT "ativo", "categoria", "codigoBarras", "createdAt", "dadosOriginaisJson", "descricao", "empresaId", "externalId", "id", "integracaoId", "marca", "nome", "sincronizadoEm", "sku", "unidade", "updatedAt" FROM "ProdutoExterno";
DROP TABLE "ProdutoExterno";
ALTER TABLE "new_ProdutoExterno" RENAME TO "ProdutoExterno";
CREATE INDEX "ProdutoExterno_empresaId_idx" ON "ProdutoExterno"("empresaId");
CREATE INDEX "ProdutoExterno_integracaoId_idx" ON "ProdutoExterno"("integracaoId");
CREATE INDEX "ProdutoExterno_sku_idx" ON "ProdutoExterno"("sku");
CREATE INDEX "ProdutoExterno_codigoBarras_idx" ON "ProdutoExterno"("codigoBarras");
CREATE INDEX "ProdutoExterno_nome_idx" ON "ProdutoExterno"("nome");
CREATE INDEX "ProdutoExterno_categoria_idx" ON "ProdutoExterno"("categoria");
CREATE UNIQUE INDEX "ProdutoExterno_integracaoId_externalId_key" ON "ProdutoExterno"("integracaoId", "externalId");
CREATE UNIQUE INDEX "ProdutoExterno_empresaId_id_key" ON "ProdutoExterno"("empresaId", "id");
CREATE TABLE "new_PropostaComercial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "negocioId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "responsavelId" INTEGER,
    "autorId" INTEGER NOT NULL,
    "propostaOrigemId" INTEGER,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "descontoGeralCentavos" INTEGER NOT NULL DEFAULT 0,
    "subtotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL DEFAULT 0,
    "validade" DATETIME NOT NULL,
    "observacoes" TEXT,
    "condicoesComerciais" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PropostaComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PropostaComercial_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PropostaComercial_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PropostaComercial_empresaId_leadId_fkey" FOREIGN KEY ("empresaId", "leadId") REFERENCES "Lead" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PropostaComercial_empresaId_responsavelId_fkey" FOREIGN KEY ("empresaId", "responsavelId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PropostaComercial_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PropostaComercial_empresaId_propostaOrigemId_fkey" FOREIGN KEY ("empresaId", "propostaOrigemId") REFERENCES "PropostaComercial" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_PropostaComercial" ("autorId", "clienteId", "codigo", "condicoesComerciais", "createdAt", "descontoGeralCentavos", "descricao", "empresaId", "id", "leadId", "negocioId", "observacoes", "propostaOrigemId", "responsavelId", "revisao", "status", "subtotalCentavos", "titulo", "totalCentavos", "updatedAt", "validade", "versao") SELECT "autorId", "clienteId", "codigo", "condicoesComerciais", "createdAt", "descontoGeralCentavos", "descricao", "empresaId", "id", "leadId", "negocioId", "observacoes", "propostaOrigemId", "responsavelId", "revisao", "status", "subtotalCentavos", "titulo", "totalCentavos", "updatedAt", "validade", "versao" FROM "PropostaComercial";
DROP TABLE "PropostaComercial";
ALTER TABLE "new_PropostaComercial" RENAME TO "PropostaComercial";
CREATE INDEX "PropostaComercial_empresaId_clienteId_status_idx" ON "PropostaComercial"("empresaId", "clienteId", "status");
CREATE INDEX "PropostaComercial_empresaId_negocioId_status_idx" ON "PropostaComercial"("empresaId", "negocioId", "status");
CREATE INDEX "PropostaComercial_empresaId_leadId_status_idx" ON "PropostaComercial"("empresaId", "leadId", "status");
CREATE INDEX "PropostaComercial_empresaId_responsavelId_status_idx" ON "PropostaComercial"("empresaId", "responsavelId", "status");
CREATE UNIQUE INDEX "PropostaComercial_empresaId_codigo_key" ON "PropostaComercial"("empresaId", "codigo");
CREATE UNIQUE INDEX "PropostaComercial_empresaId_id_key" ON "PropostaComercial"("empresaId", "id");
CREATE UNIQUE INDEX "PropostaComercial_empresaId_propostaOrigemId_versao_key" ON "PropostaComercial"("empresaId", "propostaOrigemId", "versao");
CREATE TABLE "new_SincronizacaoIntegracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "integracaoId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "iniciadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" DATETIME,
    "itensRecebidos" INTEGER NOT NULL DEFAULT 0,
    "itensProcessados" INTEGER NOT NULL DEFAULT 0,
    "itensComErro" INTEGER NOT NULL DEFAULT 0,
    "mensagemErro" TEXT,
    "metadadosJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SincronizacaoIntegracao_empresaId_integracaoId_fkey" FOREIGN KEY ("empresaId", "integracaoId") REFERENCES "Integracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "SincronizacaoIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SincronizacaoIntegracao" ("createdAt", "empresaId", "finalizadaEm", "id", "iniciadaEm", "integracaoId", "itensComErro", "itensProcessados", "itensRecebidos", "mensagemErro", "metadadosJson", "origem", "status", "updatedAt") SELECT "createdAt", "empresaId", "finalizadaEm", "id", "iniciadaEm", "integracaoId", "itensComErro", "itensProcessados", "itensRecebidos", "mensagemErro", "metadadosJson", "origem", "status", "updatedAt" FROM "SincronizacaoIntegracao";
DROP TABLE "SincronizacaoIntegracao";
ALTER TABLE "new_SincronizacaoIntegracao" RENAME TO "SincronizacaoIntegracao";
CREATE INDEX "SincronizacaoIntegracao_empresaId_idx" ON "SincronizacaoIntegracao"("empresaId");
CREATE INDEX "SincronizacaoIntegracao_integracaoId_idx" ON "SincronizacaoIntegracao"("integracaoId");
CREATE INDEX "SincronizacaoIntegracao_status_idx" ON "SincronizacaoIntegracao"("status");
CREATE INDEX "SincronizacaoIntegracao_origem_idx" ON "SincronizacaoIntegracao"("origem");
CREATE INDEX "SincronizacaoIntegracao_iniciadaEm_idx" ON "SincronizacaoIntegracao"("iniciadaEm");
CREATE UNIQUE INDEX "SincronizacaoIntegracao_empresaId_id_key" ON "SincronizacaoIntegracao"("empresaId", "id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CanalIntegracao_empresaId_id_key" ON "CanalIntegracao"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_empresaId_id_key" ON "Cliente"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Integracao_empresaId_id_key" ON "Integracao"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_empresaId_id_key" ON "Usuario"("empresaId", "id");
