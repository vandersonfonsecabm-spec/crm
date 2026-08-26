import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ApiHttpError,
  archiveClienteOnBackend,
  createNotaOnBackend,
  createClienteOnBackend,
  deleteClienteOnBackend,
  restoreClienteOnBackend,
  updateClienteOnBackend,
} from "../services/crmApi";
import { getLeadScore, getPriority, getRisk } from "../utils/dashboardHelpers";
import type { Client, Note, SortBy, Status } from "../types/dashboard";

type UseDashboardActionsParams = {
  clients: Client[];
  setClients: Dispatch<SetStateAction<Client[]>>;
  onClientListChanged?: () => void;
  selectedClient: Client | null;
  setSelectedClientDetail: Dispatch<SetStateAction<Client | null>>;
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
  setKanbanOwnerFilter: Dispatch<SetStateAction<"Todos" | "Sem responsável">>;
  setPage: Dispatch<SetStateAction<number>>;
};

export default function useDashboardActions({
  clients,
  setClients,
  onClientListChanged,
  selectedClient,
  setSelectedClientDetail,
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
  const statusUpdatesInFlight = useRef(new Set<number>());

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function syncSelected(client: Client | null) {
    if (client === null || client.id === selectedId) setSelectedClientDetail(client);
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

    try {
      const syncedClient = await updateClienteOnBackend(updatedClient);
      setClients((current) => current.map((client) => (client.id === id ? syncedClient : client)));
      syncSelected(syncedClient);
    } catch {
      showToast("Não foi possível alterar o favorito.");
    }
  }

  async function toggleHot(id: number) {
    const target = clients.find((client) => client.id === id);
    if (!target) return;

    const updatedClient = { ...target, hot: !target.hot };

    try {
      const syncedClient = await updateClienteOnBackend(updatedClient);
      setClients((current) => current.map((client) => (client.id === id ? syncedClient : client)));
      syncSelected(syncedClient);
    } catch {
      showToast("Não foi possível alterar a marcação quente.");
    }
  }

  async function changeStatus(id: number, status: Status) {
    const target = clients.find((client) => client.id === id);
    if (!target) return;
    if (statusUpdatesInFlight.current.has(id)) return;
    if (target.status === status) {
      showToast("Cliente já está nessa etapa.");
      return;
    }

    statusUpdatesInFlight.current.add(id);

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

    try {
      const syncedClient = await updateClienteOnBackend(updatedClient);
      let syncedNote: Note | null = null;
      try {
        syncedNote = await createNotaOnBackend(updatedClient, note.text);
      } catch {
        // O status ja foi confirmado pelo backend; o historico sera recarregado na proxima consulta.
      }

      const nextClient = {
        ...syncedClient,
        notes: syncedNote ? [syncedNote, ...target.notes] : syncedClient.notes,
      };
      setClients((current) => current.map((client) => (client.id === id ? nextClient : client)));
      syncSelected(nextClient);
      showToast(syncedNote ? "Status e histórico sincronizados." : "Status sincronizado; histórico pendente.");
    } catch {
      showToast("Não foi possível atualizar o status.");
    } finally {
      statusUpdatesInFlight.current.delete(id);
    }
  }

  async function saveEdit(clientToSave?: Client) {
    const target = clientToSave ?? editing;
    if (!target) throw new Error("Cliente indisponível para edição.");

    try {
      const syncedClient = await updateClienteOnBackend(target);
      setClients((current) => current.map((client) => (client.id === target.id ? syncedClient : client)));
      setSelectedId(syncedClient.id);
      setSelectedClientDetail(syncedClient);
      setEditing(null);
      showToast("Cliente atualizado e sincronizado.");
    } catch (error) {
      showToast("Não foi possível atualizar o cliente.");
      throw error;
    }
  }

  async function createClient(clientToCreate?: Client) {
    const target = clientToCreate ?? creating;
    if (!target || !target.name.trim()) {
      throw new Error("Informe o nome do cliente.");
    }

    const normalizedClient = {
      ...target,
      name: target.name.trim().replace(/\s+/g, " "),
      company: target.company.trim().replace(/\s+/g, " "),
      phone: target.phone.trim(),
      email: target.email.trim(),
      source: target.source.trim().replace(/\s+/g, " "),
      nextFollowUp: target.nextFollowUp.trim().replace(/\s+/g, " "),
    };

    try {
      const syncedClient = await createClienteOnBackend({
        ...normalizedClient,
        id: 0,
        tags: normalizedClient.tags.length ? normalizedClient.tags : ["Novo"],
        notes: [],
      });
      setSelectedId(syncedClient.id);
      setCreating(null);
      onClientListChanged?.();
      showToast("Cliente criado e sincronizado.");
    } catch {
      throw new Error("Não foi possível criar o cliente agora. Tente novamente.");
    }
  }

  async function deleteClient(id: number) {
    const target = clients.find((client) => client.id === id)
      ?? (selectedClient?.id === id ? selectedClient : null);

    try {
      if (!target) return;
      await deleteClienteOnBackend(target);
      setClients((current) => current.filter((client) => client.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedClientDetail(null);
      }
      setEditing(null);
      showToast("Cliente removido e sincronizado.");
    } catch (error) {
      showToast(error instanceof ApiHttpError && error.code === "CLIENT_HAS_RELATIONS"
        ? "Este cliente possui Leads, Negócios ou outros registros vinculados."
        : "Não foi possível remover o cliente.");
      throw error;
    }
  }

  async function archiveClient(id: number) {
    const target = clients.find((client) => client.id === id) ?? (selectedClient?.id === id ? selectedClient : null);
    if (!target) return;
    try {
      await archiveClienteOnBackend(target);
      setClients((current) => current.filter((client) => client.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedClientDetail(null);
      }
      setEditing(null);
      showToast("Cliente arquivado. O histórico foi preservado.");
    } catch (error) {
      showToast(error instanceof ApiHttpError && error.code === "CUSTOMER_REGISTRATION_CONFLICT"
        ? "O cliente mudou em outra sessão. Atualize antes de arquivar."
        : "Não foi possível arquivar o cliente.");
      throw error;
    }
  }

  async function restoreClient(client: Client) {
    try {
      const restored = await restoreClienteOnBackend(client);
      setClients((current) => current.filter((item) => item.id !== restored.id));
      showToast("Cliente restaurado.");
      return restored;
    } catch (error) {
      showToast(error instanceof ApiHttpError && error.code === "CUSTOMER_REGISTRATION_CONFLICT"
        ? "O cliente mudou em outra sessão. Atualize antes de restaurar."
        : "Não foi possível restaurar o cliente.");
      throw error;
    }
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

    try {
      const syncedNote = await createNotaOnBackend(selectedClient, note.text);
      const syncedClient = await updateClienteOnBackend(updatedClient);
      const nextClient = { ...syncedClient, notes: [syncedNote, ...selectedClient.notes], lastContactDays: 0 };
      setClients((current) =>
        current.map((client) =>
          client.id === selectedClient.id
            ? nextClient
            : client
        )
      );
      syncSelected(nextClient);
      setNoteText("");
      showToast("Nota sincronizada.");
    } catch {
      showToast("Não foi possível adicionar a nota.");
    }
  }

  async function addTagToSelected() {
    if (!selectedClient || !tagText.trim()) return;
    const tag = tagText.trim();
    if (selectedClient.tags.includes(tag)) return;

    const updatedClient = { ...selectedClient, tags: [...selectedClient.tags, tag] };

    try {
      const syncedClient = await updateClienteOnBackend(updatedClient);
      setClients((current) => current.map((client) => (client.id === selectedClient.id ? syncedClient : client)));
      syncSelected(syncedClient);
      setTagText("");
      showToast("Tag salva e sincronizada.");
    } catch {
      showToast("Não foi possível adicionar a tag.");
    }
  }

  async function removeTagFromSelected(tag: string) {
    if (!selectedClient) return;

    const updatedClient = { ...selectedClient, tags: selectedClient.tags.filter((item) => item !== tag) };

    try {
      const syncedClient = await updateClienteOnBackend(updatedClient);
      setClients((current) => current.map((client) => (client.id === selectedClient.id ? syncedClient : client)));
      syncSelected(syncedClient);
      showToast("Tag removida e sincronizada.");
    } catch {
      showToast("Não foi possível remover a tag.");
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
      client.archived ? "Arquivado" : client.status,
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
    archiveClient,
    restoreClient,
    addNote,
    addTagToSelected,
    removeTagFromSelected,
    exportCsv,
    applySmartFilter,
    whatsappMessage,
  };
}
