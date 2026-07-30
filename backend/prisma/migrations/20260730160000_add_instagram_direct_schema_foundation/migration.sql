ALTER TABLE "CanalIntegracao" ADD COLUMN "instagramBusinessAccountId" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "instagramUsernameMasked" TEXT;

CREATE UNIQUE INDEX "CanalIntegracao_instagramBusinessAccountId_key"
ON "CanalIntegracao"("instagramBusinessAccountId");
