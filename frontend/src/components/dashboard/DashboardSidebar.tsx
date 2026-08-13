import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  Inbox,
  KanbanSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  ShieldCheck,
  Sprout,
  UserRoundSearch,
  Users,
  MoreHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from "react";
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
  collapsed?: boolean;
  onToggle?: () => void;
  attentionCount?: number | null;
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
  collapsed = false,
  onToggle,
  attentionCount = null,
}: DashboardSidebarProps) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileMoreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMoreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMoreOpen(false);
      mobileMoreButtonRef.current?.focus();
    };
    const closeOnOutsidePointer = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileMoreButtonRef.current?.contains(target) || mobileMoreMenuRef.current?.contains(target)) return;
      setMobileMoreOpen(false);
    };
    window.setTimeout(() => mobileMoreMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 0);
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [mobileMoreOpen]);

  function handleMobileMoreKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(mobileMoreMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    if (event.key === "Tab") {
      setMobileMoreOpen(false);
      return;
    }
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[nextIndex]?.focus();
    }
  }
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

  const mobilePages: ActivePage[] = ["comercial", "clientes", leadsCommunicationEnabled ? "inbox" : "kanban", "agenda"];
  const moreActive = !mobilePages.includes(activePage);

  return (
    <>
    <aside
      className={`sidebar-shell ${collapsed ? "is-collapsed" : ""} hidden h-screen shrink-0 flex-col border-r lg:sticky lg:top-0 lg:flex`}
      aria-label="Barra lateral principal"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
    >
      <div className="sidebar-brand flex h-[52px] shrink-0 items-center gap-3 border-b px-4">
        <div className="brand-mark sidebar-brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
          <Sprout size={16} />
        </div>
        <div className="sidebar-brand-copy min-w-0">
          <p className="truncate text-[13px] font-semibold">CRM Agro</p>
          <p className="truncate text-[11px]">Gestão comercial</p>
        </div>
        {onToggle ? (
          <button
            type="button"
            className="sidebar-collapse-toggle ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            aria-expanded={!collapsed}
            aria-controls="sidebar-navigation"
            title={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            onClick={onToggle}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        ) : null}
      </div>

      <nav id="sidebar-navigation" aria-label="Navegação principal" className="sidebar-navigation min-h-0 flex-1 overflow-y-auto">
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
                    badge={item.page === "inbox" ? attentionCount ?? 0 : 0}
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
            aria-label={`${route.label}${page === "inbox" && attentionCount !== null && attentionCount > 0 ? `, ${attentionCount} conversa${attentionCount === 1 ? "" : "s"} exigindo atenção` : ""}`}
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
            <span className="relative inline-flex">{navigationIcons[page]}{page === "inbox" && attentionCount !== null && attentionCount > 0 ? <span className="mobile-navigation-badge" aria-hidden="true">{attentionCount > 99 ? "99+" : attentionCount}</span> : null}</span>
            <span>{route.label}</span>
          </Link>
        );
      })}
      <button ref={mobileMoreButtonRef} type="button" className={mobileMoreOpen || moreActive ? "is-active" : undefined} aria-haspopup="menu" aria-expanded={mobileMoreOpen} aria-controls="mobile-more-menu" onClick={() => setMobileMoreOpen((current) => !current)}>
        <MoreHorizontal size={16} />
        <span>Mais</span>
      </button>
      {mobileMoreOpen ? <div ref={mobileMoreMenuRef} id="mobile-more-menu" className="mobile-more-menu" aria-label="Mais páginas" role="menu" onKeyDown={handleMobileMoreKeyDown}>
        {visibleGroups.flatMap((group) => group.items).filter((item) => !mobilePages.includes(item.page)).map((item) => (
          <Link key={item.page} role="menuitem" aria-current={activePage === item.page ? "page" : undefined} to={item.pathname} onClick={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); setMobileMoreOpen(false); setActivePage(item.page); }}>{navigationIcons[item.page]}<span>{item.label}</span></Link>
        ))}
      </div> : null}
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
  badge = 0,
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  onNavigate: () => void;
  badge?: number;
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
      aria-label={`${label}${badge > 0 ? `, ${badge} conversa${badge === 1 ? "" : "s"} exigindo atenção` : ""}`}
      aria-current={active ? "page" : undefined}
      className={`sidebar-nav-item relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12px] ${active ? "is-active" : ""}`}
      title={label}
    >
      <span className="sidebar-nav-icon flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="sidebar-nav-label min-w-0 flex-1 truncate">{label}</span>
      {badge > 0 ? <span className="sidebar-nav-badge" aria-hidden="true">{badge > 99 ? "99+" : badge}</span> : null}
    </Link>
  );
}
