import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getLeadScore, getPriority, getRisk } from "../utils/dashboardHelpers";
import type { Client, Note, SortBy, Status } from "../types/dashboard";

type UseDashboardActionsParams = {
  clients: Client[];
  setClients: Dispatch<SetStateAction<Client[]>>;
  selectedClient: Client | null;
  selectedId: number | null;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  editing: Client | null;
  setEditing: Dispatch<SetStateAction<Client | null>>;
  creating: Client | null;
  setCreating: Dispatch<SetStateAction<Client | null>>;
  noteText: string;
  setNoteText: Dispatch<SetStateAction<string>>;
  tagText: string;
  setTagText: Dispatch<SetStateAction<string>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setStatusFilter: Dispatch<SetStateAction<Status | "Todos">>;
  setOnlyFavorites: Dispatch<SetStateAction<boolean>>;
  setOnlyHot: Dispatch<SetStateAction<boolean>>;
  setOnlyRisk: Dispatch<SetStateAction<boolean>>;
  setOnlySilent: Dispatch<SetStateAction<boolean>>;
  setSortBy: Dispatch<SetStateAction<SortBy>>;
  setKanbanOwnerFilter: Dispatch<SetStateAction<"Todos" | "Ana" | "Marco" | "Bia" | "Time">>;
  setPage: Dispatch<SetStateAction<number>>;
};

export default function useDashboardActions({
  clients,
  setClients,
  selectedClient,
  selectedId,
  setSelectedId,
  editing,
  setEditing,
  creating,
  setCreating,
  noteText,
  setNoteText,
  tagText,
  setTagText,
  setSearch,
  setStatusFilter,
  setOnlyFavorites,
  setOnlyHot,
  setOnlyRisk,
  setOnlySilent,
  setSortBy,
  setKanbanOwnerFilter,
  setPage,
}: UseDashboardActionsParams) {
  const [toast, setToast] = useState("");

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  async function copyText(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    showToast(message);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("Todos");
    setOnlyFavorites(false);
    setOnlyHot(false);
    setOnlyRisk(false);
    setOnlySilent(false);
    setSortBy("score");
    setKanbanOwnerFilter("Todos");
    setPage(1);
    showToast("Filtros limpos.");
  }

  function toggleFavorite(id: number) {
    setClients((current) => current.map((client) => (client.id === id ? { ...client, favorite: !client.favorite } : client)));
  }

  function toggleHot(id: number) {
    setClients((current) => current.map((client) => (client.id === id ? { ...client, hot: !client.hot } : client)));
  }

  function changeStatus(id: number, status: Status) {
    setClients((current) =>
      current.map((client) => (client.id === id ? { ...client, status, lastContactDays: 0 } : client))
    );
    showToast("Status atualizado.");
  }

  function saveEdit() {
    if (!editing) return;
    setClients((current) => current.map((client) => (client.id === editing.id ? editing : client)));
    setSelectedId(editing.id);
    setEditing(null);
    showToast("Cliente atualizado.");
  }

  function createClient() {
    if (!creating || !creating.name.trim()) {
      showToast("Informe o nome do cliente.");
      return;
    }

    const newClient: Client = {
      ...creating,
      id: Date.now(),
      tags: creating.tags.length ? creating.tags : ["Novo"],
      notes: [],
    };

    setClients((current) => [newClient, ...current]);
    setSelectedId(newClient.id);
    setCreating(null);
    showToast("Cliente criado.");
  }

  function deleteClient(id: number) {
    setClients((current) => current.filter((client) => client.id !== id));
    if (selectedId === id) setSelectedId(null);
    setEditing(null);
    showToast("Cliente removido.");
  }

  function addNote() {
    if (!selectedClient || !noteText.trim()) return;

    const note: Note = {
      id: Date.now(),
      text: noteText.trim(),
      date: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    };

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id ? { ...client, notes: [note, ...client.notes], lastContactDays: 0 } : client
      )
    );

    setNoteText("");
    showToast("Nota adicionada.");
  }

  function addTagToSelected() {
    if (!selectedClient || !tagText.trim()) return;
    const tag = tagText.trim();

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id && !client.tags.includes(tag)
          ? { ...client, tags: [...client.tags, tag] }
          : client
      )
    );

    setTagText("");
    showToast("Tag adicionada.");
  }

  function removeTagFromSelected(tag: string) {
    if (!selectedClient) return;

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id ? { ...client, tags: client.tags.filter((item) => item !== tag) } : client
      )
    );

    showToast("Tag removida.");
  }

  function exportCsv() {
    const header = ["Nome", "Empresa", "Telefone", "Email", "Valor", "Status", "Origem", "Prioridade", "Risco", "Score"];
    const rows = clients.map((client) => [
      client.name,
      client.company,
      client.phone,
      client.email,
      String(client.value),
      client.status,
      client.source,
      getPriority(client),
      getRisk(client),
      String(getLeadScore(client)),
    ]);

    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "clientes-crm.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast("CSV exportado.");
  }

  function applySmartFilter(type: "risk" | "proposal" | "silent") {
    clearFilters();

    window.setTimeout(() => {
      if (type === "risk") setOnlyRisk(true);
      if (type === "proposal") {
        setStatusFilter("Proposta");
        setOnlyHot(true);
      }
      if (type === "silent") setOnlySilent(true);
      setPage(1);
    }, 0);
  }

  function whatsappMessage(client: Client) {
    return `Olá, ${client.name}! Tudo bem? Passando para dar continuidade ao atendimento da ${client.company}.`;
  }

  return {
    toast,
    setToast,
    showToast,
    copyText,
    clearFilters,
    toggleFavorite,
    toggleHot,
    changeStatus,
    saveEdit,
    createClient,
    deleteClient,
    addNote,
    addTagToSelected,
    removeTagFromSelected,
    exportCsv,
    applySmartFilter,
    whatsappMessage,
  };
}
