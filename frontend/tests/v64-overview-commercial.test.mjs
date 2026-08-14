import assert from "node:assert/strict";
import test from "node:test";

async function processModel() {
  return import(new URL("../src/components/dashboard/DashboardCommercialProcessModel.ts", import.meta.url).href);
}

test("V64 calcula funil, negócios abertos e gargalos a partir dos resumos reais", async () => {
  const { buildCommercialProcessModel } = await processModel();
  const model = buildCommercialProcessModel(
    {
      total: 10,
      porEtapa: { NOVO: 3, CONTATO: 2, PROPOSTA: 2, FECHADO: 2, PERDIDO: 1 },
      fechados: 2,
      perdidos: 1,
    },
    { data: [{ id: 11 }, { id: 12 }], pagination: { total: 4 } },
    { indicadores: { total: 5, pendentes: 4, paraHoje: 2, atrasados: 3, criticos: 1, concluidosPeriodo: 2 }, proximos: [], porTipo: [] },
  );

  assert.deepEqual(model.stages.map((row) => [row.stage, row.total]), [["NOVO", 3], ["CONTATO", 2], ["PROPOSTA", 2], ["FECHADO", 2], ["PERDIDO", 1]]);
  assert.equal(model.total, 10);
  assert.equal(model.open, 7);
  assert.equal(model.won, 2);
  assert.equal(model.lost, 1);
  assert.equal(model.overdue, 3);
  assert.equal(model.stalledTotal, 4);
});

test("V64 falha fechado para números inválidos sem inventar quantidade", async () => {
  const { buildCommercialProcessModel } = await processModel();
  const model = buildCommercialProcessModel(
    { total: -1, porEtapa: { NOVO: Number.NaN, CONTATO: 1, PROPOSTA: 0, FECHADO: 0, PERDIDO: 0 }, fechados: -2, perdidos: 0 },
    { data: [], pagination: { total: -3 } },
    { indicadores: { total: 0, pendentes: 0, paraHoje: 0, atrasados: -1, criticos: 0, concluidosPeriodo: 0 }, proximos: [], porTipo: [] },
  );
  assert.equal(model.total, 0);
  assert.equal(model.open, 0);
  assert.equal(model.overdue, 0);
  assert.equal(model.stalledTotal, 0);
  assert.equal(model.stages[0].total, 0);
});
