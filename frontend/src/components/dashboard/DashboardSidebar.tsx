import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  Inbox,
  KanbanSquare,
  Package,
  PlugZap,
  ShieldCheck,
  Sprout,
  UserRoundSearch,
  Users,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  dashboardNavigationGroups,
  getDashboardRoute,
} from "../../navigation/dashboardNavigation";
import type { AuthSession } from "../../services/crmApi";
import type { ActivePage } from "../../types/dashboard";
import "./DashboardSidebar.css";

type DashboardSidebarProps = {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  authSession: AuthSession | null;
  canManageIntegrations?: boolean;
  canManageUsers?: boolean;
  isPlatformOperator?: boolean;
  leadsCommunicationEnabled?: boolean;
};

const navigationIcons: Record<ActivePage, ReactNode> = {
  dashboard: <BarChart3 size={16} />,
  comercial: <BriefcaseBusiness size={16} />,
  inbox: <Inbox size={16} />,
  leads: <UserRoundSearch size={16} />,
  clientes: <Users size={16} />,
  kanban: <KanbanSquare size={16} />,
  agenda: <CalendarCheck size={16} />,
  estoque: <Package size={16} />,
  integracoes: <PlugZap size={16} />,
  automacoes: <Sprout size={16} />,
  platformTenants: <ShieldCheck size={16} />,
  usuarios: <Users size={16} />,
  perfil: <ShieldCheck size={16} />,
};

export default function DashboardSidebar({
  activePage,
  setActivePage,
  canManageIntegrations = false,
  canManageUsers = false,
  isPlatformOperator = false,
  leadsCommunicationEnabled = false,
}: DashboardSidebarProps) {
  const visibleGroups = dashboardNavigationGroups
    .map((group) => ({
      ...group,
      items: group.pages
        .map((page) => getDashboardRoute(page))
        .filter((route) => route.showInSidebar)
        .filter((route) => !route.requiresIntegrationAccess || canManageIntegrations)
        .filter((route) => !route.requiresUserManagement || canManageUsers)
        .filter((route) => !route.requiresLeadsCommunication || leadsCommunicationEnabled)
        .filter((route) => !route.requiresPlatformOperator || isPlatformOperator),
    }))
    .filter((group) => group.items.length > 0);

  const mobilePages: ActivePage[] = ["comercial", "clientes", "kanban", "agenda"];

  return (
    <>
    <aside className="sidebar-shell hidden h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r lg:sticky lg:top-0 lg:flex">
      <div className="sidebar-brand flex h-[52px] shrink-0 items-center gap-3 border-b px-4">
        <div className="brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
          <Sprout size={16} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">CRM Agro</p>
          <p className="truncate text-[11px]">Gestão comercial</p>
        </div>
      </div>

      <nav aria-label="Navegação principal" className="sidebar-navigation min-h-0 flex-1 overflow-y-auto">
        <div className="sidebar-nav-groups">
          {visibleGroups.map((group) => (
            <div className="sidebar-nav-group" key={group.label}>
              <p className="sidebar-group-label">{group.label}</p>
              <div className="sidebar-nav-list">
                {group.items.map((item) => (
                  <SidebarButton
                    key={item.page}
                    active={activePage === item.page}
                    href={item.pathname}
                    icon={navigationIcons[item.page]}
                    label={item.label}
                    onNavigate={() => setActivePage(item.page)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

    </aside>
    <nav aria-label="Navegação móvel" className="mobile-navigation lg:hidden">
      {mobilePages.map((page) => {
        const route = getDashboardRoute(page);
        const active = activePage === page;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "is-active" : undefined}
            key={page}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              setActivePage(page);
            }}
            to={route.pathname}
          >
            {navigationIcons[page]}
            <span>{route.label}</span>
          </Link>
        );
      })}
    </nav>
    </>
  );
}

function SidebarButton({
  active,
  href,
  icon,
  label,
  onNavigate,
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate();
  }

  return (
    <Link
      to={href}
      onClick={handleClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`sidebar-nav-item relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12px] ${active ? "is-active" : ""}`}
      title={label}
    >
      <span className="sidebar-nav-icon flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}
