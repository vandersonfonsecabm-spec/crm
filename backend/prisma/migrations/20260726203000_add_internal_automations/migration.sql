-- H7 - Automações internas do CRM

CREATE TABLE "AutomacaoRegra" (
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
    CONSTRAINT "AutomacaoRegra_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoRegra_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AutomacaoExecucao" (
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
    CONSTRAINT "AutomacaoExecucao_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "AutomacaoRegra" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoExecucao_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoExecucao_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AutomacaoAcaoJob" (
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
    CONSTRAINT "AutomacaoAcaoJob_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "AutomacaoExecucao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AutomacaoRoundRobinEstado" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "regraId" INTEGER NOT NULL,
    "ultimoResponsavelId" INTEGER,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomacaoRoundRobinEstado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoRoundRobinEstado_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "AutomacaoRegra" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AutomacaoEventoInterno" (
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
    CONSTRAINT "AutomacaoEventoInterno_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "AutomacaoExecucao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoEventoInterno_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoEventoInterno_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoEventoInterno_acompanhamentoId_fkey" FOREIGN KEY ("acompanhamentoId") REFERENCES "Acompanhamento" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomacaoEventoInterno_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AutomacaoRegra_empresaId_ativa_prioridade_idx" ON "AutomacaoRegra"("empresaId", "ativa", "prioridade");
CREATE INDEX "AutomacaoRegra_empresaId_gatilho_ativa_idx" ON "AutomacaoRegra"("empresaId", "gatilho", "ativa");
CREATE INDEX "AutomacaoRegra_empresaId_activatedAt_idx" ON "AutomacaoRegra"("empresaId", "activatedAt");

CREATE UNIQUE INDEX "AutomacaoExecucao_empresaId_regraId_occurrenceKey_key" ON "AutomacaoExecucao"("empresaId", "regraId", "occurrenceKey");
CREATE UNIQUE INDEX "AutomacaoExecucao_empresaId_idempotencyKey_key" ON "AutomacaoExecucao"("empresaId", "idempotencyKey");
CREATE INDEX "AutomacaoExecucao_empresaId_status_createdAt_idx" ON "AutomacaoExecucao"("empresaId", "status", "createdAt");
CREATE INDEX "AutomacaoExecucao_empresaId_entidadeTipo_entidadeId_idx" ON "AutomacaoExecucao"("empresaId", "entidadeTipo", "entidadeId");
CREATE INDEX "AutomacaoExecucao_empresaId_leadId_idx" ON "AutomacaoExecucao"("empresaId", "leadId");
CREATE INDEX "AutomacaoExecucao_empresaId_negocioId_idx" ON "AutomacaoExecucao"("empresaId", "negocioId");

CREATE UNIQUE INDEX "AutomacaoAcaoJob_empresaId_actionKey_key" ON "AutomacaoAcaoJob"("empresaId", "actionKey");
CREATE INDEX "AutomacaoAcaoJob_empresaId_status_nextAttemptAt_idx" ON "AutomacaoAcaoJob"("empresaId", "status", "nextAttemptAt");
CREATE INDEX "AutomacaoAcaoJob_empresaId_execucaoId_indice_idx" ON "AutomacaoAcaoJob"("empresaId", "execucaoId", "indice");
CREATE INDEX "AutomacaoAcaoJob_empresaId_leaseExpiresAt_idx" ON "AutomacaoAcaoJob"("empresaId", "leaseExpiresAt");

CREATE UNIQUE INDEX "AutomacaoRoundRobinEstado_regraId_key" ON "AutomacaoRoundRobinEstado"("regraId");
CREATE UNIQUE INDEX "AutomacaoRoundRobinEstado_empresaId_regraId_key" ON "AutomacaoRoundRobinEstado"("empresaId", "regraId");
CREATE INDEX "AutomacaoRoundRobinEstado_empresaId_ultimoResponsavelId_idx" ON "AutomacaoRoundRobinEstado"("empresaId", "ultimoResponsavelId");

CREATE UNIQUE INDEX "AutomacaoEventoInterno_empresaId_idempotencyKey_key" ON "AutomacaoEventoInterno"("empresaId", "idempotencyKey");
CREATE INDEX "AutomacaoEventoInterno_empresaId_createdAt_idx" ON "AutomacaoEventoInterno"("empresaId", "createdAt");
CREATE INDEX "AutomacaoEventoInterno_empresaId_leadId_idx" ON "AutomacaoEventoInterno"("empresaId", "leadId");
CREATE INDEX "AutomacaoEventoInterno_empresaId_negocioId_idx" ON "AutomacaoEventoInterno"("empresaId", "negocioId");
CREATE INDEX "AutomacaoEventoInterno_empresaId_acompanhamentoId_idx" ON "AutomacaoEventoInterno"("empresaId", "acompanhamentoId");
