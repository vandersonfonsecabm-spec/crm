-- Cliente.valor e um campo legado nao nulo. Esta flag separa zero informado
-- de ausencia de valor comercial sem alterar a fonte canonica de receita.
ALTER TABLE "Cliente" ADD COLUMN "valorInformado" BOOLEAN NOT NULL DEFAULT false;

-- Apenas valores historicos diferentes de zero possuem evidencia suficiente
-- para serem classificados como informados. Zero legado permanece desconhecido.
UPDATE "Cliente" SET "valorInformado" = true WHERE "valor" <> 0;
