-- AlterTable
ALTER TABLE "MensagemCanal" ADD COLUMN "entregueEm" DATETIME;
ALTER TABLE "MensagemCanal" ADD COLUMN "enviadaEm" DATETIME;
ALTER TABLE "MensagemCanal" ADD COLUMN "erroCodigo" TEXT;
ALTER TABLE "MensagemCanal" ADD COLUMN "erroResumo" TEXT;
ALTER TABLE "MensagemCanal" ADD COLUMN "falhouEm" DATETIME;
ALTER TABLE "MensagemCanal" ADD COLUMN "lidaEm" DATETIME;
ALTER TABLE "MensagemCanal" ADD COLUMN "statusEntrega" TEXT;

-- CreateTable
CREATE TABLE "Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "responsavelId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NOVO',
    "origem" TEXT,
    "campanha" TEXT,
    "interesse" TEXT,
    "motivoDesqualificacao" TEXT,
    "qualificadoEm" DATETIME,
    "desqualificadoEm" DATETIME,
    "convertidoEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Negocio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "responsavelId" INTEGER,
    "etapa" TEXT NOT NULL DEFAULT 'NOVO',
    "valor" INTEGER,
    "motivoPerda" TEXT,
    "fechadoEm" DATETIME,
    "perdidoEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Negocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negocio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negocio_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Negocio_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotaInternaConversa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "conversaCanalId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotaInternaConversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NotaInternaConversa_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NotaInternaConversa_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HistoricoAtribuicao" (
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
    "motivo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoAtribuicao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAtribuicao_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAtribuicao_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAtribuicao_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAtribuicao_responsavelAnteriorId_fkey" FOREIGN KEY ("responsavelAnteriorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAtribuicao_responsavelNovoId_fkey" FOREIGN KEY ("responsavelNovoId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAtribuicao_alteradoPorId_fkey" FOREIGN KEY ("alteradoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventoWebhook" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "provedor" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "tipoEvento" TEXT,
    "payloadHash" TEXT,
    "statusProcessamento" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "recebidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" DATETIME,
    "erroCodigo" TEXT,
    "erroResumo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventoWebhook_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventoWebhook_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Acompanhamento" ADD COLUMN "leadId" INTEGER REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Acompanhamento" ADD COLUMN "conversaCanalId" INTEGER REFERENCES "ConversaCanal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Acompanhamento" ADD COLUMN "negocioId" INTEGER REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ContatoCanal" ADD COLUMN "clienteId" INTEGER REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ConversaCanal" ADD COLUMN "leadId" INTEGER REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversaCanal" ADD COLUMN "responsavelId" INTEGER REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversaCanal" ADD COLUMN "primeiraMensagemEm" DATETIME;
ALTER TABLE "ConversaCanal" ADD COLUMN "primeiraRespostaHumanaEm" DATETIME;
ALTER TABLE "ConversaCanal" ADD COLUMN "aguardandoDesde" DATETIME;
ALTER TABLE "ConversaCanal" ADD COLUMN "encerradaEm" DATETIME;
ALTER TABLE "ConversaCanal" ADD COLUMN "reabertaEm" DATETIME;

-- CreateIndex
CREATE INDEX "Acompanhamento_empresaId_leadId_idx" ON "Acompanhamento"("empresaId", "leadId");
CREATE INDEX "Acompanhamento_empresaId_conversaCanalId_idx" ON "Acompanhamento"("empresaId", "conversaCanalId");
CREATE INDEX "Acompanhamento_empresaId_negocioId_idx" ON "Acompanhamento"("empresaId", "negocioId");
CREATE INDEX "ContatoCanal_empresaId_clienteId_idx" ON "ContatoCanal"("empresaId", "clienteId");
CREATE INDEX "ConversaCanal_empresaId_status_aguardandoDesde_idx" ON "ConversaCanal"("empresaId", "status", "aguardandoDesde");
CREATE INDEX "ConversaCanal_empresaId_responsavelId_status_idx" ON "ConversaCanal"("empresaId", "responsavelId", "status");
CREATE INDEX "ConversaCanal_empresaId_leadId_idx" ON "ConversaCanal"("empresaId", "leadId");

-- CreateIndex
CREATE INDEX "Lead_empresaId_status_idx" ON "Lead"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Lead_empresaId_responsavelId_status_idx" ON "Lead"("empresaId", "responsavelId", "status");

-- CreateIndex
CREATE INDEX "Lead_empresaId_clienteId_idx" ON "Lead"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "Lead_empresaId_createdAt_idx" ON "Lead"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_etapa_idx" ON "Negocio"("empresaId", "etapa");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_responsavelId_etapa_idx" ON "Negocio"("empresaId", "responsavelId", "etapa");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_clienteId_idx" ON "Negocio"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "Negocio_empresaId_leadId_idx" ON "Negocio"("empresaId", "leadId");

-- CreateIndex
CREATE INDEX "NotaInternaConversa_empresaId_conversaCanalId_createdAt_idx" ON "NotaInternaConversa"("empresaId", "conversaCanalId", "createdAt");

-- CreateIndex
CREATE INDEX "NotaInternaConversa_empresaId_autorId_createdAt_idx" ON "NotaInternaConversa"("empresaId", "autorId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAtribuicao_empresaId_leadId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAtribuicao_empresaId_conversaCanalId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "conversaCanalId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAtribuicao_empresaId_negocioId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "negocioId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoricoAtribuicao_empresaId_responsavelNovoId_createdAt_idx" ON "HistoricoAtribuicao"("empresaId", "responsavelNovoId", "createdAt");

-- CreateIndex
CREATE INDEX "EventoWebhook_empresaId_statusProcessamento_recebidoEm_idx" ON "EventoWebhook"("empresaId", "statusProcessamento", "recebidoEm");

-- CreateIndex
CREATE INDEX "EventoWebhook_empresaId_canalIntegracaoId_recebidoEm_idx" ON "EventoWebhook"("empresaId", "canalIntegracaoId", "recebidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "EventoWebhook_empresaId_canalIntegracaoId_provedor_externalEventId_key" ON "EventoWebhook"("empresaId", "canalIntegracaoId", "provedor", "externalEventId");

-- CreateIndex
CREATE INDEX "MensagemCanal_empresaId_statusEntrega_idx" ON "MensagemCanal"("empresaId", "statusEntrega");
