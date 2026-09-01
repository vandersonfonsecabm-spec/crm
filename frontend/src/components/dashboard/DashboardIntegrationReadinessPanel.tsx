import { Globe2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { ApiHttpError, fetchInstagramOperationalStatus, iniciarConexaoInstagram, removeMessengerCredential, replaceMessengerCredential, storeMessengerCredential } from "../../services/crmApi";
import { createLocalMetaInstagramReadiness, deriveMetaInstagramReadiness, isApprovedInstagramAuthorizationUrl } from "../../services/metaInstagramBoundary";
import { useMessengerConnectionStatus } from "../integrations/useMessengerConnectionStatus";
import type { MessengerConnectionState } from "../integrations/messengerConnectionState";
import { EXTERNAL_PROVIDER_ACTIVATION_ENABLED } from "../integrations/integrationActivationPolicy";
import { CommunicationModal } from "../leads-communication/CommunicationOverlay";
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

const localInstagramReadiness = createLocalMetaInstagramReadiness();

const STATIC_READINESS_ITEMS: ReadinessItem[] = [
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

export default function DashboardIntegrationReadinessPanel({ canalIntegracaoId, onUnauthorized }: { canalIntegracaoId?: number | null; onUnauthorized: () => void }) {
  const [instagramReadiness, setInstagramReadiness] = useState(localInstagramReadiness);
  const [instagramLoadState, setInstagramLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [instagramRetry, setInstagramRetry] = useState(0);
  const handleMessengerUnauthorized = useCallback(() => onUnauthorized(), [onUnauthorized]);
  const { loadState: messengerLoadState, refresh: refreshMessengerStatus, status: messengerStatus } = useMessengerConnectionStatus(handleMessengerUnauthorized);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messengerModalOpen, setMessengerModalOpen] = useState(false);
  const [messengerToken, setMessengerToken] = useState("");
  const [messengerError, setMessengerError] = useState("");
  const [messengerBusy, setMessengerBusy] = useState(false);
  const [messengerCredentialMode, setMessengerCredentialMode] = useState<"create" | "replace">("create");
  useEffect(() => {
    let cancelled = false;
    const loadInstagramStatus = async () => {
      setInstagramLoadState("loading");
      try {
        const status = await fetchInstagramOperationalStatus();
        if (cancelled) return;
        setInstagramReadiness(deriveMetaInstagramReadiness({ ...status, source: "backend" }));
        setInstagramLoadState("ready");
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof ApiHttpError && loadError.status === 401) {
          onUnauthorized();
          return;
        }
        setInstagramReadiness(deriveMetaInstagramReadiness({ state: "UNAVAILABLE", source: "backend", nextRequirement: "TENTE_NOVAMENTE" }));
        setInstagramLoadState("error");
      }
    };
    void loadInstagramStatus();
    return () => { cancelled = true; };
  }, [canalIntegracaoId, instagramRetry, onUnauthorized]);
  const instagramActionAllowed = Boolean(canalIntegracaoId)
    && EXTERNAL_PROVIDER_ACTIVATION_ENABLED
    && instagramLoadState === "ready"
    && ["NOT_CONFIGURED", "WAITING_META_AUTH"].includes(instagramReadiness.state);
  const instagramAction = instagramActionAllowed && canalIntegracaoId ? async () => {
    if (busy || !EXTERNAL_PROVIDER_ACTIVATION_ENABLED) return;
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
  const messengerPresentation = messengerStatePresentation(messengerStatus.state);
  const messengerChannelId = messengerStatus.canalIntegracaoId;
  const canStoreMessengerCredential = Number.isSafeInteger(messengerChannelId)
    && EXTERNAL_PROVIDER_ACTIVATION_ENABLED
    && (messengerChannelId || 0) > 0
    && (messengerCredentialMode === "replace"
      ? messengerStatus.credentialConfigured === true && Boolean(messengerStatus.credentialRevision) && ["WAITING_META_AUTH", "CONNECTED"].includes(messengerStatus.state)
      : ["WAITING_META_AUTH", "CONNECTED"].includes(messengerStatus.state) && messengerStatus.credentialConfigured !== true)
    && messengerLoadState === "ready";
  async function saveMessengerCredential() {
    if (!canStoreMessengerCredential || !messengerChannelId || !messengerToken.trim() || messengerBusy) return;
    setMessengerBusy(true);
    setMessengerError("");
    try {
      if (messengerCredentialMode === "replace") {
        if (!messengerStatus.credentialRevision) throw new Error("A revisão atual da credencial não está disponível.");
        await replaceMessengerCredential({ canalIntegracaoId: messengerChannelId, expectedRevision: messengerStatus.credentialRevision }, messengerToken.trim());
      } else {
        await storeMessengerCredential(messengerChannelId, messengerToken.trim());
      }
      setMessengerToken("");
      setMessengerModalOpen(false);
      await refreshMessengerStatus();
    } catch (actionError) {
      setMessengerError(actionError instanceof Error ? actionError.message : "Não foi possível armazenar a credencial com segurança.");
    } finally {
      setMessengerBusy(false);
    }
  }
  async function removeMessengerCredentialSafely() {
    if (!messengerStatus.canalIntegracaoId || !messengerStatus.credentialRevision || messengerBusy) return;
    if (!window.confirm("Remover a credencial TEST_ONLY deste canal?")) return;
    setMessengerBusy(true);
    setMessengerError("");
    try {
      await removeMessengerCredential({ canalIntegracaoId: messengerStatus.canalIntegracaoId, expectedRevision: messengerStatus.credentialRevision });
      await refreshMessengerStatus();
    } catch (actionError) {
      setMessengerError(actionError instanceof Error ? actionError.message : "Não foi possível remover a credencial com segurança.");
    } finally {
      setMessengerBusy(false);
    }
  }
  const instagramItem: ReadinessItem = {
    key: "instagram-meta",
    title: "Instagram Direct / Meta",
    description: instagramReadiness.description,
    note: instagramLoadState === "loading"
      ? "Consultando o estado seguro do canal para esta empresa."
      : `${instagramReadiness.note} Boundary: ${instagramReadiness.state}.`,
    status: instagramReadiness.badgeStatus,
    label: instagramReadiness.label,
    icon: <Globe2 aria-hidden="true" size={16} />,
    nextRequirement: instagramReadiness.nextRequirement,
  };
  const readinessItems: ReadinessItem[] = [
    instagramItem,
    {
      key: "messenger-meta",
      title: "Facebook Messenger / Meta",
      description: messengerPresentation.description,
      note: messengerLoadState === "loading"
        ? "Consultando o estado seguro do canal para esta empresa."
        : messengerPresentation.note,
      status: messengerPresentation.status,
      label: messengerPresentation.label,
      icon: <Globe2 aria-hidden="true" size={16} />,
      nextRequirement: messengerStatus.nextRequirement || "CONFIGURE_MESSENGER_PROVIDER",
    },
    STATIC_READINESS_ITEMS[0],
  ];
  const messengerActionNote = messengerLoadState === "forbidden"
    ? "Seu perfil não possui permissão para consultar ou configurar este canal."
    : messengerLoadState === "error"
      ? "Não foi possível confirmar o estado agora. Tente novamente."
      : messengerStatus.credentialConfigured
        ? "Credencial armazenada; aguardando validação do webhook TEST_ONLY."
        : EXTERNAL_PROVIDER_ACTIVATION_ENABLED
          ? canStoreMessengerCredential ? "Cole o token Page TEST_ONLY; ele será cifrado no servidor e não será exibido novamente." : "Configure primeiro um App/Página TEST_ONLY; nenhuma conexão real é solicitada aqui."
          : "Ativação externa bloqueada nesta missão; nenhuma credencial será solicitada.";
  return (
    <Surface className="min-w-0 overflow-hidden" data-testid="integration-readiness-panel">
      <div className="border-b border-[var(--border-default)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Outras integrações</h3>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-[var(--text-muted)]">
              Estados de capacidade e configuração segura dos canais.
            </p>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Preparação</span>
        </div>
      </div>
      <div className="divide-y divide-[var(--border-default)]">
        {readinessItems.map((item) => (
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
                {!instagramActionAllowed && <span className="text-[10px] font-medium text-[var(--text-tertiary)] md:text-right">{instagramLoadState === "error" ? <button className="font-semibold underline" onClick={() => setInstagramRetry((current) => current + 1)} type="button">Tentar novamente</button> : !canalIntegracaoId ? "Aguardando canal Instagram real" : EXTERNAL_PROVIDER_ACTIVATION_ENABLED ? "Ação indisponível no estado atual" : "Ativação externa bloqueada nesta missão"}</span>}
                {error && <p className="max-w-56 text-[10px] font-medium text-[var(--danger)] md:text-right" role="alert">{error}</p>}
              </div>
            ) : item.key === "messenger-meta" ? (
              <div className="grid gap-1 md:justify-items-end">
                <Button aria-label={messengerStatus.credentialConfigured ? "Trocar credencial Messenger" : "Conectar Messenger"} disabled={!EXTERNAL_PROVIDER_ACTIVATION_ENABLED || (messengerStatus.credentialConfigured && !messengerStatus.credentialRevision) || (!messengerStatus.credentialConfigured && (messengerLoadState !== "ready" || !["WAITING_META_AUTH", "CONNECTED"].includes(messengerStatus.state)))} onClick={() => { setMessengerCredentialMode(messengerStatus.credentialConfigured ? "replace" : "create"); setMessengerError(""); setMessengerModalOpen(true); }} size="sm" variant="secondary">
                  {messengerStatus.credentialConfigured ? "Trocar credencial" : "Conectar Messenger"}
                </Button>
                <span className="max-w-56 text-[10px] font-medium text-[var(--text-tertiary)] md:text-right">
                  {messengerActionNote}
                </span>
                {messengerLoadState === "error" && <button className="text-[10px] font-semibold text-[var(--text-secondary)] underline" onClick={() => void refreshMessengerStatus()} type="button">Tentar novamente</button>}
                {messengerStatus.credentialConfigured && <button className="text-[10px] font-semibold text-[var(--text-secondary)] underline disabled:cursor-not-allowed disabled:opacity-50" disabled={!EXTERNAL_PROVIDER_ACTIVATION_ENABLED || messengerBusy || !messengerStatus.credentialRevision} onClick={() => void removeMessengerCredentialSafely()} type="button">Remover credencial TEST_ONLY</button>}
                {messengerError && <p className="max-w-56 text-[10px] font-medium text-[var(--danger)] md:text-right" role="alert">{messengerError}</p>}
              </div>
            ) : <span className="text-[10px] font-medium text-[var(--text-tertiary)] md:pt-1">Sem ação disponível</span>}
          </article>
        ))}
      </div>
      <CommunicationModal
        description="O token é enviado somente por HTTPS para o armazenamento cifrado do CRM. Nenhuma chamada Graph é feita por esta ação."
        footer={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => { setMessengerToken(""); setMessengerError(""); setMessengerModalOpen(false); }} variant="secondary">Cancelar</Button>
            <Button disabled={!messengerToken.trim() || messengerBusy || !canStoreMessengerCredential} onClick={() => void saveMessengerCredential()} variant="primary">
              {messengerBusy ? "Armazenando…" : messengerCredentialMode === "replace" ? "Substituir token TEST_ONLY" : "Armazenar com segurança"}
            </Button>
          </div>
        )}
        onClose={() => { setMessengerToken(""); setMessengerError(""); setMessengerModalOpen(false); }}
        open={messengerModalOpen}
        title={messengerCredentialMode === "replace" ? "Trocar credencial Messenger" : "Configurar credencial Messenger"}
      >
        <label className="grid gap-1 text-[12px] font-medium text-[var(--text-secondary)]" htmlFor="messenger-page-token">
          Page Access Token TEST_ONLY
          <input
            autoComplete="off"
            className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--focus-ring)]"
            id="messenger-page-token"
            onChange={(event) => setMessengerToken(event.target.value)}
            type="password"
            value={messengerToken}
          />
        </label>
        <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">Nunca cole App Secret no navegador. O provider e a Página devem ser TEST_ONLY e o envio real permanece bloqueado nesta missão.</p>
      </CommunicationModal>
    </Surface>
  );
}

function messengerStatePresentation(state: MessengerConnectionState) {
  if (state === "CONNECTED") return {
    status: "conectado" as const,
    label: "Conectado",
    description: "Messenger configurado para esta empresa.",
    note: "O canal está ativo conforme o estado retornado pela API; nenhuma ação externa é disparada por este painel.",
  };
  if (state === "CONFIGURED_INACTIVE" || state === "PAUSED") return {
    status: "alerta" as const,
    label: "Configuração pendente",
    description: "Messenger identificado, mas ainda aguardando ativação segura.",
    note: "Provider e Página existem, mas o recebimento permanece fechado enquanto o canal não estiver ativo.",
  };
  if (state === "ERROR" || state === "UNAVAILABLE") return {
    status: "erro" as const,
    label: "Requer atenção",
    description: "O estado do Messenger não está pronto para conexão.",
    note: "Nenhum request ao provider é feito; corrija a configuração pelo procedimento seguro do ambiente.",
  };
  if (state === "WAITING_META_AUTH") return {
    status: "alerta" as const,
    label: "Aguardando configuração",
    description: "O próximo passo depende do App/Página TEST_ONLY.",
    note: "Provider e Página ainda não foram conectados; o recebimento permanece fechado até a configuração TEST_ONLY.",
  };
  return {
    status: "informacao" as const,
    label: "Configuração pendente",
    description: "Integração Messenger pronta para receber configuração TEST_ONLY.",
    note: "Provider e Página ainda não foram conectados; o recebimento permanece fechado até a configuração TEST_ONLY.",
  };
}
