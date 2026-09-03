import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAX_PRISMA_INT,
  addMoneyWithinPrismaInt,
  multiplyQuantityByCentsRoundHalfUp,
  parseMoneyInputToCents,
  parseNonNegativePrismaInt,
  quantityToMilli,
} from "../src/utils/commercialMoney.js";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("preview monetario replica quantidade em milessimos e ROUND_HALF_UP do servidor", () => {
  assert.equal(multiplyQuantityByCentsRoundHalfUp("1.005", 100), 101);
  assert.equal(multiplyQuantityByCentsRoundHalfUp("0,145", 100), 15);
  assert.equal(multiplyQuantityByCentsRoundHalfUp("0.580", 25), 15);
  assert.equal(quantityToMilli("999999999.999"), 999999999999n);
});

test("entradas monetarias do frontend sao exatas e limitadas ao INTEGER do PostgreSQL", () => {
  assert.equal(parseMoneyInputToCents("21.474.836,47"), null);
  assert.equal(parseMoneyInputToCents("21474836,47"), MAX_PRISMA_INT);
  assert.equal(parseMoneyInputToCents("21474836,48"), null);
  assert.equal(parseMoneyInputToCents("10,05"), 1005);
  assert.equal(parseNonNegativePrismaInt(MAX_PRISMA_INT), MAX_PRISMA_INT);
  for (const value of [null, undefined, "", " ", false, [], "1e3", -1, 1.5, MAX_PRISMA_INT + 1]) {
    assert.equal(parseNonNegativePrismaInt(value), null, String(value));
  }
});

test("preview rejeita overflow em item e na soma", () => {
  assert.equal(multiplyQuantityByCentsRoundHalfUp("2", MAX_PRISMA_INT), null);
  assert.equal(addMoneyWithinPrismaInt(MAX_PRISMA_INT, 0), MAX_PRISMA_INT);
  assert.equal(addMoneyWithinPrismaInt(MAX_PRISMA_INT, 1), null);
});

test("exportacao distingue valor desconhecido de zero informado", async () => {
  const actions = await readFile(path.join(frontendDir, "src/hooks/useDashboardActions.ts"), "utf8");
  assert.match(actions, /Valor informado \(BRL\)/);
  assert.match(actions, /client\.valueKnown === false \? "" : String\(client\.value\)/);
  assert.match(actions, /client\.valueKnown === false \? "Não" : "Sim"/);
  assert.match(actions, /row\.map\(toCsvCell\)/);
  assert.match(actions, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 1_000\)/);
});

test("cards comerciais não convertem valor desconhecido em zero ou ticket", async () => {
  const [kanban, decisionCenter, executiveRadar] = await Promise.all([
    readFile(path.join(frontendDir, "src/components/kanban/KanbanLeadCard.tsx"), "utf8"),
    readFile(path.join(frontendDir, "src/components/dashboard/DashboardCommercialDecisionCenter.tsx"), "utf8"),
    readFile(path.join(frontendDir, "src/components/dashboard/DashboardExecutiveRadar.tsx"), "utf8"),
  ]);
  assert.match(kanban, /client\.valueKnown === false \? "Valor não informado" : money\(client\.value\)/);
  assert.match(decisionCenter, /proposalValueKnown/);
  assert.match(decisionCenter, /selectedClient\.valueKnown === false \? "Não informado"/);
  assert.match(executiveRadar, /filter\(\(client\) => client\.valueKnown !== false\)/);
  assert.match(executiveRadar, /proposalValueKnown/);
});

test("catalogo e oferta exibem preco somente quando o status e explicitamente AVAILABLE", async () => {
  const [offerCard, catalogPanel] = await Promise.all([
    readFile(path.join(frontendDir, "src/components/ai-commerce/ProductOfferCard.tsx"), "utf8"),
    readFile(path.join(frontendDir, "src/components/ai-commerce/CommerceCatalogPanel.tsx"), "utf8"),
  ]);
  assert.match(offerCard, /status !== "AVAILABLE"/);
  assert.match(catalogPanel, /product\.priceStatus !== "AVAILABLE"/);
});

test("sincronizacao manual do Bling inclui precos quando o provider for conectado", async () => {
  const integrations = await readFile(path.join(frontendDir, "src/components/dashboard/DashboardIntegrationsPanel.tsx"), "utf8");
  assert.match(integrations, /sincronizarIntegracao\(integrationId, \["PRODUTOS", "ESTOQUE", "PRECOS"\]\)/);
});

test("preco promocional so e escolhido dentro da vigencia", async () => {
  const inventory = await readFile(path.join(frontendDir, "src/components/dashboard/DashboardInventoryPanel.tsx"), "utf8");
  assert.match(inventory, /start <= now/);
  assert.match(inventory, /end >= now/);
  assert.match(inventory, /promotionActive \? defaultPrice\.precoPromocionalCentavos/);
});

test("fixture visual monetaria reutiliza o editor real e permanece sem rede", async () => {
  const fixture = await readFile(path.join(frontendDir, "tests/fixtures/commercial-money-integrity.tsx"), "utf8");
  assert.match(fixture, /CommercialProposalEditorFixture/);
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|Authorization/);
});
