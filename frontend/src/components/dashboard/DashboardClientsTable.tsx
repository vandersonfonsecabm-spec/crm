import { Edit3, Flame, MessageCircle, Phone, Star } from "lucide-react";

type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";

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

type DashboardClientsTableProps = {
  paginatedClients: Client[];
  filteredClientsCount: number;
  selectedId: number | null;
  page: number;
  totalPages: number;
  money: (value: number) => string;
  initials: (name: string) => string;
  tagClass: (tag: string) => string;
  statusClass: (status: Status) => string;
  idleLabel: (client: Client) => string;
  getPriority: (client: Client) => string;
  getRisk: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  forecastLabel: (client: Client) => string;
  onSelectClient: (clientId: number) => void;
  onToggleFavorite: (clientId: number) => void;
  onToggleHot: (clientId: number) => void;
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
  whatsappMessage: (client: Client) => string;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export default function DashboardClientsTable({
  paginatedClients,
  filteredClientsCount,
  selectedId,
  page,
  totalPages,
  money,
  initials,
  tagClass,
  statusClass,
  idleLabel,
  getPriority,
  getRisk,
  getLeadScore,
  forecastLabel,
  onSelectClient,
  onToggleFavorite,
  onToggleHot,
  onEditClient,
  onCopyText,
  whatsappMessage,
  onPreviousPage,
  onNextPage,
}: DashboardClientsTableProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/10 px-3 py-2">
        <div>
          <p className="text-sm font-semibold">Clientes</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Carteira comercial priorizada e pronta para ação.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-400">
            {filteredClientsCount} registros
          </span>

          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-400">
            página {page}/{totalPages}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/10 text-[10px] font-semibold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Follow-up</th>
              <th className="px-3 py-2">Prioridade</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>

          <tbody>
            {paginatedClients.map((client) => (
              <tr
                key={client.id}
                className={`border-t border-white/5 transition-all duration-200 hover:bg-white/[0.025] ${
                  selectedId === client.id
                    ? "bg-white/[0.03] shadow-[inset_2px_0_0_rgba(148,163,184,0.28)]"
                    : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <button onClick={() => onSelectClient(client.id)} className="text-left">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-[9px] font-bold text-slate-300">
                        {initials(client.name)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{client.name}</span>

                          {client.notes.length > 0 && (
                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-300">
                              {client.notes.length}
                            </span>
                          )}

                          {client.favorite && <Star size={12} className="fill-amber-300 text-amber-300" />}
                          {client.hot && <Flame size={12} className="text-rose-400" />}
                        </div>

                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{client.email}</p>
                      </div>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-1">
                      {client.tags.map((tag) => (
                        <span key={tag} className={`rounded-full border px-1.5 py-0.5 text-[9px] ${tagClass(tag)}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                </td>

                <td className="px-3 py-2.5 text-slate-300">{client.company}</td>
                <td className="px-3 py-2.5 text-slate-300">{money(client.value)}</td>

                <td className="px-3 py-2.5">
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${statusClass(client.status)}`}>
                    {client.status}
                  </span>
                </td>

                <td className="px-3 py-2.5">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-200">{client.nextFollowUp}</p>
                    <p className="text-[10px] text-slate-500">Inativo: {idleLabel(client)}</p>
                  </div>
                </td>

                <td className="px-3 py-2.5">
                  <div className="space-y-1">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-[10px] ${
                        getPriority(client) === "Alta"
                          ? "border-rose-400/20 bg-rose-500/10 text-rose-200"
                          : getPriority(client) === "Média"
                            ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
                            : "border-slate-400/20 bg-slate-500/10 text-slate-300"
                      }`}
                    >
                      {getPriority(client)}
                    </span>

                    <p className="text-[10px] text-slate-500">Risco {getRisk(client)}</p>
                  </div>
                </td>

                <td className="px-3 py-2.5">
                  <div className="w-24 rounded-lg border border-white/5 bg-black/10 p-1.5">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Score</span>
                      <span>{getLeadScore(client)}</span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${
                          getLeadScore(client) >= 80
                            ? "bg-emerald-300"
                            : getLeadScore(client) >= 60
                              ? "bg-amber-300"
                              : "bg-slate-400"
                        }`}
                        style={{ width: `${getLeadScore(client)}%` }}
                      />
                    </div>

                    <p className="mt-1 text-[10px] text-slate-600">{forecastLabel(client)}</p>
                  </div>
                </td>

                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      title="Favoritar"
                      onClick={() => onToggleFavorite(client.id)}
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-amber-200"
                    >
                      <Star size={14} />
                    </button>

                    <button
                      title="Marcar como quente"
                      onClick={() => onToggleHot(client.id)}
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-rose-200"
                    >
                      <Flame size={14} />
                    </button>

                    <button
                      title="Editar cliente"
                      onClick={() => onEditClient(client)}
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-sky-200"
                    >
                      <Edit3 size={14} />
                    </button>

                    <button
                      title="Copiar telefone"
                      onClick={() => onCopyText(client.phone, "Telefone copiado.")}
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-emerald-200"
                    >
                      <Phone size={14} />
                    </button>

                    <a
                      title="Abrir WhatsApp"
                      href={`https://wa.me/${client.phone}?text=${encodeURIComponent(whatsappMessage(client))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-emerald-200"
                    >
                      <MessageCircle size={14} />
                    </a>
                  </div>
                </td>
              </tr>
            ))}

            {paginatedClients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8">
                  <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center">
                    <p className="text-sm font-semibold text-slate-300">
                      Nenhum cliente encontrado
                    </p>

                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Ajuste a busca, limpe os filtros ou crie um novo cliente para alimentar o pipeline.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-black/10 px-3 py-2">
        <button
          onClick={onPreviousPage}
          disabled={page === 1}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
        >
          Anterior
        </button>

        <p className="text-[11px] text-slate-500">
          Mostrando <span className="font-semibold text-slate-300">{paginatedClients.length}</span> de {filteredClientsCount}
        </p>

        <button
          onClick={onNextPage}
          disabled={page === totalPages}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
