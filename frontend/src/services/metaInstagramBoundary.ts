export const META_INSTAGRAM_BACKEND_STATES = [
  "NOT_CONFIGURED",
  "CONFIGURED_INACTIVE",
  "WAITING_META_AUTH",
  "CONNECTED",
  "PAUSED",
  "ERROR",
  "UNAVAILABLE",
] as const;

export type MetaInstagramBackendState = (typeof META_INSTAGRAM_BACKEND_STATES)[number];
export type MetaInstagramBadgeStatus = "planejado" | "informacao" | "conectado" | "alerta" | "erro" | "indisponivel";
export type MetaInstagramReadiness = {
  state: MetaInstagramBackendState;
  badgeStatus: MetaInstagramBadgeStatus;
  label: string;
  description: string;
  note: string;
  nextRequirement: string;
  source: "local-preparation" | "backend" | "fixture";
};

type MetaInstagramStatusPayload = {
  state?: string | null;
  nextRequirement?: string | null;
  credentialConfigured?: boolean | null;
  verifiedAt?: string | null;
  source?: "local-preparation" | "backend" | "fixture";
};

const DEFAULT_REQUIREMENT = "REAL_META_ACCOUNT_REQUIRED_FOR_E2E";

export function deriveMetaInstagramReadiness(payload: MetaInstagramStatusPayload | null | undefined): MetaInstagramReadiness {
  const reportedState = META_INSTAGRAM_BACKEND_STATES.includes(payload?.state as MetaInstagramBackendState)
    ? payload?.state as MetaInstagramBackendState
    : "NOT_CONFIGURED";
  const state = reportedState === "CONNECTED" && (payload?.credentialConfigured !== true || !payload?.verifiedAt)
    ? "WAITING_META_AUTH"
    : reportedState;
  const source = payload?.source ?? "local-preparation";
  const nextRequirement = payload?.nextRequirement || DEFAULT_REQUIREMENT;

  switch (state) {
    case "CONNECTED":
      return {
        state,
        badgeStatus: "conectado",
        label: source === "fixture" ? "Conectado (fixture)" : "Conectado",
        description: "O boundary Meta devolveu conexão ativa.",
        note: source === "fixture" ? "Estado sintético somente para validar a state machine; não representa uma conta real." : "Identidade mascarada e capabilities foram devolvidas pelo backend local.",
        nextRequirement: nextRequirement,
        source,
      };
    case "CONFIGURED_INACTIVE":
      return { state, badgeStatus: "informacao", label: "Configurado, aguardando ativação", description: "A identidade existe, mas o inbound ainda está inativo.", note: "A ativação depende das capabilities já existentes; nenhuma ação externa é executada aqui.", nextRequirement, source };
    case "WAITING_META_AUTH":
      return { state, badgeStatus: "planejado", label: "Aguardando autorização Meta", description: "O boundary está pronto, mas a conta ainda não autorizou o provedor.", note: "A autorização real fica para a etapa E2E com uma conta Meta.", nextRequirement, source };
    case "PAUSED":
      return { state, badgeStatus: "alerta", label: "Pausado", description: "O canal existe, mas o inbound está pausado.", note: "O próximo passo usa o lifecycle existente; não há botão novo nesta preparação.", nextRequirement, source };
    case "ERROR":
      return { state, badgeStatus: "erro", label: "Erro de configuração", description: "O backend devolveu um estado de erro controlado.", note: "Revise a configuração local antes de iniciar qualquer conexão externa.", nextRequirement, source };
    case "UNAVAILABLE":
      return { state, badgeStatus: "indisponivel", label: "Indisponível", description: "A capacidade Meta não está disponível neste ambiente.", note: "Flags, capabilities e configuração global permanecem fail-closed.", nextRequirement, source };
    case "NOT_CONFIGURED":
    default:
      return { state: "NOT_CONFIGURED", badgeStatus: "indisponivel", label: "Não conectado", description: "Nenhuma conta Instagram foi conectada para esta empresa.", note: "A conexão externa será tratada em uma missão de ativação separada.", nextRequirement, source };
  }
}

export function createLocalMetaInstagramReadiness(): MetaInstagramReadiness {
  return deriveMetaInstagramReadiness({ source: "local-preparation" });
}

export function isApprovedInstagramAuthorizationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.instagram.com" && url.pathname === "/oauth/authorize";
  } catch {
    return false;
  }
}
