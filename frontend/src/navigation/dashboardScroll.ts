type DashboardScrollContainer = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTo">;
type DashboardScrollFallback = Pick<Window, "scrollTo">;

const pageStart: ScrollToOptions = { top: 0, left: 0, behavior: "auto" };

export function resetDashboardPageScroll(
  content: DashboardScrollContainer | null,
  fallback: DashboardScrollFallback,
) {
  if (content && content.scrollHeight > content.clientHeight) {
    content.scrollTo(pageStart);
    return "content" as const;
  }

  fallback.scrollTo(pageStart);
  return "window" as const;
}
