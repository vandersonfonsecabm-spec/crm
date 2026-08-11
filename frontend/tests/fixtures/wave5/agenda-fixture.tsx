import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardAgendaPanel from "../../../src/components/dashboard/DashboardAgendaPanel";
import "../../../src/index.css";

const root = document.getElementById("root");

if (!root) throw new Error("WAVE5_FIXTURE_ROOT_MISSING");

createRoot(root).render(
  <MemoryRouter>
    <main className="min-h-screen bg-[var(--bg-app)] p-4 md:p-6">
      <div className="mx-auto max-w-[1440px]">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          QA local · fixture sintética · somente leitura
        </p>
        <DashboardAgendaPanel
          backendCaption="Fixture local · sem sessão, token, cookie ou dados reais"
          clients={[]}
          createRequestKey={0}
          followUpAgenda={[]}
          money={(value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)}
          onApplySmartFilter={() => undefined}
          onSelectClient={() => undefined}
          recentActivities={[]}
          smartAlerts={["Fixture local: saída externa bloqueada.", "Dados simulados apenas para QA visual."]}
          statusClass={() => ""}
          todayRequestKey={0}
        />
      </div>
    </main>
  </MemoryRouter>,
);
