BEGIN;

DO $$ BEGIN
  CREATE TYPE "StockSourceType" AS ENUM ('INTERNAL', 'GENERIC_API_PULL', 'GENERIC_WEBHOOK_PUSH', 'DATABASE_READONLY', 'FILE_IMPORT_CSV', 'FILE_IMPORT_XLSX', 'MANUAL_CONTROLLED', 'VENDOR_SPECIFIC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockSourceStatus" AS ENUM ('DRAFT', 'VALIDATING', 'ACTIVE', 'DEGRADED', 'AUTH_ERROR', 'DISABLED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockSyncMode" AS ENUM ('FULL', 'DELTA', 'WEBHOOK', 'IMPORT', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'RETRY_WAIT', 'FAILED', 'CANCELLED', 'QUARANTINED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockMappingStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'MANUALLY_CONFIRMED', 'REJECTED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockLocationType" AS ENUM ('DEPOT', 'STORE', 'ROOM', 'SHELF', 'VIRTUAL', 'QUARANTINE', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockLotExpiryPrecision" AS ENUM ('DAY', 'MONTH', 'YEAR', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockLotStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'DISPOSED', 'ARCHIVED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockAvailableSemantics" AS ENUM ('EXPLICIT', 'DERIVED_ON_HAND_MINUS_RESERVED', 'UNAVAILABLE', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockFreshnessState" AS ENUM ('FRESH', 'AGING', 'STALE', 'UNKNOWN', 'PARTIAL', 'SYNC_FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockDataConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockQualityState" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'QUARANTINED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockAuditActorType" AS ENUM ('USER', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'QUARANTINED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockImportStatus" AS ENUM ('PREVIEW', 'READY', 'PROCESSING', 'APPLIED', 'PARTIAL', 'CANCELLED', 'EXPIRED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "StockImportRowStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'APPLIED', 'QUARANTINED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "LoteEstoque" DROP CONSTRAINT "stock_lot_validade_precision_ck";
ALTER TABLE "EventoAuditoriaEstoque" DROP CONSTRAINT "stock_audit_actor_shape_ck";
DROP INDEX "stock_import_active_file_uq";

ALTER TABLE "FonteEstoque"
  ALTER COLUMN "tipoFonte" TYPE "StockSourceType" USING "tipoFonte"::text::"StockSourceType",
  ALTER COLUMN "statusCiclo" DROP DEFAULT,
  ALTER COLUMN "statusCiclo" TYPE "StockSourceStatus" USING "statusCiclo"::text::"StockSourceStatus",
  ALTER COLUMN "statusCiclo" SET DEFAULT 'DRAFT'::"StockSourceStatus";

ALTER TABLE "ExecucaoSincronizacaoEstoque"
  ALTER COLUMN "modo" TYPE "StockSyncMode" USING "modo"::text::"StockSyncMode",
  ALTER COLUMN "estado" DROP DEFAULT,
  ALTER COLUMN "estado" TYPE "StockSyncStatus" USING "estado"::text::"StockSyncStatus",
  ALTER COLUMN "estado" SET DEFAULT 'PENDING'::"StockSyncStatus";

ALTER TABLE "MapeamentoProdutoExterno"
  ALTER COLUMN "estado" DROP DEFAULT,
  ALTER COLUMN "estado" TYPE "StockMappingStatus" USING "estado"::text::"StockMappingStatus",
  ALTER COLUMN "estado" SET DEFAULT 'UNMATCHED'::"StockMappingStatus";

ALTER TABLE "LocalEstoque"
  ALTER COLUMN "tipo" DROP DEFAULT,
  ALTER COLUMN "tipo" TYPE "StockLocationType" USING "tipo"::text::"StockLocationType",
  ALTER COLUMN "tipo" SET DEFAULT 'UNKNOWN'::"StockLocationType";

ALTER TABLE "LoteEstoque"
  ALTER COLUMN "precisaoValidade" DROP DEFAULT,
  ALTER COLUMN "precisaoValidade" TYPE "StockLotExpiryPrecision" USING "precisaoValidade"::text::"StockLotExpiryPrecision",
  ALTER COLUMN "precisaoValidade" SET DEFAULT 'UNKNOWN'::"StockLotExpiryPrecision",
  ALTER COLUMN "estado" DROP DEFAULT,
  ALTER COLUMN "estado" TYPE "StockLotStatus" USING "estado"::text::"StockLotStatus",
  ALTER COLUMN "estado" SET DEFAULT 'UNKNOWN'::"StockLotStatus";

ALTER TABLE "SaldoEstoque"
  ALTER COLUMN "semanticaDisponivel" DROP DEFAULT,
  ALTER COLUMN "semanticaDisponivel" TYPE "StockAvailableSemantics" USING "semanticaDisponivel"::text::"StockAvailableSemantics",
  ALTER COLUMN "semanticaDisponivel" SET DEFAULT 'UNKNOWN'::"StockAvailableSemantics",
  ALTER COLUMN "freshnessEstado" DROP DEFAULT,
  ALTER COLUMN "freshnessEstado" TYPE "StockFreshnessState" USING "freshnessEstado"::text::"StockFreshnessState",
  ALTER COLUMN "freshnessEstado" SET DEFAULT 'UNKNOWN'::"StockFreshnessState",
  ALTER COLUMN "dataConfidence" DROP DEFAULT,
  ALTER COLUMN "dataConfidence" TYPE "StockDataConfidence" USING "dataConfidence"::text::"StockDataConfidence",
  ALTER COLUMN "dataConfidence" SET DEFAULT 'UNKNOWN'::"StockDataConfidence";

ALTER TABLE "ObservacaoEstoque"
  ALTER COLUMN "dataQuality" DROP DEFAULT,
  ALTER COLUMN "dataQuality" TYPE "StockDataConfidence" USING "dataQuality"::text::"StockDataConfidence",
  ALTER COLUMN "dataQuality" SET DEFAULT 'UNKNOWN'::"StockDataConfidence";

ALTER TABLE "ProblemaQualidadeEstoque"
  ALTER COLUMN "estado" DROP DEFAULT,
  ALTER COLUMN "estado" TYPE "StockQualityState" USING "estado"::text::"StockQualityState",
  ALTER COLUMN "estado" SET DEFAULT 'OPEN'::"StockQualityState";

ALTER TABLE "EventoAuditoriaEstoque"
  ALTER COLUMN "actorType" TYPE "StockAuditActorType" USING "actorType"::text::"StockAuditActorType";

ALTER TABLE "EventoOutboxEstoque"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "StockOutboxStatus" USING "status"::text::"StockOutboxStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING'::"StockOutboxStatus";

ALTER TABLE "ImportacaoEstoque"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "StockImportStatus" USING "status"::text::"StockImportStatus",
  ALTER COLUMN "status" SET DEFAULT 'PREVIEW'::"StockImportStatus";

ALTER TABLE "LinhaImportacaoEstoque"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "StockImportRowStatus" USING "status"::text::"StockImportRowStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING'::"StockImportRowStatus";

ALTER TABLE "LoteEstoque" ADD CONSTRAINT "stock_lot_validade_precision_ck" CHECK (
  ("precisaoValidade" = 'DAY'::"StockLotExpiryPrecision" AND "validadeEm" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR
  ("precisaoValidade" = 'MONTH'::"StockLotExpiryPrecision" AND "validadeEm" ~ '^[0-9]{4}-[0-9]{2}$') OR
  ("precisaoValidade" = 'YEAR'::"StockLotExpiryPrecision" AND "validadeEm" ~ '^[0-9]{4}$') OR
  ("precisaoValidade" = 'UNKNOWN'::"StockLotExpiryPrecision" AND "validadeEm" IS NULL)
);
ALTER TABLE "EventoAuditoriaEstoque" ADD CONSTRAINT "stock_audit_actor_shape_ck" CHECK (
  ("actorType" = 'USER'::"StockAuditActorType" AND "actorUsuarioId" IS NOT NULL AND "actorSystemKey" IS NULL) OR
  ("actorType" = 'SYSTEM'::"StockAuditActorType" AND "actorUsuarioId" IS NULL AND "actorSystemKey" IN ('stock-sync', 'stock-import', 'stock-retention', 'stock-outbox'))
);
CREATE UNIQUE INDEX "stock_import_active_file_uq" ON "ImportacaoEstoque"("empresaId", "fonteId", "fileHash", "schemaVersion") WHERE "status" IN ('PREVIEW'::"StockImportStatus", 'READY'::"StockImportStatus", 'PROCESSING'::"StockImportStatus", 'APPLIED'::"StockImportStatus", 'PARTIAL'::"StockImportStatus");

COMMIT;
