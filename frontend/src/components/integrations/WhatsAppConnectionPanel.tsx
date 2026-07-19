import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clipboard,
  CloudCog,
  LockKeyhole,
  MessageCircle,
  PauseCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CommunicationModal } from "../leads-communication/CommunicationOverlay";
import {
  Button,
  LoadingState,
  StatusBadge,
  Surface,
  type StatusBadgeStatus,
} from "../ui";
import { useWhatsAppConnectionStatus } from "./useWhatsAppConnectionStatus";
import type {
  WhatsAppConnectionState,
  WhatsAppConnectionStatus,
} from "./whatsappConnectionState";

export const WHATSAPP_WEBHOOK_URL = "https://api-production-875f9.up.railway.app/webhooks/whatsapp";

type CommonProps = {
  onUnauthorized: () => void;
};

type WhatsAppIntegrationCardProps = CommonProps & {
  onOpen: () => void;
};

const STATE_PRESENTATION: Record<WhatsAppConnectionState, {
  badge: StatusBadgeStatus;
  label: string;
  summary: string;
}> = {
  NOT_CONFIGURED: {
    badge: "inativo",
    label: "Não configurado",
    summary: "A conta da Meta e o número ainda não foram vinculados.",
  },
  WAITING_META_AUTH: {
    badge: "alerta",
    label: "Aguardando autorização",
    summary: "A próxima etapa depende de autenticação manual na Meta.",
  },
  CONFIGURED_INACTIVE: {
    badge: "informacao",
    label: "Configurado, mas desativado",
    summary: "A configuração existe, porém o recebimento permanece desligado.",
  },
  CONNECTED: {
    badge: "conectado",
    label: "Conectado",
    summary: "A conexão está disponível para a empresa.",
  },
  PAUSED: {
    badge: "alerta",
    label: "Pausado",
    summary: "A conexão está configurada, mas o recebimento está pausado.",
  },
  ERROR: {
    badge: "erro",
    label: "Requer atenção",
    summary: "A configuração precisa ser revisada antes de continuar.",
  },
  UNAVAILABLE: {
    badge: "indisponivel",
    label: "Status indisponível",
    summary: "Não foi possível consultar o estado atual da conexão.",
  },
};

export function WhatsAppIntegrationCard({ onOpen, onUnauthorized }: WhatsAppIntegrationCardProps) {
  const { loadState, status } = useWhatsAppConnectionStatus(onUnauthorized);
  const presentation = STATE_PRESENTATION[status.state];

  return (
    <Surface aria-labelledby="whatsapp-integration-card-title" className="overflow-hidden">
      <div className="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
            <MessageCircle aria-hidden="true" size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]" id="whatsapp-integration-card-title">WhatsApp</h2>
              {loadState === "loading"
                ? <span className="h-5 w-24 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
                : <StatusBadge label={presentation.label} status={presentation.badge} />}
            </div>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
              Receba e responda mensagens diretamente pela Caixa de Entrada.
            </p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
              {loadState === "forbidden" ? "A configuração exige permissão administrativa." : presentation.summary}
            </p>
          </div>
        </div>
        <Button
          aria-label="Ver configuração do WhatsApp"
          onClick={onOpen}
          rightIcon={<ChevronRight size={14} />}
          size="sm"
          variant="secondary"
        >
          {status.state === "NOT_CONFIGURED" ? "Configurar" : "Ver configuração"}
        </Button>
      </div>
    </Surface>
  );
}

type WhatsAppConnectionPanelProps = CommonProps & {
  onBack: () => void;
};

export function WhatsAppConnectionPanel({ onBack, onUnauthorized }: WhatsAppConnectionPanelProps) {
  const { loadState, refresh, status } = useWhatsAppConnectionStatus(onUnauthorized);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const presentation = STATE_PRESENTATION[status.state];
  const details = useMemo(() => statusDetails(status), [status]);

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(WHATSAPP_WEBHOOK_URL);
      setCopyFeedback("URL copiada");
    } catch {
      setCopyFeedback("Não foi possível copiar a URL");
    }
    window.setTimeout(() => setCopyFeedback(""), 2400);
  }

  if (loadState === "loading") {
    return (
      <div className="space-y-3" data-testid="whatsapp-status-loading">
        <Surface className="p-4"><LoadingState label="Carregando status do WhatsApp" rows={2} /></Surface>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Surface className="p-4"><LoadingState label="Carregando configuração" rows={4} /></Surface>
          <Surface className="p-4"><LoadingState label="Carregando etapas" rows={4} /></Surface>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-x-hidden">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={14} />
          Integrações
        </button>
        <Button
          leftIcon={<RefreshCw size={14} />}
          onClick={() => void refresh()}
          size="sm"
          variant="secondary"
        >
          Atualizar status
        </Button>
      </div>

      {loadState === "forbidden" && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800" role="alert">
          <LockKeyhole className="mt-0.5 shrink-0" size={14} />
          Sua conta não possui permissão administrativa para consultar esta configuração.
        </div>
      )}

      {loadState === "error" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-800" role="alert">
          <span className="flex items-center gap-2"><AlertCircle size={14} /> Não foi possível atualizar o status agora.</span>
          <button className="font-semibold underline decoration-rose-300 underline-offset-2" onClick={() => void refresh()} type="button">Tentar novamente</button>
        </div>
      )}

      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border-default)] px-4 py-4">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                <MessageCircle size={21} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Conecte o WhatsApp ao CRM</h2>
                  <StatusBadge label={presentation.label} status={presentation.badge} />
                </div>
                <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[var(--text-secondary)]">
                  A estrutura do CRM está pronta. Falta autorizar a conta na Meta e vincular um número para começar a receber mensagens.
                </p>
              </div>
            </div>
            <Button
              leftIcon={<MessageCircle className="text-[var(--text-inverse)]" size={15} />}
              onClick={() => setConnectModalOpen(true)}
              ref={connectButtonRef}
              variant="primary"
            >
              <span className="text-[var(--text-inverse)]">Conectar WhatsApp</span>
            </Button>
          </div>
        </div>

        <div className="grid divide-y divide-[var(--border-default)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
          {details.map((item) => (
            <div className="min-w-0 px-4 py-3" key={item.label}>
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <p className="mt-1 break-words text-[12px] font-semibold leading-5 text-[var(--text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </Surface>

      <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface className="overflow-hidden">
          <div className="border-b border-[var(--border-default)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Prontidão da conexão</h2>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">A ativação avança apenas quando cada etapa for confirmada.</p>
          </div>
          <ol className="divide-y divide-[var(--border-default)]">
            {connectionSteps(status.state).map((step, index) => (
              <li className="flex min-w-0 items-start gap-3 px-4 py-3" key={step.label}>
                <span
                  aria-label={step.done ? "Concluída" : "Pendente"}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    step.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-muted)]"
                  }`}
                >
                  {step.done ? <Check size={13} /> : <span className="text-[10px] font-semibold">{index + 1}</span>}
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--text-primary)]">{step.label}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{step.done ? "Concluída" : "Pendente"}</p>
                </div>
              </li>
            ))}
          </ol>
        </Surface>

        <aside className="space-y-3">
          <Surface className="overflow-hidden">
            <div className="border-b border-[var(--border-default)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Ações da conexão</h2>
              <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">Controles operacionais serão liberados depois da autorização.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              <UnavailableAction icon={<ShieldCheck size={14} />} label="Testar conexão" />
              <UnavailableAction icon={<PauseCircle size={14} />} label="Pausar recebimento" />
              <UnavailableAction icon={<RefreshCw size={14} />} label="Reativar" />
              <UnavailableAction icon={<CloudCog size={14} />} label="Desconectar" />
            </div>
          </Surface>

          <details className="group rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12px] font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
              Configuração técnica
              <ChevronRight className="transition-transform group-open:rotate-90" size={14} />
            </summary>
            <div className="border-t border-[var(--border-default)] px-4 py-3">
              <p className="text-[11px] text-[var(--text-muted)]">URL preparada do webhook</p>
              <code className="mt-2 block break-all rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                {WHATSAPP_WEBHOOK_URL}
              </code>
              <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2">
                <Button leftIcon={<Clipboard size={13} />} onClick={() => void copyWebhookUrl()} size="sm" variant="secondary">
                  Copiar URL
                </Button>
                <span aria-live="polite" className="text-[11px] font-medium text-[var(--primary)]">{copyFeedback}</span>
              </div>
            </div>
          </details>
        </aside>
      </div>

      <CommunicationModal
        description="A autorização ainda não está disponível neste painel."
        footer={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => setConnectModalOpen(false)} variant="secondary">Fechar</Button>
            <Button disabled leftIcon={<Send size={14} />} variant="primary">Continuar na Meta</Button>
          </div>
        )}
        onClose={() => setConnectModalOpen(false)}
        open={connectModalOpen}
        title="Antes de conectar"
        triggerRef={connectButtonRef}
      >
        <div className="space-y-3 text-[12px] leading-5 text-[var(--text-secondary)]">
          <div className="flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-900">
            <ShieldCheck className="mt-0.5 shrink-0" size={17} />
            <p>Para continuar, será necessário acessar uma conta administradora da Meta. O login e a confirmação de segurança são feitos diretamente pela Meta e nunca ficam armazenados no CRM.</p>
          </div>
          <ul className="space-y-2">
            <ModalPoint>O CRM não solicita a senha do Facebook.</ModalPoint>
            <ModalPoint>O App Secret não é exibido no frontend.</ModalPoint>
            <ModalPoint>Após a autorização, a conta e o número serão vinculados.</ModalPoint>
            <ModalPoint>A ativação será feita de maneira controlada.</ModalPoint>
          </ul>
          <p className="text-[11px] text-[var(--text-muted)]">Disponível quando a autenticação da Meta puder ser realizada.</p>
        </div>
      </CommunicationModal>
    </div>
  );
}

function statusDetails(status: WhatsAppConnectionStatus) {
  const connected = status.state === "CONNECTED";
  const configured = connected || status.state === "CONFIGURED_INACTIVE" || status.state === "PAUSED";
  return [
    { label: "Integração", value: configured ? STATE_PRESENTATION[status.state].label : "Não configurada", icon: <CloudCog size={13} /> },
    { label: "Número", value: configured ? "Número protegido pelo backend" : "Nenhum número conectado", icon: <Smartphone size={13} /> },
    { label: "Conta Meta", value: configured ? "Autorização registrada" : "Aguardando autorização", icon: <ShieldCheck size={13} /> },
    { label: "Webhook", value: status.verifiedAt ? "Conectado e validado na Meta" : "Preparado no CRM", icon: <CheckCircle2 size={13} /> },
    { label: "Recebimento", value: connected ? "Ativado" : "Desativado", icon: <MessageCircle size={13} /> },
    { label: "Envio", value: "Ainda não implementado", icon: <Send size={13} /> },
  ];
}

function connectionSteps(state: WhatsAppConnectionState) {
  const authorized = ["CONFIGURED_INACTIVE", "CONNECTED", "PAUSED"].includes(state);
  const webhookValidated = state === "CONNECTED" || state === "PAUSED";
  return [
    { label: "Infraestrutura do CRM", done: true },
    { label: "Autorizar conta na Meta", done: authorized },
    { label: "Vincular número do WhatsApp", done: authorized },
    { label: "Validar o webhook", done: webhookValidated },
    { label: "Ativar o recebimento", done: state === "CONNECTED" },
    { label: "Testar uma mensagem", done: false },
  ];
}

function UnavailableAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  const descriptionId = `unavailable-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <span
      aria-describedby={descriptionId}
      className="group relative block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      tabIndex={0}
    >
      <Button className="w-full" disabled leftIcon={icon} size="sm" variant="subtle">{label}</Button>
      <span
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 hidden w-52 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-2 text-center text-[10px] leading-4 text-white shadow-lg group-hover:block group-focus-visible:block"
        id={descriptionId}
        role="tooltip"
      >
        Disponível depois que um número for conectado.
      </span>
    </span>
  );
}

function ModalPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Circle className="mt-1.5 shrink-0 fill-[var(--primary)] text-[var(--primary)]" size={6} />
      <span>{children}</span>
    </li>
  );
}
