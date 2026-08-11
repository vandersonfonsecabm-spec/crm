import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardInboxPanel from "../../../src/components/leads-communication/DashboardInboxPanel";
import type { AuthSession } from "./crmApi.inbox.fixture";
import "./crmApi.inbox.fixture";
import "../../../src/index.css";

type InboxFixtureScenario = "filled" | "empty" | "context";

const root = document.getElementById("root");

if (!root) throw new Error("WAVE5_INBOX_FIXTURE_ROOT_MISSING");

function fixtureScenario(): InboxFixtureScenario {
  const value = new URLSearchParams(window.location.search).get("scenario");
  if (value === "empty" || value === "context") return value;
  return "filled";
}

const scenario = fixtureScenario();

const syntheticSession: AuthSession = {
  token: "",
  usuario: {
    id: 701,
    empresaId: 0,
    nome: "Atendente QA",
    email: "atendente.fixture@example.invalid",
    papel: "GERENTE",
    ativo: true,
  },
  empresa: {
    id: 0,
    nome: "Empresa sintética local",
    slug: "wave5-inbox-fixture",
    ativo: true,
  },
  papel: "GERENTE",
  capabilities: {
    leadsCommunication: true,
    siteLeadCapture: false,
    negociosKanban: false,
    automations: false,
  },
  isPlatformOperator: false,
};

export function OpenContextForQa({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;

    const deadline = Date.now() + 5000;
    const timer = window.setInterval(() => {
      const control = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Abrir contexto do Cliente, Lead e histórico"]',
      );
      if (control) {
        control.click();
        window.clearInterval(timer);
      } else if (Date.now() >= deadline) {
        window.clearInterval(timer);
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [active]);

  return null;
}

createRoot(root).render(
  <MemoryRouter initialEntries={["/caixa-de-entrada"]}>
    <main className="min-h-screen bg-[var(--bg-app)] p-4 md:p-6" data-wave5-inbox-scenario={scenario}>
      <div className="mx-auto max-w-[1600px]">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          QA local · Inbox sintética · GET localhost · mutations bloqueadas
        </p>
        <OpenContextForQa active={scenario === "context"} />
        <DashboardInboxPanel
          authSession={syntheticSession}
          initialConversationId={scenario === "empty" ? null : 101}
          onOpenBusiness={() => undefined}
        />
      </div>
    </main>
  </MemoryRouter>,
);
