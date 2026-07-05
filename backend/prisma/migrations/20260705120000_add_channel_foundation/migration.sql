-- CreateTable
CREATE TABLE "CanalIntegracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chaveInterna" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'MODO_TESTE',
    "modoTeste" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanalIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContatoCanal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "telefoneNormalizado" TEXT,
    "nome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContatoCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContatoCanal_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversaCanal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "contatoCanalId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "chaveAberta" TEXT,
    "ultimaMensagemEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConversaCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConversaCanal_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConversaCanal_contatoCanalId_fkey" FOREIGN KEY ("contatoCanalId") REFERENCES "ContatoCanal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MensagemCanal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "conversaCanalId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "direcao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'TEXTO',
    "texto" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDA',
    "simulada" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MensagemCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MensagemCanal_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MensagemCanal_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CanalIntegracao_empresaId_chaveInterna_key" ON "CanalIntegracao"("empresaId", "chaveInterna");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_idx" ON "CanalIntegracao"("empresaId");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_tipo_idx" ON "CanalIntegracao"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_ativo_idx" ON "CanalIntegracao"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ContatoCanal_canalIntegracaoId_externalId_key" ON "ContatoCanal"("canalIntegracaoId", "externalId");

-- CreateIndex
CREATE INDEX "ContatoCanal_empresaId_idx" ON "ContatoCanal"("empresaId");

-- CreateIndex
CREATE INDEX "ContatoCanal_canalIntegracaoId_idx" ON "ContatoCanal"("canalIntegracaoId");

-- CreateIndex
CREATE INDEX "ContatoCanal_empresaId_telefoneNormalizado_idx" ON "ContatoCanal"("empresaId", "telefoneNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "ConversaCanal_chaveAberta_key" ON "ConversaCanal"("chaveAberta");

-- CreateIndex
CREATE INDEX "ConversaCanal_empresaId_idx" ON "ConversaCanal"("empresaId");

-- CreateIndex
CREATE INDEX "ConversaCanal_canalIntegracaoId_idx" ON "ConversaCanal"("canalIntegracaoId");

-- CreateIndex
CREATE INDEX "ConversaCanal_contatoCanalId_idx" ON "ConversaCanal"("contatoCanalId");

-- CreateIndex
CREATE INDEX "ConversaCanal_status_idx" ON "ConversaCanal"("status");

-- CreateIndex
CREATE INDEX "ConversaCanal_ultimaMensagemEm_idx" ON "ConversaCanal"("ultimaMensagemEm");

-- CreateIndex
CREATE UNIQUE INDEX "MensagemCanal_canalIntegracaoId_externalId_key" ON "MensagemCanal"("canalIntegracaoId", "externalId");

-- CreateIndex
CREATE INDEX "MensagemCanal_empresaId_idx" ON "MensagemCanal"("empresaId");

-- CreateIndex
CREATE INDEX "MensagemCanal_canalIntegracaoId_idx" ON "MensagemCanal"("canalIntegracaoId");

-- CreateIndex
CREATE INDEX "MensagemCanal_conversaCanalId_idx" ON "MensagemCanal"("conversaCanalId");

-- CreateIndex
CREATE INDEX "MensagemCanal_status_idx" ON "MensagemCanal"("status");

-- CreateIndex
CREATE INDEX "MensagemCanal_createdAt_idx" ON "MensagemCanal"("createdAt");
