import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const panel = fs.readFileSync(path.join(root, "src/components/leads-communication/DashboardInboxPanel.tsx"), "utf8");
const api = fs.readFileSync(path.join(root, "src/services/crmApi.ts"), "utf8");
const formatters = fs.readFileSync(path.join(root, "src/components/leads-communication/communicationFormatters.ts"), "utf8");

test("V61 Inbox operational queue exposes awaiting, next and reminder controls", () => {
  assert.match(panel, /useState<QueueScope>\("aguardando"\)/);
  assert.match(panel, /fila: "AGUARDANDO_RESPOSTA"/);
  assert.match(panel, /Próxima pendência/);
  assert.match(panel, /Enviar e próxima/);
  assert.match(panel, /Lembrar depois/);
  assert.match(panel, /snoozeCommunicationConversation/);
  assert.match(api, /snoozeCommunicationConversation\(id: number/);
});

test("V61 chat timestamps use one day separator, provider time and accessible full datetime", () => {
  assert.match(panel, /message\.enviadaEm \|\| message\.createdAt/);
  assert.match(panel, /formatCommunicationDayLabel\(timestamp\)/);
  assert.match(panel, /dateTime=\{timestamp \?\? undefined\}/);
  assert.match(panel, /aria-label=\{simulated \?/);
  assert.match(panel, /Simulação registrada; não enviada em/);
  assert.doesNotMatch(panel, /deliveryLabel\(/);
  assert.match(formatters, /formatCommunicationDateTime/);
});
