import { createRoot } from "react-dom/client";
import DashboardIntegrationReadinessPanel from "../../src/components/dashboard/DashboardIntegrationReadinessPanel";
import { Surface, StatusBadge } from "../../src/components/ui";
import "../../src/index.css";

export function IntegrationsVisualPrepFixture() {
  return (
    <div className="crm-workspace min-h-screen bg-[var(--bg-canvas)]" data-fixture-readonly="true">
      <main className="crm-content mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 lg:px-8" aria-label="Preparação visual local de Integrações">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Configurações</p>
            <h1 className="mt-1 text-[23px] font-semibold leading-tight text-[var(--text-primary)]">Integrações</h1>
            <p className="mt-1 max-w-2xl text-xs text-[var(--text-muted)]">Fixture local somente leitura; nenhuma conexão ou chamada externa é realizada.</p>
          </div>
          <span className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">QA local</span>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <Surface className="p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">WhatsApp</h2>
              <StatusBadge label="Superfície existente" status="informacao" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">O painel real e seus estados operacionais permanecem preservados fora desta prova visual.</p>
          </Surface>
          <Surface className="p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Formulário do Site</h2>
              <StatusBadge label="Superfície existente" status="informacao" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">A configuração real publicada continua na seção própria, sem alteração de contrato.</p>
          </Surface>
        </div>

        <div className="mt-3">
          <DashboardIntegrationReadinessPanel />
        </div>
        <p className="sr-only">Fixture sem sessão, sem rede e sem escrita; os estados acima são apenas a preparação visual da área de Integrações.</p>
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<IntegrationsVisualPrepFixture />);
