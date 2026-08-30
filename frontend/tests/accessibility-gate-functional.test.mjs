import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

function between(value, start, end) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, "início ausente: " + start);
  assert.ok(endIndex >= 0, "fim ausente: " + end);
  return value.slice(startIndex, endIndex);
}

test("gate A oferece movimentação de Negócio por teclado no drawer usando a mutação existente", async () => {
  const panel = await source("src/components/negocios/DashboardNegociosKanbanPanel.tsx");
  const move = between(panel, "async function moveBusiness", "if (loading) return");
  const drawer = between(panel, "function BusinessDrawer", "function Detail");

  assert.match(move, /current\.permissoes\?\.movimentar/);
  assert.match(move, /stageUpdates\.current\.add\(id\)/);
  assert.match(move, /const snapshot = businesses/);
  assert.match(panel, /const defaultNegociosKanbanAdapter: NegociosKanbanAdapter = \{[\s\S]*?updateNegocioKanbanStage,[\s\S]*?\}/);
  assert.match(move, /await adapter\.updateNegocioKanbanStage\(id, nextStage, current\.etapa\)/);
  assert.match(move, /setBusinesses\(snapshot\)/);
  assert.match(move, /onToast\("Não foi possível mover o Negócio\. A etapa anterior foi restaurada\."\)/);
  assert.match(move, /setMovingBusinessId\(id\)/);
  assert.match(move, /setMovingBusinessId\(\(movingId\) => movingId === id \? null : movingId\)/);
  assert.match(panel, /<BusinessDrawer[\s\S]*?isMoving=\{movingBusinessId === selected\.id\}[\s\S]*?onMoveBusiness=\{moveBusiness\}/);

  assert.match(drawer, /const canMove = business\.permissoes\?\.movimentar === true/);
  assert.match(drawer, /<Select[\s\S]*?label="Mover para etapa"/);
  assert.match(drawer, /disabled=\{!canMove \|\| isMoving\}/);
  assert.match(drawer, /aria-busy=\{isMoving\}/);
  assert.match(drawer, /ref=\{stageSelectRef\}/);
  assert.match(drawer, /onChange=\{\(event\) => handleStageChange\(event\.target\.value as BusinessStage\)\}/);
  assert.match(drawer, /\{stages\.map\(\(stage\) => <option key=\{stage\} value=\{stage\}>\{stageLabels\[stage\]\}<\/option>\)\}/);
  assert.match(drawer, /onMoveBusiness\(business\.id, nextStage\)\.finally/);
  assert.match(drawer, /stageSelectRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(panel, /const detailTriggerBusinessId = useRef<number \| null>\(null\)/);
  assert.match(panel, /detailTriggerBusinessId\.current = business\.id/);
  assert.match(panel, /document\.querySelector<HTMLElement>\('\[data-negocio-card-id="\' \+ businessId \+ '"]'\)/);
  assert.match(panel, /if \(currentCard\?\.isConnected\) \{[\s\S]*?currentCard\.focus\(\{ preventScroll: true \}\);[\s\S]*?return;/);
  assert.match(panel, /if \(originalTrigger\?\.isConnected\) \{[\s\S]*?originalTrigger\.focus\(\{ preventScroll: true \}\);[\s\S]*?return;/);
  assert.match(panel, /const workspaceFallbackFocus = useRef<HTMLInputElement>\(null\)/);
  assert.match(panel, /workspaceFallbackFocus\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(panel, /searchInputRef=\{workspaceFallbackFocus\}/);
  assert.match(panel, /ref=\{searchInputRef\}/);
  assert.match(drawer, /const requestClose = useCallback\(\(\) => \{[\s\S]*?if \(isMoving \|\| canonicalBusy\) return;[\s\S]*?onClose\(\);[\s\S]*?\}, \[canonicalBusy, isMoving, onClose\]\);/);
  assert.match(drawer, /event\.key === "Escape"[\s\S]*?requestClose\(\)/);
  assert.match(drawer, /aria-label="Fechar detalhes do Negócio"[\s\S]*?disabled=\{isMoving \|\| canonicalBusy\}[\s\S]*?onClick=\{requestClose\}/);
  assert.match(drawer, /aria-label="Fechar detalhes"[\s\S]*?disabled=\{isMoving \|\| canonicalBusy\}[\s\S]*?onClick=\{requestClose\}/);
  assert.match(panel, /data-negocio-card-id=\{business\.id\}/);
});

test("gate B anuncia resultados assíncronos da Agenda sem duplicar o toast visual", async () => {
  const panel = await source("src/components/dashboard/DashboardAgendaPanel.tsx");
  const toast = between(panel, "{toast && (", "<AgendaToolbarFrame");
  const modal = between(panel, "function AgendaModal", "function ActionButton");

  assert.match(toast, /aria-live="polite"/);
  assert.match(toast, /aria-atomic="true"/);
  assert.match(toast, /role="status"/);
  assert.doesNotMatch(toast, /sr-only/);

  assert.match(modal, /aria-describedby=\{error \? "agenda-form-error" : undefined\}/);
  assert.match(modal, /id="agenda-form-error"/);
  assert.match(modal, /aria-live="assertive"/);
  assert.match(modal, /aria-atomic="true"/);
  assert.match(modal, /role="alert"/);
});

test("gate B restaura o foco no submit após falha de reagendamento sem alterar sucesso ou Escape", async () => {
  const panel = await source("src/components/dashboard/DashboardAgendaPanel.tsx");
  const modal = between(panel, "function AgendaModal", "function ActionButton");

  assert.match(modal, /const submitButtonRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(modal, /const wasSubmittingRef = useRef\(isSubmitting\)/);
  assert.match(modal, /if \(!wasSubmitting \|\| isSubmitting \|\| !error \|\| !dialogRef\.current\?\.isConnected\) return;/);
  assert.match(modal, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*?submitButtonRef\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.match(modal, /dialogRef\.current\?\.isConnected && submitButtonRef\.current\?\.isConnected && !isSubmittingRef\.current/);
  assert.match(modal, /<Button className="min-w-36" disabled=\{isSubmitting\} loading=\{isSubmitting\} onClick=\{onSubmit\} ref=\{submitButtonRef\} size="sm">/);
  assert.match(modal, /event\.key === "Escape" && !isSubmittingRef\.current/);
});

test("fixture do Kanban monta o painel real com adaptador em memória e bloqueia I/O", async () => {
  const [fixture, html, panel] = await Promise.all([
    source("tests/fixtures/accessibility-gate-negocios-keyboard.tsx"),
    source("tests/fixtures/accessibility-gate-negocios-keyboard.html"),
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
  ]);

  assert.match(fixture, /import DashboardNegociosKanbanPanel, \{ type NegociosKanbanAdapter \}/);
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /data-negocios-adapter="in-memory"/);
  assert.match(fixture, /data-negocios-scenarios="success,rollback"/);
  assert.match(fixture, /permissoes: \{ movimentar: true \}/);
  assert.match(fixture, /async updateNegocioKanbanStage\(id, etapa, etapaAnterior\)/);
  assert.match(fixture, /return response\(params\?\.etapa\)/);
  assert.match(fixture, /fixtureScenario\(\) === "rollback"/);
  assert.match(fixture, /LOCAL_QA_NEGOCIOS_ROLLBACK/);
  assert.match(fixture, /adapter=\{negociosFixtureAdapter\}/);
  assert.match(fixture, /onToast=\{setToast\}/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.match(html, /window\.fetch = \(\) => Promise\.reject\(new TypeError\("ACCESSIBILITY_GATE_NEGOCIOS_OUTBOUND_OR_WRITE_BLOCKED"\)\)/);
  assert.doesNotMatch(html, /nativeFetch|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.match(html, /src="\/tests\/fixtures\/accessibility-gate-negocios-keyboard\.tsx"/);
  assert.match(panel, /adapter = defaultNegociosKanbanAdapter/);
});

test("gate C mantém Lista e Semana como grupo de botões com estado e teclado nativos", async () => {
  const panel = await source("src/components/dashboard/DashboardAgendaPanel.tsx");
  const toolbar = between(panel, "export function AgendaToolbarFrame", "type AgendaFilterDisclosureProps");
  const disclosure = between(panel, "export function AgendaFilterDisclosure", "export function AgendaNextCommitment");

  assert.match(toolbar, /role="group"/);
  assert.match(toolbar, /aria-label="Visualização da agenda"/);
  assert.match(toolbar, /<button[\s\S]*?aria-pressed=\{viewMode === "list"\}[\s\S]*?type="button">/);
  assert.match(toolbar, /<button[\s\S]*?aria-pressed=\{viewMode === "week"\}[\s\S]*?type="button">/);
  assert.doesNotMatch(toolbar, /role="tablist"|role="tab"/);
  assert.match(disclosure, /<details className="agenda-filter-disclosure">/);
  assert.match(disclosure, /<summary>/);
});

test("gate Inbox devolve overlays compactos aos gatilhos persistentes", async () => {
  const [panel, overlay] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/components/leads-communication/CommunicationOverlay.tsx"),
  ]);
  const toolbar = between(panel, "export function InboxQueueToolbar", "export function InboxContextContent");

  assert.match(panel, /const filtersTriggerRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(panel, /const contextTriggerRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(panel, /const actionModalTriggerRef = useRef<HTMLElement>\(null\)/);
  assert.match(panel, /<InboxQueueToolbar[\s\S]*?filtersTriggerRef=\{filtersTriggerRef\}/);
  assert.match(panel, /filtersTriggerRef: RefObject<HTMLButtonElement \| null>;/);
  assert.match(toolbar, /<Button[\s\S]*?className="inbox-filter-trigger"[\s\S]*?ref=\{filtersTriggerRef\}/);
  assert.match(panel, /compactInboxContext && <IconButton[\s\S]*?ref=\{contextTriggerRef\}/);
  assert.match(panel, /<summary[\s\S]*?aria-label="Mais ações da conversa"[\s\S]*?ref=\{actionModalTriggerRef\}/);
  assert.match(panel, /description="Refine por estado, SLA, canal, responsável ou Lead\."[\s\S]*?triggerRef=\{filtersTriggerRef\}/);
  assert.match(panel, /description="Dados e histórico da conversa selecionada\."[\s\S]*?triggerRef=\{contextTriggerRef\}/);
  assert.match(panel, /<CommunicationModal[\s\S]*?triggerRef=\{actionModalTriggerRef\}/);
  assert.match(overlay, /const previousFocus = triggerRef\?\.current \?\? \(document\.activeElement instanceof HTMLElement \? document\.activeElement : null\);/);
  assert.match(overlay, /previousFocus\?\.focus\(\{ preventScroll: true \}\);/);
});

test("gate F fornece fixture read-only para espaçamento de texto WCAG 1.4.12", async () => {
  const fixture = await source("tests/fixtures/accessibility-gate-text-spacing.tsx");
  const html = await source("tests/fixtures/accessibility-gate-text-spacing.html");
  const css = await source("src/index.css");

  assert.match(fixture, /import DashboardOverview from "\.\.\/\.\.\/src\/components\/dashboard\/DashboardOverview"/);
  assert.match(fixture, /import \{ AgendaToolbarFrame \} from "\.\.\/\.\.\/src\/components\/dashboard\/DashboardAgendaPanel"/);
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /data-text-spacing-contract="wcag-1\.4\.12"/);
  assert.match(fixture, /data-reflow-targets="640,320"/);
  assert.match(fixture, /line-height: 1\.5 !important;/);
  assert.match(fixture, /margin-block-end: 2em !important;/);
  assert.match(fixture, /letter-spacing: \.12em !important;/);
  assert.match(fixture, /word-spacing: \.16em !important;/);
  assert.doesNotMatch(fixture, /\bfetch\s*\(|localStorage|sessionStorage|document\.cookie|Authorization/iu);
  assert.match(html, /src="\/tests\/fixtures\/accessibility-gate-text-spacing\.tsx"/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?text-overflow: clip/);
});
