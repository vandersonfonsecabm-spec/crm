export const NO_FOLLOW_UP_PROJECTION = "Sem acompanhamento";

export type FollowUpTiming = "TODAY" | "TOMORROW" | "OVERDUE" | "FUTURE" | "NONE" | "LEGACY";

export function classifyNextFollowUp(value: string | null | undefined, now = new Date()): FollowUpTiming {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.toLowerCase() === NO_FOLLOW_UP_PROJECTION.toLowerCase()) return "NONE";
  if (normalized.toLowerCase() === "hoje") return "TODAY";
  if (normalized.toLowerCase() === "amanhã") return "TOMORROW";

  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "LEGACY";
  if (date.getTime() < now.getTime()) return "OVERDUE";
  if (sameLocalDay(date, now)) return "TODAY";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameLocalDay(date, tomorrow)) return "TOMORROW";
  return "FUTURE";
}

export function formatNextFollowUp(value: string | null | undefined, now = new Date()): string {
  const normalized = String(value ?? "").trim();
  const timing = classifyNextFollowUp(normalized, now);
  if (timing === "NONE") return NO_FOLLOW_UP_PROJECTION;
  if (timing === "TODAY") return "Hoje";
  if (timing === "TOMORROW") return "Amanhã";
  if (timing === "OVERDUE") return "Atrasado";
  if (timing === "LEGACY") return normalized || NO_FOLLOW_UP_PROJECTION;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(normalized));
}

function sameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}
