import type { ActivePage } from "../types/dashboard";

export type DashboardRoute = {
  page: ActivePage;
  pathname: string;
  label: string;
  requiresIntegrationAccess?: boolean;
  requiresLeadsCommunication?: boolean;
  showInSidebar: boolean;
};

export const dashboardRoutes = [
  { page: "dashboard", pathname: "/", label: "Visão Geral", showInSidebar: true },
  { page: "comercial", pathname: "/central-comercial", label: "Central Comercial", showInSidebar: true },
  { page: "inbox", pathname: "/caixa-de-entrada", label: "Caixa de Entrada", requiresLeadsCommunication: true, showInSidebar: true },
  { page: "leads", pathname: "/leads", label: "Leads", requiresLeadsCommunication: true, showInSidebar: true },
  { page: "clientes", pathname: "/clientes", label: "Clientes", showInSidebar: true },
  { page: "kanban", pathname: "/negocios", label: "Negócios", showInSidebar: true },
  { page: "agenda", pathname: "/agenda", label: "Agenda", showInSidebar: true },
  { page: "estoque", pathname: "/estoque", label: "Estoque", showInSidebar: true },
  {
    page: "integracoes",
    pathname: "/integracoes",
    label: "Integrações",
    requiresIntegrationAccess: true,
    showInSidebar: true,
  },
  { page: "automacoes", pathname: "/automacoes", label: "Automações", showInSidebar: false },
] as const satisfies readonly DashboardRoute[];

export const dashboardNavigationGroups: ReadonlyArray<{
  label: string;
  pages: readonly ActivePage[];
}> = [
  { label: "Visão geral", pages: ["dashboard"] },
  { label: "Comercial", pages: ["comercial", "inbox", "leads", "clientes", "kanban", "agenda"] },
  { label: "Operação", pages: ["estoque"] },
  { label: "Administração", pages: ["integracoes"] },
];

const routeByPage = new Map<ActivePage, DashboardRoute>(
  dashboardRoutes.map((route) => [route.page, route]),
);

const routeByPathname = new Map<string, DashboardRoute>(
  dashboardRoutes.map((route) => [route.pathname, route]),
);

export function getDashboardRoute(page: ActivePage): DashboardRoute {
  const route = routeByPage.get(page);
  if (!route) throw new Error(`Rota não configurada para a página ${page}.`);
  return route;
}

export function getDashboardPath(page: ActivePage) {
  return getDashboardRoute(page).pathname;
}

export function normalizeDashboardPathname(pathname: string) {
  const pathOnly = pathname.trim().split(/[?#]/, 1)[0] || "/";
  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  const withoutDuplicateSlashes = withLeadingSlash.replace(/\/{2,}/g, "/");
  const withoutTrailingSlash = withoutDuplicateSlashes.length > 1
    ? withoutDuplicateSlashes.replace(/\/+$/, "")
    : withoutDuplicateSlashes;

  return withoutTrailingSlash.toLowerCase();
}

export function resolveDashboardPathname(pathname: string) {
  const normalizedPathname = normalizeDashboardPathname(pathname);
  const route = routeByPathname.get(normalizedPathname);

  if (!route) {
    return {
      page: "dashboard" as const,
      pathname: "/",
      isKnown: false,
      needsReplace: true,
    };
  }

  return {
    page: route.page,
    pathname: route.pathname,
    isKnown: true,
    needsReplace: pathname !== route.pathname,
  };
}
