-- AlterTable
ALTER TABLE "CanalIntegracao" ADD COLUMN "accessTokenRef" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "connectedAt" DATETIME;
ALTER TABLE "CanalIntegracao" ADD COLUMN "credentialStatus" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "displayPhoneMasked" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "graphApiVersion" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "lastFailureAt" DATETIME;
ALTER TABLE "CanalIntegracao" ADD COLUMN "lastFailureCode" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "lastWebhookAt" DATETIME;
ALTER TABLE "CanalIntegracao" ADD COLUMN "metaAppId" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "metaBusinessId" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "onboardingMethod" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "phoneNumberId" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "providerEnvironment" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "qualityRating" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "CanalIntegracao" ADD COLUMN "verifiedDisplayName" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "wabaId" TEXT;

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_tipo_ativo_idx" ON "CanalIntegracao"("empresaId", "tipo", "ativo");

-- CreateIndex
CREATE INDEX "CanalIntegracao_empresaId_tipo_wabaId_idx" ON "CanalIntegracao"("empresaId", "tipo", "wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "CanalIntegracao_tipo_providerEnvironment_metaAppId_phoneNumberId_key" ON "CanalIntegracao"("tipo", "providerEnvironment", "metaAppId", "phoneNumberId");
