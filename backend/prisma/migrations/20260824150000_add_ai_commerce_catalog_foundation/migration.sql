CREATE TABLE "CommercialCatalogProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "stockProductId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "synonymsJson" TEXT NOT NULL DEFAULT '[]',
    "attributesJson" TEXT NOT NULL DEFAULT '{}',
    "primaryImageUrl" TEXT,
    "additionalMediaJson" TEXT,
    "commercialPrice" DECIMAL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "priceStatus" TEXT NOT NULL DEFAULT 'ON_REQUEST',
    "priceObservedAt" DATETIME,
    "visibility" TEXT NOT NULL DEFAULT 'HIDDEN',
    "sellabilityPolicy" TEXT NOT NULL DEFAULT 'STOCK_CANONICAL_ONLY',
    "productUrl" TEXT,
    "purchaseUrl" TEXT,
    "allowedLinkDomain" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "CommercialCatalogProduct_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "CommercialCatalogProduct_empresaId_stockProductId_fkey" FOREIGN KEY ("empresaId", "stockProductId") REFERENCES "ProdutoEstoque" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "CommercialCatalogProduct_visibility_ck" CHECK ("visibility" IN ('HIDDEN', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT "CommercialCatalogProduct_priceStatus_ck" CHECK ("priceStatus" IN ('AVAILABLE', 'ON_REQUEST', 'UNAVAILABLE', 'STALE'))
);
CREATE UNIQUE INDEX "CommercialCatalogProduct_empresaId_id_key" ON "CommercialCatalogProduct"("empresaId", "id");
CREATE UNIQUE INDEX "CommercialCatalogProduct_empresaId_stockProductId_key" ON "CommercialCatalogProduct"("empresaId", "stockProductId");
CREATE INDEX "CommercialCatalogProduct_empresaId_visibility_archivedAt_idx" ON "CommercialCatalogProduct"("empresaId", "visibility", "archivedAt");
CREATE INDEX "CommercialCatalogProduct_empresaId_stockProductId_idx" ON "CommercialCatalogProduct"("empresaId", "stockProductId");
CREATE INDEX "CommercialCatalogProduct_empresaId_category_visibility_idx" ON "CommercialCatalogProduct"("empresaId", "category", "visibility");
CREATE INDEX "CommercialCatalogProduct_empresaId_brand_visibility_idx" ON "CommercialCatalogProduct"("empresaId", "brand", "visibility");
CREATE INDEX "CommercialCatalogProduct_empresaId_revision_idx" ON "CommercialCatalogProduct"("empresaId", "revision");

CREATE TABLE "ProductOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "customerId" INTEGER,
    "catalogProductId" INTEGER NOT NULL,
    "stockProductId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "imageUrl" TEXT,
    "price" DECIMAL,
    "currency" TEXT NOT NULL,
    "availabilityStatus" TEXT NOT NULL,
    "availabilityLabel" TEXT NOT NULL,
    "commercialTermsJson" TEXT NOT NULL DEFAULT '{}',
    "productUrl" TEXT,
    "purchaseUrl" TEXT,
    "allowedActionsJson" TEXT NOT NULL DEFAULT '[]',
    "sourceFreshness" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "manualConfirmationRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "catalogRevision" INTEGER NOT NULL,
    "stockMaterialVersion" INTEGER,
    "policyVersion" TEXT NOT NULL,
    "correlationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "ProductOffer_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ProductOffer_empresaId_conversationId_fkey" FOREIGN KEY ("empresaId", "conversationId") REFERENCES "ConversaCanal" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ProductOffer_empresaId_customerId_fkey" FOREIGN KEY ("empresaId", "customerId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ProductOffer_empresaId_catalogProductId_fkey" FOREIGN KEY ("empresaId", "catalogProductId") REFERENCES "CommercialCatalogProduct" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ProductOffer_empresaId_stockProductId_fkey" FOREIGN KEY ("empresaId", "stockProductId") REFERENCES "ProdutoEstoque" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ProductOffer_status_ck" CHECK ("status" IN ('ACTIVE', 'EXPIRED', 'STALE', 'CANCELLED'))
);
CREATE UNIQUE INDEX "ProductOffer_empresaId_id_key" ON "ProductOffer"("empresaId", "id");
CREATE INDEX "ProductOffer_empresaId_conversationId_createdAt_idx" ON "ProductOffer"("empresaId", "conversationId", "createdAt");
CREATE INDEX "ProductOffer_empresaId_customerId_createdAt_idx" ON "ProductOffer"("empresaId", "customerId", "createdAt");
CREATE INDEX "ProductOffer_empresaId_catalogProductId_createdAt_idx" ON "ProductOffer"("empresaId", "catalogProductId", "createdAt");
CREATE INDEX "ProductOffer_empresaId_expiresAt_status_idx" ON "ProductOffer"("empresaId", "expiresAt", "status");
