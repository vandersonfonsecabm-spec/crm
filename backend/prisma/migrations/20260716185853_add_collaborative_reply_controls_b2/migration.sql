ALTER TABLE "ConversaCanal"
ADD COLUMN "respostaReservadaPorId" INTEGER
REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversaCanal"
ADD COLUMN "respostaReservadaAte" DATETIME;

ALTER TABLE "MensagemCanal"
ADD COLUMN "autorUsuarioId" INTEGER
REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ConversaCanal_empresaId_respostaReservadaPorId_idx"
ON "ConversaCanal"("empresaId", "respostaReservadaPorId");

CREATE INDEX "ConversaCanal_empresaId_respostaReservadaAte_idx"
ON "ConversaCanal"("empresaId", "respostaReservadaAte");

CREATE INDEX "MensagemCanal_empresaId_conversaCanalId_autorUsuarioId_idx"
ON "MensagemCanal"("empresaId", "conversaCanalId", "autorUsuarioId");
