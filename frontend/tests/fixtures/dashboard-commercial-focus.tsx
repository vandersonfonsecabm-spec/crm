import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardControlCenter from "../../src/components/dashboard/DashboardControlCenter";
import DashboardCustomerDrawer from "../../src/components/dashboard/DashboardCustomerDrawer";
import { useDrawerFocusSession } from "../../src/components/dashboard/useDrawerFocusSession";
import { emptyClient } from "../../src/data/clientDefaults";
import { useCloseCustomerDrawerOnPageKeyChange } from "../../src/pages/Dashboard";
import type { ApiDashboardSummary } from "../../src/services/crmApi";
import type { Analytics, Client } from "../../src/types/dashboard";

const manualMode = new URLSearchParams(window.location.search).has("manual");

const priorityClient: Client = {
  ...emptyClient,
  id: 101,
  name: "Cliente A da fila",
  company: "Conta de teste local",
  status: "Contato",
  lastContactDays: 9,
};

const agendaClient: Client = {
  ...emptyClient,
  id: 202,
  name: "Cliente B da Agenda",
  company: "Conta de teste local",
  status: "Contato",
  lastContactDays: 0,
  nextFollowUp: "hoje",
};

const unmountClient: Client = {
  ...emptyClient,
  id: 303,
  name: "Cliente de troca interna",
  company: "Conta de teste local",
  status: "Contato",
  lastContactDays: 0,
};

const summary = {
  analytics: {
    forecastValue: 1500,
    todayFollowUps: 0,
    hotProposalCount: 0,
    silentCount: 1,
    highRiskCount: 0,
  },
} as ApiDashboardSummary;

const analytics: Analytics = {
  totalValue: 1500,
  wonValue: 0,
  forecastValue: 1500,
  hotCount: 0,
  averageScore: 0,
  todayFollowUps: 0,
};

function waitForCondition(predicate: () => boolean, message: string) {
  return new Promise<void>((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      attempts += 1;
      if (attempts >= 200) {
        reject(new Error(message));
        return;
      }
      window.setTimeout(check, 20);
    };
    check();
  });
}

export function FocusFixture() {
  const [clients, setClients] = useState<Client[]>([priorityClient, agendaClient, unmountClient]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(true);
  const [pageKey, setPageKey] = useState("dashboard-commercial-focus");
  const [noteText, setNoteText] = useState("");
  const [result, setResult] = useState<"running" | "ready" | "passed" | "failed">(manualMode ? "ready" : "running");
  const [error, setError] = useState("");
  const [trace, setTrace] = useState("");
  const [lastSessionToken, setLastSessionToken] = useState<number | null>(null);
  const lastSessionTokenRef = useRef<number | null>(null);
  const unmountOriginRef = useRef<HTMLButtonElement>(null);
  const unmountFallbackRef = useRef<HTMLHeadingElement>(null);
  const validationFallbackRef = useRef<HTMLButtonElement>(null);
  const disabledOriginRef = useRef<HTMLButtonElement>(null);
  const ariaDisabledOriginRef = useRef<HTMLButtonElement>(null);
  const hiddenOriginRef = useRef<HTMLButtonElement>(null);
  const transparentOriginRef = useRef<HTMLButtonElement>(null);
  const inertOriginRef = useRef<HTMLButtonElement>(null);
  const ariaHiddenOriginRef = useRef<HTMLButtonElement>(null);
  const selectedClient = clients.find((client) => client.id === selectedId) ?? null;
  const drawerFocus = useDrawerFocusSession(pageKey);
  useCloseCustomerDrawerOnPageKeyChange(pageKey, drawerFocus.invalidateSession, setDrawerOpen);

  const openClient = useCallback((clientId: number | null, origin: HTMLElement | null = null, fallback: HTMLElement | null = null) => {
    setSelectedId(clientId);
    if (clientId === null) {
      drawerFocus.invalidateSession();
      setDrawerOpen(false);
      return;
    }
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const token = drawerFocus.startSession(origin ?? activeElement, fallback);
    lastSessionTokenRef.current = token;
    setLastSessionToken(token);
    setDrawerOpen(true);
  }, [drawerFocus]);

  const closeDrawer = useCallback((token: number) => {
    if (!drawerFocus.requestClose(token)) return;
    setDrawerOpen(false);
  }, [drawerFocus]);

  const saveClientAsClosed = useCallback((client: Client) => {
    setClients((current) => current.map((currentClient) => currentClient.id === client.id
      ? { ...currentClient, status: "Fechado", lastContactDays: 0 }
      : currentClient));
    // O fluxo real de edição fecha o drawer antes de o salvamento atualizar a fila.
    drawerFocus.invalidateSession();
    setDrawerOpen(false);
  }, [drawerFocus]);

  useEffect(() => {
    if (manualMode) return undefined;

    let cancelled = false;
    const events: string[] = [];
    const record = (event: string) => events.push(event);

    async function run() {
      try {
        await waitForCondition(() => Boolean(document.querySelector('[data-commercial-priority-id="101"]')), "A prioridade inicial não foi renderizada.");

        const firstOrigin = document.querySelector<HTMLElement>('[data-commercial-priority-id="101"]');
        if (!firstOrigin) throw new Error("Botão originador inicial ausente.");
        firstOrigin.focus();
        firstOrigin.click();
        await waitForCondition(() => {
          const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
          return Boolean(dialog?.contains(document.activeElement));
        }, "O foco não entrou no dialog na primeira abertura.");

        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        await waitForCondition(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), "O drawer não fechou por Escape.");
        await waitForCondition(() => (document.activeElement as HTMLElement | null)?.dataset.commercialPriorityId === "101", "O originador preservado não recuperou o foco.");
        record(`fila-presente:${lastSessionTokenRef.current}`);

        const secondOrigin = document.querySelector<HTMLElement>('[data-commercial-priority-id="101"]');
        if (!secondOrigin) throw new Error("Botão originador ausente na segunda abertura.");
        secondOrigin.focus();
        secondOrigin.click();
        const staleQueueSessionToken = lastSessionTokenRef.current;
        if (staleQueueSessionToken === null) throw new Error("A sessão da fila não recebeu token.");
        await waitForCondition(() => {
          const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
          return Boolean(dialog?.contains(document.activeElement));
        }, "O foco não entrou no dialog na segunda abertura.");

        const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
        const editButton = Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])
          .find((button) => button.textContent?.includes("Editar cadastro"));
        if (!dialog || !editButton) throw new Error("A ação real de editar cadastro não foi encontrada.");
        editButton.focus();
        editButton.click();

        await waitForCondition(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), "Salvar como Fechado não fechou o drawer de A.");
        await waitForCondition(() => !document.querySelector('[data-commercial-priority-id="101"]'), "Salvar como Fechado não removeu A da fila.");

        const openAgendaDrawer = async () => {
          const agendaOrigin = document.querySelector<HTMLButtonElement>('.commercial-agenda-row[aria-label*="Cliente B da Agenda"]');
          if (!agendaOrigin) throw new Error("O acionador B da Agenda não foi encontrado.");
          agendaOrigin.focus();
          agendaOrigin.click();
          await waitForCondition(() => {
            const nextDialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
            return Boolean(nextDialog?.contains(document.activeElement));
          }, "O foco não entrou no drawer aberto pela Agenda.");
          return agendaOrigin;
        };

        const agendaOrigin = await openAgendaDrawer();
        const agendaSessionToken = lastSessionTokenRef.current;
        if (agendaSessionToken === null) throw new Error("A sessão da Agenda não recebeu token.");
        drawerFocus.settleClose(staleQueueSessionToken);
        const agendaDialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
        if (!agendaDialog?.contains(document.activeElement)) throw new Error("Callback tardio da fila alterou o foco da sessão da Agenda.");

        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        await waitForCondition(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), "O drawer de B não fechou por Escape.");
        await waitForCondition(() => document.activeElement === agendaOrigin, "O foco não voltou ao acionador B da Agenda.");
        record(`agenda-escape-double-close:${agendaSessionToken}`);

        const agendaOriginForCancel = await openAgendaDrawer();
        const backdrop = document.querySelector<HTMLButtonElement>('[role="presentation"] > button[tabindex="-1"]');
        if (!backdrop) throw new Error("O cancelamento pelo backdrop não foi encontrado.");
        backdrop.click();
        await waitForCondition(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), "O backdrop não fechou o drawer.");
        await waitForCondition(() => document.activeElement === agendaOriginForCancel, "Cancelar pelo backdrop não devolveu o foco à Agenda.");
        record(`agenda-cancel:${lastSessionTokenRef.current}`);

        const agendaOriginForInternalSwitch = await openAgendaDrawer();
        setSelectedId(unmountClient.id);
        await waitForCondition(() => document.querySelector('[role="dialog"][aria-modal="true"]')?.textContent?.includes(unmountClient.name) === true, "A troca interna de registro não atualizou o drawer.");
        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        await waitForCondition(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), "O drawer não fechou após a troca interna.");
        await waitForCondition(() => document.activeElement === agendaOriginForInternalSwitch, "A troca interna perdeu a origem da sessão da Agenda.");
        record(`troca-interna:${lastSessionTokenRef.current}`);

        await openAgendaDrawer();
        setSelectedId(agendaClient.id);
        setClients((current) => current.map((client) => client.id === agendaClient.id ? { ...client, nextFollowUp: "" } : client));
        await waitForCondition(() => !document.querySelector('.commercial-agenda-row[aria-label*="Cliente B da Agenda"]'), "O acionador removido da Agenda continuou renderizado.");
        const closeButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Fechar"]'))
          .find((button) => button.tabIndex !== -1);
        if (!closeButton) throw new Error("O botão Fechar do drawer não foi encontrado.");
        closeButton.click();
        await waitForCondition(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), "O botão Fechar não fechou o drawer.");
        await waitForCondition(() => document.activeElement?.id === "commercial-agenda-title", "Origem removida não usou o fallback da Agenda da sessão atual.");
        record(`agenda-fallback-removido:${lastSessionTokenRef.current}`);

        const invalidOrigins = [
          ["desabilitado", disabledOriginRef.current],
          ["aria-disabled", ariaDisabledOriginRef.current],
          ["hidden", hiddenOriginRef.current],
          ["transparente", transparentOriginRef.current],
          ["inert", inertOriginRef.current],
          ["aria-hidden", ariaHiddenOriginRef.current],
          ["desconectado", document.createElement("button")],
        ] as const;
        for (const [label, origin] of invalidOrigins) {
          const token = drawerFocus.startSession(origin, validationFallbackRef.current);
          if (!drawerFocus.requestClose(token)) throw new Error(`Não foi possível fechar a sessão ${label}.`);
          drawerFocus.settleClose(token);
          if (document.activeElement !== validationFallbackRef.current) throw new Error(`Origem ${label} inválida recebeu foco em vez do fallback válido.`);
        }
        record("validacao-de-alvos");

        const unmountOrigin = unmountOriginRef.current;
        const unmountFallback = unmountFallbackRef.current;
        if (!unmountOrigin || !unmountFallback) throw new Error("Refs da rota sintética não foram montadas.");
        unmountOrigin.focus();
        unmountOrigin.click();
        await waitForCondition(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')), "A sessão de rota não abriu o drawer.");
        const routeSessionToken = lastSessionTokenRef.current;
        if (routeSessionToken === null) throw new Error("A sessão de rota não recebeu token.");
        setPageKey("dashboard-commercial-focus-next-page");
        await waitForCondition(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), "A troca real de rota não fechou o drawer.");
        if (document.activeElement === unmountOrigin || document.activeElement === unmountFallback) throw new Error("Troca de rota restaurou foco para a página anterior.");
        record(`rota-invalida:${routeSessionToken}`);

        setPageKey("dashboard-commercial-focus-unmount-source");
        await waitForCondition(() => document.getElementById("focus-test-result")?.dataset.pageKey === "dashboard-commercial-focus-unmount-source", "A rota de origem do unmount não foi aplicada.");
        unmountOrigin.focus();
        unmountOrigin.click();
        await waitForCondition(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')), "A sessão de unmount não abriu o drawer.");
        const unmountSessionToken = lastSessionTokenRef.current;
        if (unmountSessionToken === null) throw new Error("A sessão de unmount não recebeu token.");
        setPageKey("dashboard-commercial-focus-unmounted-page");
        setDrawerMounted(false);
        await waitForCondition(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), "O drawer não desmontou na troca real de rota.");
        if (document.activeElement === unmountOrigin || document.activeElement === unmountFallback) throw new Error("Unmount/rota restaurou foco para a página anterior.");
        record(`unmount-invalido:${unmountSessionToken}`);

        if (!cancelled) {
          setTrace(events.join(" | "));
          setResult("passed");
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
          setTrace(events.join(" | "));
          setResult("failed");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  // The fixture intentionally captures one deterministic browser scenario from its initial mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <main data-error={error} data-page-key={pageKey} data-session-token={lastSessionToken ?? ""} data-status={result} data-trace={trace} id="focus-test-result">{result}</main>
      <section aria-label="Controles sintéticos de foco">
        <button id="fixture-unmount-origin" onClick={() => openClient(unmountClient.id, unmountOriginRef.current, unmountFallbackRef.current)} ref={unmountOriginRef} type="button">Abrir sessão de rota</button>
        <h2 id="fixture-unmount-fallback" ref={unmountFallbackRef} tabIndex={-1}>Fallback da página anterior</h2>
        <button id="fixture-validation-fallback" ref={validationFallbackRef} type="button">Fallback válido</button>
        <button disabled ref={disabledOriginRef} type="button">Origem desabilitada</button>
        <button aria-disabled="true" ref={ariaDisabledOriginRef} type="button">Origem aria-disabled</button>
        <button hidden ref={hiddenOriginRef} type="button">Origem invisível</button>
        <button ref={transparentOriginRef} style={{ opacity: 0 }} type="button">Origem transparente</button>
        <div inert><button ref={inertOriginRef} type="button">Origem inert</button></div>
        <div aria-hidden="true"><button ref={ariaHiddenOriginRef} type="button">Origem aria-hidden</button></div>
      </section>
      <DashboardControlCenter
        clients={clients}
        summary={summary}
        summaryLoadState="ready"
        clientsLoadState="ready"
        isAuthorized
        money={(value) => String(value)}
        getRisk={() => "Baixo"}
        onCreateClient={() => undefined}
        setSelectedId={openClient}
        onOpenRiskClients={() => undefined}
        onOpenProposals={() => undefined}
        onRetry={() => undefined}
      />
      {drawerMounted && <DashboardCustomerDrawer
        activePage="comercial"
        selectedClient={selectedClient}
        noteText={noteText}
        tagText=""
        clients={clients}
        analytics={analytics}
        money={(value) => String(value)}
        initials={(name) => name.slice(0, 2)}
        statusClass={() => ""}
        tagClass={() => ""}
        nextActionLabel={() => ""}
        getLeadScore={() => 0}
        getRisk={() => "Baixo"}
        slaLabel={() => ""}
        priorityLabel={() => "Normal"}
        onClearSelectedClient={() => openClient(null)}
        onSetNoteText={setNoteText}
        onSetTagText={() => undefined}
        onAddNote={() => undefined}
        onAddTagToSelected={() => undefined}
        onRemoveTagFromSelected={() => undefined}
        onEditClient={saveClientAsClosed}
        onCopyText={() => undefined}
        onRequestWhatsapp={() => undefined}
        onNavigateContext={() => undefined}
        onUnauthorized={() => undefined}
        onApplySmartFilter={() => undefined}
        focusSession={drawerFocus.session}
        isFocusSessionActive={drawerFocus.isSessionActive}
        onRequestFocusSessionClose={closeDrawer}
        onFocusSessionSettled={drawerFocus.settleClose}
        overlay
        open={drawerOpen}
      />}
    </>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de teste ausente.");
createRoot(rootElement).render(<MemoryRouter><FocusFixture /></MemoryRouter>);
