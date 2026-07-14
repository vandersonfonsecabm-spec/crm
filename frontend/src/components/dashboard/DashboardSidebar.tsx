import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  KanbanSquare,
  Package,
  PlugZap,
  Sprout,
  Users,
} from "lucide-react";
import type { AuthSession } from "../../services/crmApi";
import type { ActivePage } from "../../types/dashboard";
import "./DashboardSidebar.css";

type DashboardSidebarProps = {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  authSession: AuthSession | null;
  canManageIntegrations?: boolean;
};

const navigationGroups: Array<{
  label: string;
  items: Array<{
    page: ActivePage;
    label: string;
    icon: React.ReactNode;
    requiresIntegrationAccess?: boolean;
  }>;
}> = [
  {
    label: "Visão geral",
    items: [
      { page: "dashboard", label: "Visão Geral", icon: <BarChart3 size={16} /> },
    ],
  },
  {
    label: "Comercial",
    items: [
      { page: "comercial", label: "Central Comercial", icon: <BriefcaseBusiness size={16} /> },
      { page: "clientes", label: "Clientes", icon: <Users size={16} /> },
      { page: "kanban", label: "Negócios", icon: <KanbanSquare size={16} /> },
      { page: "agenda", label: "Agenda", icon: <CalendarCheck size={16} /> },
    ],
  },
  {
    label: "Operação",
    items: [
      { page: "estoque", label: "Estoque", icon: <Package size={16} /> },
    ],
  },
  {
    label: "Administração",
    items: [
      {
        page: "integracoes",
        label: "Integrações",
        icon: <PlugZap size={16} />,
        requiresIntegrationAccess: true,
      },
    ],
  },
];

export default function DashboardSidebar({
  activePage,
  setActivePage,
  authSession,
  canManageIntegrations = false,
}: DashboardSidebarProps) {
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.requiresIntegrationAccess || canManageIntegrations),
    }))
    .filter((group) => group.items.length > 0);

  const displayName = authSession?.usuario.nome || "Usuário";
  const companyName = authSession?.empresa?.nome || "CRM Agro SaaS";
  const roleLabel = getRoleLabel(authSession?.papel ?? authSession?.usuario.papel);

  return (
    <aside className="sidebar-shell hidden h-screen w-[224px] shrink-0 flex-col border-r lg:sticky lg:top-0 lg:flex">
      <div className="sidebar-brand flex h-16 shrink-0 items-center gap-3 border-b px-4">
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
                    icon={item.icon}
                    label={item.label}
                    onClick={() => setActivePage(item.page)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="sidebar-account border-t px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <div className="sidebar-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
            {getInitials(displayName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium">{displayName}</p>
            <p className="truncate text-[10px]">{roleLabel} · {companyName}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`sidebar-nav-item relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12px] ${active ? "is-active" : ""}`}
      type="button"
    >
      <span className="sidebar-nav-icon flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function getRoleLabel(role?: string) {
  const labels: Record<string, string> = {
    ADMIN: "Administrador",
    GERENTE: "Gerente",
    VENDEDOR: "Vendedor",
  };
  return role ? labels[role] ?? role : "Operador";
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "U";
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? words[words.length - 1]?.[0] ?? "" : words[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase();
}
