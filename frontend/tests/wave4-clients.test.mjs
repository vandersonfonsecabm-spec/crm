import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("Onda 4 Clientes apresenta somente os campos de listagem contratados", async () => {
  const table = await source("src/components/dashboard/DashboardClientsTable.tsx");

  for (const label of ["Cliente", "Localização", "Contato", "Status + risco", "Próxima ação", "Ações"]) {
    assert.match(table, new RegExp(`>${escapeRegExp(label)}<`));
  }
  assert.equal((table.match(/<th /g) ?? []).length, 6);
  assert.match(table, /Abrir Cliente 360/);
  assert.match(table, /maskPhone/);
  assert.match(table, /maskEmail/);
  assert.match(table, /classifyNextFollowUp/);
  assert.match(table, /data-clientes-sticky="client"/);
  assert.match(table, /data-clientes-sticky="actions"/);
  assert.doesNotMatch(table, /\bScore\b|data-clientes-score|scoreClass/);
  assert.doesNotMatch(table, /money\(client\.value\)/);
  assert.doesNotMatch(table, /leadOwner\(client\)/);
  assert.doesNotMatch(table, /getLeadScore\(client\)/);
  assert.doesNotMatch(table, /forecastLabel\(client\)/);
});

test("Onda 4 Clientes mantém ações, paginação e estados de foco sem inventar indicadores", async () => {
  const [table, filters, css, dashboard] = await Promise.all([
    source("src/components/dashboard/DashboardClientsTable.tsx"),
    source("src/components/dashboard/DashboardOperationalSearch.tsx"),
    source("src/components/dashboard/DashboardClientes.css"),
    source("src/pages/Dashboard.tsx"),
  ]);

  for (const snippet of ["onToggleFavorite", "onToggleHot", "onRequestWhatsapp", "Pagination", "Nenhum cliente encontrado", "truncate"]) {
    assert.match(table, new RegExp(snippet));
  }
  assert.match(table, /function rowActions/);
  assert.doesNotMatch(dashboard, /DashboardClientsInsights/);
  assert.match(dashboard, /activePage !== "comercial" && activePage !== "clientes" && activePage !== "agenda"/);

  assert.match(filters, /const isClientsPage = activePage === "clientes"/);
  assert.match(filters, /Ordem padrão/);
  assert.match(filters, /clientes-filter-hot/);
  assert.match(filters, /triggerLabel="Mais"/);
  assert.match(css, /\.clientes-table-surface/);
  assert.match(css, /\.clientes-client-link:focus-visible/);
  assert.match(css, /\.clientes-next-action--overdue/);
  assert.match(css, /\.clientes-table \[data-clientes-sticky="client"\]/);
  assert.match(css, /\.clientes-table \[data-clientes-sticky="actions"\]/);
  assert.doesNotMatch(css, /:root|#[0-9a-f]{3,8}/i);
});
