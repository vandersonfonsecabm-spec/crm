import { Bell, Plus, Search, UserRound } from "lucide-react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardControlCenter from "../../../src/components/dashboard/DashboardControlCenter";
import DashboardOverview from "../../../src/components/dashboard/DashboardOverview";
import DashboardSidebar from "../../../src/components/dashboard/DashboardSidebar";
import { emptyClient } from "../../../src/data/clientDefaults";
import "../../../src/index.css";
import type { ApiDashboardSummary } from "../../../src/services/crmApi";
import type { ActivePage, Client } from "../../../src/types/dashboard";

function localDate(offset: number, hour: number) {
  const value = new Date();
  value.setHours(hour, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value.toISOString();
}

const summary = {
  indicadores: { clientes: 12 },
  analytics: {
    wonValue: 248000,
    activePipeline: 9,
    forecastValue: 412000,
    todayFollowUps: 2,
    hotProposalCount: 1,
    silentCount: 2,
    highRiskCount: 2,
  },
  status: [
    { status: "Novo", total: 2, valor: 78000 },
    { status: "Contato", total: 3, valor: 112000 },
    { status: "Proposta", total: 4, valor: 222000 },
    { status: "Fechado", total: 2, valor: 248000 },
    { status: "Perdido", total: 1, valor: 19000 },
  ],
} as ApiDashboardSummary;

const clients: Client[] = [
  { ...emptyClient, id: 601, name: "Cooperativa Horizonte", company: "Conta local sintética", status: "Proposta", lastContactDays: 2, nextFollowUp: localDate(-1, 15) },
  { ...emptyClient, id: 602, name: "Fazenda Aurora", company: "Conta local sintética", status: "Contato", lastContactDays: 1, nextFollowUp: localDate(0, 11) },
  { ...emptyClient, id: 603, name: "Grupo Campo Alto", company: "Conta local sintética", status: "Contato", lastContactDays: 9, nextFollowUp: localDate(1, 9) },
  { ...emptyClient, id: 604, name: "Sítio Mineral", company: "Conta local sintética", status: "Novo", lastContactDays: 0, nextFollowUp: localDate(2, 14) },
];

export function ShellFixture() {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");

  return (
    <div className="crm-workspace min-h-screen" data-qa-mode="fixture-only" data-wave6-lot="2">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar activePage={activePage} authSession={null} setActivePage={setActivePage} />

        <main className="crm-main min-w-0">
          <header className="topbar-shell sticky top-0 z-40 flex h-14 items-center border-b px-5 lg:px-7">
            <div className="topbar-content mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4">
              <div className="min-w-0 lg:w-[220px]">
                <p className="hidden text-[11px] font-medium text-slate-500 lg:block">Área de trabalho</p>
              </div>
              <div aria-label="Busca global, visualização estática" className="command-search hidden h-9 min-w-0 flex-1 items-center gap-2 rounded-md border px-3 md:flex md:max-w-xl">
                <Search aria-hidden="true" size={13} />
                <span className="text-xs">Buscar cliente, empresa ou página...</span>
              </div>
              <div className="flex min-w-0 items-center justify-end gap-1.5 lg:w-[220px]">
                <button aria-label="Ações rápidas" className="topbar-icon-button inline-flex h-9 w-9 items-center justify-center rounded-md" type="button"><Plus aria-hidden="true" size={16} /></button>
                <button aria-label="Notificações" className="topbar-icon-button inline-flex h-9 w-9 items-center justify-center rounded-md" type="button"><Bell aria-hidden="true" size={16} /></button>
                <button aria-label="Menu do usuário" className="topbar-user-button flex h-9 items-center gap-2 rounded-md px-1.5 pr-2" type="button">
                  <span className="user-avatar flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold">QA</span>
                  <span className="hidden max-w-[116px] truncate text-[11px] font-medium xl:block">Operador local</span>
                  <UserRound aria-hidden="true" size={13} />
                </button>
              </div>
            </div>
          </header>

          <div className="crm-content min-h-0 flex-1 overflow-y-auto">
            {activePage === "comercial" ? (
              <DashboardControlCenter
                clients={clients}
                clientsLoadState="ready"
                getRisk={(client) => client.id === 603 ? "Alto" : "Baixo"}
                isAuthorized
                money={(value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                onCreateClient={() => undefined}
                onOpenProposals={() => undefined}
                onOpenRiskClients={() => undefined}
                onRetry={() => undefined}
                setSelectedId={() => undefined}
                summary={summary}
                summaryLoadState="ready"
              />
            ) : (
              <DashboardOverview
                isAuthorized
                money={(value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                onOpenCommercial={() => setActivePage("comercial")}
                onRetry={() => undefined}
                summary={summary}
                summaryLoadState="ready"
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><ShellFixture /></MemoryRouter>);
