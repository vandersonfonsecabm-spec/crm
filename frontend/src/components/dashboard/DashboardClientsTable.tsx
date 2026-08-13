import {
  AlertTriangle,
  CalendarClock,
  Eye,
  MapPin,
  Star,
  UserCheck,
} from "lucide-react";
import type { Client, Status } from "../../types/dashboard";
import { classifyNextFollowUp, formatNextFollowUp } from "../../utils/followUpProjection";
import { Button, EmptyState, Pagination, Surface } from "../ui";
import DashboardActionOverflow from "./DashboardActionOverflow";
import type { PageAction } from "./DashboardActionOverflow";
import "./DashboardClientes.css";

type DashboardClientsTableProps = {
  paginatedClients: Client[];
  filteredClientsCount: number;
  selectedId: number | null;
  page: number;
  totalPages: number;
  initials: (name: string) => string;
  statusClass: (status: Status) => string;
  getRisk: (client: Client) => string;
  onSelectClient: (clientId: number) => void;
  onToggleFavorite: (clientId: number) => void;
  onToggleHot: (clientId: number) => void;
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
  initials,
  statusClass,
  getRisk,
  onSelectClient,
  onToggleFavorite,
  onToggleHot,
  onRequestWhatsapp,
  onPreviousPage,
  onNextPage,
}: DashboardClientsTableProps) {
  return (
    <Surface className="clientes-table-surface overflow-hidden">
      <div className="clientes-table-count" role="status">
        <UserCheck aria-hidden="true" size={15} />
        <span>{filteredClientsCount} {filteredClientsCount === 1 ? "cliente" : "clientes"}</span>
        <span aria-hidden="true">·</span>
        <span>Página {page}/{totalPages}</span>
      </div>

      <div className="clientes-table-scroll overflow-x-auto">
        <table aria-label="Tabela de clientes" className="clientes-table w-full min-w-[1024px] table-fixed border-collapse text-left" data-clientes-table>
          <thead>
            <tr>
              <th className="w-[25%] px-4 py-2.5 font-medium" data-clientes-sticky="client">Cliente</th>
              <th className="w-[14%] px-3 py-2.5 font-medium">Localização</th>
              <th className="w-[17%] px-3 py-2.5 font-medium">Contato</th>
              <th className="w-[15%] px-3 py-2.5 font-medium">Status + risco</th>
              <th className="w-[17%] px-3 py-2.5 font-medium">Próxima ação</th>
              <th className="w-[12%] px-3 py-2.5 text-right font-medium" data-clientes-sticky="actions">Ações</th>
            </tr>
          </thead>

          <tbody>
            {paginatedClients.map((client) => (
              <ClientTableRow
                client={client}
                initials={initials}
                key={client.id}
                onRequestWhatsapp={onRequestWhatsapp}
                onSelectClient={onSelectClient}
                onToggleFavorite={onToggleFavorite}
                onToggleHot={onToggleHot}
                risk={getRisk(client)}
                selected={selectedId === client.id}
                statusClass={statusClass}
              />
            ))}
          </tbody>
        </table>

        {paginatedClients.length === 0 && (
          <EmptyState
            description="Ajuste a busca, limpe os filtros ou crie um novo cliente para alimentar a carteira."
            icon={<UserCheck size={16} />}
            title="Nenhum cliente encontrado"
          />
        )}
      </div>

      <Pagination
        itemLabel="clientes"
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
  initials,
  statusClass,
  onSelectClient,
  onToggleFavorite,
  onToggleHot,
  onRequestWhatsapp,
  risk,
}: {
  client: Client;
  selected: boolean;
  initials: (name: string) => string;
  statusClass: (status: Status) => string;
  onSelectClient: (clientId: number) => void;
  onToggleFavorite: (clientId: number) => void;
  onToggleHot: (clientId: number) => void;
  onRequestWhatsapp: (client: Client) => void;
  risk: string;
}) {
  const tags = client.tags.slice(0, 2);
  const hiddenTags = Math.max(0, client.tags.length - tags.length);
  const nextAction = formatNextFollowUp(client.nextFollowUp);
  const isNextActionOverdue = !client.archived && classifyNextFollowUp(client.nextFollowUp) === "OVERDUE";
  const isHighRisk = !client.archived && risk === "Alto";

  return (
    <tr aria-selected={selected} className={`clientes-table-row ${selected ? "is-selected" : ""}`} data-client-risk={isHighRisk ? "high" : "normal"} data-client-timing={isNextActionOverdue ? "overdue" : "planned"}>
      <td className="px-4 py-3 align-middle" data-clientes-sticky="client">
        <button aria-label={`Abrir Cliente 360 de ${client.name}`} className="clientes-client-link flex w-full min-w-0 items-center gap-2.5 text-left" onClick={() => onSelectClient(client.id)} type="button">
          <span className="clientes-client-avatar flex h-8 w-8 shrink-0 items-center justify-center text-[11px] font-semibold">
            {initials(client.name)}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-[var(--text-primary)]" title={client.name}>{client.name}</span>
              {client.favorite && <Star aria-label="Favorito" className="clientes-favorite-icon shrink-0" size={12} />}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]" title={client.company}>
              {client.company}{tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}{hiddenTags > 0 ? ` · +${hiddenTags}` : ""}
            </span>
          </span>
        </button>
      </td>

      <td className="px-3 py-3 align-middle">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-medium text-[var(--text-secondary)]" title={formatLocation(client)}>
          <MapPin aria-hidden="true" className="shrink-0 text-[var(--icon-muted)]" size={12} />
          {formatLocation(client)}
        </p>
      </td>

      <td className="px-3 py-3 align-middle">
        <p className="truncate text-[11px] font-medium text-[var(--text-secondary)]">{maskPhone(client.phone)}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{maskEmail(client.email)}</p>
      </td>

      <td className="px-3 py-3 align-middle">
        <div className="clientes-status-cell flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${client.archived ? "border-slate-300 bg-slate-100 text-slate-700" : statusClass(client.status)}`}>
            {client.archived ? "Arquivado" : client.status}
          </span>
          {isHighRisk && (
            <span className="clientes-risk-indicator inline-flex items-center gap-1" title="Risco alto informado no resumo atual">
              <AlertTriangle aria-hidden="true" size={11} />
              Risco alto
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-3 align-middle">
        <p className={`clientes-next-action flex min-w-0 items-center gap-1.5 truncate text-[11px] font-medium ${isNextActionOverdue ? "clientes-next-action--overdue" : ""}`} title={client.archived ? "Acompanhamentos disponíveis após restaurar" : nextAction}>
          <CalendarClock aria-hidden="true" className="shrink-0" size={12} />
          {client.archived ? "Somente leitura" : nextAction}
        </p>
        {isNextActionOverdue && <p className="mt-0.5 text-[10px] font-medium text-[var(--danger)]">Ação atrasada</p>}
      </td>

      <td className="px-3 py-3 align-middle" data-clientes-sticky="actions">
        <div className="clientes-row-actions flex justify-end gap-0.5">
          <Button aria-label={`Abrir Cliente 360 de ${client.name}`} className="clientes-open-action" leftIcon={<Eye size={13} />} onClick={() => onSelectClient(client.id)} size="sm" variant="secondary">
            Abrir
          </Button>
          {client.archived ? (
            <span className="px-2 text-[10px] text-[var(--text-muted)]">Somente leitura</span>
          ) : (
            <DashboardActionOverflow
              actions={rowActions(client, onToggleFavorite, onToggleHot, onRequestWhatsapp)}
              menuClassName="clientes-row-actions-menu"
              pageTitle={client.name}
              triggerClassName="clientes-row-overflow-trigger"
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function rowActions(
  client: Client,
  onToggleFavorite: (clientId: number) => void,
  onToggleHot: (clientId: number) => void,
  onRequestWhatsapp: (client: Client) => void,
): PageAction[] {
  return [
    {
      label: client.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos",
      onClick: () => onToggleFavorite(client.id),
    },
    {
      label: client.hot ? "Remover dos quentes" : "Marcar como quente",
      onClick: () => onToggleHot(client.id),
    },
    {
      label: "Abrir confirmação de WhatsApp",
      onClick: () => onRequestWhatsapp(client),
    },
  ];
}

function formatLocation(client: Client) {
  const location = [client.city, client.state].map((value) => value.trim()).filter(Boolean).join(" · ");
  return location || "Localização não informada";
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
