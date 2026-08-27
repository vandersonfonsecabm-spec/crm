import type { HubIntegracao } from "../../services/crmApi";

export function blingStatePresentation(integration: HubIntegracao | undefined) {
  const connected = integration?.tipo === "BLING"
    && integration.ativo
    && integration.possuiCredenciais
    && integration.status === "ATIVA";
  if (connected) return { label: "Conectado", status: "conectado" as const };
  if (!integration) return { label: "Não configurado", status: "indisponivel" as const };
  if (integration.status === "ERRO") return { label: "Erro de conexão", status: "erro" as const };
  if (integration.status === "PENDENTE") return { label: "Configuração incompleta", status: "alerta" as const };
  return { label: "Desconectado", status: "desconectado" as const };
}

export function isApprovedBlingAuthorizationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "www.bling.com.br"
      && url.pathname === "/Api/v3/oauth/authorize";
  } catch {
    return false;
  }
}
