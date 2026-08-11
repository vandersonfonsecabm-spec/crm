export const COMMERCIAL_PRIORITY_PRECEDENCE = [
  "follow-up-overdue",
  "follow-up-today",
  "high-risk",
  "hot-proposal",
  "silent-client",
] as const;

export const COMMERCIAL_PRIORITY_TIE_BREAKERS = [
  "follow-up-overdue-first",
  "next-follow-up-ascending",
  "client-id-ascending",
] as const;

export type CommercialPriorityReason = (typeof COMMERCIAL_PRIORITY_PRECEDENCE)[number];
export type CommercialFollowUpTiming = "TODAY" | "TOMORROW" | "OVERDUE" | "FUTURE" | "NONE" | "LEGACY";
export type CommercialPanelState = "loading" | "ready" | "partial" | "empty" | "error" | "fail-closed";
export type CommercialLocalState = "loading" | "ready" | "partial" | "empty";

export type CommercialClientRecord = {
  id: number;
  name: string;
  company: string;
  value: number;
  status: string;
  hot: boolean;
  lastContactDays: number;
  nextFollowUp: string | null | undefined;
};

export type CommercialMetric = {
  key: "forecastValue" | "todayFollowUps" | "hotProposalCount" | "silentCount";
  label: string;
  kind: "money" | "count";
  value: number | null;
};

export type CommercialPriorityItem<TClient extends CommercialClientRecord> = {
  client: TClient;
  reason: CommercialPriorityReason;
  reasonLabel: string;
  timing: CommercialFollowUpTiming;
  deadlineLabel: string;
};

export type CommercialAgendaItem<TClient extends CommercialClientRecord> = {
  client: TClient;
  timing: CommercialFollowUpTiming;
  deadlineLabel: string;
};

export type CommercialAttention = {
  highRiskCount: number | null;
};

export type CommercialControlCenterModel<TClient extends CommercialClientRecord> = {
  state: CommercialPanelState;
  metrics: CommercialMetric[];
  priorityState: CommercialLocalState;
  priorities: CommercialPriorityItem<TClient>[];
  agendaState: CommercialLocalState;
  agenda: CommercialAgendaItem<TClient>[];
  attention: CommercialAttention;
};

export type CommercialControlCenterInput<TClient extends CommercialClientRecord> = {
  summary: unknown;
  summaryLoadState?: "loading" | "ready" | "error";
  clients: readonly TClient[];
  clientsLoadState?: "loading" | "ready" | "error";
  isAuthorized?: boolean;
  getRisk: (client: TClient) => string;
  classifyFollowUp?: (value: string | null | undefined, now: Date) => CommercialFollowUpTiming;
  formatFollowUp?: (value: string | null | undefined, now: Date) => string;
  now?: Date;
};

type CommercialAnalytics = {
  forecastValue: number | null;
  todayFollowUps: number | null;
  hotProposalCount: number | null;
  silentCount: number | null;
  highRiskCount: number | null;
};

type PriorityCandidate<TClient extends CommercialClientRecord> = CommercialPriorityItem<TClient> & {
  deadlineAt: number | null;
  sourceIndex: number;
};

type AgendaCandidate<TClient extends CommercialClientRecord> = CommercialAgendaItem<TClient> & {
  deadlineAt: number | null;
  sourceIndex: number;
};

/**
 * The model is intentionally detached from React and API hooks. KPI values are read
 * only from `summary.analytics`; queue and agenda values are read only from the
 * currently loaded `clients` page. No page-level value is ever a KPI fallback.
 * Priorities remain local to the loaded page. They place overdue follow-ups first,
 * then the next valid follow-up date, then a visible reason and client.id; score and
 * derived "prioridade alta" do not participate in this composition.
 */
export function buildCommercialControlCenterModel<TClient extends CommercialClientRecord>({
  summary,
  summaryLoadState = "ready",
  clients,
  clientsLoadState = "ready",
  isAuthorized = true,
  getRisk,
  classifyFollowUp = defaultClassifyFollowUp,
  formatFollowUp = defaultFormatFollowUp,
  now = new Date(),
}: CommercialControlCenterInput<TClient>): CommercialControlCenterModel<TClient> {
  if (!isAuthorized) return restrictedModel<TClient>();

  const analytics = summaryLoadState === "loading" ? unavailableAnalytics() : readAnalytics(summary);
  const metrics = buildMetrics(analytics);
  const attention = { highRiskCount: analytics.highRiskCount };

  if (summaryLoadState === "error" || clientsLoadState === "error") {
    return unavailableModel<TClient>("error");
  }

  if (summaryLoadState === "loading" && clientsLoadState === "loading") {
    return unavailableModel<TClient>("loading");
  }

  if (clientsLoadState === "loading") {
    return {
      state: "partial",
      metrics,
      priorityState: "loading",
      priorities: [],
      agendaState: "loading",
      agenda: [],
      attention,
    };
  }

  if (clients.length === 0) {
    return {
      state: "empty",
      metrics,
      priorityState: "empty",
      priorities: [],
      agendaState: "empty",
      agenda: [],
      attention,
    };
  }

  const priorities = buildPriorities({
    clients,
    getRisk,
    classifyFollowUp,
    formatFollowUp,
    now,
  });
  const agendaResult = buildAgenda({ clients, classifyFollowUp, formatFollowUp, now });
  const metricsComplete = metrics.every((metric) => metric.value !== null);

  return {
    state: summaryLoadState === "loading" || !metricsComplete ? "partial" : "ready",
    metrics,
    priorityState: priorities.length > 0 ? "ready" : "empty",
    priorities,
    agendaState: agendaResult.state,
    agenda: agendaResult.items,
    attention,
  };
}

function readAnalytics(summary: unknown): CommercialAnalytics {
  const analytics = asRecord(asRecord(summary)?.analytics);
  return {
    forecastValue: readNonNegativeNumber(analytics?.forecastValue),
    todayFollowUps: readNonNegativeNumber(analytics?.todayFollowUps),
    hotProposalCount: readNonNegativeNumber(analytics?.hotProposalCount),
    silentCount: readNonNegativeNumber(analytics?.silentCount),
    highRiskCount: readNonNegativeNumber(analytics?.highRiskCount),
  };
}

function unavailableAnalytics(): CommercialAnalytics {
  return {
    forecastValue: null,
    todayFollowUps: null,
    hotProposalCount: null,
    silentCount: null,
    highRiskCount: null,
  };
}

function buildMetrics(analytics: CommercialAnalytics): CommercialMetric[] {
  return [
    {
      key: "forecastValue",
      label: "Valor informado em clientes — Novo e Proposta",
      kind: "money",
      value: analytics.forecastValue,
    },
    {
      key: "todayFollowUps",
      label: "Clientes com acompanhamento hoje",
      kind: "count",
      value: analytics.todayFollowUps,
    },
    {
      key: "hotProposalCount",
      label: "Clientes quentes em Proposta",
      kind: "count",
      value: analytics.hotProposalCount,
    },
    {
      key: "silentCount",
      label: "Clientes sem contato recente",
      kind: "count",
      value: analytics.silentCount,
    },
  ];
}

function buildPriorities<TClient extends CommercialClientRecord>({
  clients,
  getRisk,
  classifyFollowUp,
  formatFollowUp,
  now,
}: Pick<CommercialControlCenterInput<TClient>, "clients" | "getRisk" | "classifyFollowUp" | "formatFollowUp" | "now">): CommercialPriorityItem<TClient>[] {
  const classifier = classifyFollowUp ?? defaultClassifyFollowUp;
  const formatter = formatFollowUp ?? defaultFormatFollowUp;
  const referenceTime = now ?? new Date();
  const candidates: PriorityCandidate<TClient>[] = [];

  clients.forEach((client, sourceIndex) => {
    if (isClosedStatus(client.status)) return;

    const timing = classifier(client.nextFollowUp, referenceTime);
    const reason = getPriorityReason(client, timing, getRisk);
    if (!reason) return;

    candidates.push({
      client,
      reason,
      reasonLabel: priorityReasonLabel(reason, client),
      timing,
      deadlineLabel: formatter(client.nextFollowUp, referenceTime),
      deadlineAt: getDeadlineTimestamp(client.nextFollowUp, timing, referenceTime),
      sourceIndex,
    });
  });

  candidates.sort(comparePriorityCandidates);
  return dedupeByClientId(candidates).slice(0, 4).map(stripPriorityCandidate);
}

function buildAgenda<TClient extends CommercialClientRecord>({
  clients,
  classifyFollowUp,
  formatFollowUp,
  now,
}: Pick<CommercialControlCenterInput<TClient>, "clients" | "classifyFollowUp" | "formatFollowUp" | "now">): {
  state: Extract<CommercialLocalState, "ready" | "partial" | "empty">;
  items: CommercialAgendaItem<TClient>[];
} {
  const classifier = classifyFollowUp ?? defaultClassifyFollowUp;
  const formatter = formatFollowUp ?? defaultFormatFollowUp;
  const referenceTime = now ?? new Date();
  const candidates: AgendaCandidate<TClient>[] = [];

  clients.forEach((client, sourceIndex) => {
    const timing = classifier(client.nextFollowUp, referenceTime);
    if (timing !== "TODAY") return;

    candidates.push({
      client,
      timing,
      deadlineLabel: formatter(client.nextFollowUp, referenceTime),
      deadlineAt: getDeadlineTimestamp(client.nextFollowUp, timing, referenceTime),
      sourceIndex,
    });
  });

  candidates.sort(compareAgendaCandidates);
  const uniqueCandidates = dedupeByClientId(candidates);
  const items = uniqueCandidates.slice(0, 3).map(stripAgendaCandidate);
  return {
    state: items.length === 0 ? "empty" : "ready",
    items,
  };
}

function getPriorityReason<TClient extends CommercialClientRecord>(
  client: TClient,
  timing: CommercialFollowUpTiming,
  getRisk: (client: TClient) => string,
): CommercialPriorityReason | null {
  if (timing === "OVERDUE") return "follow-up-overdue";
  if (timing === "TODAY") return "follow-up-today";
  if (normalizedText(getRisk(client)) === "alto") return "high-risk";
  if (client.hot && normalizedText(client.status) === "proposta") return "hot-proposal";
  if (safeLastContactDays(client.lastContactDays) >= 7) return "silent-client";
  return null;
}

function priorityReasonLabel(reason: CommercialPriorityReason, client: CommercialClientRecord) {
  if (reason === "follow-up-overdue") return "Follow-up atrasado";
  if (reason === "follow-up-today") return "Follow-up hoje";
  if (reason === "high-risk") return "Risco alto";
  if (reason === "hot-proposal") return "Proposta quente";
  return `${safeLastContactDays(client.lastContactDays)} dias sem contato`;
}

function comparePriorityCandidates<TClient extends CommercialClientRecord>(
  first: PriorityCandidate<TClient>,
  second: PriorityCandidate<TClient>,
) {
  const timingDifference = agendaTimingRank(first.timing) - agendaTimingRank(second.timing);
  if (timingDifference !== 0) return timingDifference;

  const deadlineDifference = compareDeadlines(first.deadlineAt, second.deadlineAt);
  if (deadlineDifference !== 0) return deadlineDifference;

  const reasonDifference = priorityRank(first.reason) - priorityRank(second.reason);
  if (reasonDifference !== 0) return reasonDifference;

  const idDifference = first.client.id - second.client.id;
  return idDifference !== 0 ? idDifference : first.sourceIndex - second.sourceIndex;
}

function compareAgendaCandidates<TClient extends CommercialClientRecord>(
  first: AgendaCandidate<TClient>,
  second: AgendaCandidate<TClient>,
) {
  const timingDifference = agendaTimingRank(first.timing) - agendaTimingRank(second.timing);
  if (timingDifference !== 0) return timingDifference;

  const deadlineDifference = compareDeadlines(first.deadlineAt, second.deadlineAt);
  if (deadlineDifference !== 0) return deadlineDifference;

  const idDifference = first.client.id - second.client.id;
  return idDifference !== 0 ? idDifference : first.sourceIndex - second.sourceIndex;
}

function compareDeadlines(first: number | null, second: number | null) {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return first - second;
}

function priorityRank(reason: CommercialPriorityReason) {
  return COMMERCIAL_PRIORITY_PRECEDENCE.indexOf(reason);
}

function agendaTimingRank(timing: CommercialFollowUpTiming) {
  if (timing === "OVERDUE") return 0;
  if (timing === "TODAY") return 1;
  if (timing === "TOMORROW") return 2;
  if (timing === "FUTURE") return 3;
  if (timing === "LEGACY") return 4;
  return 5;
}

function unavailableModel<TClient extends CommercialClientRecord>(state: Extract<CommercialPanelState, "loading" | "error">): CommercialControlCenterModel<TClient> {
  return {
    state,
    metrics: unavailableMetrics(),
    priorityState: "loading",
    priorities: [],
    agendaState: "loading",
    agenda: [],
    attention: { highRiskCount: null },
  };
}

function restrictedModel<TClient extends CommercialClientRecord>(): CommercialControlCenterModel<TClient> {
  return {
    state: "fail-closed",
    metrics: unavailableMetrics(),
    priorityState: "loading",
    priorities: [],
    agendaState: "loading",
    agenda: [],
    attention: { highRiskCount: null },
  };
}

function unavailableMetrics(): CommercialMetric[] {
  return buildMetrics(unavailableAnalytics());
}

function dedupeByClientId<TItem extends { client: CommercialClientRecord }>(items: TItem[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.client.id)) return false;
    seen.add(item.client.id);
    return true;
  });
}

function stripPriorityCandidate<TClient extends CommercialClientRecord>({
  client,
  reason,
  reasonLabel,
  timing,
  deadlineLabel,
}: PriorityCandidate<TClient>): CommercialPriorityItem<TClient> {
  return { client, reason, reasonLabel, timing, deadlineLabel };
}

function stripAgendaCandidate<TClient extends CommercialClientRecord>({
  client,
  timing,
  deadlineLabel,
}: AgendaCandidate<TClient>): CommercialAgendaItem<TClient> {
  return { client, timing, deadlineLabel };
}

function getDeadlineTimestamp(value: string | null | undefined, timing: CommercialFollowUpTiming, now: Date) {
  const normalized = String(value ?? "").trim();
  const parsed = new Date(normalized);
  if (Number.isFinite(parsed.getTime())) return parsed.getTime();
  if (timing === "TODAY") return startOfDay(now).getTime();
  if (timing === "TOMORROW") {
    const tomorrow = startOfDay(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getTime();
  }
  return null;
}

function defaultClassifyFollowUp(value: string | null | undefined, now: Date): CommercialFollowUpTiming {
  const normalized = String(value ?? "").trim();
  const label = normalized.toLocaleLowerCase("pt-BR");
  if (!normalized || label === "sem acompanhamento") return "NONE";
  if (label === "hoje") return "TODAY";
  if (label === "amanhã") return "TOMORROW";

  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "LEGACY";
  if (date.getTime() < now.getTime()) return "OVERDUE";
  if (sameLocalDay(date, now)) return "TODAY";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return sameLocalDay(date, tomorrow) ? "TOMORROW" : "FUTURE";
}

function defaultFormatFollowUp(value: string | null | undefined, now: Date) {
  const normalized = String(value ?? "").trim();
  const timing = defaultClassifyFollowUp(normalized, now);
  if (timing === "NONE") return "Sem acompanhamento";
  if (timing === "TODAY") return "Hoje";
  if (timing === "TOMORROW") return "Amanhã";
  if (timing === "OVERDUE") return "Atrasado";
  if (timing === "LEGACY") return normalized;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(normalized));
}

function isClosedStatus(status: string) {
  return ["fechado", "perdido", "concluido"].includes(normalizedText(status));
}

function normalizedText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function safeLastContactDays(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function readNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}
