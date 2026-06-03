import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";
type ActivePage = "dashboard" | "clientes" | "kanban" | "automacoes";

type Note = {
  id: number;
  text: string;
  date: string;
};

type Client = {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  value: number;
  status: Status;
  source: string;
  favorite: boolean;
  hot: boolean;
  lastContactDays: number;
  nextFollowUp: string;
  tags: string[];
  notes: Note[];
};

type DashboardCommandSearchProps = {
  clients: Client[];
  onSelectClient: (clientId: number) => void;
  onSetActivePage: (page: ActivePage) => void;
  onCloseQuickActions: () => void;
};

export default function DashboardCommandSearch({
  clients,
  onSelectClient,
  onSetActivePage,
  onCloseQuickActions,
}: DashboardCommandSearchProps) {
  const [commandSearch, setCommandSearch] = useState("");
  const [showCommandResults, setShowCommandResults] = useState(false);

  useEffect(() => {
    function handleShortcuts(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommandResults(true);
        window.setTimeout(() => document.getElementById("crm-command-search")?.focus(), 0);
        return;
      }

      if (!isTyping && event.key === "/") {
        event.preventDefault();
        setShowCommandResults(true);
        window.setTimeout(() => document.getElementById("crm-command-search")?.focus(), 0);
        return;
      }

      if (event.key === "Escape") {
        setShowCommandResults(false);
        setCommandSearch("");
        onCloseQuickActions();
      }
    }

    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [onCloseQuickActions]);

  const commandResults = useMemo(() => {
    const term = commandSearch.toLowerCase().trim();

    if (!term) {
      return [];
    }

    const pages = [
      { label: "Dashboard", type: "Página", action: () => onSetActivePage("dashboard") },
      { label: "Clientes", type: "Página", action: () => onSetActivePage("clientes") },
      { label: "Kanban", type: "Página", action: () => onSetActivePage("kanban") },
      { label: "Automações", type: "Página", action: () => onSetActivePage("automacoes") },
    ].filter((item) => item.label.toLowerCase().includes(term));

    const clientResults = clients
      .filter(
        (client) =>
          client.name.toLowerCase().includes(term) ||
          client.company.toLowerCase().includes(term) ||
          client.email.toLowerCase().includes(term)
      )
      .slice(0, 4)
      .map((client) => ({
        label: client.name,
        type: client.company,
        action: () => {
          onSelectClient(client.id);
          onSetActivePage("clientes");
        },
      }));

    return [...pages, ...clientResults].slice(0, 6);
  }, [clients, commandSearch, onSelectClient, onSetActivePage]);

  return (
    <div className="relative hidden md:block">
      <div className="flex w-64 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        <Search size={13} className="text-slate-500" />

        <input
          id="crm-command-search"
          value={commandSearch}
          onChange={(event) => {
            setCommandSearch(event.target.value);
            setShowCommandResults(true);
          }}
          onFocus={() => setShowCommandResults(true)}
          placeholder="Buscar cliente, empresa ou página..."
          className="w-full select-text bg-transparent text-[11px] outline-none placeholder:text-slate-500"
        />

        <kbd className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] text-slate-600">
          Ctrl K
        </kbd>
      </div>

      {showCommandResults && commandSearch && (
        <div className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-white/10 bg-[#0d111a] p-2 shadow-2xl">
          {commandResults.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <p className="text-[11px] font-semibold text-slate-300">
                Nenhum resultado encontrado
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Tente buscar pelo nome do cliente, empresa, email ou página do CRM.
              </p>
            </div>
          )}

          {commandResults.map((item) => (
            <button
              key={`${item.type}-${item.label}`}
              onClick={() => {
                item.action();
                setCommandSearch("");
                setShowCommandResults(false);
              }}
              className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/10"
            >
              <p className="text-[11px] font-medium text-slate-200">
                {item.label}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {item.type}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
