import { Gauge, Globe2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { iniciarConexaoInstagram } from "../../services/crmApi";
import { createLocalMetaInstagramReadiness, isApprovedInstagramAuthorizationUrl } from "../../services/metaInstagramBoundary";
import { Button, StatusBadge, Surface } from "../ui";

type ReadinessItem = {
  key: string;
  title: string;
  description: string;
  note: string;
  status: "planejado" | "informacao" | "conectado" | "alerta" | "erro" | "indisponivel";
  label: string;
  icon: ReactNode;
  nextRequirement?: string;
};

const instagramReadiness = createLocalMetaInstagramReadiness();

const READINESS_ITEMS: ReadinessItem[] = [
  {
    key: "instagram-meta",
    title: "Instagram Direct / Meta",
    description: instagramReadiness.description,
    note: `${instagramReadiness.note} Boundary: ${instagramReadiness.state}.`,
    status: instagramReadiness.badgeStatus,
    label: instagramReadiness.label,
    icon: <Globe2 aria-hidden="true" size={16} />,
    nextRequirement: instagramReadiness.nextRequirement,
  },
  {
    key: "facebook-meta",
    title: "Facebook / Meta",
    description: "Integração ainda não configurada.",
    note: "Nenhuma conexão ou fluxo dedicado de Facebook foi identificado no CRM atual.",
    status: "informacao",
    label: "Configuração pendente",
    icon: <Gauge aria-hidden="true" size={16} />,
  },
  {
    key: "serasa-score",
    title: "Serasa / score",
    description: "Consulta externa ainda não disponível.",
    note: "Não há consulta de CPF/CNPJ, score ou credencial correspondente implementada no CRM.",
    status: "indisponivel",
    label: "Ainda não disponível",
    icon: <ShieldCheck aria-hidden="true" size={16} />,
  },
];

export default function DashboardIntegrationReadinessPanel({ canalIntegracaoId }: { canalIntegracaoId?: number | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const instagramAction = canalIntegracaoId ? async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await iniciarConexaoInstagram(canalIntegracaoId);
      if (!isApprovedInstagramAuthorizationUrl(result.authorizationUrl)) throw new Error("A URL de autorização retornada não é segura.");
      window.location.assign(result.authorizationUrl);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível iniciar a conexão com o Instagram.");
    } finally {
      setBusy(false);
    }
  } : undefined;
  return (
    <Surface className="min-w-0 overflow-hidden" data-testid="integration-readiness-panel">
      <div className="border-b border-[var(--border-default)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Outras integrações</h3>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-[var(--text-muted)]">
              Estados de capacidades ainda sem conexão acionável neste painel.
            </p>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Preparação</span>
        </div>
      </div>
      <div className="divide-y divide-[var(--border-default)]">
        {READINESS_ITEMS.map((item) => (
          <article className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start" key={item.key}>
            <div className="flex min-w-0 gap-3">
              <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--info)]">
                {item.icon}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-xs font-semibold text-[var(--text-primary)]">{item.title}</h4>
                  <StatusBadge label={item.label} status={item.status} />
                </div>
                <p className="mt-1 text-[11px] font-medium text-[var(--text-secondary)]">{item.description}</p>
                <p className="mt-1 max-w-3xl text-[11px] leading-4 text-[var(--text-muted)]">{item.note}</p>
                {item.nextRequirement && <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Próximo requisito: {item.nextRequirement}</p>}
              </div>
            </div>
            {item.key === "instagram-meta" ? (
              <div className="grid gap-1 md:justify-items-end">
                <Button aria-label="Conectar Instagram" disabled={!instagramAction || busy} onClick={instagramAction} size="sm" variant="secondary">
                  {busy ? "Iniciando…" : "Conectar Instagram"}
                </Button>
                {!canalIntegracaoId && <span className="text-[10px] font-medium text-[var(--text-tertiary)] md:text-right">Aguardando canal Instagram real</span>}
                {error && <p className="max-w-56 text-[10px] font-medium text-[var(--danger)] md:text-right" role="alert">{error}</p>}
              </div>
            ) : <span className="text-[10px] font-medium text-[var(--text-tertiary)] md:pt-1">Sem ação disponível</span>}
          </article>
        ))}
      </div>
    </Surface>
  );
}
