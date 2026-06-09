import { Edit3, Flame, MessageCircle, Phone, Star } from "lucide-react";
import type { Client, Status } from "../../types/dashboard";

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
            whatsappMessage={whatsappMessage}
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/40 bg-slate-950/20 px-4 py-3">
      <div>
        <p className="text-sm font-semibold">Clientes</p>
        <p className="mt-0.5 text-[10px] text-slate-500">Carteira priorizada sem barra horizontal.</p>
      </div>

      <div className="flex items-center gap-2">
          <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
          {filteredClientsCount} registros
        </span>
          <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
          Página {page}/{totalPages}
        </span>
      </div>
    </div>
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
  whatsappMessage,
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
  whatsappMessage: (client: Client) => string;
}) {
  const score = getLeadScore(client);
  const priority = getPriority(client);
  const risk = getRisk(client);

  return (
    <article
      className={`saas-row grid min-w-0 gap-3 rounded-xl p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(150px,0.6fr)_minmax(160px,0.65fr)_auto] ${
        selected
          ? "border-teal-300/32 bg-teal-300/[0.055] shadow-[inset_2px_0_0_rgba(45,212,191,0.42),0_14px_32px_rgba(0,0,0,0.18)]"
          : ""
      }`}
    >
      <button onClick={() => onSelectClient(client.id)} className="min-w-0 text-left">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-500/16 bg-slate-900/70 text-[9px] font-bold text-slate-200">
            {initials(client.name)}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-slate-100">{client.name}</p>
              {client.favorite && <Star size={12} className="shrink-0 fill-amber-300 text-amber-300" />}
              {client.hot && <Flame size={12} className="shrink-0 text-rose-400" />}
            </div>

            <p className="mt-0.5 truncate text-[11px] text-slate-500">{client.company}</p>

          </div>
        </div>
      </button>

      <div className="grid min-w-0 grid-cols-2 gap-2 md:block md:space-y-2">
        <CompactInfo label="Valor" value={money(client.value)} />
        <div>
          <p className="text-[9px] text-slate-500">Status</p>
          <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[10px] ${statusClass(client.status)}`}>
            {client.status}
          </span>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 md:block md:space-y-2">
        <CompactInfo label="Follow-up" value={client.nextFollowUp} hint={`Inativo: ${idleLabel(client)}`} />
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
          <IconButton title="Favoritar" onClick={() => onToggleFavorite(client.id)}>
            <Star size={14} />
          </IconButton>
          <IconButton title="Marcar como quente" onClick={() => onToggleHot(client.id)}>
            <Flame size={14} />
          </IconButton>
          <IconButton title="Editar cliente" onClick={() => onEditClient(client)}>
            <Edit3 size={14} />
          </IconButton>
          <IconButton title="Copiar telefone" onClick={() => onCopyText(client.phone, "Telefone copiado.")}>
            <Phone size={14} />
          </IconButton>
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
      </div>
    </article>
  );
}

function CompactInfo({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-slate-200">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[9px] text-slate-600">{hint}</p>}
    </div>
  );
}

function ScorePill({ score, forecast }: { score: number; forecast: string }) {
  return (
    <div className="saas-card w-24 shrink-0 rounded-lg p-1.5">
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

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700/45 hover:text-slate-100"
    >
      {children}
    </button>
  );
}

function EmptyClientsState() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-dashed border-slate-500/20 bg-slate-950/25 p-4 text-center">
      <p className="text-sm font-semibold text-slate-300">Nenhum cliente encontrado</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Ajuste a busca, limpe os filtros ou crie um novo cliente para alimentar o pipeline.
      </p>
    </div>
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
    <div className="flex items-center justify-between border-t border-slate-700/40 bg-slate-950/16 px-4 py-3">
      <button
        onClick={onPreviousPage}
        disabled={page === 1}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
      >
        Anterior
      </button>

      <p className="text-[11px] text-slate-500">
        Página <span className="font-semibold text-slate-300">{page}</span> de {totalPages} •{" "}
        <span className="font-semibold text-slate-300">{visibleClientsCount}</span> de {filteredClientsCount}
      </p>

      <button
        onClick={onNextPage}
        disabled={page === totalPages}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
      >
        Próxima
      </button>
    </div>
  );
}

function priorityClass(priority: string) {
  if (priority === "Alta") return "border-rose-300/20 bg-slate-950/25 text-rose-200";
  if (priority !== "Baixa") return "border-amber-300/20 bg-slate-950/25 text-amber-200";
  return "border-slate-400/20 bg-slate-950/25 text-slate-300";
}

function riskClass(risk: string) {
  if (risk === "Alto") return "border-rose-300/20 bg-slate-950/25 text-rose-200";
  if (risk === "Médio") return "border-amber-300/20 bg-slate-950/25 text-amber-200";
  return "border-emerald-300/20 bg-slate-950/25 text-emerald-200";
}

function scoreClass(score: number) {
  if (score >= 80) return "bg-emerald-300";
  if (score >= 60) return "bg-amber-300";
  return "bg-slate-400";
}
