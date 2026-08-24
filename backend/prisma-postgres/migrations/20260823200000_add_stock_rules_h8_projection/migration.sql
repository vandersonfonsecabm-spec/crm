BEGIN;

ALTER TABLE "Notificacao" ADD COLUMN "stockTargetType" TEXT;
ALTER TABLE "Notificacao" ADD COLUMN "stockTargetId" INTEGER;
ALTER TABLE "Notificacao" ADD COLUMN "stockTargetSubId" INTEGER;
ALTER TABLE "Notificacao" ADD COLUMN "stockSnapshotJson" TEXT;
ALTER TABLE "Notificacao" ADD COLUMN "stockMaterialVersion" INTEGER;
ALTER TABLE "Notificacao" ADD COLUMN "stockSourceObservedAt" TIMESTAMP(3);
ALTER TABLE "Notificacao" ADD COLUMN "stockResolutionState" TEXT;

CREATE TABLE "ConfiguracaoRegraEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ruleType" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'TENANT',
    "scopeKey" TEXT NOT NULL DEFAULT 'TENANT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "expiryWindowDays" INTEGER,
    "freshnessSlaMinutes" INTEGER,
    "timezone" TEXT,
    "requiredCapabilitiesJson" TEXT,
    "priorityBandsJson" TEXT,
    "recipientPolicyJson" TEXT,
    "suppressionPolicyJson" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "actorRef" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConfiguracaoRegraEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConfiguracaoRegraEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ConfiguracaoRegraEstoque_empresaId_ruleType_scope_key" ON "ConfiguracaoRegraEstoque"("empresaId", "ruleType", "scopeType", "scopeKey");
CREATE UNIQUE INDEX "ConfiguracaoRegraEstoque_empresaId_id_key" ON "ConfiguracaoRegraEstoque"("empresaId", "id");
CREATE INDEX "ConfiguracaoRegraEstoque_empresaId_ruleType_enabled_idx" ON "ConfiguracaoRegraEstoque"("empresaId", "ruleType", "enabled");
CREATE INDEX "ConfiguracaoRegraEstoque_empresaId_updatedAt_idx" ON "ConfiguracaoRegraEstoque"("empresaId", "updatedAt");

CREATE TABLE "OverrideEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ruleType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "enabled" BOOLEAN,
    "thresholdJson" TEXT,
    "freshnessSlaMinutes" INTEGER,
    "priority" TEXT,
    "recipientPolicyJson" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "actorRef" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OverrideEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OverrideEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "OverrideEstoque_empresaId_ruleType_target_key" ON "OverrideEstoque"("empresaId", "ruleType", "targetType", "targetId");
CREATE UNIQUE INDEX "OverrideEstoque_empresaId_id_key" ON "OverrideEstoque"("empresaId", "id");
CREATE INDEX "OverrideEstoque_empresaId_ruleType_target_idx" ON "OverrideEstoque"("empresaId", "ruleType", "targetType", "targetId");
CREATE INDEX "OverrideEstoque_empresaId_updatedAt_idx" ON "OverrideEstoque"("empresaId", "updatedAt");

CREATE TABLE "AvaliacaoRegraEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "sourceConnectionId" INTEGER,
    "scopeJson" TEXT,
    "produtoEstoqueId" INTEGER,
    "loteEstoqueId" INTEGER,
    "localEstoqueId" INTEGER,
    "requiredCapabilitiesJson" TEXT,
    "capabilitiesObservedJson" TEXT,
    "enabledEffective" BOOLEAN NOT NULL,
    "thresholdJson" TEXT,
    "evaluationTime" TIMESTAMP(3) NOT NULL,
    "tenantTimezone" TEXT NOT NULL,
    "freshnessRequirement" TEXT,
    "freshnessObserved" TEXT,
    "quantitySemantic" TEXT,
    "quantityRelevant" BOOLEAN,
    "expiryDate" TEXT,
    "expiryPrecision" TEXT,
    "matched" BOOLEAN NOT NULL,
    "noMatchReason" TEXT,
    "priority" TEXT,
    "occurrenceKey" TEXT NOT NULL,
    "materialVersion" INTEGER NOT NULL,
    "materialChange" BOOLEAN NOT NULL DEFAULT false,
    "destinationJson" TEXT,
    "resolutionCandidate" TEXT,
    "suppressionPolicyJson" TEXT,
    "confidence" TEXT,
    "correlationId" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvaliacaoRegraEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AvaliacaoRegraEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AvaliacaoRegraEstoque_empresaId_sourceConnectionId_fkey" FOREIGN KEY ("empresaId", "sourceConnectionId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AvaliacaoRegraEstoque_empresaId_produtoEstoqueId_fkey" FOREIGN KEY ("empresaId", "produtoEstoqueId") REFERENCES "ProdutoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AvaliacaoRegraEstoque_empresaId_loteEstoqueId_fkey" FOREIGN KEY ("empresaId", "loteEstoqueId") REFERENCES "LoteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AvaliacaoRegraEstoque_empresaId_localEstoqueId_fkey" FOREIGN KEY ("empresaId", "localEstoqueId") REFERENCES "LocalEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "AvaliacaoRegraEstoque_empresaId_id_key" ON "AvaliacaoRegraEstoque"("empresaId", "id");
CREATE INDEX "AvaliacaoRegraEstoque_empresaId_ruleType_evaluatedAt_idx" ON "AvaliacaoRegraEstoque"("empresaId", "ruleType", "evaluatedAt");
CREATE INDEX "AvaliacaoRegraEstoque_empresaId_occurrenceKey_materialVersion_idx" ON "AvaliacaoRegraEstoque"("empresaId", "occurrenceKey", "materialVersion");
CREATE INDEX "AvaliacaoRegraEstoque_empresaId_matched_evaluatedAt_idx" ON "AvaliacaoRegraEstoque"("empresaId", "matched", "evaluatedAt");
CREATE INDEX "AvaliacaoRegraEstoque_empresaId_retentionUntil_idx" ON "AvaliacaoRegraEstoque"("empresaId", "retentionUntil");

COMMIT;
