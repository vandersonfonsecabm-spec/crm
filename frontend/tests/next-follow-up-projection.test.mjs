import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projection = await import(pathToFileURL(path.join(frontendDir, "src/utils/followUpProjection.ts")));

test("formata projecao ISO para hoje, amanha, atrasado, futuro e sentinela", () => {
  const now = new Date(2026, 6, 29, 10, 0, 0);
  assert.equal(projection.formatNextFollowUp(new Date(2026, 6, 29, 11, 0, 0).toISOString(), now), "Hoje");
  assert.equal(projection.formatNextFollowUp(new Date(2026, 6, 30, 11, 0, 0).toISOString(), now), "Amanhã");
  assert.equal(projection.formatNextFollowUp(new Date(2026, 6, 29, 9, 0, 0).toISOString(), now), "Atrasado");
  assert.match(
    projection.formatNextFollowUp(new Date(2026, 7, 2, 11, 30, 0).toISOString(), now),
    /02\/08\/2026.*11:30/,
  );
  assert.equal(projection.formatNextFollowUp("Sem acompanhamento", now), "Sem acompanhamento");
});

test("cliente usa projecao do backend, nao envia edicao e modal e somente leitura", async () => {
  const [api, modal] = await Promise.all([
    readFile(path.join(frontendDir, "src/services/crmApi.ts"), "utf8"),
    readFile(path.join(frontendDir, "src/components/dashboard/ClientModal.tsx"), "utf8"),
  ]);
  assert.match(api, /cliente\.proximoFollowUp \?\? fallback\?\.nextFollowUp/);
  const payload = api.slice(api.indexOf("function clientToPayload"), api.indexOf("function backendIdToNumericId"));
  assert.doesNotMatch(payload, /proximoFollowUp/);
  assert.match(modal, /formatNextFollowUp\(client\.nextFollowUp\)/);
  assert.match(modal, /readOnly/);
  assert.doesNotMatch(modal, /updateField\("nextFollowUp"/);
});

test("allowlists nao liberam a acao de projecao", async () => {
  const actions = await readFile(path.join(frontendDir, "../backend/src/automations/actions.js"), "utf8");
  const worker = actions.slice(actions.indexOf("WORKER_ACTION_TYPES"), actions.indexOf("PILOT_ACTION_TYPES"));
  const pilot = actions.slice(actions.indexOf("PILOT_ACTION_TYPES"), actions.indexOf("function"));
  assert.doesNotMatch(worker, /UPDATE_NEXT_FOLLOW_UP_PROJECTION/);
  assert.doesNotMatch(pilot, /UPDATE_NEXT_FOLLOW_UP_PROJECTION/);
});
