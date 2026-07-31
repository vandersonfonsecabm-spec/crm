ALTER TABLE "CanalIntegracao" ADD COLUMN "messengerPageId" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "messengerPageNameMasked" TEXT;

CREATE UNIQUE INDEX "CanalIntegracao_messengerPageId_key"
ON "CanalIntegracao"("messengerPageId");
