import type { ActivePage } from "../types/dashboard";

export type DashboardRoute = {
  page: ActivePage;
  pathname: string;
  label: string;
  requiresIntegrationAccess?: boolean;
  requiresLeadsCommunication?: boolean;
  requiresAutomationsAccess?: boolean;
  requiresPlatformOperator?: boolean;
  requiresUserManagement?: boolean;
  showInSidebar: boolean;
};

export const dashboardRoutes = [
  { page: "dashboard", pathname: "/visao-geral", label: "Visão Geral", showInSidebar: true },
  { page: "comercial", pathname: "/central-comercial", label: "Painel Comercial", showInSidebar: true },
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
  { page: "automacoes", pathname: "/automacoes", label: "Automações", requiresAutomationsAccess: true, showInSidebar: true },
  { page: "platformTenants", pathname: "/platform/tenants", label: "Tenants", requiresPlatformOperator: true, showInSidebar: true },
  { page: "usuarios", pathname: "/usuarios", label: "Usuários", requiresUserManagement: true, showInSidebar: true },
  { page: "perfil", pathname: "/perfil", label: "Meu perfil", showInSidebar: false },
] as const satisfies readonly DashboardRoute[];

export const dashboardNavigationGroups: ReadonlyArray<{
  label: string;
  pages: readonly ActivePage[];
}> = [
  { label: "Comercial", pages: ["dashboard", "comercial", "inbox", "leads", "clientes", "kanban", "agenda"] },
  { label: "Operação", pages: ["estoque", "automacoes"] },
  { label: "Administração", pages: ["integracoes", "usuarios"] },
  { label: "Plataforma", pages: ["platformTenants"] },
];

const routeByPage = new Map<ActivePage, DashboardRoute>(
  dashboardRoutes.map((route) => [route.page, route]),
);

const routeByPathname = new Map<string, DashboardRoute>(
  dashboardRoutes.map((route) => [route.pathname, route]),
);

const legacyDashboardPathnames = new Set(["/"]);

const dashboardDetailRoutes = new Map([
  ["/integracoes/whatsapp", { page: "integracoes" as const, detail: "whatsapp" as const }],
  ["/catalogo-comercial", { page: "comercial" as const, detail: "catalogo-comercial" as const }],
  ["/catalogo-comercial/produtos", { page: "comercial" as const, detail: "catalogo-comercial-produtos" as const }],
  ["/configuracoes/ia-comercial", { page: "comercial" as const, detail: "ia-comercial" as const }],
]);
const stockSubroutes = new Set([
  "/estoque/produtos",
  "/estoque/lotes",
  "/estoque/fontes",
  "/estoque/importacoes",
  "/estoque/mapeamentos",
  "/estoque/regras",
]);

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

  if (legacyDashboardPathnames.has(normalizedPathname)) {
    const route = getDashboardRoute("comercial");
    return {
      page: route.page,
      detail: null,
      pathname: route.pathname,
      isKnown: true,
      needsReplace: pathname !== route.pathname,
    };
  }

  const detailRoute = dashboardDetailRoutes.get(normalizedPathname);
  if (detailRoute) {
    return {
      ...detailRoute,
      pathname: normalizedPathname,
      isKnown: true,
      needsReplace: pathname !== normalizedPathname,
    };
  }

  const commercialProductDetail = normalizedPathname.match(/^\/catalogo-comercial\/produtos\/([1-9]\d*)$/);
  if (commercialProductDetail) {
    return {
      page: "comercial" as const,
      detail: `catalogo-comercial-produto:${commercialProductDetail[1]}`,
      pathname: normalizedPathname,
      isKnown: true,
      needsReplace: pathname !== normalizedPathname,
    };
  }

  const stockDetail = normalizedPathname.match(/^\/estoque\/(produtos|lotes|fontes)\/(\d+)$/);
  if (stockDetail) {
    return {
      page: "estoque" as const,
      detail: `${stockDetail[1]}:${stockDetail[2]}`,
      pathname: normalizedPathname,
      isKnown: true,
      needsReplace: pathname !== normalizedPathname,
    };
  }
  if (stockSubroutes.has(normalizedPathname)) {
    return {
      page: "estoque" as const,
      detail: null,
      pathname: normalizedPathname,
      isKnown: true,
      needsReplace: pathname !== normalizedPathname,
    };
  }

  const route = routeByPathname.get(normalizedPathname);

  if (!route) {
    return {
      page: "comercial" as const,
      detail: null,
      pathname: getDashboardPath("comercial"),
      isKnown: false,
      needsReplace: true,
    };
  }

  return {
    page: route.page,
    detail: null,
    pathname: route.pathname,
    isKnown: true,
    needsReplace: pathname !== route.pathname,
  };
}

type DashboardLocation = Pick<Location, "pathname" | "search" | "hash">;

export function resolveDashboardLocation(location: DashboardLocation) {
  return {
    ...resolveDashboardPathname(location.pathname),
    search: location.search,
    hash: location.hash,
  };
}
