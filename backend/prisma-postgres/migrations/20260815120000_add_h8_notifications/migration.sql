BEGIN;

ALTER TABLE "Acompanhamento" ADD COLUMN "notificacaoAntecedenciaMinutos" INTEGER;

CREATE TABLE "Notificacao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "destinatarioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "origemTipo" TEXT NOT NULL,
    "origemId" INTEGER,
    "occurrenceKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT,
    "alvoTipo" TEXT NOT NULL,
    "alvoId" INTEGER,
    "alvoSubId" INTEGER,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "venceEm" TIMESTAMP(3),
    "lidaEm" TIMESTAMP(3),
    "resolvidaEm" TIMESTAMP(3),
    "adiadaAte" TIMESTAMP(3),
    "presentationVersion" INTEGER NOT NULL DEFAULT 1,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Notificacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notificacao_empresaId_destinatarioId_fkey" FOREIGN KEY ("empresaId", "destinatarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "Notificacao_empresaId_destinatarioId_occurrenceKey_key" ON "Notificacao"("empresaId", "destinatarioId", "occurrenceKey");
CREATE UNIQUE INDEX "Notificacao_empresaId_destinatarioId_dedupeKey_key" ON "Notificacao"("empresaId", "destinatarioId", "dedupeKey");
CREATE INDEX "Notificacao_empresaId_destinatarioId_resolvidaEm_lidaEm_idx" ON "Notificacao"("empresaId", "destinatarioId", "resolvidaEm", "lidaEm");
CREATE INDEX "Notificacao_empresaId_destinatarioId_adiadaAte_idx" ON "Notificacao"("empresaId", "destinatarioId", "adiadaAte");
CREATE INDEX "Notificacao_empresaId_ocorridoEm_idx" ON "Notificacao"("empresaId", "ocorridoEm");
CREATE INDEX "Notificacao_empresaId_origemTipo_origemId_idx" ON "Notificacao"("empresaId", "origemTipo", "origemId");

CREATE TABLE "ConfiguracaoNotificacaoEmpresa" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "diasSemContato" INTEGER NOT NULL DEFAULT 7,
    "diasProdutoDesatualizado" INTEGER NOT NULL DEFAULT 30,
    "diasAntesVencimento" INTEGER NOT NULL DEFAULT 7,
    "antecedenciaPadraoMinutos" INTEGER NOT NULL DEFAULT 30,
    "habilitada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConfiguracaoNotificacaoEmpresa_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConfiguracaoNotificacaoEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConfiguracaoNotificacaoEmpresa_empresaId_key" ON "ConfiguracaoNotificacaoEmpresa"("empresaId");

CREATE TABLE "PreferenciaNotificacaoUsuario" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "antecedenciaPadraoMinutos" INTEGER NOT NULL DEFAULT 30,
    "habilitada" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PreferenciaNotificacaoUsuario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PreferenciaNotificacaoUsuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreferenciaNotificacaoUsuario_empresaId_usuarioId_fkey" FOREIGN KEY ("empresaId", "usuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "PreferenciaNotificacaoUsuario_empresaId_usuarioId_key" ON "PreferenciaNotificacaoUsuario"("empresaId", "usuarioId");
CREATE INDEX "PreferenciaNotificacaoUsuario_empresaId_usuarioId_idx" ON "PreferenciaNotificacaoUsuario"("empresaId", "usuarioId");

COMMIT;
