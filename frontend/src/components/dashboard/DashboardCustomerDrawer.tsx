import {
  Activity,
  AlertTriangle,
  Copy,
  Edit3,
  KanbanSquare,
  MessageCircle,
  Phone,
  Plus,
  Sparkles,
  StickyNote,
  Target,
  X,
} from "lucide-react";

type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";
type ActivePage = "dashboard" | "clientes" | "kanban" | "automacoes";

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

type Analytics = {
  totalValue: number;
  wonValue: number;
  forecastValue: number;
  hotCount: number;
  averageScore: number;
  todayFollowUps: number;
};

type SmartFilterType = "risk" | "proposal" | "silent";

type DashboardCustomerDrawerProps = {
  activePage: ActivePage;
  selectedClient: Client | null;
  noteText: string;
  tagText: string;
  clients: Client[];
  analytics: Analytics;
  money: (value: number) => string;
  initials: (name: string) => string;
  statusClass: (status: Status) => string;
  tagClass: (tag: string) => string;
  customerFitLabel: (client: Client) => string;
  leadOwner: (client: Client) => string;
  nextActionLabel: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  slaLabel: (client: Client) => string;
  priorityLabel: (client: Client) => string;
  whatsappMessage: (client: Client) => string;
  onClearSelectedClient: () => void;
  onSetNoteText: (value: string) => void;
  onSetTagText: (value: string) => void;
  onAddNote: () => void;
  onAddTagToSelected: () => void;
  onRemoveTagFromSelected: (tag: string) => void;
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
  onApplySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardCustomerDrawer({
  activePage,
  selectedClient,
  noteText,
  tagText,
  clients,
  analytics,
  money,
  initials,
  statusClass,
  tagClass,
  customerFitLabel,
  leadOwner,
  nextActionLabel,
  getLeadScore,
  getRisk,
  slaLabel,
  priorityLabel,
  whatsappMessage,
  onClearSelectedClient,
  onSetNoteText,
  onSetTagText,
  onAddNote,
  onAddTagToSelected,
  onRemoveTagFromSelected,
  onEditClient,
  onCopyText,
  onApplySmartFilter,
}: DashboardCustomerDrawerProps) {
  if (activePage === "automacoes") {
    return null;
  }

  function localIdleLabel(client: Client) {
    if (client.lastContactDays === 0) return "Hoje";
    if (client.lastContactDays === 1) return "1 dia";
    return `${client.lastContactDays} dias`;
  }

  if (activePage === "kanban") {
    return (
      <aside className="w-[380px] shrink-0 space-y-3">
        <CommercialDecisionCenter
          selectedClient={selectedClient}
          clients={clients}
          analytics={analytics}
          money={money}
          statusClass={statusClass}
          getLeadScore={getLeadScore}
          getRisk={getRisk}
          slaLabel={slaLabel}
          priorityLabel={priorityLabel}
          nextActionLabel={nextActionLabel}
          whatsappMessage={whatsappMessage}
          onEditClient={onEditClient}
          onCopyText={onCopyText}
          onApplySmartFilter={onApplySmartFilter}
          mode="kanban"
        />
      </aside>
    );
  }

  return (
    <aside className="w-[380px] shrink-0 space-y-3">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
        <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.09] via-white/[0.035] to-transparent p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Central de decisão</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Lead, ação, risco e histórico em um único painel.</p>
            </div>

            {selectedClient && (
              <button
                onClick={onClearSelectedClient}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {selectedClient ? (
          <div className="p-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-xs font-black text-black shadow-[0_0_22px_rgba(255,255,255,0.12)]">
                    {initials(selectedClient.name)}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{selectedClient.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{selectedClient.company}</p>
                  </div>
                </div>

                <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusClass(selectedClient.status)}`}>
                  {selectedClient.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-[1fr_86px] gap-2">
                <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-emerald-100/50">Valor potencial</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-100">{money(selectedClient.value)}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-center">
                  <p className="text-[9px] text-slate-500">Score</p>
                  <p className="mt-0.5 text-xl font-black leading-none text-slate-100">{getLeadScore(selectedClient)}</p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-violet-400/10 bg-violet-500/[0.055] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-violet-100">Próxima melhor ação</p>
                  <span className="rounded-full border border-violet-300/10 bg-violet-400/10 px-2 py-0.5 text-[9px] text-violet-100">
                    decisão
                  </span>
                </div>

                <p className="text-[10px] leading-relaxed text-violet-100/70">{nextActionLabel(selectedClient)}</p>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2">
                <DecisionMini label="Fit" value={customerFitLabel(selectedClient)} />
                <DecisionMini label="Dono" value={leadOwner(selectedClient)} />
                <DecisionMini label="Risco" value={getRisk(selectedClient)} />
                <DecisionMini label="SLA" value={slaLabel(selectedClient)} />
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Força comercial</span>
                  <span>{getLeadScore(selectedClient)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.35)]"
                    style={{ width: `${getLeadScore(selectedClient)}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <a
                  href={`https://wa.me/${selectedClient.phone}?text=${encodeURIComponent(whatsappMessage(selectedClient))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-white px-2 py-2 text-left text-black transition hover:opacity-90"
                >
                  <MessageCircle size={14} className="mb-1" />
                  <p className="text-[10px] font-black">WhatsApp</p>
                </a>

                <ActionButton
                  icon={<Phone size={13} className="mb-1 text-emerald-300" />}
                  label="Telefone"
                  onClick={() => onCopyText(selectedClient.phone, "Telefone copiado.")}
                />

                <ActionButton
                  icon={<Copy size={13} className="mb-1 text-sky-300" />}
                  label="Mensagem"
                  onClick={() => onCopyText(whatsappMessage(selectedClient), "Mensagem copiada.")}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {selectedClient.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onRemoveTagFromSelected(tag)}
                    className={`rounded-full border px-2 py-0.5 text-[9px] ${tagClass(tag)}`}
                  >
                    {tag} ×
                  </button>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={tagText}
                  onChange={(event) => onSetTagText(event.target.value)}
                  placeholder="Nova tag..."
                  className="flex-1 select-text rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500"
                />
                <button onClick={onAddTagToSelected} className="rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-black">
                  Tag
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <SmallButton onClick={() => onEditClient(selectedClient)} icon={<Edit3 size={12} />} label="Editar" />
                <SmallButton
                  onClick={() =>
                    onCopyText(
                      `${selectedClient.name} | ${selectedClient.company} | ${money(selectedClient.value)} | ${selectedClient.status}`,
                      "Resumo copiado."
                    )
                  }
                  icon={<Copy size={12} />}
                  label="Resumo"
                />
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <div className="border-b border-white/10 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-violet-200">
                      <StickyNote size={14} />
                    </div>

                    <div>
                      <p className="text-xs font-semibold">Timeline comercial</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {localIdleLabel(selectedClient)} sem contato • próxima {selectedClient.nextFollowUp}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
                    {selectedClient.notes.length}
                  </span>
                </div>
              </div>

              <div className="p-3">
                <div className="flex gap-2">
                  <input
                    value={noteText}
                    onChange={(event) => onSetNoteText(event.target.value)}
                    placeholder="Registrar interação..."
                    className="flex-1 select-text rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500"
                  />
                  <button onClick={onAddNote} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-black">
                    <Plus size={12} />
                    Add
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="relative rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5">
                    <div className="absolute left-3 top-3 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.55)]" />
                    <div className="pl-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-emerald-100">Ação recomendada</p>
                        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-100">ação</span>
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-emerald-100/65">
                        {getLeadScore(selectedClient) >= 80
                          ? "Priorizar contato hoje e conduzir para fechamento."
                          : getRisk(selectedClient) === "Alto"
                            ? "Reativar com mensagem objetiva antes de mover para perdido."
                            : "Manter cadência de follow-up e registrar resposta do cliente."}
                      </p>
                    </div>
                  </div>

                  {selectedClient.notes.length === 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2.5">
                      <p className="text-[11px] text-slate-500">Nenhuma nota adicionada ainda.</p>
                      <p className="mt-1 text-[10px] text-slate-600">Registre ligações, propostas, objeções e próximos passos.</p>
                    </div>
                  )}

                  {selectedClient.notes.map((note, index) => (
                    <div
                      key={note.id}
                      className="relative rounded-xl border border-white/10 bg-white/[0.035] p-2.5 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.055]"
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[10px] ${
                            index === 0
                              ? "border-sky-300/20 bg-sky-500/10 text-sky-200"
                              : "border-white/10 bg-white/5 text-slate-400"
                          }`}
                        >
                          {index === 0 ? <Sparkles size={12} /> : <StickyNote size={12} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-slate-200">
                              {index === 0 ? "Última interação" : "Registro comercial"}
                            </p>
                            <span className="shrink-0 text-[9px] text-slate-600">{note.date}</span>
                          </div>

                          <p className="text-[11px] leading-relaxed text-slate-400">{note.text}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyDecisionState />
        )}
      </div>

      <ExecutiveRadar clients={clients} analytics={analytics} money={money} getRisk={getRisk} onApplySmartFilter={onApplySmartFilter} />
    </aside>
  );
}

function CommercialDecisionCenter({
  selectedClient,
  clients,
  analytics,
  money,
  statusClass,
  getLeadScore,
  getRisk,
  slaLabel,
  priorityLabel,
  nextActionLabel,
  whatsappMessage,
  onEditClient,
  onCopyText,
  onApplySmartFilter,
  mode,
}: {
  selectedClient: Client | null;
  clients: Client[];
  analytics: Analytics;
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  slaLabel: (client: Client) => string;
  priorityLabel: (client: Client) => string;
  nextActionLabel: (client: Client) => string;
  whatsappMessage: (client: Client) => string;
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
  onApplySmartFilter: (type: SmartFilterType) => void;
  mode: "kanban" | "default";
}) {
  const highRiskClients = clients.filter((client) => getRisk(client) === "Alto");
  const hotOpportunities = clients.filter((client) => client.hot || client.value >= 12000);
  const proposalValue = clients
    .filter((client) => client.status === "Proposta")
    .reduce((sum, client) => sum + client.value, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(0,0,0,0.25)] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.09] via-white/[0.035] to-transparent p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-500/10 text-violet-200">
              <Sparkles size={15} />
            </div>

            <div>
              <p className="text-sm font-semibold">Central comercial</p>
              <p className="text-[10px] text-slate-500">Decisão, risco e ação imediata</p>
            </div>
          </div>

          <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-200">
            Online
          </span>
        </div>
      </div>

      <div className="p-3">
        {selectedClient ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{selectedClient.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">{selectedClient.company}</p>
              </div>

              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusClass(selectedClient.status)}`}>
                {selectedClient.status}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[1fr_74px] gap-2">
              <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-emerald-100/50">Ticket em foco</p>
                <p className="mt-1 text-sm font-semibold text-emerald-100">{money(selectedClient.value)}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-center">
                <p className="text-[9px] text-slate-500">Score</p>
                <p className="mt-0.5 text-xl font-black leading-none text-slate-100">{getLeadScore(selectedClient)}</p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-violet-400/10 bg-violet-500/[0.055] p-2.5">
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="font-semibold text-violet-100">Ação recomendada</span>
                <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[9px] text-violet-100">agora</span>
              </div>
              <p className="text-[10px] leading-relaxed text-violet-100/65">{nextActionLabel(selectedClient)}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
              <DecisionMini label="Prioridade" value={priorityLabel(selectedClient)} />
              <DecisionMini label="SLA" value={slaLabel(selectedClient)} />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <a
                href={`https://wa.me/${selectedClient.phone}?text=${encodeURIComponent(whatsappMessage(selectedClient))}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-white px-2 py-2 text-left text-black transition hover:opacity-90"
              >
                <MessageCircle size={14} className="mb-1" />
                <p className="text-[10px] font-black">WhatsApp</p>
              </a>

              <ActionButton
                icon={<Phone size={13} className="mb-1 text-emerald-300" />}
                label="Telefone"
                onClick={() => onCopyText(selectedClient.phone, "Telefone copiado.")}
              />

              <ActionButton
                icon={<Edit3 size={13} className="mb-1 text-sky-300" />}
                label="Editar"
                onClick={() => onEditClient(selectedClient)}
              />
            </div>
          </div>
        ) : (
          <EmptyDecisionState />
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <RadarMetric label="Risco alto" value={`${highRiskClients.length} leads`} tone="rose" icon={<AlertTriangle size={12} className="text-rose-200" />} />
          <RadarMetric label="Quentes" value={`${hotOpportunities.length} oportunidades`} tone="amber" icon={<Target size={12} className="text-amber-200" />} />
          <RadarMetric label="Hoje" value={`${analytics.todayFollowUps} ações`} tone="sky" icon={<Activity size={12} className="text-sky-200" />} />
          <RadarMetric label="Propostas" value={money(proposalValue)} tone="violet" icon={<Sparkles size={12} className="text-violet-200" />} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <FilterAction tone="amber" label="Propostas" onClick={() => onApplySmartFilter("proposal")} />
          <FilterAction tone="rose" label="Silenciosos" onClick={() => onApplySmartFilter("silent")} />
          <FilterAction tone="sky" label="Risco" onClick={() => onApplySmartFilter("risk")} />
        </div>

        {mode === "kanban" && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] px-2 py-1.5 text-[10px] leading-relaxed text-slate-500">
            Arraste leads entre etapas e use esta central para decidir onde agir primeiro.
          </p>
        )}
      </div>
    </div>
  );
}

function ExecutiveRadar({
  clients,
  analytics,
  money,
  getRisk,
  onApplySmartFilter,
}: {
  clients: Client[];
  analytics: Analytics;
  money: (value: number) => string;
  getRisk: (client: Client) => string;
  onApplySmartFilter: (type: SmartFilterType) => void;
}) {
  const hotOpportunities = clients.filter((client) => client.hot || client.value >= 12000);
  const silentClients = clients.filter((client) => client.lastContactDays >= 7);
  const highRiskClients = clients.filter((client) => getRisk(client) === "Alto");
  const proposalValue = clients
    .filter((client) => client.status === "Proposta")
    .reduce((sum, client) => sum + client.value, 0);

  const topOpportunity = [...clients].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KanbanSquare size={15} className="text-slate-400" />
          <div>
            <p className="text-sm font-semibold">Radar executivo</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Prioridades rápidas do funil</p>
          </div>
        </div>

        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] text-slate-400">ao vivo</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <RadarMetric label="Risco alto" value={`${highRiskClients.length} leads`} tone="rose" icon={<AlertTriangle size={12} className="text-rose-200" />} />
        <RadarMetric label="Quentes" value={`${hotOpportunities.length} oportunidades`} tone="amber" icon={<Target size={12} className="text-amber-200" />} />
        <RadarMetric label="Hoje" value={`${analytics.todayFollowUps} ações`} tone="sky" icon={<Activity size={12} className="text-sky-200" />} />
        <RadarMetric label="Propostas" value={money(proposalValue)} tone="violet" icon={<Sparkles size={12} className="text-violet-200" />} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <FilterAction tone="amber" label="Propostas" onClick={() => onApplySmartFilter("proposal")} />
        <FilterAction tone="rose" label="Silenciosos" onClick={() => onApplySmartFilter("silent")} />
        <FilterAction tone="sky" label="Risco" onClick={() => onApplySmartFilter("risk")} />
      </div>

      <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-slate-200">Ação sugerida</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              {highRiskClients.length > 0
                ? "Reativar clientes em risco antes de criar novas oportunidades."
                : analytics.todayFollowUps > 0
                  ? "Priorizar follow-ups de hoje e propostas abertas."
                  : "Revisar oportunidades quentes e manter cadência comercial."}
            </p>
          </div>

          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-slate-400">
            prioridade
          </span>
        </div>
      </div>

      {topOpportunity && (
        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold text-slate-200">{topOpportunity.name}</p>
              <p className="mt-0.5 truncate text-[9px] text-slate-500">{topOpportunity.company}</p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[9px] text-slate-500">Maior ticket</p>
              <p className="text-[10px] font-semibold text-slate-200">{money(topOpportunity.value)}</p>
            </div>
          </div>
        </div>
      )}

      {silentClients.length > 0 && (
        <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.025] px-2 py-1.5 text-[10px] text-slate-500">
          {silentClients.length} cliente(s) sem contato recente pedem atenção.
        </p>
      )}
    </div>
  );
}

function EmptyDecisionState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
        <Sparkles size={16} />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-300">Selecione um lead</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Clique em um cliente na tabela ou no Kanban para abrir a central de decisão comercial.
      </p>
    </div>
  );
}

function DecisionMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-1.5 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
    >
      {icon}
      <p className="text-[9px] font-semibold text-slate-300">{label}</p>
    </button>
  );
}

function SmallButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"
    >
      {icon}
      {label}
    </button>
  );
}

function FilterAction({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "amber" | "rose" | "sky";
  onClick: () => void;
}) {
  const classes = {
    amber: "border-amber-300/10 bg-amber-500/[0.06] text-amber-100 hover:bg-amber-500/[0.10]",
    rose: "border-rose-300/10 bg-rose-500/[0.06] text-rose-100 hover:bg-rose-500/[0.10]",
    sky: "border-sky-300/10 bg-sky-500/[0.06] text-sky-100 hover:bg-sky-500/[0.10]",
  };

  return (
    <button onClick={onClick} className={`rounded-xl border px-2 py-2 text-[10px] font-semibold transition ${classes[tone]}`}>
      {label}
    </button>
  );
}

function RadarMetric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "rose" | "amber" | "sky" | "violet";
  icon: React.ReactNode;
}) {
  const classes = {
    rose: "border-rose-400/10 bg-rose-500/[0.055] text-rose-100",
    amber: "border-amber-400/10 bg-amber-500/[0.055] text-amber-100",
    sky: "border-sky-400/10 bg-sky-500/[0.055] text-sky-100",
    violet: "border-violet-400/10 bg-violet-500/[0.055] text-violet-100",
  };

  return (
    <div className={`rounded-xl border p-2 ${classes[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] opacity-65">{label}</p>
        {icon}
      </div>
      <p className="mt-1 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}
