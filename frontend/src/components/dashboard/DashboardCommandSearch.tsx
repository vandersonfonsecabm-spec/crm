/* eslint-disable react-hooks/set-state-in-effect -- network search state is synchronized from the active command effect. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { fetchClientesFromBackend } from "../../services/crmApi";
import type { ActivePage, Client } from "../../types/dashboard";

type DashboardCommandSearchProps = {
  onSelectClient: (clientId: number) => void;
  onSetActivePage: (page: ActivePage) => void;
  onCloseQuickActions: () => void;
  canManageIntegrations: boolean;
  leadsCommunicationEnabled: boolean;
  automationsEnabled: boolean;
  readOnly?: boolean;
};

type CommandResult = {
  key: string;
  label: string;
  type: string;
  searchText: string;
  action: () => void;
};

export default function DashboardCommandSearch({
  onSelectClient,
  onSetActivePage,
  onCloseQuickActions,
  canManageIntegrations,
  leadsCommunicationEnabled,
  automationsEnabled,
  readOnly = false,
}: DashboardCommandSearchProps) {
  const [commandSearch, setCommandSearch] = useState("");
  const [showCommandResults, setShowCommandResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (readOnly) return;

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
  }, [onCloseQuickActions, readOnly]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) setShowCommandResults(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (readOnly) return;

    const term = normalizeCommandTerm(commandSearch);
    if (term.length < 2) {
      setClientResults([]);
      setIsSearching(false);
      setSearchError(false);
      return;
    }
    let ignore = false;
    setIsSearching(true);
    setSearchError(false);
    const timeout = window.setTimeout(() => {
      fetchClientesFromBackend({ search: commandSearch, page: 1, limit: 4, sortBy: "name" })
        .then((result) => {
          if (!ignore) {
            setClientResults(result?.data ?? []);
            setIsSearching(false);
          }
        })
        .catch(() => {
          if (!ignore) {
            setClientResults([]);
            setIsSearching(false);
            setSearchError(true);
          }
        });
    }, 250);
    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, [commandSearch, readOnly]);

  const commandResults = useMemo(() => {
    const term = normalizeCommandTerm(commandSearch);

    if (!term) {
      return [];
    }

    const pages: CommandResult[] = [
      { key: "page-dashboard", label: "Visão Geral", type: "Página", searchText: "visao geral dashboard inicio leitura transversal carteira", action: () => onSetActivePage("dashboard") },
      { key: "page-comercial", label: "Painel Comercial", type: "Página", searchText: "painel central comercial operacao", action: () => onSetActivePage("comercial") },
      ...(leadsCommunicationEnabled
        ? [
            { key: "page-inbox", label: "Caixa de Entrada", type: "Página", searchText: "caixa de entrada conversas mensagens inbox atendimento whatsapp instagram facebook omnichannel", action: () => onSetActivePage("inbox") },
            { key: "page-leads", label: "Leads", type: "Página", searchText: "leads interesses qualificacao fila atendimento", action: () => onSetActivePage("leads") },
          ]
        : []),
      { key: "page-clientes", label: "Clientes", type: "Página", searchText: "clientes carteira", action: () => onSetActivePage("clientes") },
      { key: "page-kanban", label: "Negócios", type: "Página", searchText: "negocios funil comercial kanban oportunidades", action: () => onSetActivePage("kanban") },
      { key: "page-agenda", label: "Agenda", type: "Página", searchText: "agenda acompanhamentos calendario", action: () => onSetActivePage("agenda") },
      { key: "page-estoque", label: "Estoque", type: "Página", searchText: "estoque produtos inventario", action: () => onSetActivePage("estoque") },
      ...(automationsEnabled
        ? [{ key: "page-automacoes", label: "Automações", type: "Página", searchText: "automacoes automacao inteligencia regras", action: () => onSetActivePage("automacoes") }]
        : []),
      ...(canManageIntegrations
        ? [{ key: "page-integracoes", label: "Integrações", type: "Página administrativa", searchText: "integracoes integracao dados importacoes catalogo qualidade bling simulador whatsapp", action: () => onSetActivePage("integracoes") }]
        : []),
    ].filter((item) => matchesCommandSearch(term, item.label, item.searchText));

    const matchingClients = (!isSearching && !searchError ? clientResults : [])
      .filter((client) => matchesCommandSearch(term, client.name, client.company, client.email, client.phone, ...(client.tags ?? [])))
      .map((client) => ({
        key: `client-${client.id}`,
        label: client.name,
        type: client.company,
        searchText: `${client.name} ${client.company}`,
        action: () => onSelectClient(client.id),
      }));

    return [...pages, ...matchingClients].slice(0, 6);
  }, [automationsEnabled, canManageIntegrations, clientResults, commandSearch, isSearching, leadsCommunicationEnabled, onSelectClient, onSetActivePage, searchError]);

  const boundedSelectedIndex = Math.min(selectedIndex, Math.max(commandResults.length - 1, 0));

  function runCommandResult(item: CommandResult) {
    item.action();
    setCommandSearch("");
    setShowCommandResults(false);
    setSelectedIndex(0);
  }

  return (
    <div className="relative min-w-0 flex-1 md:max-w-xl" ref={searchRef}>
      <div className="command-search flex h-11 w-full items-center gap-2 rounded-md border px-3 transition">
        <Search size={13} className="text-slate-500" />

        <input
          id="crm-command-search"
          value={commandSearch}
          onChange={(event) => {
            if (readOnly) return;
            setCommandSearch(event.target.value);
            setShowCommandResults(true);
            setSelectedIndex(0);
          }}
          onFocus={() => {
            if (!readOnly) setShowCommandResults(true);
          }}
          onKeyDown={(event) => {
            if (readOnly) return;

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
          placeholder="Buscar páginas e clientes…"
          aria-label="Busca global"
          aria-autocomplete="list"
          aria-controls={showCommandResults && commandSearch && commandResults.length > 0 ? "crm-command-results-listbox" : undefined}
          aria-expanded={!readOnly && showCommandResults && Boolean(commandSearch)}
          aria-busy={isSearching}
          aria-activedescendant={showCommandResults && commandSearch && commandResults.length > 0 ? `crm-command-result-${boundedSelectedIndex}` : undefined}
          className="w-full select-text bg-transparent text-xs outline-none"
          readOnly={readOnly}
          role="combobox"
        />

      </div>

      {showCommandResults && commandSearch && (
        <div className="command-results absolute left-0 right-0 top-11 z-[130] rounded-lg border p-2 shadow-lg" id="crm-command-results">
          {isSearching && (
            <div role="status" aria-live="polite" className="rounded-md border px-3 py-3 text-[11px] text-slate-600">Buscando…</div>
          )}
          {!isSearching && searchError && (
            <div role="alert" className="rounded-md border px-3 py-3 text-[11px] text-rose-700">Não foi possível buscar agora. Tente novamente.</div>
          )}
          {!isSearching && !searchError && commandResults.length === 0 && (
            <div role="status" aria-live="polite" className="rounded-md border px-3 py-3">
              <p className="text-[11px] font-semibold text-slate-900">
                Nenhum resultado encontrado
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Busque pelo nome do cliente, empresa, e-mail ou página do CRM.
              </p>
            </div>
          )}

          {commandResults.length > 0 && (
            <div id="crm-command-results-listbox" role="listbox" aria-label="Resultados da busca">
              {commandResults.map((item, index) => (
                <button
                  key={item.key}
                  id={`crm-command-result-${index}`}
                  aria-selected={index === boundedSelectedIndex}
                  onClick={() => runCommandResult(item)}
                  className={`command-result w-full rounded-md px-3 py-2 text-left transition ${index === boundedSelectedIndex ? "is-selected" : ""}`}
                  role="option"
                  tabIndex={-1}
                >
                  <p className="text-xs font-medium text-slate-900">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {item.type}
                  </p>
                </button>
              ))}
            </div>
          )}
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
