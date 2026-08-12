-- Fail closed before any DDL: this migration intentionally performs no
-- credential backfill. Any legacy non-null bridge must be resolved by an
-- authorized operator first.
CREATE TEMP TABLE "__MetaCredentialPreflight" (
    "ok" INTEGER NOT NULL CHECK ("ok" = 1)
);
INSERT INTO "__MetaCredentialPreflight" ("ok")
SELECT CASE
    WHEN EXISTS (SELECT 1 FROM "CanalIntegracao" WHERE "accessTokenRef" IS NOT NULL)
    THEN 0 ELSE 1 END;
DROP TABLE "__MetaCredentialPreflight";

-- CreateTable
CREATE TABLE "MetaCredential" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "removedAt" DATETIME,
    CONSTRAINT "MetaCredential_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MetaCredential_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaCredential_reference_key" ON "MetaCredential"("reference");

-- CreateIndex
CREATE INDEX "MetaCredential_empresaId_canalIntegracaoId_provider_status_idx" ON "MetaCredential"("empresaId", "canalIntegracaoId", "provider", "status");

-- CreateIndex
CREATE INDEX "MetaCredential_empresaId_reference_idx" ON "MetaCredential"("empresaId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCredential_empresaId_id_key" ON "MetaCredential"("empresaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCredential_empresaId_canalIntegracaoId_provider_reference_key" ON "MetaCredential"("empresaId", "canalIntegracaoId", "provider", "reference");

-- Add the tenant-scoped bridge from CanalIntegracao.accessTokenRef to the
-- dedicated credential reference. The existing bridge is preserved; the
-- table rebuild copies every column and adds only the FK constraint.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CanalIntegracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chaveInterna" TEXT NOT NULL,
    "publicId" TEXT,
    "configuracaoJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'MODO_TESTE',
    "modoTeste" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "providerEnvironment" TEXT,
    "metaAppId" TEXT,
    "metaBusinessId" TEXT,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "displayPhoneMasked" TEXT,
    "verifiedDisplayName" TEXT,
    "instagramBusinessAccountId" TEXT,
    "instagramUsernameMasked" TEXT,
    "messengerPageId" TEXT,
    "messengerPageNameMasked" TEXT,
    "emailProviderType" TEXT,
    "emailProviderAccountIdMasked" TEXT,
    "emailDisplayNameMasked" TEXT,
    "qualityRating" TEXT,
    "graphApiVersion" TEXT,
    "onboardingMethod" TEXT,
    "accessTokenRef" TEXT,
    "credentialStatus" TEXT,
    "connectedAt" DATETIME,
    "verifiedAt" DATETIME,
    "lastWebhookAt" DATETIME,
    "lastFailureAt" DATETIME,
    "lastFailureCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanalIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CanalIntegracao_empresaId_id_accessTokenRef_fkey" FOREIGN KEY ("empresaId", "id", "accessTokenRef") REFERENCES "MetaCredential" ("empresaId", "canalIntegracaoId", "reference") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_CanalIntegracao" ("accessTokenRef", "ativo", "chaveInterna", "configuracaoJson", "connectedAt", "createdAt", "credentialStatus", "displayPhoneMasked", "emailDisplayNameMasked", "emailProviderAccountIdMasked", "emailProviderType", "empresaId", "graphApiVersion", "id", "instagramBusinessAccountId", "instagramUsernameMasked", "lastFailureAt", "lastFailureCode", "lastWebhookAt", "messengerPageId", "messengerPageNameMasked", "metaAppId", "metaBusinessId", "modoTeste", "nome", "onboardingMethod", "phoneNumberId", "providerEnvironment", "publicId", "qualityRating", "status", "tipo", "updatedAt", "verifiedAt", "verifiedDisplayName", "wabaId") SELECT "accessTokenRef", "ativo", "chaveInterna", "configuracaoJson", "connectedAt", "createdAt", "credentialStatus", "displayPhoneMasked", "emailDisplayNameMasked", "emailProviderAccountIdMasked", "emailProviderType", "empresaId", "graphApiVersion", "id", "instagramBusinessAccountId", "instagramUsernameMasked", "lastFailureAt", "lastFailureCode", "lastWebhookAt", "messengerPageId", "messengerPageNameMasked", "metaAppId", "metaBusinessId", "modoTeste", "nome", "onboardingMethod", "phoneNumberId", "providerEnvironment", "publicId", "qualityRating", "status", "tipo", "updatedAt", "verifiedAt", "verifiedDisplayName", "wabaId" FROM "CanalIntegracao";
DROP TABLE "CanalIntegracao";
ALTER TABLE "new_CanalIntegracao" RENAME TO "CanalIntegracao";
CREATE UNIQUE INDEX "CanalIntegracao_publicId_key" ON "CanalIntegracao"("publicId");
CREATE UNIQUE INDEX "CanalIntegracao_instagramBusinessAccountId_key" ON "CanalIntegracao"("instagramBusinessAccountId");
CREATE UNIQUE INDEX "CanalIntegracao_messengerPageId_key" ON "CanalIntegracao"("messengerPageId");
CREATE INDEX "CanalIntegracao_empresaId_idx" ON "CanalIntegracao"("empresaId");
CREATE INDEX "CanalIntegracao_empresaId_tipo_idx" ON "CanalIntegracao"("empresaId", "tipo");
CREATE INDEX "CanalIntegracao_empresaId_ativo_idx" ON "CanalIntegracao"("empresaId", "ativo");
CREATE INDEX "CanalIntegracao_empresaId_tipo_ativo_idx" ON "CanalIntegracao"("empresaId", "tipo", "ativo");
CREATE INDEX "CanalIntegracao_empresaId_tipo_wabaId_idx" ON "CanalIntegracao"("empresaId", "tipo", "wabaId");
CREATE UNIQUE INDEX "CanalIntegracao_empresaId_chaveInterna_key" ON "CanalIntegracao"("empresaId", "chaveInterna");
CREATE UNIQUE INDEX "CanalIntegracao_empresaId_id_key" ON "CanalIntegracao"("empresaId", "id");
CREATE UNIQUE INDEX "CanalIntegracao_tipo_providerEnvironment_metaAppId_phoneNumberId_key" ON "CanalIntegracao"("tipo", "providerEnvironment", "metaAppId", "phoneNumberId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Postflight: fail if any copied bridge is not tenant+channel bound.
CREATE TEMP TABLE "__MetaCredentialPostflight" (
    "ok" INTEGER NOT NULL CHECK ("ok" = 1)
);
INSERT INTO "__MetaCredentialPostflight" ("ok")
SELECT CASE
    WHEN EXISTS (
        SELECT 1
        FROM "CanalIntegracao" AS c
        LEFT JOIN "MetaCredential" AS m
          ON m."empresaId" = c."empresaId"
         AND m."canalIntegracaoId" = c."id"
         AND m."reference" = c."accessTokenRef"
        WHERE c."accessTokenRef" IS NOT NULL
          AND m."id" IS NULL
    )
    THEN 0 ELSE 1 END;
DROP TABLE "__MetaCredentialPostflight";

-- CreateIndex
CREATE UNIQUE INDEX "MetaCredential_empresaId_reference_key" ON "MetaCredential"("empresaId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCredential_empresaId_canalIntegracaoId_reference_key" ON "MetaCredential"("empresaId", "canalIntegracaoId", "reference");
