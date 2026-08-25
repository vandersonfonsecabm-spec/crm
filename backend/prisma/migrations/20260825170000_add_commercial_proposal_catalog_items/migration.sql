-- Fail closed before deriving the item tenant from its proposal parent.
CREATE TEMP TABLE "__proposal_catalog_item_preflight" ("violations" INTEGER NOT NULL CHECK ("violations" = 0));
INSERT INTO "__proposal_catalog_item_preflight"
SELECT COUNT(*)
FROM "ItemPropostaComercial" AS "item"
LEFT JOIN "PropostaComercial" AS "proposal" ON "proposal"."id" = "item"."propostaId"
WHERE "proposal"."id" IS NULL;
DROP TABLE "__proposal_catalog_item_preflight";

-- SQLite requires a table rebuild to add the tenant-scoped foreign keys and
-- catalog/legacy CHECK constraints.  Existing rows are deliberately retained
-- as legacy items; no catalog or offer matching is inferred during backfill.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ItemPropostaComercial" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "empresaId" INTEGER NOT NULL,
  "propostaId" INTEGER NOT NULL,
  "itemType" TEXT NOT NULL DEFAULT 'LEGACY_ITEM',
  "productOfferId" TEXT,
  "catalogProductId" INTEGER,
  "stockProductId" INTEGER,
  "descricao" TEXT NOT NULL,
  "productNameSnapshot" TEXT,
  "skuSnapshot" TEXT,
  "unitSnapshot" TEXT,
  "quantidade" DECIMAL NOT NULL,
  "valorUnitarioCentavos" INTEGER NOT NULL,
  "currencySnapshot" TEXT,
  "priceStatusSnapshot" TEXT,
  "offerExpiresAt" DATETIME,
  "catalogRevision" INTEGER,
  "stockMaterialVersion" INTEGER,
  "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
  "subtotalCentavos" INTEGER NOT NULL,
  "totalCentavos" INTEGER NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ItemPropostaComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ItemPropostaComercial_empresaId_propostaId_fkey" FOREIGN KEY ("empresaId", "propostaId") REFERENCES "PropostaComercial"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "ItemPropostaComercial_empresaId_productOfferId_fkey" FOREIGN KEY ("empresaId", "productOfferId") REFERENCES "ProductOffer"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ItemPropostaComercial_empresaId_catalogProductId_fkey" FOREIGN KEY ("empresaId", "catalogProductId") REFERENCES "CommercialCatalogProduct"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ItemPropostaComercial_empresaId_stockProductId_fkey" FOREIGN KEY ("empresaId", "stockProductId") REFERENCES "ProdutoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ItemPropostaComercial_itemType_ck" CHECK ("itemType" IN ('CATALOG_ITEM', 'LEGACY_ITEM')),
  CONSTRAINT "ItemPropostaComercial_currencySnapshot_ck" CHECK ("currencySnapshot" IS NULL OR "currencySnapshot" = 'BRL'),
  CONSTRAINT "ItemPropostaComercial_priceStatusSnapshot_ck" CHECK ("priceStatusSnapshot" IS NULL OR "priceStatusSnapshot" IN ('AVAILABLE', 'ON_REQUEST', 'UNAVAILABLE', 'STALE')),
  CONSTRAINT "ItemPropostaComercial_catalog_contract_ck" CHECK (
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
  )
);

INSERT INTO "new_ItemPropostaComercial" (
  "id", "empresaId", "propostaId", "itemType", "productOfferId", "catalogProductId", "stockProductId",
  "descricao", "productNameSnapshot", "skuSnapshot", "unitSnapshot", "quantidade", "valorUnitarioCentavos",
  "currencySnapshot", "priceStatusSnapshot", "offerExpiresAt", "catalogRevision", "stockMaterialVersion",
  "descontoCentavos", "subtotalCentavos", "totalCentavos", "ordem", "createdAt", "updatedAt"
)
SELECT
  "item"."id", "proposal"."empresaId", "item"."propostaId", 'LEGACY_ITEM', NULL, NULL, NULL,
  "item"."descricao", NULL, NULL, NULL, "item"."quantidade", "item"."valorUnitarioCentavos",
  NULL, NULL, NULL, NULL, NULL,
  "item"."descontoCentavos", "item"."subtotalCentavos", "item"."totalCentavos", "item"."ordem", "item"."createdAt", "item"."updatedAt"
FROM "ItemPropostaComercial" AS "item"
INNER JOIN "PropostaComercial" AS "proposal" ON "proposal"."id" = "item"."propostaId";

DROP TABLE "ItemPropostaComercial";
ALTER TABLE "new_ItemPropostaComercial" RENAME TO "ItemPropostaComercial";

CREATE UNIQUE INDEX "ItemPropostaComercial_empresaId_id_key" ON "ItemPropostaComercial"("empresaId", "id");
CREATE INDEX "ItemPropostaComercial_empresaId_propostaId_ordem_idx" ON "ItemPropostaComercial"("empresaId", "propostaId", "ordem");
CREATE INDEX "ItemPropostaComercial_empresaId_productOfferId_idx" ON "ItemPropostaComercial"("empresaId", "productOfferId");
CREATE INDEX "ItemPropostaComercial_empresaId_catalogProductId_idx" ON "ItemPropostaComercial"("empresaId", "catalogProductId");
CREATE INDEX "ItemPropostaComercial_empresaId_stockProductId_idx" ON "ItemPropostaComercial"("empresaId", "stockProductId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
