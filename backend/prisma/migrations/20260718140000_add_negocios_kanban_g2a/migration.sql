-- Add an idempotent link for the future legacy Client-to-Business backfill.
ALTER TABLE "Negocio" ADD COLUMN "legacyClienteId" INTEGER REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Negocio_legacyClienteId_key" ON "Negocio"("legacyClienteId");
CREATE INDEX "Negocio_empresaId_legacyClienteId_idx" ON "Negocio"("empresaId", "legacyClienteId");
