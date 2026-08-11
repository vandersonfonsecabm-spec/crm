import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

async function sourceTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceTree(entryPath);
    if (!/\.(?:css|ts|tsx)$/.test(entry.name)) return "";
    return readFile(entryPath, "utf8");
  }));
  return chunks.join("\n");
}

function token(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`));
  assert.ok(match, `token hexadecimal ausente: --${name}`);
  return match[1];
}

function luminance(hex) {
  const values = hex.slice(1).match(/.{2}/g)?.map((component) => Number.parseInt(component, 16) / 255);
  assert.ok(values?.length === 3, `cor inválida: ${hex}`);
  const [red, green, blue] = values.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
}

test("Lote 9 prova contraste dos tokens de estados e controles", async () => {
  const css = await source("src/index.css");
  const pairs = [
    ["texto forte", "text-strong", "surface", 4.5],
    ["texto primário", "text-primary", "surface", 4.5],
    ["texto secundário", "text-secondary", "surface", 4.5],
    ["texto auxiliar", "text-muted", "surface", 4.5],
    ["desabilitado", "disabled-text", "disabled-bg", 4.5],
    ["sucesso", "success", "success-subtle", 4.5],
    ["informação", "info", "info-subtle", 4.5],
    ["aviso", "warning", "warning-subtle", 4.5],
    ["perigo", "danger", "danger-subtle", 4.5],
    ["foco", "focus", "surface", 3],
    ["borda de controle", "control-border", "surface", 3],
    ["marcador de seleção", "brand", "brand-subtle", 3],
  ];

  for (const [label, foreground, background, minimum] of pairs) {
    const ratio = contrastRatio(token(css, foreground), token(css, background));
    assert.ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)}:1 deve ser pelo menos ${minimum}:1`);
  }
});

test("Lote 9 conserva sinais redundantes, foco, alvos viáveis e movimento reduzido", async () => {
  const [css, feedback, button, fields, badge, commandSearch, topbar, quickActions] = await Promise.all([
    source("src/index.css"),
    source("src/components/ui/Feedback.tsx"),
    source("src/components/ui/Button.tsx"),
    source("src/components/ui/Fields.tsx"),
    source("src/components/ui/Badge.tsx"),
    source("src/components/dashboard/DashboardCommandSearch.tsx"),
    source("src/components/dashboard/DashboardTopbar.tsx"),
    source("src/components/dashboard/DashboardQuickActions.tsx"),
  ]);

  for (const state of ["empty", "no-results", "restricted", "unavailable", "info", "success", "warning", "danger"]) {
    assert.match(feedback, new RegExp(`(?:\\b${state}|"${state}"):`), `estado semântico ausente: ${state}`);
  }
  assert.match(feedback, /aria-busy="true"[\s\S]*?role="status"/);
  assert.match(feedback, /data-ui-feedback data-state=\{state\}/);
  assert.match(button, /disabled:bg-\[var\(--disabled-bg\)\][\s\S]*?disabled:text-\[var\(--disabled-text\)\]/);
  assert.match(fields, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(badge, /aria-hidden="true"[\s\S]*?\{label \?\? config\.label\}/);

  assert.match(commandSearch, /aria-selected=\{index === boundedSelectedIndex\}/);
  assert.match(commandSearch, /"is-selected"/);
  assert.match(css, /command-result:hover, \.crm-workspace \.command-result\.is-selected[\s\S]*?background: var\(--surface-subtle\)/);
  assert.match(css, /\.crm-workspace \.command-result\.is-selected \{ border-left: 2px solid var\(--selected-marker\);/);
  assert.match(css, /button:focus-visible[\s\S]*?outline: 2px solid var\(--focus-ring\); outline-offset: 2px;/);

  assert.match(topbar, /topbar-user-button flex h-11/);
  assert.match(quickActions, /topbar-icon-button inline-flex h-11 w-11/);
  assert.match(quickActions, /quick-action-item flex min-h-11/);
  assert.match(commandSearch, /command-search flex h-11/);

  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration: 0\.01ms !important;[\s\S]*?animation-duration: 0\.01ms !important;/);
  const allSource = await sourceTree(path.join(frontendDir, "src"));
  assert.doesNotMatch(allSource, /\btransition-all\b/);
  assert.doesNotMatch(allSource, /transition\s*:\s*all\b/i);
});

test("fixture Lote 9 é local, read-only e permite revisar estados e reflow", async () => {
  const [fixture, html, css] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote9-states.tsx"),
    source("tests/fixtures/compositional-redesign-lote9-states.html"),
    source("src/index.css"),
  ]);

  for (const component of ["DashboardSidebar", "DashboardTopbar", "LoadingState", "EmptyState", "ErrorState", "StatusBadge", "IconButton"]) {
    assert.match(fixture, new RegExp(component));
  }
  assert.match(fixture, /data-compositional-lote="9"/);
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /data-reflow-targets="1440,1280,320,200"/);
  assert.match(fixture, /state="no-results"/);
  assert.match(fixture, /state="restricted"/);
  assert.match(fixture, /state="unavailable"/);
  assert.match(fixture, /aria-selected="true"[\s\S]*?command-result is-selected/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/i);
  assert.match(html, /src="\/tests\/fixtures\/compositional-redesign-lote9-states\.tsx"/);

  assert.match(css, /body \{[^}]*min-width: 320px;/);
  assert.match(css, /\.crm-workspace \{ min-height: 100vh; overflow-x: hidden;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.page-header-main \{ flex-direction: column;/);
});
