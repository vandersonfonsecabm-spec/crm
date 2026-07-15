import { Zap } from "lucide-react";
import { EmptyState, SectionHeader, StatusBadge, Surface } from "../ui";

export default function DashboardAutomationsPanel() {
  return (
    <Surface className="overflow-hidden">
      <SectionHeader
        description="Nenhuma regra está ativa. O módulo aguarda contratos de backend para criar, executar e monitorar automações com segurança."
        icon={<Zap size={15} />}
        status={<StatusBadge label="Em preparação" status="planejado" />}
        title="Automações"
      />
      <EmptyState
        className="min-h-[280px]"
        description="Gatilhos, ações e históricos só serão exibidos quando houver suporte operacional real."
        icon={<Zap size={18} />}
        title="Motor de automação em preparação"
      />
    </Surface>
  );
}
