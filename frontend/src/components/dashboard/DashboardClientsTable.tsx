import {
  Eye,
  Flame,
  MessageCircle,
  Star,
  UserCheck,
} from "lucide-react";
import type { Client, Status } from "../../types/dashboard";
import { EmptyState, IconButton, Pagination, SectionHeader, Surface } from "../ui";

type DashboardClientsTableProps = {
  paginatedClients: Client[];
  filteredClientsCount: number;
  selectedId: number | null;
  page: number;
  totalPages: number;
  money: (value: number) => string;
  initials: (name: string) => string;
  statusClass: (status: Status) => string;
  idleLabel: (client: Client) => string;
  leadOwner: (client: Client) => string;
  getPriority: (client: Client) => string;
  getRisk: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  forecastLabel: (client: Client) => string;
  onSelectClient: (clientId: number) => void;
  onToggleFavorite: (clientId: number) => void;
  onToggleHot: (clientId: number) => void;
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
  onRequestWhatsapp: (client: Client) => void;
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
  statusClass,
  idleLabel,
  leadOwner,
  getPriority,
  getRisk,
  getLeadScore,
  forecastLabel,
  onSelectClient,
  onToggleFavorite,
  onToggleHot,
  onRequestWhatsapp,
  onPreviousPage,
  onNextPage,
}: DashboardClientsTableProps) {
  return (
    <Surface className="overflow-hidden">
      <SectionHeader
        actions={<span className="text-[11px] text-[var(--text-muted)]">{filteredClientsCount} registros · Página {page}/{totalPages}</span>}
        description="Clientes, contatos, oportunidade e próxima ação em uma visão operacional."
        icon={<UserCheck size={16} />}
        title="Carteira de clientes"
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] table-fixed border-collapse text-left">
          <thead className="bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--border-default)]">
              <th className="w-[24%] px-4 py-2.5 font-medium">Cliente</th>
              <th className="w-[17%] px-3 py-2.5 font-medium">Contato principal</th>
              <th className="w-[11%] px-3 py-2.5 font-medium">Status</th>
              <th className="w-[15%] px-3 py-2.5 font-medium">Oportunidade</th>
              <th className="w-[10%] px-3 py-2.5 font-medium">Score</th>
              <th className="w-[14%] px-3 py-2.5 font-medium">Próxima ação</th>
              <th className="w-[9%] px-3 py-2.5 text-right font-medium">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-default)]">
            {paginatedClients.map((client) => (
              <ClientTableRow
                client={client}
                getLeadScore={getLeadScore}
                getPriority={getPriority}
                getRisk={getRisk}
                idleLabel={idleLabel}
                initials={initials}
                key={client.id}
                leadOwner={leadOwner}
                money={money}
                onRequestWhatsapp={onRequestWhatsapp}
                onSelectClient={onSelectClient}
                onToggleFavorite={onToggleFavorite}
                onToggleHot={onToggleHot}
                selected={selectedId === client.id}
                statusClass={statusClass}
                forecastLabel={forecastLabel}
              />
            ))}
          </tbody>
        </table>

        {paginatedClients.length === 0 && (
          <EmptyState
            description="Ajuste a busca, limpe os filtros ou crie um novo cliente para alimentar o funil."
            icon={<UserCheck size={16} />}
            title="Nenhum cliente encontrado"
          />
        )}
      </div>

      <Pagination
        itemLabel="registros"
        onPageChange={(nextPage) => nextPage < page ? onPreviousPage() : onNextPage()}
        page={page}
        total={filteredClientsCount}
        totalPages={totalPages}
        visibleCount={paginatedClients.length}
      />
    </Surface>
  );
}

function ClientTableRow({
  client,
  selected,
  money,
  initials,
  statusClass,
  idleLabel,
  leadOwner,
  getPriority,
  getRisk,
  getLeadScore,
  forecastLabel,
  onSelectClient,
  onToggleFavorite,
  onToggleHot,
  onRequestWhatsapp,
}: {
  client: Client;
  selected: boolean;
  money: (value: number) => string;
  initials: (name: string) => string;
  statusClass: (status: Status) => string;
  idleLabel: (client: Client) => string;
  leadOwner: (client: Client) => string;
  getPriority: (client: Client) => string;
  getRisk: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  forecastLabel: (client: Client) => string;
  onSelectClient: (clientId: number) => void;
  onToggleFavorite: (clientId: number) => void;
  onToggleHot: (clientId: number) => void;
  onRequestWhatsapp: (client: Client) => void;
}) {
  const score = getLeadScore(client);
  const tags = client.tags.slice(0, 2);
  const hiddenTags = Math.max(0, client.tags.length - tags.length);

  return (
    <tr
      aria-selected={selected}
      className={`group transition-colors hover:bg-[var(--bg-muted)] ${selected ? "bg-[var(--bg-muted)] shadow-[inset_3px_0_0_var(--primary)]" : "bg-[var(--bg-surface)]"}`}
    >
      <td className="px-4 py-3 align-middle">
        <button className="flex w-full min-w-0 items-center gap-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" onClick={() => onSelectClient(client.id)} type="button">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-secondary)]">
            {initials(client.name)}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{client.name}</span>
              {client.favorite && <Star aria-label="Favorito" className="shrink-0 fill-[var(--warning)] text-[var(--warning)]" size={12} />}
              {client.hot && <Flame aria-label="Oportunidade quente" className="shrink-0 text-[var(--danger)]" size={12} />}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
              {client.company}{tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}{hiddenTags > 0 ? ` · +${hiddenTags}` : ""}
            </span>
          </span>
        </button>
      </td>

      <td className="px-3 py-3 align-middle">
        <p className="truncate text-[11px] font-medium text-[var(--text-secondary)]">{maskPhone(client.phone)}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{maskEmail(client.email)}</p>
      </td>

      <td className="px-3 py-3 align-middle">
        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${statusClass(client.status)}`}>{client.status}</span>
      </td>

      <td className="px-3 py-3 align-middle">
        <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{money(client.value)}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{getPriority(client)} · Risco {getRisk(client)}</p>
      </td>

      <td className="px-3 py-3 align-middle">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-[var(--text-primary)]">{score}</span>
          <span className="truncate text-[var(--text-muted)]">{forecastLabel(client)}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
          <div className={`h-full rounded-full ${scoreClass(score)}`} style={{ width: `${score}%` }} />
        </div>
      </td>

      <td className="px-3 py-3 align-middle">
        <p className="truncate text-[11px] font-medium text-[var(--text-primary)]">{client.nextFollowUp}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{leadOwner(client)} · {idleLabel(client)}</p>
      </td>

      <td className="px-3 py-3 align-middle">
        <div className="flex justify-end gap-0.5">
          <IconButton aria-label={client.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-pressed={client.favorite} onClick={() => onToggleFavorite(client.id)}>
            <Star className={client.favorite ? "fill-[var(--warning)] text-[var(--warning)]" : ""} size={14} />
          </IconButton>
          <IconButton aria-label={client.hot ? "Remover dos quentes" : "Marcar como quente"} aria-pressed={client.hot} onClick={() => onToggleHot(client.id)}>
            <Flame className={client.hot ? "text-[var(--danger)]" : ""} size={14} />
          </IconButton>
          <IconButton aria-label="Abrir WhatsApp" className="hover:text-[var(--primary)]" onClick={() => onRequestWhatsapp(client)}>
            <MessageCircle size={14} />
          </IconButton>
          <IconButton aria-label="Abrir detalhes do cliente" onClick={() => onSelectClient(client.id)}>
            <Eye size={14} />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}

function scoreClass(score: number) {
  if (score >= 80) return "bg-[var(--success)]";
  if (score >= 60) return "bg-[var(--warning)]";
  return "bg-[var(--icon-muted)]";
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 6) return phone || "Não informado";
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

function maskEmail(email?: string) {
  if (!email) return "E-mail protegido";
  const [name, domain] = email.split("@");
  if (!name || !domain) return "E-mail protegido";
  return `${name[0] ?? "*"}***@${domain}`;
}
