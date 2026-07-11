import {
  Edit3,
  Flame,
  Mail,
  MessageCircle,
  Phone,
  Star,
  Tag,
  UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Client, Status } from "../../types/dashboard";
import { Badge, EmptyState, IconButton, Pagination, SectionHeader } from "../ui";

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
  getPriority,
  getRisk,
  getLeadScore,
  forecastLabel,
  onSelectClient,
  onToggleFavorite,
  onToggleHot,
  onEditClient,
  onCopyText,
  onRequestWhatsapp,
  onPreviousPage,
  onNextPage,
}: DashboardClientsTableProps) {
  return (
    <section className="saas-panel rounded-2xl">
      <ClientsHeader filteredClientsCount={filteredClientsCount} page={page} totalPages={totalPages} />

      <div className="grid gap-2.5 p-3">
        {paginatedClients.map((client) => (
          <ClientRowCard
            key={client.id}
            client={client}
            selected={selectedId === client.id}
            money={money}
            initials={initials}
            statusClass={statusClass}
            idleLabel={idleLabel}
            getPriority={getPriority}
            getRisk={getRisk}
            getLeadScore={getLeadScore}
            forecastLabel={forecastLabel}
            onSelectClient={onSelectClient}
            onToggleFavorite={onToggleFavorite}
            onToggleHot={onToggleHot}
            onEditClient={onEditClient}
            onCopyText={onCopyText}
            onRequestWhatsapp={onRequestWhatsapp}
          />
        ))}

        {paginatedClients.length === 0 && <EmptyClientsState />}
      </div>

      <ClientsFooter
        page={page}
        totalPages={totalPages}
        visibleClientsCount={paginatedClients.length}
        filteredClientsCount={filteredClientsCount}
        onPreviousPage={onPreviousPage}
        onNextPage={onNextPage}
      />
    </section>
  );
}

function ClientsHeader({
  filteredClientsCount,
  page,
  totalPages,
}: {
  filteredClientsCount: number;
  page: number;
  totalPages: number;
}) {
  return (
    <SectionHeader
      actions={<><Badge>{filteredClientsCount} registros</Badge><Badge>Página {page}/{totalPages}</Badge></>}
      description="Lista priorizada por valor, score e próxima ação."
      icon={<UserCheck size={16} />}
      title="Carteira de clientes"
    />
  );
}

function ClientRowCard({
  client,
  selected,
  money,
  initials,
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
  onRequestWhatsapp,
}: {
  client: Client;
  selected: boolean;
  money: (value: number) => string;
  initials: (name: string) => string;
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
  onRequestWhatsapp: (client: Client) => void;
}) {
  const score = getLeadScore(client);
  const priority = getPriority(client);
  const risk = getRisk(client);
  const visibleTags = client.tags.slice(0, 2);
  const hiddenTags = Math.max(0, client.tags.length - visibleTags.length);

  return (
    <article
      className={`saas-row grid min-w-0 gap-3 rounded-xl p-3 md:grid-cols-[minmax(0,1.25fr)_minmax(150px,0.58fr)_minmax(170px,0.72fr)_auto] ${
        selected
          ? "border-teal-300/32 bg-teal-300/[0.055] shadow-[inset_2px_0_0_rgba(45,212,191,0.42),0_14px_32px_rgba(0,0,0,0.18)]"
          : ""
      }`}
    >
      <button onClick={() => onSelectClient(client.id)} className="min-w-0 text-left">
        <div className="flex min-w-0 items-start gap-2">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[10px] font-bold ${
              selected
                ? "border-teal-300/24 bg-teal-300/[0.09] text-teal-100"
                : "border-slate-500/16 bg-slate-900/70 text-slate-200"
            }`}
          >
            {initials(client.name)}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-slate-100">{client.name}</p>
              {client.favorite && <Star size={12} className="shrink-0 fill-amber-300 text-amber-300" />}
              {client.hot && <Flame size={12} className="shrink-0 text-rose-400" />}
            </div>

            <p className="mt-0.5 truncate text-[11px] text-slate-500">{client.company}</p>

            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
              {visibleTags.map((tag) => (
                <span key={tag} className="saas-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]">
                  <Tag size={10} />
                  {tag}
                </span>
              ))}
              {hiddenTags > 0 && (
                <span className="rounded-full bg-slate-900/60 px-2 py-0.5 text-[9px] text-slate-500">
                  +{hiddenTags}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      <div className="grid min-w-0 grid-cols-2 gap-2 md:block md:space-y-2">
        <CompactInfo label="Valor" value={money(client.value)} strong />
        <div>
          <p className="text-[9px] text-slate-500">Status</p>
          <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[10px] ${statusClass(client.status)}`}>
            {client.status}
          </span>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 md:block md:space-y-2">
        <CompactInfo label="Próximo contato" value={client.nextFollowUp} hint={`Inativo: ${idleLabel(client)}`} />
        <div className="grid grid-cols-2 gap-1.5">
          <CompactContact icon={<Phone size={11} />} value={maskPhone(client.phone)} />
          <CompactContact icon={<Mail size={11} />} value={maskEmail(client.email)} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <span className={`rounded-full border px-2 py-1 text-[10px] ${priorityClass(priority)}`}>
            {priority}
          </span>
          <span className={`rounded-full border px-2 py-1 text-[10px] ${riskClass(risk)}`}>
            {risk}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 md:justify-end">
        <ScorePill score={score} forecast={forecastLabel(client)} />

        <div className="flex shrink-0 items-center gap-1">
          <IconButton aria-label="Favoritar" onClick={() => onToggleFavorite(client.id)}>
            <Star size={14} />
          </IconButton>
          <IconButton aria-label="Marcar como quente" onClick={() => onToggleHot(client.id)}>
            <Flame size={14} />
          </IconButton>
          <IconButton aria-label="Editar cliente" onClick={() => onEditClient(client)}>
            <Edit3 size={14} />
          </IconButton>
          <IconButton aria-label="Copiar telefone" onClick={() => onCopyText(client.phone, "Telefone copiado.")}>
            <Phone size={14} />
          </IconButton>
          <IconButton
            aria-label="Abrir WhatsApp"
            onClick={() => onRequestWhatsapp(client)}
            className="hover:text-emerald-700"
          >
            <MessageCircle size={14} />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

function CompactInfo({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-xs font-semibold ${strong ? "text-teal-100" : "text-slate-200"}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[9px] text-slate-600">{hint}</p>}
    </div>
  );
}

function CompactContact({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-500/12 bg-slate-950/20 px-2 py-1 text-[9px] text-slate-500">
      <span className="shrink-0 text-slate-600">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function ScorePill({ score, forecast }: { score: number; forecast: string }) {
  return (
    <div className={`metric-card w-28 shrink-0 rounded-lg p-1.5 ${score >= 80 ? "metric-pipeline" : score >= 60 ? "metric-forecast" : ""}`}>
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>Score</span>
        <span>{score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${scoreClass(score)}`} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-1 truncate text-[9px] text-slate-600">{forecast}</p>
    </div>
  );
}

function EmptyClientsState() {
  return (
    <EmptyState
      className="metric-card rounded-2xl"
      description="Ajuste a busca, limpe os filtros ou crie um novo cliente para alimentar o funil."
      icon={<UserCheck size={16} />}
      title="Nenhum cliente encontrado"
    />
  );
}

function ClientsFooter({
  page,
  totalPages,
  visibleClientsCount,
  filteredClientsCount,
  onPreviousPage,
  onNextPage,
}: {
  page: number;
  totalPages: number;
  visibleClientsCount: number;
  filteredClientsCount: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <Pagination
      itemLabel="registros"
      onPageChange={(nextPage) => nextPage < page ? onPreviousPage() : onNextPage()}
      page={page}
      total={filteredClientsCount}
      totalPages={totalPages}
      visibleCount={visibleClientsCount}
    />
  );
}

function priorityClass(priority: string) {
  if (priority === "Alta") return "border-rose-300/20 bg-slate-950/25 text-rose-200";
  if (priority !== "Baixa") return "border-amber-300/20 bg-slate-950/25 text-amber-200";
  return "border-slate-400/20 bg-slate-950/25 text-slate-300";
}

function riskClass(risk: string) {
  if (risk === "Alto") return "border-rose-300/20 bg-slate-950/25 text-rose-200";
  if (risk === "Medio" || risk === "Médio") return "border-amber-300/20 bg-slate-950/25 text-amber-200";
  return "border-emerald-300/20 bg-slate-950/25 text-emerald-200";
}

function scoreClass(score: number) {
  if (score >= 80) return "bg-emerald-300";
  if (score >= 60) return "bg-amber-300";
  return "bg-slate-400";
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 6) return phone || "não informado";
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

function maskEmail(email?: string) {
  if (!email) return "e-mail protegido";
  const [name, domain] = email.split("@");
  if (!name || !domain) return "e-mail protegido";
  return `${name[0] ?? "*"}***@${domain}`;
}
