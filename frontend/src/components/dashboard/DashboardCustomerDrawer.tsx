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

  if (activePage === "kanban") {
    return (
      <aside className="w-[340px] shrink-0 space-y-4">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
          <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-500/10 text-violet-200">
                  <Sparkles size={15} />
                </div>

                <div>
                  <p className="text-sm font-semibold">Inteligência do pipeline</p>
                  <p className="text-[10px] text-slate-500">Leitura comercial</p>
                </div>
              </div>

              <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-200">
                Online
              </span>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              O painel cruza score, valor, risco e tempo sem contato para indicar onde agir primeiro.
            </p>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                <p className="text-[9px] text-slate-500">Pressão</p>
                <p className="mt-1 text-xs font-semibold">
                  {clients.filter((client) => getRisk(client) !== "Baixo").length} leads
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                <p className="text-[9px] text-slate-500">Hoje</p>
                <p className="mt-1 text-xs font-semibold">{analytics.todayFollowUps}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                <p className="text-[9px] text-slate-500">Score</p>
                <p className="mt-1 text-xs font-semibold">{analytics.averageScore}</p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <button
                onClick={() => onApplySmartFilter("proposal")}
                className="group w-full rounded-xl border border-amber-300/10 bg-amber-500/[0.06] p-3 text-left transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-500/[0.1]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-amber-100">Prioridade agora</p>
                  <Target size={13} className="text-amber-200" />
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-amber-100/60">
                  Revisar propostas quentes e acelerar fechamento antes de perder timing.
                </p>
              </button>

              <button
                onClick={() => onApplySmartFilter("silent")}
                className="group w-full rounded-xl border border-rose-300/10 bg-rose-500/[0.06] p-3 text-left transition-all duration-200 hover:border-rose-300/20 hover:bg-rose-500/[0.1]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-rose-100">Risco silencioso</p>
                  <AlertTriangle size={13} className="text-rose-200" />
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-rose-100/60">
                  Clientes parados há muitos dias precisam de ação para não esfriar.
                </p>
              </button>

              <button
                onClick={() => onApplySmartFilter("risk")}
                className="group w-full rounded-xl border border-sky-300/10 bg-sky-500/[0.06] p-3 text-left transition-all duration-200 hover:border-sky-300/20 hover:bg-sky-500/[0.1]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-sky-100">Limpeza inteligente</p>
                  <Activity size={13} className="text-sky-200" />
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-sky-100/60">
                  Separar leads em risco alto para decidir reativação, pausa ou descarte.
                </p>
              </button>
            </div>
          </div>
        </div>

        {selectedClient && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Lead em foco</p>
                <p className="text-[10px] text-slate-500">Próxima ação recomendada</p>
              </div>

              <span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(selectedClient.status)}`}>
                {selectedClient.status}
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{selectedClient.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{selectedClient.company}</p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Valor</p>
                  <p className="text-xs font-semibold">{money(selectedClient.value)}</p>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
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

              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                <div className="rounded-lg bg-white/5 p-2">
                  <p className="text-slate-500">Prioridade</p>
                  <p className="mt-0.5 font-semibold text-slate-200">{priorityLabel(selectedClient)}</p>
                </div>

                <div className="rounded-lg bg-white/5 p-2">
                  <p className="text-slate-500">SLA</p>
                  <p className="mt-0.5 font-semibold text-slate-200">{slaLabel(selectedClient)}</p>
                </div>
              </div>

              <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-[10px] leading-relaxed text-slate-400">
                Sugestão: enviar mensagem curta pelo WhatsApp, confirmar interesse e registrar a resposta na timeline.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/${selectedClient.phone}?text=${encodeURIComponent(whatsappMessage(selectedClient))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-black"
                >
                  <MessageCircle size={12} /> WhatsApp
                </a>

                <button
                  onClick={() => onEditClient(selectedClient)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"
                >
                  <Edit3 size={12} /> Editar
                </button>
              </div>
            </div>
          </div>
        )}

        <PipelineVisualCard />
      </aside>
    );
  }

  function localIdleLabel(client: Client) {
    if (client.lastContactDays === 0) return "Hoje";
    if (client.lastContactDays === 1) return "1 dia";
    return `${client.lastContactDays} dias`;
  }

  return (
    <aside className="w-[340px] shrink-0 space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Central do cliente</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Atendimento, sinais comerciais e próxima ação.
            </p>
          </div>

          {selectedClient && (
            <button
              onClick={onClearSelectedClient}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {selectedClient ? (
          <div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
              <div className="border-b border-white/10 bg-white/[0.025] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[11px] font-bold text-black">
                        {initials(selectedClient.name)}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{selectedClient.name}</p>
                        <p className="truncate text-[11px] text-slate-400">{selectedClient.company}</p>
                      </div>
                    </div>
                  </div>

                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusClass(selectedClient.status)}`}>
                    {selectedClient.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoBox label="Valor" value={money(selectedClient.value)} />
                  <InfoBox label="Fit" value={customerFitLabel(selectedClient)} />
                  <InfoBox label="Dono" value={leadOwner(selectedClient)} />
                </div>
              </div>

              <div className="p-3">
                <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.045] p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-violet-100">Diagnóstico comercial</span>
                    <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[9px] text-violet-100">
                      prioridade
                    </span>
                  </div>

                  <p className="text-[10px] leading-relaxed text-violet-100/65">
                    {nextActionLabel(selectedClient)}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
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

                  <a
                    href={`https://wa.me/${selectedClient.phone}?text=${encodeURIComponent(whatsappMessage(selectedClient))}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-2 py-1.5 text-left transition hover:border-emerald-400/20 hover:bg-emerald-500/[0.08]"
                  >
                    <MessageCircle size={13} className="mb-1 text-emerald-300" />
                    <p className="text-[9px] font-semibold text-emerald-100">WhatsApp</p>
                  </a>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Score inteligente</span>
                    <span>{getLeadScore(selectedClient)}/100</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.35)]"
                      style={{ width: `${getLeadScore(selectedClient)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <InfoBox label="Origem" value={selectedClient.source} />
                  <InfoBox label="Follow-up" value={selectedClient.nextFollowUp} />
                  <InfoBox label="Risco" value={getRisk(selectedClient)} />
                  <InfoBox label="SLA" value={slaLabel(selectedClient)} />
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {selectedClient.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => onRemoveTagFromSelected(tag)}
                      className={`rounded-full border px-2 py-1 text-[10px] ${tagClass(tag)}`}
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
                  <button
                    onClick={onAddTagToSelected}
                    className="rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-black"
                  >
                    Tag
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <SmallButton onClick={() => onEditClient(selectedClient)} icon={<Edit3 size={12} />} label="Editar" />
                  <SmallButton onClick={() => onCopyText(selectedClient.phone, "Telefone copiado.")} icon={<Phone size={12} />} label="Telefone" />
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
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035]">
              <div className="border-b border-white/10 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-violet-200">
                      <StickyNote size={14} />
                    </div>

                    <div>
                      <p className="text-xs font-semibold">Histórico comercial</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">Interações, SLA e cadência</p>
                    </div>
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
                    {selectedClient.notes.length} registros
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoBox label="Contato" value={localIdleLabel(selectedClient)} />
                  <InfoBox label="SLA" value={slaLabel(selectedClient)} />
                  <InfoBox label="Próxima" value={selectedClient.nextFollowUp} />
                </div>
              </div>

              <div className="p-3">
                <div className="flex gap-2">
                  <input
                    value={noteText}
                    onChange={(event) => onSetNoteText(event.target.value)}
                    placeholder="Registrar nova interação..."
                    className="flex-1 select-text rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500"
                  />
                  <button
                    onClick={onAddNote}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-black"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="relative rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-3">
                    <div className="absolute left-3 top-3 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.55)]" />
                    <div className="pl-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-emerald-100">
                          Próxima ação recomendada
                        </p>
                        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-100">
                          ação
                        </span>
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
                    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                      <p className="text-[11px] text-slate-500">
                        Nenhuma nota adicionada ainda.
                      </p>
                      <p className="mt-1 text-[10px] text-slate-600">
                        Use a timeline para registrar ligações, propostas, objeções e próximos passos.
                      </p>
                    </div>
                  )}

                  {selectedClient.notes.map((note, index) => (
                    <div
                      key={note.id}
                      className="relative rounded-xl border border-white/10 bg-white/[0.035] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.055]"
                    >
                      <div className="flex items-start gap-3">
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
                            <span className="shrink-0 text-[9px] text-slate-600">
                              {note.date}
                            </span>
                          </div>

                          <p className="text-[11px] leading-relaxed text-slate-400">
                            {note.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Selecione um cliente na tabela ou no Kanban.</p>
        )}
      </div>

      <PipelineVisualCard />
    </aside>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-200">{value}</p>
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

function PipelineVisualCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="flex items-center gap-2">
        <KanbanSquare size={15} className="text-slate-400" />
        <p className="text-sm font-semibold">Pipeline visual</p>
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
          <p className="text-[11px] text-slate-200">Dica rápida</p>
          <p className="mt-1 text-[10px] text-slate-500">
            Arraste clientes entre colunas para atualizar rapidamente o funil comercial.
          </p>
        </div>

        <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
          <p className="text-[11px] text-slate-200">Fluxo recomendado</p>
          <p className="mt-1 text-[10px] text-slate-500">
            Novo → Contato → Proposta → Fechado.
          </p>
        </div>
      </div>
    </div>
  );
}
