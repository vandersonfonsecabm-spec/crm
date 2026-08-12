ALTER TABLE "IntegracaoOAuthState" ADD COLUMN "canalIntegracaoId" INTEGER;
ALTER TABLE "IntegracaoOAuthState" ADD COLUMN "fluxo" TEXT;

ALTER TABLE "IntegracaoOAuthState"
  ADD CONSTRAINT "IntegracaoOAuthState_empresaId_canalIntegracaoId_fkey"
  FOREIGN KEY ("empresaId", "canalIntegracaoId")
  REFERENCES "CanalIntegracao"("empresaId", "id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

CREATE INDEX "IntegracaoOAuthState_empresaId_canalIntegracaoId_fluxo_idx"
  ON "IntegracaoOAuthState"("empresaId", "canalIntegracaoId", "fluxo");
