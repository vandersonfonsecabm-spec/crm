ALTER TYPE "TipoCanal" ADD VALUE 'INSTAGRAM_META';
ALTER TYPE "ChaveFuncionalidade" ADD VALUE 'INSTAGRAM_INTEGRATION';
ALTER TYPE "ChaveFuncionalidade" ADD VALUE 'INSTAGRAM_INBOUND';

ALTER TABLE "CanalIntegracao"
ADD COLUMN "instagramBusinessAccountId" TEXT,
ADD COLUMN "instagramUsernameMasked" TEXT;

CREATE UNIQUE INDEX "CanalIntegracao_instagramBusinessAccountId_key"
ON "CanalIntegracao"("instagramBusinessAccountId");
