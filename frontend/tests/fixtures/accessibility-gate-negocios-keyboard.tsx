import { createRoot } from "react-dom/client";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import DashboardNegociosKanbanPanel, { type NegociosKanbanAdapter } from "../../src/components/negocios/DashboardNegociosKanbanPanel";
import "../../src/index.css";
import type { BusinessStage, CommunicationBusiness, NegociosKanbanResponse } from "../../src/services/crmApi";

type FixtureScenario = "success" | "rollback";

const initialBusinesses: CommunicationBusiness[] = [
  {
    id: 9901,
    clienteId: 8801,
    cliente: { id: 8801, nome: "Cooperativa Horizonte local", empresa: "Conta sintética" },
    leadId: null,
    lead: null,
    responsavelId: 8800,
    responsavel: { id: 8800, nome: "Operadora de QA" },
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo: "Validar movimento por teclado",
    observacao: "Registro local para o cenário de acessibilidade.",
    etapa: "NOVO",
    valor: 86000,
    proximaAcao: {
      id: 7601,
      titulo: "Confirmar a próxima etapa pelo seletor",
      dataHora: "2026-08-12T14:00:00.000Z",
      prioridade: "ALTA",
      status: "PENDENTE",
      tipo: "RETORNO",
      responsavelUsuario: { id: 8800, nome: "Operadora de QA" },
      atrasada: false,
    },
    tempoEtapa: {
      entrouEm: "2026-08-09T12:00:00.000Z",
      ultimaMovimentacaoEm: null,
      atualSegundos: 172800,
      acumuladoSegundos: 172800,
      estimado: false,
    },
    negocioParado: false,
    motivoParado: null,
    createdAt: "2026-08-07T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
    permissoes: { movimentar: true },
  },
  {
    id: 9902,
    clienteId: 8802,
    cliente: { id: 8802, nome: "Fazenda Aurora local", empresa: "Conta sintética" },
    leadId: null,
    lead: null,
    responsavelId: 8800,
    responsavel: { id: 8800, nome: "Operadora de QA" },
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo: "Referência de outra etapa",
    observacao: null,
    etapa: "PROPOSTA",
    valor: 124000,
    proximaAcao: null,
    tempoEtapa: {
      entrouEm: "2026-08-08T12:00:00.000Z",
      ultimaMovimentacaoEm: null,
      atualSegundos: 86400,
      acumuladoSegundos: 86400,
      estimado: false,
    },
    negocioParado: false,
    motivoParado: null,
    createdAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
    permissoes: { movimentar: false },
  },
];

let inMemoryBusinesses = initialBusinesses.map((business) => ({ ...business }));

function fixtureScenario(): FixtureScenario {
  return new URLSearchParams(window.location.search).get("scenario") === "rollback" ? "rollback" : "success";
}

function response(stageFilter?: BusinessStage): NegociosKanbanResponse {
  const visibleBusinesses = stageFilter
    ? inMemoryBusinesses.filter((business) => business.etapa === stageFilter)
    : inMemoryBusinesses;
  const porEtapa: Record<BusinessStage, number> = {
    NOVO: 0,
    CONTATO: 0,
    PROPOSTA: 0,
    FECHADO: 0,
    PERDIDO: 0,
  };
  visibleBusinesses.forEach((business) => { porEtapa[business.etapa] += 1; });
  return {
    data: visibleBusinesses.map((business) => ({ ...business })),
    resumo: {
      total: visibleBusinesses.length,
      porEtapa,
      fechados: porEtapa.FECHADO,
      perdidos: porEtapa.PERDIDO,
    },
    pagination: { page: 1, limit: 100, total: visibleBusinesses.length, totalPages: visibleBusinesses.length ? 1 : 0 },
  };
}

function waitForLocalMutationState() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 120));
}

const negociosFixtureAdapter: NegociosKanbanAdapter = {
  async fetchNegociosKanban(params) {
    return response(params?.etapa);
  },
  async fetchNegocioKanban(id) {
    const business = inMemoryBusinesses.find((item) => item.id === id);
    if (!business) throw new Error("LOCAL_QA_NEGOCIOS_NOT_FOUND");
    return { ...business };
  },
  async updateNegocioKanbanStage(id, etapa, etapaAnterior) {
    await waitForLocalMutationState();
    if (fixtureScenario() === "rollback") throw new Error("LOCAL_QA_NEGOCIOS_ROLLBACK");

    const current = inMemoryBusinesses.find((business) => business.id === id);
    if (!current || current.etapa !== etapaAnterior) throw new Error("LOCAL_QA_NEGOCIOS_STAGE_CONFLICT");

    const updated = { ...current, etapa, updatedAt: "2026-08-09T12:01:00.000Z" };
    inMemoryBusinesses = inMemoryBusinesses.map((business) => business.id === id ? updated : business);
    return { ...updated };
  },
};

export function AccessibilityGateNegociosKeyboardFixture() {
  const [toast, setToast] = useState("");
  const scenario = fixtureScenario();

  return (
    <main className="crm-workspace min-h-screen p-4 md:p-6" data-fixture-readonly="true" data-negocios-adapter="in-memory" data-negocios-scenarios="success,rollback" data-negocios-scenario={scenario}>
      <div className="mx-auto max-w-[1680px]">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          QA local · Kanban real · adaptador em memória · I/O bloqueada
        </p>
        {toast && <p aria-live="polite" className="mb-3 text-xs text-[var(--text-secondary)]" role="status">{toast}</p>}
        <DashboardNegociosKanbanPanel
          adapter={negociosFixtureAdapter}
          authSession={null}
          onOpenAgenda={() => undefined}
          onToast={setToast}
        />
      </div>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("ACCESSIBILITY_GATE_NEGOCIOS_FIXTURE_ROOT_MISSING");
createRoot(rootElement).render(<MemoryRouter><AccessibilityGateNegociosKeyboardFixture /></MemoryRouter>);
