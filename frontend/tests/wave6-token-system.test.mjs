import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Onda 6 centraliza papéis minerais e separa marca, sucesso, seleção e foco", async () => {
  const css = await source("src/index.css");

  for (const token of [
    "--brand",
    "--brand-subtle",
    "--success",
    "--info",
    "--warning",
    "--danger",
    "--selected-subtle",
    "--selected-border",
    "--hover-bg",
    "--focus-ring",
    "--surface-tonal",
    "--surface-muted",
    "--border-emphasis",
    "--text-strong",
    "--text-primary",
    "--text-secondary",
    "--text-tertiary",
    "--text-muted",
  ]) {
    assert.match(css, new RegExp(`${token}:`));
  }

  assert.match(css, /--brand:\s*#17624f;/);
  assert.match(css, /--success:\s*#2b744d;/);
  assert.match(css, /--focus:\s*#0c6876;/);
  assert.match(css, /--selected-marker:\s*var\(--brand\);/);
  assert.doesNotMatch(css, /--success:\s*var\(--brand\);/);
  assert.doesNotMatch(css, /--focus:\s*var\(--brand\);/);
});

test("Onda 6 modela E0–E4 e F como intensidade estrutural independente", async () => {
  const css = await source("src/index.css");

  for (const level of ["e0", "e1", "e2", "e3", "e4"]) {
    assert.match(css, new RegExp(`--emphasis-${level}-surface:`));
    assert.match(css, new RegExp(`--emphasis-${level}-border:`));
    assert.match(css, new RegExp(`--emphasis-${level}-text:`));
  }

  assert.match(css, /--emphasis-focus-outline:\s*var\(--focus\);/);
  assert.match(css, /--emphasis-focus-offset:\s*var\(--focus-ring-offset\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
});

test("Onda 6 aplica a prova dos tokens nos primitivos e mantém o Kanban neutro por etapa", async () => {
  const [button, badge, fields, feedback, sidebar, inbox, negocios] = await Promise.all([
    source("src/components/ui/Button.tsx"),
    source("src/components/ui/Badge.tsx"),
    source("src/components/ui/Fields.tsx"),
    source("src/components/ui/Feedback.tsx"),
    source("src/components/dashboard/DashboardSidebar.css"),
    source("src/components/leads-communication/LeadsCommunication.css"),
    source("src/components/negocios/DashboardNegocios.css"),
  ]);

  assert.match(button, /--action-primary-bg/);
  assert.match(button, /--action-danger-bg/);
  assert.match(button, /--focus-ring/);
  assert.match(badge, /primary: "border-\[var\(--brand-border\)\]/);
  assert.match(badge, /success: "border-\[var\(--success-border\)\]/);
  assert.match(fields, /--control-border-focus/);
  assert.match(fields, /--focus-ring/);
  assert.match(fields, /data-ui-control/);
  assert.match(feedback, /bg-\[var\(--bg-muted\)\]/);
  assert.match(sidebar, /border-color: var\(--selected-border\);/);
  assert.match(sidebar, /color: var\(--selected-marker\);/);
  assert.match(inbox, /border-left-color: var\(--selected-marker\);/);
  assert.match(inbox, /background: var\(--selected-subtle\);/);
  assert.match(negocios, /background: var\(--surface\);/);
  assert.match(negocios, /\.negocios-stage-header\s*\{[\s\S]*?border-bottom: 1px solid var\(--border\);/);
  assert.match(negocios, /\.negocios-stage-header\s*\{[\s\S]*?background: var\(--surface-subtle\);/);
  assert.doesNotMatch(negocios, /\.negocios-stage\[data-stage=/);
  assert.match(negocios, /\.negocios-card\.is-overdue\s*\{[\s\S]*?border-left: 2px solid var\(--danger\);/);
  assert.match(negocios, /\.negocios-card-action\.is-overdue/);
});
