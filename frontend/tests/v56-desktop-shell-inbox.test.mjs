import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("V58 entrega uma rail ainda mais compacta e expande o conteúdo sem perder o estado", () => {
  const css = read("src/index.css");
  const sidebarCss = read("src/components/dashboard/DashboardSidebar.css");
  const dashboard = read("src/pages/Dashboard.tsx");

  assert.match(css, /--sidebar-expanded-width:\s*208px;/);
  assert.match(css, /--sidebar-collapsed-width:\s*64px;/);
  assert.match(sidebarCss, /\.sidebar-shell\.is-collapsed\s*\{\s*width:\s*var\(--sidebar-collapsed-width, 64px\)/);
  assert.match(sidebarCss, /sidebar-shell\.is-collapsed \.sidebar-brand-mark[\s\S]*?display: inline-flex/);
  assert.match(sidebarCss, /sidebar-shell\.is-collapsed \.sidebar-collapse-toggle[\s\S]*?width: 40px[\s\S]*?height: 40px/);
  assert.match(sidebarCss, /sidebar-shell\.is-collapsed \.sidebar-collapse-toggle:focus-visible[\s\S]*?outline-offset: -2px/);
  assert.match(sidebarCss, /aria-label|sidebar-collapse-toggle/);
  assert.match(dashboard, /crm-sidebar-collapsed/);
  assert.match(dashboard, /isInboxPage \? " crm-content--inbox"/);
  assert.doesNotMatch(dashboard, /premium-shell min-h-screen select-none/);
});

test("V58 mantém o modo full-workspace da Inbox e ancora as três colunas", () => {
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
  assert.match(inbox, /aria-controls=\{hasContextDrawer \? "inbox-conversation-context" : undefined\}/);
  assert.match(inbox, /CommunicationDrawer[\s\S]*id="inbox-conversation-context"/);
  assert.match(inbox, /actionModalTriggerRef\.current\?\.focus/);
  assert.match(overlay, /onCloseRef/);
  assert.match(css, /@media \(min-width: 1360px\)/);
  assert.match(css, /\.crm-workspace \.crm-main > \.crm-content\.crm-content--inbox[\s\S]*?max-width: none[\s\S]*?padding: 8px 10px 10px/);
  assert.match(css, /\.crm-content--inbox \.inbox-workspace[\s\S]*?height: auto[\s\S]*?grid-template-columns: minmax\(248px, 25%\) minmax\(0, 75%\)/);
  assert.match(css, /\.crm-content--inbox \.inbox-workspace\.has-context[\s\S]*?grid-template-columns: minmax\(248px, 25%\) minmax\(0, 50%\) minmax\(248px, 25%\)/);
  assert.match(css, /\.inbox-conversation-item[\s\S]*?min-height: 96px/);
  assert.match(css, /\.inbox-context-content dd[\s\S]*?overflow-wrap: anywhere[\s\S]*?word-break: break-word/);
  assert.match(css, /\.inbox-list-scroll,\s*\.inbox-message-viewport,\s*\.inbox-context-pane/);
  assert.match(css, /\.crm-content--inbox \.inbox-context-content dd[\s\S]*?overflow-wrap: anywhere/);
});
