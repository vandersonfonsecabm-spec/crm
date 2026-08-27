ALTER TABLE "EventoWebhook" ADD COLUMN "nextAttemptAt" DATETIME;
ALTER TABLE "EventoWebhook" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "EventoWebhook" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "TokenRecuperacaoSenha" ADD COLUMN "deliveryRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ConviteUsuario" ADD COLUMN "deliveryRevision" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "EventoWebhook_statusProcessamento_nextAttemptAt_recebidoEm_idx"
  ON "EventoWebhook"("statusProcessamento", "nextAttemptAt", "recebidoEm");
CREATE INDEX "EventoWebhook_leaseExpiresAt_idx" ON "EventoWebhook"("leaseExpiresAt");

CREATE TABLE "OperacaoDistribuidaLease" (
  "empresaId" INTEGER NOT NULL,
  "namespace" TEXT NOT NULL,
  "resourceKey" TEXT NOT NULL,
  "ownerToken" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "heartbeatAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("empresaId", "namespace", "resourceKey"),
  CONSTRAINT "OperacaoDistribuidaLease_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "OperacaoDistribuidaLease_ownerToken_key" ON "OperacaoDistribuidaLease"("ownerToken");
CREATE INDEX "OperacaoDistribuidaLease_empresaId_expiresAt_idx" ON "OperacaoDistribuidaLease"("empresaId", "expiresAt");
CREATE INDEX "OperacaoDistribuidaLease_expiresAt_idx" ON "OperacaoDistribuidaLease"("expiresAt");

CREATE TABLE "WorkerCheckpoint" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "chave" TEXT NOT NULL,
  "cursorJson" TEXT,
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WorkerCheckpoint_chave_key" ON "WorkerCheckpoint"("chave");

CREATE TABLE "EmailDeliveryOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "empresaId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "targetVersion" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "recipientNormalized" TEXT NOT NULL,
  "payloadCiphertext" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseToken" TEXT,
  "leaseExpiresAt" DATETIME,
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "deliveredAt" DATETIME,
  "failedAt" DATETIME,
  "correlationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "EmailDeliveryOutbox_status_ck" CHECK ("status" IN ('PENDING','PROCESSING','RETRY_WAIT','DELIVERED','FAILED','BOUNCED','EXPIRED','CANCELLED')),
  CONSTRAINT "EmailDeliveryOutbox_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE ("empresaId", "id")
);
CREATE UNIQUE INDEX "EmailDeliveryOutbox_leaseToken_key" ON "EmailDeliveryOutbox"("leaseToken");
CREATE UNIQUE INDEX "EmailDeliveryOutbox_empresaId_idempotencyKey_key" ON "EmailDeliveryOutbox"("empresaId", "idempotencyKey");
CREATE INDEX "EmailDeliveryOutbox_empresaId_status_availableAt_idx" ON "EmailDeliveryOutbox"("empresaId", "status", "availableAt");
CREATE INDEX "EmailDeliveryOutbox_empresaId_leaseExpiresAt_idx" ON "EmailDeliveryOutbox"("empresaId", "leaseExpiresAt");
CREATE INDEX "EmailDeliveryOutbox_empresaId_sourceType_sourceId_idx" ON "EmailDeliveryOutbox"("empresaId", "sourceType", "sourceId");

CREATE TABLE "EmailDeliveryEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "empresaId" INTEGER NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "providerMessageId" TEXT,
  "providerEventId" TEXT,
  "providerOccurredAt" DATETIME,
  "errorCode" TEXT,
  "metadataSanitizedJson" TEXT,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailDeliveryEvent_status_ck" CHECK ("status" IN ('PENDING','PROCESSING','RETRY_WAIT','DELIVERED','FAILED','BOUNCED','EXPIRED','CANCELLED')),
  CONSTRAINT "EmailDeliveryEvent_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "EmailDeliveryEvent_empresaId_deliveryId_fkey"
    FOREIGN KEY ("empresaId", "deliveryId") REFERENCES "EmailDeliveryOutbox"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "EmailDeliveryEvent_empresaId_providerEventId_key" ON "EmailDeliveryEvent"("empresaId", "providerEventId");
CREATE INDEX "EmailDeliveryEvent_empresaId_deliveryId_occurredAt_idx" ON "EmailDeliveryEvent"("empresaId", "deliveryId", "occurredAt");
CREATE INDEX "EmailDeliveryEvent_empresaId_type_occurredAt_idx" ON "EmailDeliveryEvent"("empresaId", "type", "occurredAt");
