import type { CommunicationConversation } from "../../services/crmApi";
import { Badge } from "../ui";
import { getChannelPresentation } from "./communicationChannels";

export function CommunicationChannelBadge({
  channel,
  compact = false,
}: {
  channel: CommunicationConversation["canalIntegracao"];
  compact?: boolean;
}) {
  const presentation = getChannelPresentation(channel.tipo);
  const Icon = presentation.icon;
  const simulated = channel.modoTeste === true;

  return (
    <Badge
      className={`communication-channel-badge communication-channel-${presentation.tone} gap-1.5`}
      data-channel-type={channel.tipo}
      title={simulated ? `${presentation.label} · ambiente de teste` : presentation.label}
      variant="neutral"
    >
      <Icon aria-hidden={true} size={11} />
      {!compact && <span>{presentation.label}</span>}
      {simulated && !compact && <span className="communication-channel-mode">Teste</span>}
    </Badge>
  );
}
