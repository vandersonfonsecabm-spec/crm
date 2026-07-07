import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ActivePage, Client } from "../../types/dashboard";

type DashboardCommandSearchProps = {
  clients: Client[];
  onSelectClient: (clientId: number) => void;
  onSetActivePage: (page: ActivePage) => void;
  onCloseQuickActions: () => void;
  canManageIntegrations: boolean;
};

type CommandResult = {
  label: string;
  type: string;
  searchText: string;
  action: () => void;
};

export default function DashboardCommandSearch({
  clients,
  onSelectClient,
  onSetActivePage,
  onCloseQuickActions,
  canManageIntegrations,
}: DashboardCommandSearchProps) {
  const [commandSearch, setCommandSearch] = useState("");
  const [showCommandResults, setShowCommandResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
    const term = normalizeCommandTerm(commandSearch);

    if (!term) {
      return [];
    }

    const pages: CommandResult[] = [
      { label: "Visão Geral", type: "Página", searchText: "visao geral dashboard inicio", action: () => onSetActivePage("dashboard") },
      { label: "Central Comercial", type: "Página", searchText: "central comercial operacao", action: () => onSetActivePage("comercial") },
      { label: "Carteira", type: "Página", searchText: "carteira clientes", action: () => onSetActivePage("clientes") },
      { label: "Funil Comercial", type: "Página", searchText: "funil comercial kanban oportunidades", action: () => onSetActivePage("kanban") },
      { label: "Agenda", type: "Página", searchText: "agenda acompanhamentos calendario", action: () => onSetActivePage("agenda") },
      { label: "Estoque", type: "Página", searchText: "estoque produtos inventario", action: () => onSetActivePage("estoque") },
      { label: "Automações", type: "Página", searchText: "automacoes automacao inteligencia regras", action: () => onSetActivePage("automacoes") },
      ...(canManageIntegrations
        ? [{ label: "Integrações", type: "Página administrativa", searchText: "integracoes integracao dados importacoes catalogo qualidade bling simulador whatsapp", action: () => onSetActivePage("integracoes") }]
        : []),
    ].filter((item) => matchesCommandSearch(term, item.label, item.searchText));

    const clientResults = clients
      .filter(
        (client) =>
          matchesCommandSearch(term, client.name, client.company, client.email, client.phone, ...(client.tags ?? []))
      )
      .slice(0, 4)
      .map((client) => ({
        label: client.name,
        type: client.company,
        searchText: `${client.name} ${client.company}`,
        action: () => onSelectClient(client.id),
      }));

    return [...pages, ...clientResults].slice(0, 6);
  }, [canManageIntegrations, clients, commandSearch, onSelectClient, onSetActivePage]);

  const boundedSelectedIndex = Math.min(selectedIndex, Math.max(commandResults.length - 1, 0));

  function runCommandResult(item: CommandResult) {
    item.action();
    setCommandSearch("");
    setShowCommandResults(false);
    setSelectedIndex(0);
  }

  return (
    <div className="relative hidden md:block">
      <div className="flex w-72 items-center gap-2 rounded-xl border border-slate-500/16 bg-slate-950/34 px-3 py-2 shadow-inner shadow-black/20 transition focus-within:border-teal-200/24 focus-within:bg-slate-950/48">
        <Search size={13} className="text-slate-500" />

        <input
          id="crm-command-search"
          value={commandSearch}
          onChange={(event) => {
            setCommandSearch(event.target.value);
            setShowCommandResults(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setShowCommandResults(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setShowCommandResults(false);
              setCommandSearch("");
              return;
            }

            if (!showCommandResults || commandResults.length === 0) {
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelectedIndex((current) => Math.min(current + 1, commandResults.length - 1));
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelectedIndex((current) => Math.max(current - 1, 0));
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              runCommandResult(commandResults[boundedSelectedIndex] ?? commandResults[0]);
            }
          }}
          placeholder="Buscar cliente, empresa ou página..."
          className="w-full select-text bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
        />

        <kbd className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] text-slate-600">
          Ctrl K
        </kbd>
      </div>

      {showCommandResults && commandSearch && (
        <div className="saas-panel absolute right-0 top-11 z-[130] w-72 rounded-2xl p-2 shadow-2xl shadow-black/45">
          {commandResults.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <p className="text-[11px] font-semibold text-slate-300">
                Nenhum resultado encontrado
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Busque pelo nome do cliente, empresa, e-mail ou página do CRM.
              </p>
            </div>
          )}

          {commandResults.map((item, index) => (
            <button
              key={`${item.type}-${item.label}`}
              aria-selected={index === boundedSelectedIndex}
              onClick={() => runCommandResult(item)}
              className={`w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.06] ${index === boundedSelectedIndex ? "bg-white/[0.06]" : ""}`}
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

function normalizeCommandTerm(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesCommandSearch(term: string, ...values: Array<string | null | undefined>) {
  if (!term) return false;
  const searchable = normalizeCommandTerm(values.filter(Boolean).join(" "));
  return searchable.includes(term);
}
