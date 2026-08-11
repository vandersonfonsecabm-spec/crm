import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

function temporalGroupingFrom(panel) {
  const groupingStart = panel.indexOf("function buildAgendaTemporalGroups");
  const groupingEnd = panel.indexOf("function startOfWeek");
  const localDayStart = panel.indexOf("function isSameLocalDay");
  const localDayEnd = panel.indexOf("function formatWeekLabel");

  assert.ok(groupingStart >= 0 && groupingEnd > groupingStart, "agrupamento temporal disponível");
  assert.ok(localDayStart >= 0 && localDayEnd > localDayStart, "comparação local de dia disponível");

  const code = ts.transpileModule(
    `${panel.slice(groupingStart, groupingEnd)}\n${panel.slice(localDayStart, localDayEnd)}\nglobalThis.__wave5TemporalGrouping = buildAgendaTemporalGroups;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const context = {};
  vm.runInNewContext(code, context);
  return context.__wave5TemporalGrouping;
}

test("Onda 5 mantém a lista contínua agrupada sem alterar a Semana", async () => {
  const panel = await source("src/components/dashboard/DashboardAgendaPanel.tsx");

  assert.match(panel, /viewMode === "list" && <AgendaTemporalList/);
  assert.match(panel, /viewMode === "week" && items\.length > 0 && \(/);
  assert.match(panel, /function AgendaWeekView/);
  assert.match(panel, /temporalGroup=\{group\.key\}/);

  for (const group of ["overdue", "today", "upcoming", "completed", "cancelled"]) {
    assert.match(panel, new RegExp(`key: "${group}"`));
    assert.match(panel, new RegExp(`agenda-row--\\$\\{temporalGroup\\}`));
  }
});

test("Onda 5 reutiliza a regra temporal existente em meia-noite, hoje, atrasado e futuro", async () => {
  const panel = await source("src/components/dashboard/DashboardAgendaPanel.tsx");
  const grouping = temporalGroupingFrom(panel);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const future = new Date(midnight);
  future.setDate(future.getDate() + 1);
  const oneMinuteBeforeMidnight = new Date(midnight.getTime() - 60_000);
  const grouped = grouping([
    { id: 1, dataHora: oneMinuteBeforeMidnight.toISOString(), atrasado: true, status: "PENDENTE" },
    { id: 2, dataHora: midnight.toISOString(), atrasado: false, status: "PENDENTE" },
    { id: 3, dataHora: future.toISOString(), atrasado: false, status: "PENDENTE" },
  ]);

  assert.match(panel, /item\.atrasado\s*\?\s*"overdue"/);
  assert.match(panel, /isSameLocalDay\(new Date\(item\.dataHora\), today\)/);
  assert.match(panel, /date\.setHours\(0, 0, 0, 0\)/);
  assert.match(panel, /date\.setHours\(23, 59, 59, 999\)/);
  assert.match(panel, /:\s*"upcoming";/);
  assert.doesNotMatch(panel, /function (isToday|isOverdue|isFuture|startOfDay|endOfDay)\(/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(grouped.map((group) => [group.key, group.items.map((item) => item.id)]))),
    [["overdue", [1]], ["today", [2]], ["upcoming", [3]]],
  );
});

test("Onda 5 preserva filtros, paginação, ações, status, prioridade, responsável e vínculos", async () => {
  const panel = await source("src/components/dashboard/DashboardAgendaPanel.tsx");

  for (const contract of [
    "Buscar cliente ou título",
    "Filtrar por status",
    "Filtrar por prioridade",
    "Filtrar por responsável",
    "Pagination",
    "statusTone",
    "priorityTone",
    "responsavelUsuario",
    "clienteId",
    "negocioId",
    "conversaCanalId",
    "propostaComercialId",
    "permissoes?.editar",
    "permissoes?.concluir",
    "permissoes?.reabrir",
    "permissoes?.cancelar",
    "Histórico",
    "Reagendar",
    "Iniciar",
    "Concluir",
    "Reabrir",
    "Cancelar",
  ]) {
    assert.match(panel, new RegExp(contract.replace(/[?.]/g, "\\$&")));
  }
});

test("Onda 5 usa superfície e cores sem redefinir tokens globais", async () => {
  const [panel, css] = await Promise.all([
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/components/dashboard/DashboardAgenda.css"),
  ]);

  assert.match(panel, /import "\.\/DashboardAgenda\.css"/);
  for (const className of ["agenda-temporal-group-header", "agenda-row--overdue", "agenda-row--today", "agenda-row--upcoming", "agenda-row--completed", "agenda-row--cancelled"]) {
    assert.match(css, new RegExp(`\\.${className}`));
  }
  assert.match(css, /@media \(max-width: 1279px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /:root|#[0-9a-f]{3,8}\b/i);
});
