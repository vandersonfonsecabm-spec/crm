export const overviewStages = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"] as const;

export type OverviewStage = (typeof overviewStages)[number];
export type DashboardOverviewState = "loading" | "ready" | "partial" | "empty" | "error" | "fail-closed";

export type DashboardOverviewMetric = {
  label: string;
  kind: "count" | "money";
  value: number | null;
};

export type DashboardOverviewStageRow = {
  stage: OverviewStage;
  total: number;
  value: number;
  percentage: number;
};

export type DashboardOverviewSignal = {
  key: "high-risk" | "silent" | "hot-proposal";
  count: number;
  label: string;
};

export type DashboardOverviewModel = {
  state: DashboardOverviewState;
  partialMessage: string | null;
  metrics: DashboardOverviewMetric[];
  statusRows: DashboardOverviewStageRow[] | null;
  attentionSignals: DashboardOverviewSignal[];
  attentionKnown: boolean;
};

export type DashboardOverviewInput = {
  summary: unknown;
  isLoading?: boolean;
  hasSummaryError?: boolean;
  isAuthorized?: boolean;
};

const unavailableMetrics = (): DashboardOverviewMetric[] => [
  { label: "Clientes na carteira", kind: "count", value: null },
  { label: "Receita realizada — vendas canônicas", kind: "money", value: null },
  { label: "Pipeline estimado — Negócios abertos", kind: "money", value: null },
  { label: "Clientes em acompanhamento comercial", kind: "count", value: null },
];

export function buildDashboardOverviewModel({
  summary,
  isLoading = false,
  hasSummaryError = false,
  isAuthorized = true,
}: DashboardOverviewInput): DashboardOverviewModel {
  if (!isAuthorized) return baseModel("fail-closed");
  if (isLoading) return baseModel("loading");
  if (hasSummaryError) return baseModel("error");

  const root = asRecord(summary);
  if (!root) return baseModel("error");

  const indicators = asRecord(root.indicadores);
  const analytics = asRecord(root.analytics);
  const clients = readNumber(indicators?.clientes);
  const wonValue = readNumber(analytics?.wonValue);
  const forecastValue = readNumber(analytics?.forecastValue);
  const activePipeline = readNumber(analytics?.activePipeline);
  const highRiskCount = readNumber(analytics?.highRiskCount);
  const silentCount = readNumber(analytics?.silentCount);
  const hotProposalCount = readNumber(analytics?.hotProposalCount);
  const statusRows = normalizeStatusRows(root.status);
  const attentionKnown = [highRiskCount, silentCount, hotProposalCount].every((value) => value !== null);
  const coreKnown = [clients, wonValue, forecastValue, activePipeline, highRiskCount, silentCount, hotProposalCount].every((value) => value !== null);
  const metrics: DashboardOverviewMetric[] = [
    { label: "Clientes na carteira", kind: "count", value: clients },
    { label: "Receita realizada — vendas canônicas", kind: "money", value: wonValue },
    { label: "Pipeline estimado — Negócios abertos", kind: "money", value: forecastValue },
    { label: "Clientes em acompanhamento comercial", kind: "count", value: activePipeline },
  ];
  const attentionSignals = buildAttentionSignals(highRiskCount, silentCount, hotProposalCount);

  if (!coreKnown || statusRows === null) {
    return {
      state: "partial",
      partialMessage: "Dados parciais no resumo atual.",
      metrics,
      statusRows,
      attentionSignals,
      attentionKnown,
    };
  }

  return {
    state: clients === 0 ? "empty" : "ready",
    partialMessage: null,
    metrics,
    statusRows,
    attentionSignals,
    attentionKnown: true,
  };
}

function baseModel(state: Extract<DashboardOverviewState, "loading" | "error" | "fail-closed">): DashboardOverviewModel {
  return {
    state,
    partialMessage: null,
    metrics: unavailableMetrics(),
    statusRows: null,
    attentionSignals: [],
    attentionKnown: false,
  };
}

function buildAttentionSignals(
  highRiskCount: number | null,
  silentCount: number | null,
  hotProposalCount: number | null,
) {
  const signals: DashboardOverviewSignal[] = [];

  if (highRiskCount && highRiskCount > 0) {
    signals.push({ key: "high-risk", count: highRiskCount, label: "Clientes em alto risco" });
  }

  if (silentCount && silentCount > 0) {
    signals.push({ key: "silent", count: silentCount, label: "Clientes sem contato recente" });
  }

  if (hotProposalCount && hotProposalCount > 0) {
    signals.push({ key: "hot-proposal", count: hotProposalCount, label: "Clientes quentes em Proposta" });
  }

  return signals;
}

function normalizeStatusRows(value: unknown): DashboardOverviewStageRow[] | null {
  if (!Array.isArray(value)) return null;

  const rows = new Map<OverviewStage, { total: number; value: number }>();
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;

    const stage = typeof row.status === "string" ? row.status : null;
    if (!stage || !isOverviewStage(stage)) continue;

    const total = readNumber(row.total);
    const stageValue = readNumber(row.valor);
    if (total === null || stageValue === null || rows.has(stage)) return null;
    rows.set(stage, { total, value: stageValue });
  }

  const greatestTotal = Math.max(...[...rows.values()].map((row) => row.total), 1);
  return overviewStages.map((stage) => {
    const row = rows.get(stage) ?? { total: 0, value: 0 };
    return {
      stage,
      total: row.total,
      value: row.value,
      percentage: (row.total / greatestTotal) * 100,
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isOverviewStage(value: string): value is OverviewStage {
  return (overviewStages as readonly string[]).includes(value);
}
