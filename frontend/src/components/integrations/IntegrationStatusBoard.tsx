import {
  Bot,
  Clock3,
  Globe2,
  Mail,
  MessageCircle,
  Package,
  PlugZap,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ApiHttpError,
  fetchEmailOperationalStatus,
  fetchIntegracoes,
  fetchInstagramOperationalStatus,
  fetchMessengerOperationalStatus,
  fetchWhatsappOperationalStatus,
  type ApiChannelSummary,
  type EmailOperationalStatusResponse,
  type HubIntegracao,
  type InstagramOperationalStatusResponse,
  type MessengerOperationalStatusResponse,
  type WhatsappOperationalStatusResponse,
} from "../../services/crmApi";
import { fetchAICommerceConnectionStatus, type AICommerceConnectionStatus } from "../../services/aiCommerceApi";
import { deriveMetaInstagramReadiness } from "../../services/metaInstagramBoundary";
import { mapMessengerConnectionStatus } from "./messengerConnectionState";
import { mapWhatsAppConnectionStatus } from "./whatsappConnectionState";
import { blingStatePresentation } from "./blingConnectionState";
import { Badge, Button, ErrorState, LoadingState, SectionHeader, StatusBadge, Surface } from "../ui";

/**
 * Intent: an administrator should answer "what is connected and what is next?" in one glance.
 * Domain: channels, provider readiness, tenant capabilities, sync freshness and safe activation.
 * Signature: every provider gets the same status + next-action anatomy, while the source contract stays provider-specific.
 * Palette: existing CRM semantic tokens; green confirms a real state, amber marks incomplete configuration, and neutral keeps OFF honest.
 * Depth: existing border-first surfaces and 4px rhythm keep the board operational rather than promotional.
 * Typography: compact labels with stronger provider names; status remains textual and never color-only.
 */

export type IntegrationCanonicalState =
  | "NOT_CONFIGURED"
  | "CONFIGURATION_INCOMPLETE"
  | "READY_TO_CONNECT"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR"
  | "EXPIRED"
  | "DISCONNECTED"
  | "UNAVAILABLE";

export type IntegrationStatusCard = {
  key: "whatsapp" | "instagram" | "messenger" | "bling" | "email" | "ai";
  title: string;
  description: string;
  detail: string;
  label: string;
  state: IntegrationCanonicalState;
  badge: "conectado" | "desconectado" | "alerta" | "erro" | "informacao" | "indisponivel";
  icon: ReactNode;
  lastUpdated: string | null;
  nextRequirement: string | null;
};

type StatusInput = {
  whatsapp?: WhatsappOperationalStatusResponse | null;
  whatsappUnavailable?: boolean;
  instagram?: InstagramOperationalStatusResponse | null;
  instagramUnavailable?: boolean;
  messenger?: MessengerOperationalStatusResponse | null;
  messengerUnavailable?: boolean;
  bling?: HubIntegracao[];
  blingUnavailable?: boolean;
  channels?: ApiChannelSummary[];
  channelsUnavailable?: boolean;
  email?: EmailOperationalStatusResponse | null;
  emailUnavailable?: boolean;
  ai?: AICommerceConnectionStatus | null;
  aiUnavailable?: boolean;
  aiUnavailableCode?: string;
};

type LoadState = "loading" | "ready" | "error";

export default function IntegrationStatusBoard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [state, setState] = useState<LoadState>("loading");
  const [cards, setCards] = useState<IntegrationStatusCard[]>(() => buildIntegrationStatusCards({}));
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setState("loading");
    setError("");
    const results = await Promise.allSettled([
      fetchWhatsappOperationalStatus(),
      fetchInstagramOperationalStatus(),
      fetchMessengerOperationalStatus(),
      fetchIntegracoes({ tipo: "BLING", limit: 10 }),
      fetchEmailOperationalStatus(),
      fetchAICommerceConnectionStatus(),
    ]);
    if (sequence !== requestSequence.current) return;

    const [whatsapp, instagram, messenger, bling, email, ai] = results;
    const unauthorized = results.some((result) => result.status === "rejected" && isUnauthorized(result.reason));
    if (unauthorized) {
      onUnauthorized();
      return;
    }

    const nextCards = buildIntegrationStatusCards({
      whatsapp: fulfilledValue(whatsapp),
      whatsappUnavailable: rejected(whatsapp),
      instagram: fulfilledValue(instagram),
      instagramUnavailable: rejected(instagram),
      messenger: fulfilledValue(messenger),
      messengerUnavailable: rejected(messenger),
      bling: fulfilledValue(bling)?.data,
      blingUnavailable: rejected(bling),
      email: fulfilledValue(email),
      emailUnavailable: rejected(email),
      ai: fulfilledValue(ai),
      aiUnavailable: rejected(ai),
      aiUnavailableCode: rejectionCode(ai),
    });
    setCards(nextCards);
    setState("ready");
    if (results.every((result) => result.status === "rejected")) {
      setState("error");
      setError("Não foi possível confirmar os estados das integrações agora.");
    }
  }, [onUnauthorized]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [load]);

  return (
    <Surface className="min-w-0 overflow-hidden" data-testid="integration-status-board">
      <SectionHeader
        actions={<Button disabled={state === "loading"} leftIcon={<RefreshCw size={14} />} loading={state === "loading"} onClick={() => void load()} size="sm" variant="secondary">Atualizar status</Button>}
        description="Leitura tenant-scoped. Nenhuma conexão externa é iniciada nesta fase."
        icon={<PlugZap size={15} />}
        status={<Badge variant="info">Somente leitura</Badge>}
        title="Status das integrações"
      />
      <div className="flex flex-wrap items-start gap-2 border-b border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3 text-[11px] leading-4 text-[var(--text-secondary)]">
        <ShieldCheck className="mt-0.5 shrink-0 text-[var(--info)]" size={14} />
        <p>O estado exibido vem da API da empresa. Credenciais, tokens, URLs privadas e payloads técnicos nunca são exibidos.</p>
      </div>
      {state === "loading" && <div className="p-4"><LoadingState label="Consultando estados das integrações" rows={3} /></div>}
      {state === "error" && <div className="p-4"><ErrorState description={error} onRetry={() => void load()} title="Status indisponível" /></div>}
      {state === "ready" && (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => <IntegrationStatusCardView card={card} key={card.key} />)}
        </div>
      )}
    </Surface>
  );
}

function IntegrationStatusCardView({ card }: { card: IntegrationStatusCard }) {
  return (
    <article className="flex min-w-0 flex-col rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3" data-integration-state={card.state} data-testid={`integration-status-${card.key}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--icon-default)]">{card.icon}</span>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-semibold text-[var(--text-primary)]">{card.title}</h3>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{card.description}</p>
          </div>
        </div>
        <StatusBadge label={card.label} status={card.badge} />
      </div>
      <p className="mt-3 min-h-8 text-[11px] leading-4 text-[var(--text-secondary)]">{card.detail}</p>
      {card.nextRequirement && <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.05em] text-[var(--text-tertiary)]">Próximo requisito: {card.nextRequirement}</p>}
      <div className="mt-3 flex min-w-0 items-center gap-1.5 border-t border-[var(--border-default)] pt-2 text-[10px] text-[var(--text-muted)]">
        <Clock3 aria-hidden="true" size={12} />
        <span className="truncate">{card.lastUpdated ? `Última atualização: ${formatDate(card.lastUpdated)}` : "Última atualização: nunca"}</span>
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Ativação externa bloqueada nesta fase</p>
    </article>
  );
}

// This model export is intentionally kept for deterministic source tests; it
// is not a component and should not participate in Fast Refresh boundaries.
// eslint-disable-next-line react-refresh/only-export-components
export function buildIntegrationStatusCards(input: StatusInput): IntegrationStatusCard[] {
  return [
    whatsappCard(input),
    instagramCard(input),
    messengerCard(input),
    blingCard(input),
    emailCard(input),
    aiCard(input),
  ];
}

function whatsappCard(input: StatusInput): IntegrationStatusCard {
  const icon = <MessageCircle size={16} />;
  if (input.whatsappUnavailable) return unavailable("whatsapp", "WhatsApp", "Não foi possível confirmar o canal agora.", icon);
  const status = mapWhatsAppConnectionStatus(input.whatsapp);
  return mapMetaCard("whatsapp", "WhatsApp", status.state, status.verifiedAt || status.connectedAt || status.lastWebhookAt, "CONFIGURE_WHATSAPP_PROVIDER", icon);
}

function instagramCard(input: StatusInput): IntegrationStatusCard {
  const icon = <Globe2 size={16} />;
  if (input.instagramUnavailable) return unavailable("instagram", "Instagram", "Não foi possível confirmar o canal agora. Tente atualizar.", icon);
  const status = deriveMetaInstagramReadiness({ ...(input.instagram || {}), source: "backend" });
  return mapMetaCard("instagram", "Instagram", status.state, input.instagram?.verifiedAt || input.instagram?.connectedAt || input.instagram?.lastWebhookAt, input.instagram?.nextRequirement || "REAL_META_ACCOUNT_REQUIRED_FOR_E2E", icon);
}

function messengerCard(input: StatusInput): IntegrationStatusCard {
  const icon = <Globe2 size={16} />;
  if (input.messengerUnavailable) return unavailable("messenger", "Messenger", "Não foi possível confirmar o canal agora. Tente atualizar.", icon);
  const status = mapMessengerConnectionStatus(input.messenger);
  return mapMetaCard("messenger", "Messenger", status.state, status.verifiedAt || status.connectedAt || status.lastWebhookAt, input.messenger?.nextRequirement || "CONFIGURE_MESSENGER_PROVIDER", icon);
}

function mapMetaCard(key: "whatsapp" | "instagram" | "messenger", title: string, rawState: string, lastUpdated: string | null | undefined, nextRequirement: string | null, icon: ReactNode): IntegrationStatusCard {
  const state = rawState === "CONNECTED"
    ? "CONNECTED"
    : rawState === "ERROR"
      ? "ERROR"
      : rawState === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : rawState === "PAUSED" || rawState === "CONFIGURED_INACTIVE"
          ? "DISCONNECTED"
          : rawState === "WAITING_META_AUTH"
            ? "CONFIGURATION_INCOMPLETE"
            : "NOT_CONFIGURED";
  const copy = stateCopy(state, title);
  return { key, title, ...copy, icon, lastUpdated: lastUpdated || null, nextRequirement: rawState === "CONNECTED" ? null : metaRequirement(rawState, nextRequirement) };
}

function metaRequirement(rawState: string, fallback: string | null) {
  if (rawState === "UNAVAILABLE") return "TENTE_NOVAMENTE";
  if (rawState === "ERROR") return "REVISE_CONFIGURACAO";
  if (rawState === "PAUSED") return "REATIVAR_CANAL";
  if (rawState === "CONFIGURED_INACTIVE") return "ATIVAR_CANAL";
  return fallback;
}

function blingCard(input: StatusInput): IntegrationStatusCard {
  const icon = <Package size={16} />;
  if (input.blingUnavailable) return unavailable("bling", "Bling", "Não foi possível confirmar a integração deste tenant.", icon);
  const rows = input.bling || [];
  const latest = rows.find((item) => item.tipo === "BLING" && item.ativo && item.possuiCredenciais && item.status === "ATIVA") || rows.find((item) => item.tipo === "BLING");
  const presentation = blingStatePresentation(latest);
  const state: IntegrationCanonicalState = presentation.status === "conectado"
    ? "CONNECTED"
    : presentation.status === "erro"
      ? "ERROR"
      : presentation.status === "alerta"
        ? "CONFIGURATION_INCOMPLETE"
        : latest
          ? "DISCONNECTED"
          : "NOT_CONFIGURED";
  const copy = stateCopy(state, "Bling");
  return { key: "bling", title: "Bling", ...copy, icon, lastUpdated: latest?.updatedAt || latest?.ultimaSincronizacaoEm || null, nextRequirement: state === "CONNECTED" ? null : state === "ERROR" ? "TENTE_NOVAMENTE" : "CONFIGURE_BLING_PROVIDER" };
}

function emailCard(input: StatusInput): IntegrationStatusCard {
  const icon = <Mail size={16} />;
  if (input.emailUnavailable) return unavailable("email", "E-mail", "Não foi possível confirmar a caixa deste tenant. Tente atualizar.", icon);
  if (input.email) {
    const rawState = String(input.email.state || input.email.status || "UNAVAILABLE").toUpperCase();
    const state: IntegrationCanonicalState = rawState === "CONNECTED"
      ? "CONNECTED"
      : rawState === "ERROR"
        ? "ERROR"
        : rawState === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : rawState === "PAUSED"
            ? "DISCONNECTED"
            : rawState === "CONFIGURED_INACTIVE" || rawState === "WAITING_PROVIDER_AUTH"
              ? "CONFIGURATION_INCOMPLETE"
              : rawState === "NOT_CONFIGURED"
                ? "NOT_CONFIGURED"
                : "UNAVAILABLE";
    const copy = stateCopy(state, "E-mail");
    return {
      key: "email",
      title: "E-mail",
      ...copy,
      icon,
      lastUpdated: input.email.updatedAt || input.email.lastFailureAt || null,
      nextRequirement: state === "CONNECTED" ? null : input.email.nextRequirement || (state === "UNAVAILABLE" ? "TENTE_NOVAMENTE" : state === "ERROR" ? "RECONCILE_EMAIL_CHANNEL" : state === "DISCONNECTED" ? "REACTIVATE_EMAIL_INBOUND" : "CONFIGURE_EMAIL_PROVIDER"),
    };
  }
  if (input.channelsUnavailable) return unavailable("email", "E-mail", "Não foi possível confirmar a caixa deste tenant.", icon);
  const channel = (input.channels || []).find((item) => item.tipo === "EMAIL" && item.modoTeste === false);
  const state: IntegrationCanonicalState = !channel
    ? "NOT_CONFIGURED"
    : channel.status === "ATIVO" && channel.ativo
      ? "CONFIGURATION_INCOMPLETE"
      : "DISCONNECTED";
  const copy = stateCopy(state, "E-mail");
  return { key: "email", title: "E-mail", ...copy, icon, lastUpdated: channel?.updatedAt || null, nextRequirement: state === "CONFIGURATION_INCOMPLETE" ? "VALIDATE_EMAIL_PROVIDER" : "CONFIGURE_EMAIL_PROVIDER" };
}

function aiCard(input: StatusInput): IntegrationStatusCard {
  const icon = <Bot size={16} />;
  if (input.aiUnavailable) {
    if (isDisabledCode(input.aiUnavailableCode)) {
      return unavailable("ai", "IA Comercial", "A capacidade de IA está desativada neste ambiente; nenhum provider real está disponível.", icon, "disabled");
    }
    return unavailable("ai", "IA Comercial", "Não foi possível confirmar a fundação de IA agora.", icon);
  }
  const status = input.ai?.status;
  const state: IntegrationCanonicalState = status === "REAL_CONNECTED"
    ? "CONNECTED"
    : status === "REAL_NOT_CONNECTED"
      ? "CONFIGURATION_INCOMPLETE"
      : status === "MOCK_AVAILABLE"
        ? "READY_TO_CONNECT"
        : "NOT_CONFIGURED";
  const copy = stateCopy(state, "IA Comercial");
  if (status === "MOCK_AVAILABLE") {
    copy.label = "Mock disponível";
    copy.detail = "Mock determinístico disponível sem conexão externa; o provider real permanece desligado.";
    copy.badge = "informacao";
  }
  return { key: "ai", title: "IA Comercial", ...copy, icon, lastUpdated: input.ai?.lastValidatedAt || null, nextRequirement: status === "REAL_CONNECTED" ? null : status === "MOCK_AVAILABLE" ? "ATIVAR_PROVIDER_EM_MISSAO_SEPARADA" : "CONFIGURE_AI_PROVIDER" };
}

function unavailable(key: IntegrationStatusCard["key"], title: string, detail: string, icon: ReactNode, variant: "unknown" | "disabled" = "unknown"): IntegrationStatusCard {
  if (variant === "disabled") {
    return { key, title, description: `${title} está desativada.`, detail, label: "Desativado", state: "UNAVAILABLE", badge: "informacao", icon, lastUpdated: null, nextRequirement: "ATIVAR_CAPACIDADE_EM_MISSAO_SEPARADA" };
  }
  return { key, title, description: "Estado não confirmado", detail, label: "Indisponível", state: "UNAVAILABLE", badge: "indisponivel", icon, lastUpdated: null, nextRequirement: "TENTE_NOVAMENTE" };
}

function stateCopy(state: IntegrationCanonicalState, title: string) {
  if (state === "CONNECTED") return { description: `${title} confirmado para esta empresa.`, detail: "O estado conectado foi retornado pela API tenant-scoped.", label: "Conectado", badge: "conectado" as const, state };
  if (state === "ERROR") return { description: `${title} exige atenção.`, detail: "A API registrou uma falha; nenhum retry externo é iniciado por este painel.", label: "Erro", badge: "erro" as const, state };
  if (state === "UNAVAILABLE") return { description: "Estado não confirmado", detail: "A leitura segura não retornou dados suficientes para afirmar prontidão.", label: "Indisponível", badge: "indisponivel" as const, state };
  if (state === "CONFIGURATION_INCOMPLETE") return { description: `${title} ainda não está pronto.`, detail: "Existe uma configuração parcial, mas a autorização/validação do provider não foi concluída.", label: "Configuração incompleta", badge: "alerta" as const, state };
  if (state === "READY_TO_CONNECT") return { description: `${title} preparado para a próxima fase.`, detail: "A fundação interna está disponível; a conexão externa exige uma missão de ativação separada.", label: "Pronto para conectar", badge: "informacao" as const, state };
  if (state === "EXPIRED") return { description: `${title} precisa de reconexão.`, detail: "A credencial/validação expirou e não será renovada automaticamente nesta fase.", label: "Expirado", badge: "alerta" as const, state };
  if (state === "DISCONNECTED") return { description: `${title} não está ativo.`, detail: "Nenhum request externo é disparado enquanto o canal permanecer desconectado.", label: "Desconectado", badge: "desconectado" as const, state };
  return { description: `${title} ainda não foi configurado.`, detail: "Não há conexão confirmada para esta empresa.", label: "Não conectado", badge: "desconectado" as const, state: "NOT_CONFIGURED" as const };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function fulfilledValue<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled" ? result.value : undefined;
}

function rejected<T>(result: PromiseSettledResult<T>) {
  return result.status === "rejected";
}

function rejectionCode(result: PromiseSettledResult<unknown>) {
  if (result.status !== "rejected") return undefined;
  const error = result.reason;
  return error instanceof ApiHttpError ? error.code : undefined;
}

function isDisabledCode(code?: string) {
  return ["AI_COMMERCE_DISABLED", "CAPABILITY_DISABLED", "INTEGRATION_DISABLED", "PROVIDER_DISABLED"].includes(String(code || "").toUpperCase());
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiHttpError && error.status === 401;
}
