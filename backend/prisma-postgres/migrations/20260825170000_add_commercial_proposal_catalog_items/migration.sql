BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ItemPropostaComercial" AS "item"
    LEFT JOIN "PropostaComercial" AS "proposal" ON "proposal"."id" = "item"."propostaId"
    WHERE "proposal"."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'ITEM_PROPOSTA_COMERCIAL_PARENT_MISSING';
  END IF;
END $$;

CREATE TYPE "TipoItemPropostaComercial" AS ENUM ('CATALOG_ITEM', 'LEGACY_ITEM');

ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'ADICIONAR_ITEM_CATALOGADO';
ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'REVALIDAR';
ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'REVALIDACAO_RECUSADA';

ALTER TABLE "ItemPropostaComercial"
  ADD COLUMN "empresaId" INTEGER,
  ADD COLUMN "itemType" "TipoItemPropostaComercial" NOT NULL DEFAULT 'LEGACY_ITEM',
  ADD COLUMN "productOfferId" TEXT,
  ADD COLUMN "catalogProductId" INTEGER,
  ADD COLUMN "stockProductId" INTEGER,
  ADD COLUMN "productNameSnapshot" TEXT,
  ADD COLUMN "skuSnapshot" TEXT,
  ADD COLUMN "unitSnapshot" TEXT,
  ADD COLUMN "currencySnapshot" TEXT,
  ADD COLUMN "priceStatusSnapshot" TEXT,
  ADD COLUMN "offerExpiresAt" TIMESTAMP(3),
  ADD COLUMN "catalogRevision" INTEGER,
  ADD COLUMN "stockMaterialVersion" INTEGER;

UPDATE "ItemPropostaComercial" AS "item"
SET "empresaId" = "proposal"."empresaId"
FROM "PropostaComercial" AS "proposal"
WHERE "proposal"."id" = "item"."propostaId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ItemPropostaComercial" WHERE "empresaId" IS NULL) THEN
    RAISE EXCEPTION 'ITEM_PROPOSTA_COMERCIAL_TENANT_BACKFILL_INCOMPLETE';
  END IF;
END $$;

ALTER TABLE "ItemPropostaComercial"
  ALTER COLUMN "empresaId" SET NOT NULL;

ALTER TABLE "ItemPropostaComercial"
  DROP CONSTRAINT "ItemPropostaComercial_propostaId_fkey",
  ADD CONSTRAINT "ItemPropostaComercial_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ItemPropostaComercial_empresaId_propostaId_fkey"
    FOREIGN KEY ("empresaId", "propostaId") REFERENCES "PropostaComercial"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT "ItemPropostaComercial_empresaId_productOfferId_fkey"
    FOREIGN KEY ("empresaId", "productOfferId") REFERENCES "ProductOffer"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ItemPropostaComercial_empresaId_catalogProductId_fkey"
    FOREIGN KEY ("empresaId", "catalogProductId") REFERENCES "CommercialCatalogProduct"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ItemPropostaComercial_empresaId_stockProductId_fkey"
    FOREIGN KEY ("empresaId", "stockProductId") REFERENCES "ProdutoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ItemPropostaComercial_currencySnapshot_ck"
    CHECK ("currencySnapshot" IS NULL OR "currencySnapshot" = 'BRL'),
  ADD CONSTRAINT "ItemPropostaComercial_priceStatusSnapshot_ck"
    CHECK ("priceStatusSnapshot" IS NULL OR "priceStatusSnapshot" IN ('AVAILABLE', 'ON_REQUEST', 'UNAVAILABLE', 'STALE')),
  ADD CONSTRAINT "ItemPropostaComercial_catalog_contract_ck"
    CHECK (
      (
        "itemType" = 'LEGACY_ITEM'
        AND "productOfferId" IS NULL
        AND "catalogProductId" IS NULL
        AND "stockProductId" IS NULL
        AND "productNameSnapshot" IS NULL
        AND "skuSnapshot" IS NULL
        AND "unitSnapshot" IS NULL
        AND "currencySnapshot" IS NULL
        AND "priceStatusSnapshot" IS NULL
        AND "offerExpiresAt" IS NULL
        AND "catalogRevision" IS NULL
        AND "stockMaterialVersion" IS NULL
      )
      OR (
        "itemType" = 'CATALOG_ITEM'
        AND "productOfferId" IS NOT NULL
        AND "catalogProductId" IS NOT NULL
        AND "stockProductId" IS NOT NULL
        AND "productNameSnapshot" IS NOT NULL
        AND "unitSnapshot" IS NOT NULL
        AND "currencySnapshot" IS NOT NULL
        AND "priceStatusSnapshot" IS NOT NULL
        AND "offerExpiresAt" IS NOT NULL
        AND "catalogRevision" IS NOT NULL
      )
    );

CREATE UNIQUE INDEX "ItemPropostaComercial_empresaId_id_key" ON "ItemPropostaComercial"("empresaId", "id");
CREATE INDEX "ItemPropostaComercial_empresaId_propostaId_ordem_idx" ON "ItemPropostaComercial"("empresaId", "propostaId", "ordem");
CREATE INDEX "ItemPropostaComercial_empresaId_productOfferId_idx" ON "ItemPropostaComercial"("empresaId", "productOfferId");
CREATE INDEX "ItemPropostaComercial_empresaId_catalogProductId_idx" ON "ItemPropostaComercial"("empresaId", "catalogProductId");
CREATE INDEX "ItemPropostaComercial_empresaId_stockProductId_idx" ON "ItemPropostaComercial"("empresaId", "stockProductId");

COMMIT;
