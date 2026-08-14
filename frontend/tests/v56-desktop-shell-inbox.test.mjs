import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("V56 entrega uma rail compacta e expande o conteúdo sem perder o estado", () => {
  const css = read("src/index.css");
  const sidebarCss = read("src/components/dashboard/DashboardSidebar.css");
  const dashboard = read("src/pages/Dashboard.tsx");

  assert.match(css, /--sidebar-expanded-width:\s*224px;/);
  assert.match(css, /--sidebar-collapsed-width:\s*68px;/);
  assert.match(sidebarCss, /\.sidebar-shell\.is-collapsed\s*\{\s*width:\s*var\(--sidebar-collapsed-width, 68px\)/);
  assert.match(sidebarCss, /sidebar-shell\.is-collapsed \.sidebar-brand-mark[\s\S]*?display: inline-flex/);
  assert.match(sidebarCss, /aria-label|sidebar-collapse-toggle/);
  assert.match(dashboard, /crm-sidebar-collapsed/);
  assert.match(dashboard, /isInboxPage \? " crm-content--inbox"/);
  assert.doesNotMatch(dashboard, /premium-shell min-h-screen select-none/);
});

test("V56 limita o modo full-workspace à Inbox e ancora as três colunas", () => {
  const dashboard = read("src/pages/Dashboard.tsx");
  const inbox = read("src/components/leads-communication/DashboardInboxPanel.tsx");
  const overlay = read("src/components/leads-communication/CommunicationOverlay.tsx");
  const css = read("src/components/leads-communication/LeadsCommunication.css");

  assert.match(dashboard, /\(!isInboxPage \|\| !leadsCommunicationEnabled\)/);
  assert.match(dashboard, /className=\{`crm-content[\s\S]*isInboxPage/);
  assert.match(dashboard, /inbox-route-section/);
  assert.match(dashboard, /inbox-route-stack/);
  assert.match(inbox, /className="inbox-page"/);
  assert.match(inbox, /Caixa de entrada/);
  assert.match(inbox, /aria-controls="inbox-conversation-context"/);
  assert.match(inbox, /actionModalTriggerRef\.current\?\.focus/);
  assert.match(overlay, /onCloseRef/);
  assert.match(css, /@media \(min-width: 1360px\)/);
  assert.match(css, /\.crm-content\.crm-content--inbox[\s\S]*?max-width: none[\s\S]*?padding: 8px 12px 12px/);
  assert.match(css, /\.crm-content--inbox \.inbox-workspace[\s\S]*?height: auto[\s\S]*?grid-template-columns: minmax\(280px, 24%\) minmax\(0, 76%\)/);
  assert.match(css, /\.crm-content--inbox \.inbox-workspace\.has-context[\s\S]*?grid-template-columns: minmax\(240px, 24%\) minmax\(0, 52%\) minmax\(260px, 24%\)/);
  assert.match(css, /\.crm-content--inbox \.inbox-workspace[\s\S]*?grid-template-columns: minmax\(280px, 24%\) minmax\(0, 76%\)/);
  assert.match(css, /\.inbox-list-scroll,\s*\.inbox-message-viewport,\s*\.inbox-context-pane/);
  assert.match(css, /\.crm-content--inbox \.inbox-context-content dd[\s\S]*?overflow-wrap: anywhere/);
});
