import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  createNotaOnBackend,
  createClienteOnBackend,
  deleteClienteOnBackend,
  updateClienteOnBackend,
} from "../services/crmApi";
import { getLeadScore, getPriority, getRisk } from "../utils/dashboardHelpers";
import type { Client, Note, SortBy, Status } from "../types/dashboard";

type UseDashboardActionsParams = {
  clients: Client[];
  setClients: Dispatch<SetStateAction<Client[]>>;
  dataSource: "offline" | "backend";
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
  dataSource,
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

  async function toggleFavorite(id: number) {
    const target = clients.find((client) => client.id === id);
    if (!target) return;

    const updatedClient = { ...target, favorite: !target.favorite };
    setClients((current) => current.map((client) => (client.id === id ? updatedClient : client)));

    try {
      const syncedClient = dataSource === "backend" ? await updateClienteOnBackend(updatedClient) : null;
      if (syncedClient) {
        setClients((current) => current.map((client) => (client.id === id ? syncedClient : client)));
      }
    } catch {
      showToast("Favorito alterado na tela. A sincronização não foi confirmada.");
    }
  }

  async function toggleHot(id: number) {
    const target = clients.find((client) => client.id === id);
    if (!target) return;

    const updatedClient = { ...target, hot: !target.hot };
    setClients((current) => current.map((client) => (client.id === id ? updatedClient : client)));

    try {
      const syncedClient = dataSource === "backend" ? await updateClienteOnBackend(updatedClient) : null;
      if (syncedClient) {
        setClients((current) => current.map((client) => (client.id === id ? syncedClient : client)));
      }
    } catch {
      showToast("Marcação quente alterada na tela. A sincronização não foi confirmada.");
    }
  }

  async function changeStatus(id: number, status: Status) {
    const target = clients.find((client) => client.id === id);
    if (!target) return;
    if (target.status === status) {
      showToast("Cliente já está nessa etapa.");
      return;
    }

    const note: Note = {
      id: Date.now(),
      text: `Status alterado de ${target.status} para ${status}.`,
      date: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
      createdAt: Date.now(),
    };

    const updatedClient: Client = {
      ...target,
      status,
      lastContactDays: 0,
      notes: [note, ...target.notes],
    };

    setClients((current) => current.map((client) => (client.id === id ? updatedClient : client)));

    try {
      const syncedClient = dataSource === "backend" ? await updateClienteOnBackend(updatedClient) : null;
      const syncedNote = dataSource === "backend" ? await createNotaOnBackend(updatedClient, note.text) : null;

      if (syncedClient) {
        const nextClient = {
          ...syncedClient,
          notes: syncedNote ? [syncedNote, ...updatedClient.notes.filter((item) => item.id !== note.id)] : updatedClient.notes,
        };

        setClients((current) => current.map((client) => (client.id === id ? nextClient : client)));
        showToast(syncedNote ? "Status e histórico sincronizados." : "Status sincronizado.");
        return;
      }

      showToast("Status atualizado.");
    } catch {
      showToast("Status atualizado na tela. A sincronização não foi confirmada.");
    }
  }

  async function saveEdit() {
    if (!editing) return;

    try {
      const syncedClient = dataSource === "backend" ? await updateClienteOnBackend(editing) : null;
      const nextClient = syncedClient ?? editing;

      setClients((current) => current.map((client) => (client.id === editing.id ? nextClient : client)));
      setSelectedId(nextClient.id);
      setEditing(null);
      showToast(syncedClient ? "Cliente atualizado e sincronizado." : "Cliente atualizado.");
    } catch {
      setClients((current) => current.map((client) => (client.id === editing.id ? editing : client)));
      setSelectedId(editing.id);
      setEditing(null);
      showToast("Cliente salvo neste navegador. Sincronização indisponível.");
    }
  }

  async function createClient() {
    if (!creating || !creating.name.trim()) {
      throw new Error("Informe o nome do cliente.");
    }

    const normalizedClient = {
      ...creating,
      name: creating.name.trim().replace(/\s+/g, " "),
      company: creating.company.trim().replace(/\s+/g, " "),
      phone: creating.phone.trim(),
      email: creating.email.trim(),
      source: creating.source.trim().replace(/\s+/g, " "),
      nextFollowUp: creating.nextFollowUp.trim().replace(/\s+/g, " "),
    };

    const newClient: Client = {
      ...normalizedClient,
      id: Date.now(),
      tags: normalizedClient.tags.length ? normalizedClient.tags : ["Novo"],
      notes: [],
    };

    try {
      const syncedClient = dataSource === "backend" ? await createClienteOnBackend(newClient) : null;
      const nextClient = syncedClient ?? newClient;

      setClients((current) => [nextClient, ...current]);
      setSelectedId(nextClient.id);
      setCreating(null);
      showToast(syncedClient ? "Cliente criado e sincronizado." : "Cliente criado.");
    } catch {
      throw new Error("Não foi possível criar o cliente agora. Tente novamente.");
    }
  }

  async function deleteClient(id: number) {
    const target = clients.find((client) => client.id === id);

    try {
      if (dataSource === "backend" && target) {
        await deleteClienteOnBackend(target);
      }
    } catch {
      showToast("Removido da tela, mas a sincronização não foi confirmada.");
    }

    setClients((current) => current.filter((client) => client.id !== id));
    if (selectedId === id) setSelectedId(null);
    setEditing(null);
    showToast(dataSource === "backend" ? "Cliente removido e sincronizado." : "Cliente removido.");
  }

  async function addNote() {
    if (!selectedClient || !noteText.trim()) return;

    const note: Note = {
      id: Date.now(),
      text: noteText.trim(),
      date: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
      createdAt: Date.now(),
    };

    const updatedClient = { ...selectedClient, notes: [note, ...selectedClient.notes], lastContactDays: 0 };

    setClients((current) => current.map((client) => (client.id === selectedClient.id ? updatedClient : client)));

    setNoteText("");

    try {
      const syncedNote =
        dataSource === "backend" ? await createNotaOnBackend(selectedClient, note.text) : null;
      const syncedClient = dataSource === "backend" ? await updateClienteOnBackend(updatedClient) : null;

      if (syncedNote) {
        setClients((current) =>
          current.map((client) =>
            client.id === selectedClient.id
              ? {
                  ...(syncedClient ?? client),
                  notes: [syncedNote, ...client.notes.filter((item) => item.id !== note.id)],
                  lastContactDays: 0,
                }
              : client
          )
        );
        showToast("Nota sincronizada.");
        return;
      }

      showToast("Nota adicionada.");
    } catch {
      showToast("Nota adicionada na tela. A sincronização não foi confirmada.");
    }
  }

  async function addTagToSelected() {
    if (!selectedClient || !tagText.trim()) return;
    const tag = tagText.trim();
    if (selectedClient.tags.includes(tag)) return;

    const updatedClient = { ...selectedClient, tags: [...selectedClient.tags, tag] };

    setClients((current) => current.map((client) => (client.id === selectedClient.id ? updatedClient : client)));

    setTagText("");

    try {
      const syncedClient = dataSource === "backend" ? await updateClienteOnBackend(updatedClient) : null;
      if (syncedClient) {
        setClients((current) => current.map((client) => (client.id === selectedClient.id ? syncedClient : client)));
      }
      showToast(syncedClient ? "Tag salva e sincronizada." : "Tag adicionada.");
    } catch {
      showToast("Tag adicionada na tela. A sincronização não foi confirmada.");
    }
  }

  async function removeTagFromSelected(tag: string) {
    if (!selectedClient) return;

    const updatedClient = { ...selectedClient, tags: selectedClient.tags.filter((item) => item !== tag) };

    setClients((current) => current.map((client) => (client.id === selectedClient.id ? updatedClient : client)));

    try {
      const syncedClient = dataSource === "backend" ? await updateClienteOnBackend(updatedClient) : null;
      if (syncedClient) {
        setClients((current) => current.map((client) => (client.id === selectedClient.id ? syncedClient : client)));
      }
      showToast(syncedClient ? "Tag removida e sincronizada." : "Tag removida.");
    } catch {
      showToast("Tag removida na tela. A sincronização não foi confirmada.");
    }
  }

  function exportCsv() {
    const confirmed = window.confirm(
      "O CSV contém dados pessoais de clientes. Exporte apenas se houver finalidade comercial legítima e armazenamento seguro."
    );

    if (!confirmed) {
      showToast("Exportação cancelada.");
      return;
    }

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
