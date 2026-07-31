ALTER TYPE "TipoCanal" ADD VALUE 'MESSENGER_META';
ALTER TYPE "ChaveFuncionalidade" ADD VALUE 'MESSENGER_INTEGRATION';
ALTER TYPE "ChaveFuncionalidade" ADD VALUE 'MESSENGER_INBOUND';

ALTER TABLE "CanalIntegracao"
ADD COLUMN "messengerPageId" TEXT,
ADD COLUMN "messengerPageNameMasked" TEXT;

CREATE UNIQUE INDEX "CanalIntegracao_messengerPageId_key"
ON "CanalIntegracao"("messengerPageId");
