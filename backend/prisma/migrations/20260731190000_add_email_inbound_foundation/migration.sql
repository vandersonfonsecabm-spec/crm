ALTER TABLE "CanalIntegracao" ADD COLUMN "emailProviderType" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "emailProviderAccountIdMasked" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "emailDisplayNameMasked" TEXT;

ALTER TABLE "ConversaCanal" ADD COLUMN "emailThreadKey" TEXT;
ALTER TABLE "ConversaCanal" ADD COLUMN "emailSubject" TEXT;

CREATE TABLE "EmailMailboxAddress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "addressNormalized" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "primarySlot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailMailboxAddress_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailMailboxAddress_canalIntegracaoId_fkey" FOREIGN KEY ("canalIntegracaoId") REFERENCES "CanalIntegracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EmailMessageMetadata" (
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
    CONSTRAINT "EmailMessageMetadata_mensagemCanalId_fkey" FOREIGN KEY ("mensagemCanalId") REFERENCES "MensagemCanal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmailMailboxAddress_addressNormalized_key" ON "EmailMailboxAddress"("addressNormalized");
CREATE UNIQUE INDEX "EmailMailboxAddress_primarySlot_key" ON "EmailMailboxAddress"("primarySlot");
CREATE INDEX "EmailMailboxAddress_empresaId_idx" ON "EmailMailboxAddress"("empresaId");
CREATE INDEX "EmailMailboxAddress_canalIntegracaoId_idx" ON "EmailMailboxAddress"("canalIntegracaoId");
CREATE INDEX "EmailMailboxAddress_canalIntegracaoId_kind_idx" ON "EmailMailboxAddress"("canalIntegracaoId", "kind");

CREATE UNIQUE INDEX "ConversaCanal_emailThreadKey_key" ON "ConversaCanal"("emailThreadKey");
CREATE INDEX "ConversaCanal_empresaId_emailThreadKey_idx" ON "ConversaCanal"("empresaId", "emailThreadKey");

CREATE UNIQUE INDEX "EmailMessageMetadata_mensagemCanalId_key" ON "EmailMessageMetadata"("mensagemCanalId");
CREATE INDEX "EmailMessageMetadata_empresaId_idx" ON "EmailMessageMetadata"("empresaId");
CREATE INDEX "EmailMessageMetadata_empresaId_threadKey_idx" ON "EmailMessageMetadata"("empresaId", "threadKey");
CREATE INDEX "EmailMessageMetadata_empresaId_messageId_idx" ON "EmailMessageMetadata"("empresaId", "messageId");
CREATE INDEX "EmailMessageMetadata_empresaId_providerMessageId_idx" ON "EmailMessageMetadata"("empresaId", "providerMessageId");
CREATE INDEX "EmailMessageMetadata_empresaId_providerThreadId_idx" ON "EmailMessageMetadata"("empresaId", "providerThreadId");
