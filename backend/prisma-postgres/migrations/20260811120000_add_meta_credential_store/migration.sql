-- Keep preflight, DDL and postflight in one explicit unit so any failure
-- leaves no partial MetaCredential structures behind.
BEGIN;

-- Fail closed before any persistent DDL. No credential backfill is approved;
-- a legacy bridge must be resolved by an authorized operator first.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "CanalIntegracao"
        WHERE "accessTokenRef" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'META_PERSISTENCE_PRECHECK_FAILED: legacy accessTokenRef requires authorized resolution before migration';
    END IF;
END $$;

-- The SQLite pipeline already carries the semantic status enum; the
-- PostgreSQL baseline predates it, so materialize it before the new table.
CREATE TYPE "StatusCredencialMeta" AS ENUM (
    'ATIVA',
    'ROTACAO_PENDENTE',
    'REMOVIDA',
    'ERRO'
);

CREATE TABLE "MetaCredential" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "status" "StatusCredencialMeta" NOT NULL DEFAULT 'ATIVA',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "MetaCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaCredential_reference_key"
    ON "MetaCredential" ("reference");
CREATE UNIQUE INDEX "MetaCredential_empresaId_id_key"
    ON "MetaCredential" ("empresaId", "id");
CREATE UNIQUE INDEX "MetaCredential_empresaId_reference_key"
    ON "MetaCredential" ("empresaId", "reference");
CREATE UNIQUE INDEX "MetaCredential_empresaId_canalIntegracaoId_reference_key"
    ON "MetaCredential" ("empresaId", "canalIntegracaoId", "reference");
CREATE UNIQUE INDEX "MetaCredential_empresaId_canalIntegracaoId_provider_reference_key"
    ON "MetaCredential" ("empresaId", "canalIntegracaoId", "provider", "reference");
CREATE INDEX "MetaCredential_empresaId_canalIntegracaoId_provider_status_idx"
    ON "MetaCredential" ("empresaId", "canalIntegracaoId", "provider", "status");
CREATE INDEX "MetaCredential_empresaId_reference_idx"
    ON "MetaCredential" ("empresaId", "reference");

ALTER TABLE "MetaCredential"
    ADD CONSTRAINT "MetaCredential_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MetaCredential"
    ADD CONSTRAINT "MetaCredential_empresaId_canalIntegracaoId_fkey"
    FOREIGN KEY ("empresaId", "canalIntegracaoId")
    REFERENCES "CanalIntegracao" ("empresaId", "id")
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "CanalIntegracao"
    ADD CONSTRAINT "CanalIntegracao_empresaId_id_accessTokenRef_fkey"
    FOREIGN KEY ("empresaId", "id", "accessTokenRef")
    REFERENCES "MetaCredential" ("empresaId", "canalIntegracaoId", "reference")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Postflight: reject every orphan or cross-tenant/cross-channel bridge.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "MetaCredential" AS m
        LEFT JOIN "CanalIntegracao" AS c
          ON c."empresaId" = m."empresaId"
         AND c."id" = m."canalIntegracaoId"
        WHERE c."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'META_PERSISTENCE_POSTCHECK_FAILED: credential ownership is not tenant+channel bound';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "CanalIntegracao" AS c
        LEFT JOIN "MetaCredential" AS m
          ON m."empresaId" = c."empresaId"
         AND m."canalIntegracaoId" = c."id"
         AND m."reference" = c."accessTokenRef"
        WHERE c."accessTokenRef" IS NOT NULL
          AND m."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'META_PERSISTENCE_POSTCHECK_FAILED: bridge reference is not tenant+channel bound';
    END IF;
END $$;

COMMIT;
