import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Lote 5 diferencia estados globais com tokens sem criar novos contratos", async () => {
  const [feedback, dashboard, inventory] = await Promise.all([
    source("src/components/ui/Feedback.tsx"),
    source("src/pages/Dashboard.tsx"),
    source("src/components/dashboard/DashboardInventoryPanel.tsx"),
  ]);

  for (const state of ["empty", "no-results", "restricted", "unavailable", "info", "success", "warning", "danger"]) {
    assert.match(feedback, new RegExp(`${state === "no-results" ? '"no-results"' : state}:`));
  }
  assert.match(feedback, /data-ui-feedback data-state=\{state\}/);
  assert.match(feedback, /data-ui-feedback data-state="loading"/);
  assert.match(feedback, /state = "danger"/);
  assert.match(feedback, /state\?: Extract<FeedbackState, "restricted" \| "unavailable" \| "danger">/);
  assert.doesNotMatch(feedback, /#[0-9a-f]{3,8}\b/i);

  assert.match(dashboard, /state="unavailable" title="Recurso não habilitado"/);
  assert.match(inventory, /state: "restricted" \| "unavailable" \| "danger"/);
  assert.match(inventory, /state=\{errorState\.state\}/);
  assert.match(inventory, /state=\{sourceState === "disconnected" \? "unavailable" : "empty"\}/);
  assert.match(inventory, /state="no-results"/);
  assert.match(inventory, /status === 403[\s\S]*state: "restricted"/);
  assert.match(inventory, /status === 410[\s\S]*state: "unavailable"/);
});

test("Lote 5 preserva foco, tipografia de rótulo e sinais não exclusivos de cor", async () => {
  const [fields, button, badge, css] = await Promise.all([
    source("src/components/ui/Fields.tsx"),
    source("src/components/ui/Button.tsx"),
    source("src/components/ui/Badge.tsx"),
    source("src/index.css"),
  ]);

  assert.match(fields, /label className="text-xs font-medium/);
  assert.match(fields, /placeholder:text-\[var\(--control-placeholder\)\]/);
  assert.match(fields, /focus:outline-2/);
  assert.match(button, /size === "sm" \? "h-8 w-8"/);
  assert.match(button, /focus-visible:outline-2/);
  assert.match(badge, /text-\[11px\]/);
  assert.match(badge, /h-1\.5 w-1\.5 rounded-full/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
});

test("Fixture local do Lote 5 cobre todos os estados sem rede nem mutação", async () => {
  const [html, fixture] = await Promise.all([
    source("tests/fixtures/wave6/lot5-global-states.html"),
    source("tests/fixtures/wave6/lot5-global-states.tsx"),
  ]);

  assert.match(html, /WAVE6_GLOBAL_STATES_READ_ONLY/);
  for (const state of ["filled", "empty", "no-results", "error", "restricted", "unavailable", "loading", "selected", "disabled", "semantic", "field-focus"]) {
    assert.match(fixture, new RegExp(`state="${state}"`));
  }
  assert.match(fixture, /data-wave6-fixture="global-states"/);
  assert.match(fixture, /state="no-results"/);
  assert.match(fixture, /state="restricted"/);
  assert.match(fixture, /state="unavailable"/);
  assert.match(fixture, /<LoadingState/);
  assert.match(fixture, /<Button disabled/);
  assert.match(fixture, /StatusBadge status="sucesso"/);
  assert.match(fixture, /StatusBadge status="alerta"/);
  assert.match(fixture, /StatusBadge status="erro"/);
});

test("Lote 5 transpila os primitivos e a fixture focal sem erro de sintaxe", async () => {
  for (const relativePath of [
    "src/components/ui/Feedback.tsx",
    "src/components/ui/Fields.tsx",
    "src/components/ui/Badge.tsx",
    "src/components/dashboard/DashboardInventoryPanel.tsx",
    "tests/fixtures/wave6/lot5-global-states.tsx",
  ]) {
    const output = ts.transpileModule(await source(relativePath), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      fileName: relativePath,
      reportDiagnostics: true,
    });
    const errors = (output.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${relativePath}: ${errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")).join("; ")}`);
  }
});
