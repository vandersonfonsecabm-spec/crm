import type { ApiAcompanhamentoResumo, BusinessStage, CommunicationBusiness, NegociosKanbanResponse } from "../../services/crmApi";

export const businessStageLabels: Record<BusinessStage, string> = {
  NOVO: "Novo",
  CONTATO: "Contato",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

export type CommercialProcessSnapshot = {
  stages: Array<{ stage: BusinessStage; total: number }>;
  total: number;
  open: number;
  won: number;
  lost: number;
  overdue: number;
  stalled: CommunicationBusiness[];
  stalledTotal: number;
};

export function buildCommercialProcessModel(
  businesses: NegociosKanbanResponse["resumo"],
  stalled: { data: CommunicationBusiness[]; pagination: { total: number } },
  agenda: ApiAcompanhamentoResumo,
): CommercialProcessSnapshot {
  const stages = (Object.keys(businessStageLabels) as BusinessStage[]).map((stage) => ({
    stage,
    total: Number.isFinite(businesses.porEtapa[stage]) ? Math.max(0, businesses.porEtapa[stage]) : 0,
  }));
  const won = Math.max(0, businesses.fechados);
  const lost = Math.max(0, businesses.perdidos);
  const total = Math.max(0, businesses.total);
  return {
    stages,
    total,
    open: Math.max(0, total - won - lost),
    won,
    lost,
    overdue: Math.max(0, agenda.indicadores.atrasados),
    stalled: stalled.data,
    stalledTotal: Math.max(0, stalled.pagination.total),
  };
}
