import { Camera, CircleHelp, Globe2, MessageCircle, UsersRound } from "lucide-react";
import type { ComponentType } from "react";
import type { CommunicationConversation } from "../../services/crmApi";

type ChannelIcon = ComponentType<{ "aria-hidden"?: boolean; size?: number }>;

export type ChannelPresentation = {
  icon: ChannelIcon;
  label: string;
  tone: "site" | "whatsapp" | "instagram" | "messenger" | "unknown";
};

const CHANNELS: Record<string, ChannelPresentation> = {
  SITE_FORM: { icon: Globe2, label: "Site", tone: "site" },
  WHATSAPP_META: { icon: MessageCircle, label: "WhatsApp", tone: "whatsapp" },
  INSTAGRAM_META: { icon: Camera, label: "Instagram", tone: "instagram" },
  MESSENGER_META: { icon: UsersRound, label: "Messenger", tone: "messenger" },
};

export function getChannelPresentation(type?: string | null): ChannelPresentation {
  return CHANNELS[String(type ?? "").toUpperCase()] ?? {
    icon: CircleHelp,
    label: "Canal não reconhecido",
    tone: "unknown",
  };
}

export function canUseSimulatedReply(conversation?: CommunicationConversation | null) {
  return conversation?.podeResponderDiretamente === true
    && conversation.canalIntegracao.tipo === "WHATSAPP_META"
    && conversation.canalIntegracao.modoTeste === true;
}
