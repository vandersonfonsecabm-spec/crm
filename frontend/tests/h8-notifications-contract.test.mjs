import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("H8 mantém sino, badge de não lidas e painel sem outbound", () => {
  const topbar = read("src/components/dashboard/DashboardTopbar.tsx");
  const notifications = read("src/components/dashboard/DashboardNotifications.tsx");
  const api = read("src/services/crmApi.ts");
  assert.match(topbar, /DashboardNotifications/);
  assert.match(notifications, /aria-label=\{badge \? `Notificações, \$\{badge\} novas`/);
  assert.match(notifications, /markAllNotificationsRead/);
  assert.match(notifications, /Lembrar depois/);
  assert.match(api, /\/notificacoes\/resumo/);
  assert.doesNotMatch(notifications, /navigator\.serviceWorker|Notification\.requestPermission|mailto:|whatsapp/);
});

test("H8 resolve destino exato e preserva query na navegação", () => {
  const dashboard = read("src/pages/Dashboard.tsx");
  const inbox = read("src/components/leads-communication/DashboardInboxPanel.tsx");
  const agenda = read("src/components/dashboard/DashboardAgendaPanel.tsx");
  const service = read("../backend/src/notifications/service.js");
  assert.match(dashboard, /conversationId/);
  assert.match(dashboard, /acompanhamentoId/);
  assert.match(dashboard, /negocioId/);
  assert.match(service, /CONVERSATION.*conversationId/);
  assert.match(service, /FOLLOW_UP.*acompanhamentoId/);
  assert.match(service, /DEAL.*negocioId/);
  assert.match(inbox, /syncedInitialConversationId/);
  assert.match(inbox, /setSelectedId\(initialConversationId\)/);
  assert.match(agenda, /consumedInitialFollowUpId/);
});

test("H8 painel informa estado e prioridade para tecnologias assistivas", () => {
  const notifications = read("src/components/dashboard/DashboardNotifications.tsx");
  assert.match(notifications, /aria-modal="true"/);
  assert.match(notifications, /A Central de notificações está desativada/);
  assert.match(notifications, /Prioridade \$\{priorityLabel\(item\.prioridade\)\}/);
});

test("H8 oferece preferências e configuração da empresa com defaults explícitos", () => {
  const service = read("../backend/src/notifications/service.js");
  const migration = read("../backend/prisma/migrations/20260815120000_add_h8_notifications/migration.sql");
  const component = read("src/components/dashboard/DashboardNotifications.tsx");
  assert.match(component, /Configurações/);
  assert.match(component, /updateNotificationPreferences/);
  assert.match(component, /updateNotificationSettings/);
  assert.match(service, /MANAGER_ROLES/);
  assert.match(migration, /habilitada.*BOOLEAN NOT NULL DEFAULT false/i);
});

test("H8 usa estados separados para leitura, adiamento e resolução", () => {
  const service = read("../backend/src/notifications/service.js");
  assert.match(service, /markRead/);
  assert.match(service, /snooze/);
  assert.match(service, /unsnooze/);
  assert.match(service, /resolve/);
  assert.match(service, /createdAt: \{ lte: cutoffAt \}/);
  assert.match(service, /occurrenceKey/);
});
