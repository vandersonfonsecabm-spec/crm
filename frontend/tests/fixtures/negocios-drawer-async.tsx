/* eslint-disable react-refresh/only-export-components -- fixture DOM comportamental executada diretamente pelo Vite. */
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import DashboardNegociosKanbanPanel, { type NegociosKanbanAdapter } from "../../src/components/negocios/DashboardNegociosKanbanPanel";
import type { BusinessStage, CommunicationBusiness, NegociosKanbanResponse } from "../../src/services/crmApi";
import "../../src/index.css";

type Scenario = "deep-link-race" | "close-during-open" | "close-during-terminal" | "unmount-during-open";

const businesses: CommunicationBusiness[] = [makeBusiness(7101, "Negócio assíncrono A", "NOVO"), makeBusiness(7102, "Negócio assíncrono B", "PROPOSTA")];
let detailCalls = 0;
let handledCalls = 0;
const toastMessages: string[] = [];

function makeBusiness(id: number, titulo: string, etapa: BusinessStage): CommunicationBusiness {
  return {
    id,
    clienteId: id + 100,
    cliente: { id: id + 100, nome: `Cliente ${id}`, empresa: "Conta sintética" },
    leadId: null,
    lead: null,
    responsavelId: 7000,
    responsavel: { id: 7000, nome: "Operadora sintética" },
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo,
    observacao: null,
    etapa,
    valor: 100,
    proximaAcao: null,
    tempoEtapa: { entrouEm: "2026-08-30T00:00:00.000Z", ultimaMovimentacaoEm: null, atualSegundos: 60, acumuladoSegundos: 60, estimado: false },
    negocioParado: false,
    motivoParado: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    permissoes: { movimentar: true },
  };
}

function response(): NegociosKanbanResponse {
  return {
    data: businesses.map((item) => ({ ...item })),
    resumo: { total: businesses.length, porEtapa: { NOVO: 1, CONTATO: 0, PROPOSTA: 1, FECHADO: 0, PERDIDO: 0 }, fechados: 0, perdidos: 0 },
    pagination: { page: 1, limit: 100, total: businesses.length, totalPages: 1 },
  };
}

function delayed<T>(value: T, delay: number, reject = false): Promise<T> {
  return new Promise((resolve, rejectPromise) => window.setTimeout(() => reject ? rejectPromise(new Error("STALE_DETAIL")) : resolve(value), delay));
}

function selectedScenario(): Scenario {
  const raw = new URLSearchParams(window.location.search).get("scenario");
  if (raw === "close-during-open" || raw === "close-during-terminal" || raw === "unmount-during-open") return raw;
  return "deep-link-race";
}

function setResult(scenario: Scenario, passed: boolean, trace: string) {
  document.body.dataset.status = passed ? "passed" : "failed";
  document.body.dataset.scenario = scenario;
  document.body.dataset.trace = trace;
}

function waitFor(selector: string, timeout = 1000): Promise<Element> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const element = document.querySelector(selector);
      if (element) return resolve(element);
      if (Date.now() - started >= timeout) return reject(new Error(`MISSING_${selector}`));
      window.setTimeout(poll, 10);
    };
    poll();
  });
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`CLICK_TARGET_MISSING_${selector}`);
  element.click();
}

const adapter: NegociosKanbanAdapter = {
  async fetchNegociosKanban() {
    return response();
  },
  async fetchNegocioKanban(id) {
    detailCalls += 1;
    const business = businesses.find((item) => item.id === id);
    if (!business) throw new Error("DETAIL_NOT_FOUND");
    const scenario = selectedScenario();
    if (scenario === "deep-link-race") return delayed({ ...business }, id === 7101 ? 160 : 20, id === 7101);
    if (scenario === "close-during-open") return delayed({ ...business }, 160);
    if (scenario === "unmount-during-open") return delayed({ ...business }, 160, true);
    return delayed({ ...business }, detailCalls === 1 ? 10 : 180);
  },
  async updateNegocioKanbanStage(id, etapa) {
    const business = businesses.find((item) => item.id === id);
    if (!business) throw new Error("DETAIL_NOT_FOUND");
    return { ...business, etapa };
  },
};

function Fixture() {
  const scenario = selectedScenario();
  const [target, setTarget] = useState<number | null>(scenario === "deep-link-race" ? 7101 : null);
  const [toast, setToast] = useState("");
  const [mounted, setMounted] = useState(true);
  const consumeTarget = useCallback(() => {
    handledCalls += 1;
    setTarget(null);
  }, []);
  const handleToast = useCallback((message: string) => {
    toastMessages.push(message);
    setToast(message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (scenario === "deep-link-race") {
          window.setTimeout(() => setTarget(7102), 8);
          await new Promise((resolve) => window.setTimeout(resolve, 260));
          const text = document.body.textContent || "";
          const dialog = document.querySelector('[role="dialog"]');
          const passed = dialog?.textContent?.includes("Negócio assíncrono B") === true && !text.includes("Carregando detalhes") && toastMessages.length === 0 && handledCalls === 1;
          if (!cancelled) setResult(scenario, passed, `dialog=${Boolean(dialog)};handled=${handledCalls};toasts=${toastMessages.length};calls=${detailCalls}`);
          return;
        }

        await waitFor('[data-negocio-card-id="7101"]');
        click('[data-negocio-card-id="7101"]');
        await waitFor('button[aria-label="Fechar detalhes"]');
        if (scenario === "unmount-during-open") {
          window.setTimeout(() => setMounted(false), 20);
          await new Promise((resolve) => window.setTimeout(resolve, 240));
          const passed = !document.querySelector('[role="dialog"]') && toastMessages.length === 0;
          if (!cancelled) setResult(scenario, passed, `mounted=false;toasts=${toastMessages.length};calls=${detailCalls}`);
          return;
        }
        if (scenario === "close-during-terminal") {
          await new Promise((resolve) => window.setTimeout(resolve, 30));
          const select = document.querySelector<HTMLSelectElement>('.negocios-drawer select');
          if (!select) throw new Error("STAGE_SELECT_MISSING");
          select.value = "FECHADO";
          select.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise((resolve) => window.setTimeout(resolve, 20));
        } else {
          await new Promise((resolve) => window.setTimeout(resolve, 20));
        }
        click('button[aria-label="Fechar detalhes"]');
        await new Promise((resolve) => window.setTimeout(resolve, 240));
        const dialog = document.querySelector('[role="dialog"]');
        const passed = !dialog && toastMessages.length === 0;
        if (!cancelled) setResult(scenario, passed, `dialog=${Boolean(dialog)};toasts=${toastMessages.length};calls=${detailCalls}`);
      } catch (error) {
        if (!cancelled) setResult(scenario, false, error instanceof Error ? error.message : "UNKNOWN");
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [scenario]);

  return (
    <main data-fixture-readonly="true">
      {mounted && <DashboardNegociosKanbanPanel adapter={adapter} authSession={null} initialBusinessId={target} onInitialBusinessHandled={consumeTarget} onOpenAgenda={() => undefined} onToast={handleToast} />}
      {toast && <p role="status">{toast}</p>}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("NEGOCIOS_ASYNC_FIXTURE_ROOT_MISSING");
createRoot(root).render(<MemoryRouter><Fixture /></MemoryRouter>);
