ALTER TABLE "CanalIntegracao" ADD COLUMN "publicId" TEXT;
ALTER TABLE "CanalIntegracao" ADD COLUMN "configuracaoJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Lead" ADD COLUMN "paginaOrigem" TEXT;
ALTER TABLE "Lead" ADD COLUMN "aceitePoliticaPrivacidade" BOOLEAN;
ALTER TABLE "Lead" ADD COLUMN "versaoPoliticaPrivacidade" TEXT;
ALTER TABLE "Lead" ADD COLUMN "aceitePoliticaEm" DATETIME;
ALTER TABLE "NotaInternaConversa" ADD COLUMN "sistema" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "CanalIntegracao_publicId_key" ON "CanalIntegracao"("publicId");
