ALTER TABLE "Negocio" ADD COLUMN "etapaEntrouEm" DATETIME;
ALTER TABLE "Negocio" ADD COLUMN "ultimaMovimentacaoEm" DATETIME;

ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "etapaAnterior" TEXT;
ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "etapaNova" TEXT;
ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "etapaEntrouEm" DATETIME;
ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "etapaSaiuEm" DATETIME;
ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "duracaoEtapaSegundos" INTEGER;
ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "duracaoEtapaEstimada" BOOLEAN;
