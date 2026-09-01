import { createRoot } from "react-dom/client";
import IntegrationStatusBoard from "../../src/components/integrations/IntegrationStatusBoard";
import { setAuthToken } from "../../src/services/crmApi";
import "../../src/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root da fixture ausente.");
setAuthToken("synthetic-qa-token");
localStorage.setItem("crm-auth-user", JSON.stringify({ id: 1, empresaId: 1, nome: "QA Admin", email: "qa@example.invalid", papel: "ADMIN", ativo: true }));
localStorage.setItem("crm-auth-company", JSON.stringify({ id: 1, nome: "QA Empresa", slug: "qa" }));
localStorage.setItem("crm-auth-role", "ADMIN");
createRoot(rootElement).render(
  <main className="crm-workspace min-h-screen bg-[var(--bg-canvas)] p-4 sm:p-6" aria-label="QA visual do status das integrações">
    <div className="mx-auto w-full max-w-[1280px]">
      <IntegrationStatusBoard onUnauthorized={() => undefined} />
    </div>
  </main>,
);
