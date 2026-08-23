BEGIN;

CREATE TABLE "FonteEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tipoFonte" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "statusCiclo" TEXT NOT NULL DEFAULT 'DRAFT',
    "configuracaoPublicaJson" TEXT,
    "credencialRef" TEXT,
    "capabilitiesVersion" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 100,
    "schemaVersion" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FonteEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FonteEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "FonteEstoque_empresaId_nome_key" ON "FonteEstoque"("empresaId", "nome");
CREATE UNIQUE INDEX "FonteEstoque_empresaId_id_key" ON "FonteEstoque"("empresaId", "id");
CREATE INDEX "FonteEstoque_empresaId_statusCiclo_idx" ON "FonteEstoque"("empresaId", "statusCiclo");
CREATE INDEX "FonteEstoque_empresaId_tipoFonte_statusCiclo_idx" ON "FonteEstoque"("empresaId", "tipoFonte", "statusCiclo");

CREATE TABLE "CapacidadeFonteEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fonteId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "suportada" BOOLEAN NOT NULL DEFAULT false,
    "semanticaJson" TEXT,
    "versao" TEXT NOT NULL,
    "observadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapacidadeFonteEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CapacidadeFonteEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "CapacidadeFonteEstoque_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "CapacidadeFonteEstoque_empresaId_fonteId_codigo_versao_key" ON "CapacidadeFonteEstoque"("empresaId", "fonteId", "codigo", "versao");
CREATE INDEX "CapacidadeFonteEstoque_empresaId_fonteId_suportada_idx" ON "CapacidadeFonteEstoque"("empresaId", "fonteId", "suportada");

CREATE TABLE "ExecucaoSincronizacaoEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fonteId" INTEGER NOT NULL,
    "modo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "cursorAntes" TEXT,
    "cursorDepois" TEXT,
    "snapshotGeneration" TEXT,
    "lidos" INTEGER NOT NULL DEFAULT 0,
    "aceitos" INTEGER NOT NULL DEFAULT 0,
    "rejeitados" INTEGER NOT NULL DEFAULT 0,
    "criados" INTEGER NOT NULL DEFAULT 0,
    "atualizados" INTEGER NOT NULL DEFAULT 0,
    "tombstoned" INTEGER NOT NULL DEFAULT 0,
    "warningsJson" TEXT,
    "errorClass" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "correlationId" TEXT,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExecucaoSincronizacaoEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExecucaoSincronizacaoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ExecucaoSincronizacaoEstoque_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ExecucaoSincronizacaoEstoque_empresaId_id_key" ON "ExecucaoSincronizacaoEstoque"("empresaId", "id");
CREATE INDEX "ExecucaoSincronizacaoEstoque_empresaId_fonteId_startedAt_idx" ON "ExecucaoSincronizacaoEstoque"("empresaId", "fonteId", "startedAt");
CREATE INDEX "ExecucaoSincronizacaoEstoque_empresaId_estado_leaseExpiresAt_idx" ON "ExecucaoSincronizacaoEstoque"("empresaId", "estado", "leaseExpiresAt");
CREATE INDEX "ExecucaoSincronizacaoEstoque_empresaId_retentionUntil_idx" ON "ExecucaoSincronizacaoEstoque"("empresaId", "retentionUntil");

CREATE TABLE "CheckpointSincronizacaoEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fonteId" INTEGER NOT NULL,
    "cursor" TEXT,
    "sourceGeneration" TEXT,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastFullSnapshotAt" TIMESTAMP(3),
    "lastIncrementalSyncAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckpointSincronizacaoEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CheckpointSincronizacaoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "CheckpointSincronizacaoEstoque_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "CheckpointSincronizacaoEstoque_empresaId_fonteId_key" ON "CheckpointSincronizacaoEstoque"("empresaId", "fonteId");
CREATE UNIQUE INDEX "CheckpointSincronizacaoEstoque_empresaId_id_key" ON "CheckpointSincronizacaoEstoque"("empresaId", "id");

CREATE TABLE "ProdutoEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nomeExibicao" TEXT NOT NULL,
    "skuCanonico" TEXT,
    "skuCanonicoConfirmado" BOOLEAN NOT NULL DEFAULT false,
    "barcodeCanonico" TEXT,
    "barcodeCanonicoConfirmado" BOOLEAN NOT NULL DEFAULT false,
    "unidadeCanonica" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "metadataNamespacedJson" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProdutoEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProdutoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ProdutoEstoque_empresaId_id_key" ON "ProdutoEstoque"("empresaId", "id");
CREATE INDEX "ProdutoEstoque_empresaId_skuCanonico_idx" ON "ProdutoEstoque"("empresaId", "skuCanonico");
CREATE INDEX "ProdutoEstoque_empresaId_barcodeCanonico_idx" ON "ProdutoEstoque"("empresaId", "barcodeCanonico");
CREATE INDEX "ProdutoEstoque_empresaId_ativo_idx" ON "ProdutoEstoque"("empresaId", "ativo");
CREATE UNIQUE INDEX "stock_product_confirmed_sku_uq" ON "ProdutoEstoque"("empresaId", "skuCanonico") WHERE "skuCanonico" IS NOT NULL AND "skuCanonicoConfirmado" = TRUE;
CREATE UNIQUE INDEX "stock_product_confirmed_barcode_uq" ON "ProdutoEstoque"("empresaId", "barcodeCanonico") WHERE "barcodeCanonico" IS NOT NULL AND "barcodeCanonicoConfirmado" = TRUE;

CREATE TABLE "MapeamentoProdutoExterno" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fonteId" INTEGER NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "produtoEstoqueId" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "evidenciaJson" TEXT,
    "sourceVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MapeamentoProdutoExterno_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MapeamentoProdutoExterno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "MapeamentoProdutoExterno_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "MapeamentoProdutoExterno_empresaId_produtoEstoqueId_fkey" FOREIGN KEY ("empresaId", "produtoEstoqueId") REFERENCES "ProdutoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "MapeamentoProdutoExterno_empresaId_fonteId_sourceProductId_idx" ON "MapeamentoProdutoExterno"("empresaId", "fonteId", "sourceProductId");
CREATE INDEX "MapeamentoProdutoExterno_empresaId_produtoEstoqueId_estado_idx" ON "MapeamentoProdutoExterno"("empresaId", "produtoEstoqueId", "estado");
CREATE UNIQUE INDEX "stock_mapping_external_identity_uq" ON "MapeamentoProdutoExterno"("empresaId", "fonteId", "sourceProductId") WHERE "sourceProductId" IS NOT NULL;

CREATE TABLE "LocalEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fonteId" INTEGER,
    "externalLocationId" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "parentId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LocalEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LocalEstoque_empresaId_id_key" UNIQUE ("empresaId", "id"),
    CONSTRAINT "LocalEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "LocalEstoque_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "LocalEstoque_empresaId_parentId_fkey" FOREIGN KEY ("empresaId", "parentId") REFERENCES "LocalEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "LocalEstoque_empresaId_fonteId_externalLocationId_idx" ON "LocalEstoque"("empresaId", "fonteId", "externalLocationId");
CREATE INDEX "LocalEstoque_empresaId_parentId_idx" ON "LocalEstoque"("empresaId", "parentId");
CREATE UNIQUE INDEX "stock_location_external_identity_uq" ON "LocalEstoque"("empresaId", "fonteId", "externalLocationId") WHERE "fonteId" IS NOT NULL AND "externalLocationId" IS NOT NULL;

CREATE TABLE "LoteEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "produtoEstoqueId" INTEGER NOT NULL,
    "fonteId" INTEGER NOT NULL,
    "sourceLotId" TEXT,
    "codigoLote" TEXT,
    "validadeEm" TEXT,
    "precisaoValidade" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "estado" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "sourceUpdatedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoteEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoteEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "LoteEstoque_empresaId_produtoEstoqueId_fkey" FOREIGN KEY ("empresaId", "produtoEstoqueId") REFERENCES "ProdutoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "LoteEstoque_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "stock_lot_validade_precision_ck" CHECK (
      ("precisaoValidade" = 'DAY' AND "validadeEm" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR
      ("precisaoValidade" = 'MONTH' AND "validadeEm" ~ '^[0-9]{4}-[0-9]{2}$') OR
      ("precisaoValidade" = 'YEAR' AND "validadeEm" ~ '^[0-9]{4}$') OR
      ("precisaoValidade" = 'UNKNOWN' AND "validadeEm" IS NULL)
    )
);
CREATE UNIQUE INDEX "LoteEstoque_empresaId_id_key" ON "LoteEstoque"("empresaId", "id");
CREATE INDEX "LoteEstoque_empresaId_produtoEstoqueId_estado_idx" ON "LoteEstoque"("empresaId", "produtoEstoqueId", "estado");
CREATE INDEX "LoteEstoque_empresaId_fonteId_sourceLotId_idx" ON "LoteEstoque"("empresaId", "fonteId", "sourceLotId");
CREATE INDEX "LoteEstoque_empresaId_fonteId_codigoLote_idx" ON "LoteEstoque"("empresaId", "fonteId", "codigoLote");
CREATE INDEX "LoteEstoque_empresaId_validadeEm_idx" ON "LoteEstoque"("empresaId", "validadeEm");
CREATE UNIQUE INDEX "stock_lot_external_identity_uq" ON "LoteEstoque"("empresaId", "fonteId", "sourceLotId") WHERE "sourceLotId" IS NOT NULL;
CREATE UNIQUE INDEX "stock_lot_code_identity_uq" ON "LoteEstoque"("empresaId", "fonteId", "produtoEstoqueId", "codigoLote") WHERE "sourceLotId" IS NULL AND "codigoLote" IS NOT NULL;

CREATE TABLE "SaldoEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "produtoEstoqueId" INTEGER NOT NULL,
    "loteId" INTEGER,
    "localId" INTEGER,
    "fonteAutoritativaId" INTEGER NOT NULL,
    "unidade" TEXT NOT NULL,
    "onHand" DECIMAL NOT NULL DEFAULT 0,
    "reserved" DECIMAL,
    "available" DECIMAL,
    "quarantined" DECIMAL,
    "damaged" DECIMAL,
    "inTransit" DECIMAL,
    "semanticaDisponivel" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "quantityRelevantForExpiry" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshnessEstado" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "dataConfidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "sourceVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SaldoEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SaldoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "SaldoEstoque_empresaId_produtoEstoqueId_fkey" FOREIGN KEY ("empresaId", "produtoEstoqueId") REFERENCES "ProdutoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "SaldoEstoque_empresaId_loteId_fkey" FOREIGN KEY ("empresaId", "loteId") REFERENCES "LoteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "SaldoEstoque_empresaId_localId_fkey" FOREIGN KEY ("empresaId", "localId") REFERENCES "LocalEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "SaldoEstoque_empresaId_fonteAutoritativaId_fkey" FOREIGN KEY ("empresaId", "fonteAutoritativaId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "SaldoEstoque_empresaId_produtoEstoqueId_idx" ON "SaldoEstoque"("empresaId", "produtoEstoqueId");
CREATE INDEX "SaldoEstoque_empresaId_loteId_idx" ON "SaldoEstoque"("empresaId", "loteId");
CREATE INDEX "SaldoEstoque_empresaId_localId_idx" ON "SaldoEstoque"("empresaId", "localId");
CREATE INDEX "SaldoEstoque_empresaId_fonteAutoritativaId_idx" ON "SaldoEstoque"("empresaId", "fonteAutoritativaId");
CREATE INDEX "SaldoEstoque_empresaId_freshnessEstado_observedAt_idx" ON "SaldoEstoque"("empresaId", "freshnessEstado", "observedAt");
CREATE UNIQUE INDEX "stock_balance_product_only_uq" ON "SaldoEstoque"("empresaId", "produtoEstoqueId", "fonteAutoritativaId") WHERE "loteId" IS NULL AND "localId" IS NULL;
CREATE UNIQUE INDEX "stock_balance_product_location_uq" ON "SaldoEstoque"("empresaId", "produtoEstoqueId", "fonteAutoritativaId", "localId") WHERE "loteId" IS NULL AND "localId" IS NOT NULL;
CREATE UNIQUE INDEX "stock_balance_product_lot_uq" ON "SaldoEstoque"("empresaId", "produtoEstoqueId", "fonteAutoritativaId", "loteId") WHERE "loteId" IS NOT NULL AND "localId" IS NULL;
CREATE UNIQUE INDEX "stock_balance_product_lot_location_uq" ON "SaldoEstoque"("empresaId", "produtoEstoqueId", "fonteAutoritativaId", "loteId", "localId") WHERE "loteId" IS NOT NULL AND "localId" IS NOT NULL;

CREATE TABLE "ObservacaoEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fonteId" INTEGER NOT NULL,
    "syncRunId" INTEGER NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataQuality" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "warningsJson" TEXT,
    "appliedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ObservacaoEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ObservacaoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ObservacaoEstoque_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ObservacaoEstoque_empresaId_syncRunId_fkey" FOREIGN KEY ("empresaId", "syncRunId") REFERENCES "ExecucaoSincronizacaoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ObservacaoEstoque_empresaId_fonteId_sourceEntityType_sourceRecordId_sourceVersion_key" ON "ObservacaoEstoque"("empresaId", "fonteId", "sourceEntityType", "sourceRecordId", "sourceVersion");
CREATE INDEX "ObservacaoEstoque_empresaId_fonteId_checksum_idx" ON "ObservacaoEstoque"("empresaId", "fonteId", "checksum");
CREATE INDEX "ObservacaoEstoque_empresaId_retentionUntil_idx" ON "ObservacaoEstoque"("empresaId", "retentionUntil");

CREATE TABLE "ProblemaQualidadeEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fonteId" INTEGER NOT NULL,
    "syncRunId" INTEGER,
    "tipo" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "targetRef" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'OPEN',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "detailsSanitizedJson" TEXT,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProblemaQualidadeEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProblemaQualidadeEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ProblemaQualidadeEstoque_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ProblemaQualidadeEstoque_empresaId_syncRunId_fkey" FOREIGN KEY ("empresaId", "syncRunId") REFERENCES "ExecucaoSincronizacaoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "ProblemaQualidadeEstoque_empresaId_estado_lastSeenAt_idx" ON "ProblemaQualidadeEstoque"("empresaId", "estado", "lastSeenAt");
CREATE INDEX "ProblemaQualidadeEstoque_empresaId_fonteId_tipo_idx" ON "ProblemaQualidadeEstoque"("empresaId", "fonteId", "tipo");
CREATE INDEX "ProblemaQualidadeEstoque_empresaId_retentionUntil_idx" ON "ProblemaQualidadeEstoque"("empresaId", "retentionUntil");

CREATE TABLE "EventoAuditoriaEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUsuarioId" INTEGER,
    "actorSystemKey" TEXT,
    "action" TEXT NOT NULL,
    "beforeJsonSanitized" TEXT,
    "afterJsonSanitized" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventoAuditoriaEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventoAuditoriaEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "EventoAuditoriaEstoque_empresaId_actorUsuarioId_fkey" FOREIGN KEY ("empresaId", "actorUsuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "stock_audit_actor_shape_ck" CHECK (
      ("actorType" = 'USER' AND "actorUsuarioId" IS NOT NULL AND "actorSystemKey" IS NULL) OR
      ("actorType" = 'SYSTEM' AND "actorUsuarioId" IS NULL AND "actorSystemKey" IN ('stock-sync', 'stock-import', 'stock-retention', 'stock-outbox'))
    )
);
CREATE INDEX "EventoAuditoriaEstoque_empresaId_action_createdAt_idx" ON "EventoAuditoriaEstoque"("empresaId", "action", "createdAt");
CREATE INDEX "EventoAuditoriaEstoque_empresaId_actorUsuarioId_createdAt_idx" ON "EventoAuditoriaEstoque"("empresaId", "actorUsuarioId", "createdAt");

CREATE TABLE "EventoOutboxEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "materialVersion" INTEGER NOT NULL,
    "payloadStructuredJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventoOutboxEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventoOutboxEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "EventoOutboxEstoque_empresaId_eventType_aggregateType_aggregateId_materialVersion_key" ON "EventoOutboxEstoque"("empresaId", "eventType", "aggregateType", "aggregateId", "materialVersion");
CREATE INDEX "EventoOutboxEstoque_empresaId_status_availableAt_idx" ON "EventoOutboxEstoque"("empresaId", "status", "availableAt");
CREATE INDEX "EventoOutboxEstoque_empresaId_leaseExpiresAt_idx" ON "EventoOutboxEstoque"("empresaId", "leaseExpiresAt");
CREATE INDEX "EventoOutboxEstoque_empresaId_retentionUntil_idx" ON "EventoOutboxEstoque"("empresaId", "retentionUntil");

CREATE TABLE "ImportacaoEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fonteId" INTEGER NOT NULL,
    "actorUsuarioId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "schemaVersion" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "safeFilename" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "syncRunId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "ImportacaoEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportacaoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ImportacaoEstoque_empresaId_fonteId_fkey" FOREIGN KEY ("empresaId", "fonteId") REFERENCES "FonteEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ImportacaoEstoque_empresaId_actorUsuarioId_fkey" FOREIGN KEY ("empresaId", "actorUsuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ImportacaoEstoque_empresaId_syncRunId_fkey" FOREIGN KEY ("empresaId", "syncRunId") REFERENCES "ExecucaoSincronizacaoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ImportacaoEstoque_empresaId_id_key" ON "ImportacaoEstoque"("empresaId", "id");
CREATE UNIQUE INDEX "ImportacaoEstoque_empresaId_idempotencyKey_key" ON "ImportacaoEstoque"("empresaId", "idempotencyKey");
CREATE INDEX "ImportacaoEstoque_empresaId_fonteId_fileHash_schemaVersion_idx" ON "ImportacaoEstoque"("empresaId", "fonteId", "fileHash", "schemaVersion");
CREATE UNIQUE INDEX "stock_import_active_file_uq" ON "ImportacaoEstoque"("empresaId", "fonteId", "fileHash", "schemaVersion") WHERE "status" IN ('PREVIEW', 'READY', 'PROCESSING', 'APPLIED', 'PARTIAL');
CREATE INDEX "ImportacaoEstoque_empresaId_status_expiresAt_idx" ON "ImportacaoEstoque"("empresaId", "status", "expiresAt");
CREATE INDEX "ImportacaoEstoque_empresaId_actorUsuarioId_createdAt_idx" ON "ImportacaoEstoque"("empresaId", "actorUsuarioId", "createdAt");
CREATE INDEX "ImportacaoEstoque_empresaId_retentionUntil_idx" ON "ImportacaoEstoque"("empresaId", "retentionUntil");

CREATE TABLE "LinhaImportacaoEstoque" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "importacaoId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rowChecksum" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "normalizedJsonSanitized" TEXT,
    "warningsJson" TEXT,
    "errorsJson" TEXT,
    "appliedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "LinhaImportacaoEstoque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LinhaImportacaoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "LinhaImportacaoEstoque_empresaId_importacaoId_fkey" FOREIGN KEY ("empresaId", "importacaoId") REFERENCES "ImportacaoEstoque"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "LinhaImportacaoEstoque_empresaId_importacaoId_rowNumber_key" ON "LinhaImportacaoEstoque"("empresaId", "importacaoId", "rowNumber");
CREATE INDEX "LinhaImportacaoEstoque_empresaId_importacaoId_rowChecksum_idx" ON "LinhaImportacaoEstoque"("empresaId", "importacaoId", "rowChecksum");
CREATE INDEX "LinhaImportacaoEstoque_empresaId_retentionUntil_idx" ON "LinhaImportacaoEstoque"("empresaId", "retentionUntil");

COMMIT;
