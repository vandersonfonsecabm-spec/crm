-- Expand CRM client fields used by the frontend workspace.
ALTER TABLE "Cliente"
  ADD COLUMN IF NOT EXISTS "valor" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "origem" TEXT,
  ADD COLUMN IF NOT EXISTS "favorito" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quente" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ultimoContato" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "proximoFollowUp" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Cliente"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT,
  ALTER COLUMN "status" SET DEFAULT 'Novo';

CREATE TABLE IF NOT EXISTS "ClienteNota" (
  "id" SERIAL NOT NULL,
  "texto" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'nota',
  "clienteId" TEXT NOT NULL,
  "empresaId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClienteNota_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClienteNota_clienteId_fkey'
  ) THEN
    ALTER TABLE "ClienteNota"
      ADD CONSTRAINT "ClienteNota_clienteId_fkey"
      FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ClienteNota_clienteId_idx" ON "ClienteNota"("clienteId");
CREATE INDEX IF NOT EXISTS "ClienteNota_empresaId_idx" ON "ClienteNota"("empresaId");
CREATE INDEX IF NOT EXISTS "ClienteNota_createdAt_idx" ON "ClienteNota"("createdAt");
