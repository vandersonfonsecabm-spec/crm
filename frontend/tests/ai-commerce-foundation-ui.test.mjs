import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("E6A UI exposes a bounded single-connection surface", () => {
  const api = read("src/services/aiCommerceApi.ts");
  const settings = read("src/components/ai-commerce/CommerceSettingsPanel.tsx");
  assert.match(api, /AICommerceMode = \"OFF\" \| \"SHADOW\" \| \"SUGGESTION_ONLY\" \| \"HUMAN_APPROVAL\"/);
  assert.match(api, /runAICommerceAssistant/);
  assert.match(api, /normalizeRunConnectionStatus/);
  assert.match(api, /return value\.mock === true \? "MOCK_AVAILABLE" : "NOT_CONNECTED"/);
  assert.match(api, /\/ai-commerce\/connection\/status/);
  assert.match(api, /\/catalogo-comercial\/busca/);
  assert.match(api, /\/catalogo-comercial\/ofertas\/preview/);
  assert.doesNotMatch(api, /\/ai-commerce\/catalog|\/ai-commerce\/interests|\/ai-commerce\/opportunity-drafts|\/ai-commerce\/handoffs/);
  assert.match(api, /isSafeCommerceUrl/);
  assert.doesNotMatch(api, /OpenAIAdapter|GeminiAdapter|AnthropicAdapter|ProviderRegistry/);
  assert.match(settings, /realProviderConnected.*false|Não conectado/);
  assert.match(settings, /Nenhum envio automático/);
});

test("ProductOffer renders stale, unknown and expired as non-authoritative", () => {
  const card = read("src/components/ai-commerce/ProductOfferCard.tsx");
  assert.match(card, /Oferta expirada/);
  assert.match(card, /Confirmar com vendedor/);
  assert.match(card, /manualConfirmationRequired/);
  assert.match(card, /isSafeCommerceUrl/);
  assert.match(card, /Tenho interesse/);
  assert.doesNotMatch(card, /onClick=\{\(\) => .*send|auto.?send/i);
});

test("Inbox assistant uses the existing composer as an insertion target", () => {
  const api = read("src/services/aiCommerceApi.ts");
  const panel = read("src/components/ai-commerce/CommerceInboxAssistantPanel.tsx");
  assert.match(panel, /onInsertComposer/);
  assert.match(panel, /Inserir no composer/);
  assert.match(panel, /envio continua sendo uma ação humana separada/);
  assert.match(panel, /Aprovar interesse/);
  assert.match(panel, /Criar oportunidade rascunho/);
  assert.match(panel, /Aprovar handoff/);
  assert.match(panel, /draftStale/);
  assert.match(api, /approvalToken: typeof value\.approvalToken === "string" \? value\.approvalToken : ""/);
  assert.match(api, /approvalToken: string/);
  assert.match(panel, /approvalToken: draft\.approvalToken/);
  assert.doesNotMatch(api, /createOpaqueKey\("approval"\)|createOpaqueKey\("reject"\)/);
  assert.doesNotMatch(panel, /approvalToken:\s*`approval-|approvalKeys/);
  assert.doesNotMatch(panel, /send.*Message|fetch\(.*\/send/i);
});

test("commerce routes stay inside the existing dashboard shell", () => {
  const navigation = read("src/navigation/dashboardNavigation.ts");
  assert.match(navigation, /\/catalogo-comercial/);
  assert.match(navigation, /\/configuracoes\/ia-comercial/);
  assert.doesNotMatch(navigation, /second|segunda.*Inbox|novo.*worker/i);
});
