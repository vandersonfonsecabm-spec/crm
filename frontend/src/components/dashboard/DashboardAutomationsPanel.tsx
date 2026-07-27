import { AlertTriangle, CheckCircle2, Clock, FlaskConical, History, PauseCircle, PlayCircle, Plus, RefreshCw, RotateCcw, Settings2, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  activateAutomationRule,
  createAutomationRule,
  deactivateAutomationRule,
  fetchAutomationExecutions,
  fetchAutomationOptions,
  fetchAutomationRules,
  fetchAutomationSummary,
  retryAutomationJob,
  simulateAutomationRule,
  updateAutomationRule,
  type ApiHttpError,
  type AutomationAction,
  type AutomationActionType,
  type AutomationCondition,
  type AutomationExecution,
  type AutomationOptions,
  type AutomationRule,
  type AutomationRulePayload,
  type AutomationSimulation,
  type AutomationSummary,
  type AutomationTrigger,
} from "../../services/crmApi";
import { Badge, Button, EmptyState, ErrorState, Input, SectionHeader, Select, StatusBadge, Surface, Textarea } from "../ui";
import { cx } from "../ui/utils";

type FormState = {
  id: number | null;
  nome: string;
  descricao: string;
  prioridade: string;
  gatilho: AutomationTrigger;
  timezone: string;
  origem: string;
  semResponsavel: boolean;
  etapa: string;
  tempoMinutos: string;
  acao: AutomationActionType;
  usuarioId: string;
  usuarioIds: number[];
  followUpTitulo: string;
  followUpDescricao: string;
  followUpDelay: string;
  followUpPrioridade: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE" | "CRITICA";
  internalEventType: string;
  internalEventSummary: string;
};

const emptyForm: FormState = {
  id: null,
  nome: "",
  descricao: "",
  prioridade: "100",
  gatilho: "LEAD_CREATED",
  timezone: "America/Sao_Paulo",
  origem: "",
  semResponsavel: false,
  etapa: "NOVO",
  tempoMinutos: "60",
  acao: "CREATE_FOLLOW_UP",
  usuarioId: "",
  usuarioIds: [],
  followUpTitulo: "Retornar contato",
  followUpDescricao: "",
  followUpDelay: "60",
  followUpPrioridade: "MEDIA",
  internalEventType: "AUTOMATION_EVENT",
  internalEventSummary: "Evento tecnico criado pela automacao.",
};

const triggerLabels: Record<AutomationTrigger, string> = {
  LEAD_CREATED: "Lead criado",
  LEAD_WITHOUT_FOLLOW_UP: "Lead sem acompanhamento",
  DEAL_STALLED: "Negocio parado",
};

const actionLabels: Record<AutomationActionType, string> = {
  ASSIGN_OWNER: "Atribuir responsavel",
  ASSIGN_ROUND_ROBIN: "Round-robin",
  CREATE_FOLLOW_UP: "Criar acompanhamento",
  CREATE_INTERNAL_EVENT: "Evento tecnico interno",
  UPDATE_NEXT_FOLLOW_UP_PROJECTION: "Atualizar proximo follow-up",
};

const executionStatusLabels: Record<string, string> = {
  PENDENTE: "Pendente",
  PROCESSANDO: "Processando",
  CONCLUIDA: "Concluida",
  FALHOU: "Falhou",
  FALHA_DEFINITIVA: "Falha definitiva",
  CANCELADA: "Cancelada",
  SIMULADA: "Simulada",
};

export default function DashboardAutomationsPanel() {
  const [summary, setSummary] = useState<AutomationSummary | null>(null);
  const [options, setOptions] = useState<AutomationOptions | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [simulation, setSimulation] = useState<AutomationSimulation | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [entityType, setEntityType] = useState<"LEAD" | "NEGOCIO">("LEAD");
  const [entityId, setEntityId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const hasFailedJobs = executions.some((execution) => execution.jobs.some((job) => job.status === "FALHOU" || job.status === "FALHA_DEFINITIVA"));
  const orderedRules = useMemo(() => [...rules].sort((first, second) => first.prioridade - second.prioridade || first.id - second.id), [rules]);
  const availableUsers = options?.users ?? [];
  const simulationConditions = simulation?.condicoes ?? [];
  const simulationActions = simulation?.acoesPrevistas ?? [];
  const simulationIncompatibilities = simulation?.incompatibilidades ?? [];

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [summaryData, optionsData, rulesData, executionData] = await Promise.all([
        fetchAutomationSummary(),
        fetchAutomationOptions(),
        fetchAutomationRules({ limit: 50 }),
        fetchAutomationExecutions({ limit: 12 }),
      ]);
      setSummary(summaryData);
      setOptions(optionsData);
      setRules(rulesData.data);
      setExecutions(executionData.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function submitRule() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPayload(form);
      const saved = form.id ? await updateAutomationRule(form.id, payload) : await createAutomationRule(payload);
      setMessage(form.id ? "Regra atualizada." : "Regra criada em modo inativo.");
      setForm(ruleToForm(saved));
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: AutomationRule) {
    setError("");
    setMessage("");
    try {
      const updated = rule.ativa ? await deactivateAutomationRule(rule.id) : await activateAutomationRule(rule.id);
      setMessage(updated.ativa ? "Regra ativada sem processar historico antigo." : "Regra desativada.");
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function runSimulation() {
    setError("");
    setMessage("");
    try {
      const payload = form.id
        ? { regraId: form.id, entidadeTipo: entityType, entidadeId: Number(entityId) || undefined }
        : { regra: buildPayload(form), entidadeTipo: entityType, entidadeId: Number(entityId) || undefined };
      setSimulation(await simulateAutomationRule(payload));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function retryJob(jobId: number) {
    setError("");
    setMessage("");
    try {
      await retryAutomationJob(jobId);
      setMessage("Acao recolocada na fila de retry.");
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  if (loading) {
    return (
      <Surface>
        <SectionHeader description="Carregando regras, execucoes e falhas." icon={<Zap size={15} />} title="Automações" />
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-72 animate-pulse rounded-md bg-[var(--bg-muted)]" />
          <div className="h-72 animate-pulse rounded-md bg-[var(--bg-muted)]" />
        </div>
      </Surface>
    );
  }

  if (error && !summary && !rules.length) {
    return (
      <Surface>
        <SectionHeader
          description="A funcionalidade aparece somente para tenants com a capability de automacoes ativa."
          icon={<Zap size={15} />}
          status={<StatusBadge label="Indisponivel" status="indisponivel" />}
          title="Automações"
        />
        <ErrorState className="min-h-[260px]" description={error} onRetry={() => void load()} title="Automações indisponíveis" />
      </Surface>
    );
  }

  return (
    <div className="grid gap-3">
      <Surface>
        <SectionHeader
          actions={<Button leftIcon={<RefreshCw size={14} />} onClick={() => void load()} size="sm" variant="secondary">Atualizar</Button>}
          description="Regras internas com execucao local, idempotencia por ocorrencia e sem envio externo."
          icon={<Zap size={15} />}
          status={<StatusBadge label={summary?.activeRules ? "Ativo" : "Configuracao local"} status={summary?.activeRules ? "ativo" : "planejado"} />}
          title="Automações"
        />
        {message && <p className="border-b border-[var(--border-default)] px-4 py-2 text-xs font-medium text-emerald-700">{message}</p>}
        {error && <p className="border-b border-[var(--border-default)] px-4 py-2 text-xs font-medium text-[var(--danger)]">{error}</p>}
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <Metric label="Regras" value={summary?.rules ?? 0} />
          <Metric label="Ativas" value={summary?.activeRules ?? 0} />
          <Metric label="Falhas elegíveis" tone={hasFailedJobs ? "warning" : "neutral"} value={summary?.failedJobs ?? 0} />
        </div>
      </Surface>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Surface className="min-w-0 overflow-hidden">
          <SectionHeader
            actions={<Button leftIcon={<Plus size={14} />} onClick={() => { setForm(emptyForm); setSimulation(null); }} size="sm" variant="secondary">Nova regra</Button>}
            description="Menor prioridade executa primeiro. Occurrences antigas nao sao reprocessadas ao ativar."
            icon={<Settings2 size={15} />}
            title="Regras"
          />
          {orderedRules.length === 0 ? (
            <EmptyState className="min-h-[240px]" description="Crie uma regra inativa, simule com uma entidade real e ative apenas quando estiver pronta." icon={<Zap size={18} />} title="Nenhuma regra cadastrada" />
          ) : (
            <div className="divide-y divide-[var(--border-default)]">
              {orderedRules.map((rule) => (
                <article className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto]" key={rule.id}>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <button className="truncate text-left text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--primary)]" onClick={() => { setForm(ruleToForm(rule)); setSimulation(null); }} type="button">
                        {rule.nome}
                      </button>
                      <StatusBadge label={rule.ativa ? "Ativa" : "Inativa"} status={rule.ativa ? "ativo" : "inativo"} />
                      <Badge>{triggerLabels[rule.gatilho]}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-muted)]">{rule.descricao || "Sem descricao."}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <span>Prioridade {rule.prioridade}</span>
                      <span>Versao {rule.versao}</span>
                      <span>{rule.timezone}</span>
                      <span>{rule.acoes.length} acao(oes)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => { setForm(ruleToForm(rule)); setSimulation(null); }} size="sm" variant="ghost">Editar</Button>
                    <Button leftIcon={rule.ativa ? <PauseCircle size={14} /> : <PlayCircle size={14} />} onClick={() => void toggleRule(rule)} size="sm" variant={rule.ativa ? "subtle" : "primary"}>
                      {rule.ativa ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="min-w-0 overflow-hidden">
          <SectionHeader description="Configure somente gatilhos, condicoes e acoes sustentados pelo CRM." icon={<Settings2 size={15} />} title={form.id ? "Editar regra" : "Nova regra"} />
          <div className="grid gap-3 p-4">
            <Input label="Nome" maxLength={120} onChange={(event) => setForm({ ...form, nome: event.target.value })} value={form.nome} />
            <Textarea label="Descricao" maxLength={500} onChange={(event) => setForm({ ...form, descricao: event.target.value })} value={form.descricao} />
            <div className="grid gap-2 sm:grid-cols-3">
              <Select label="Gatilho" onChange={(event) => setForm({ ...form, gatilho: event.target.value as AutomationTrigger })} value={form.gatilho}>
                {Object.entries(triggerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Input label="Prioridade" min={1} max={999} onChange={(event) => setForm({ ...form, prioridade: event.target.value })} type="number" value={form.prioridade} />
              <Input label="Timezone" onChange={(event) => setForm({ ...form, timezone: event.target.value })} value={form.timezone} />
            </div>

            <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Condicoes reais</p>
              <div className="mt-2 grid gap-2">
                {form.gatilho === "LEAD_CREATED" && (
                  <>
                    <Input label="Origem opcional" onChange={(event) => setForm({ ...form, origem: event.target.value })} placeholder="Ex.: SITE" value={form.origem} />
                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <input checked={form.semResponsavel} onChange={(event) => setForm({ ...form, semResponsavel: event.target.checked })} type="checkbox" />
                      Apenas Leads sem responsavel
                    </label>
                  </>
                )}
                {form.gatilho === "LEAD_WITHOUT_FOLLOW_UP" && <Input label="Tempo sem acompanhamento (min)" min={1} onChange={(event) => setForm({ ...form, tempoMinutos: event.target.value })} type="number" value={form.tempoMinutos} />}
                {form.gatilho === "DEAL_STALLED" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select label="Etapa" onChange={(event) => setForm({ ...form, etapa: event.target.value })} value={form.etapa}>
                      {["NOVO", "CONTATO", "PROPOSTA"].map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                    </Select>
                    <Input label="Tempo parado (min)" min={1} onChange={(event) => setForm({ ...form, tempoMinutos: event.target.value })} type="number" value={form.tempoMinutos} />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Acao</p>
              <div className="mt-2 grid gap-2">
                <Select label="Tipo de acao" onChange={(event) => setForm({ ...form, acao: event.target.value as AutomationActionType })} value={form.acao}>
                  {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                {form.acao === "ASSIGN_OWNER" && (
                  <Select label="Responsavel" onChange={(event) => setForm({ ...form, usuarioId: event.target.value })} value={form.usuarioId}>
                    <option value="">Selecione</option>
                    {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}
                  </Select>
                )}
                {form.acao === "ASSIGN_ROUND_ROBIN" && (
                  <div className="grid gap-1">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">Elegiveis</span>
                    <div className="max-h-32 overflow-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-2">
                      {availableUsers.map((user) => (
                        <label className="flex items-center gap-2 py-1 text-xs text-[var(--text-secondary)]" key={user.id}>
                          <input checked={form.usuarioIds.includes(user.id)} onChange={() => setForm((current) => toggleRoundRobinUser(current, user.id))} type="checkbox" />
                          {user.nome}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {form.acao === "CREATE_FOLLOW_UP" && (
                  <div className="grid gap-2">
                    <Input label="Titulo do acompanhamento" onChange={(event) => setForm({ ...form, followUpTitulo: event.target.value })} value={form.followUpTitulo} />
                    <Textarea label="Descricao opcional" onChange={(event) => setForm({ ...form, followUpDescricao: event.target.value })} value={form.followUpDescricao} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input label="Prazo em minutos" min={1} onChange={(event) => setForm({ ...form, followUpDelay: event.target.value })} type="number" value={form.followUpDelay} />
                      <Select label="Prioridade" onChange={(event) => setForm({ ...form, followUpPrioridade: event.target.value as FormState["followUpPrioridade"] })} value={form.followUpPrioridade}>
                        {["BAIXA", "MEDIA", "ALTA", "URGENTE", "CRITICA"].map((value) => <option key={value} value={value}>{value}</option>)}
                      </Select>
                    </div>
                  </div>
                )}
                {form.acao === "CREATE_INTERNAL_EVENT" && (
                  <div className="grid gap-2">
                    <Input label="Tipo tecnico" onChange={(event) => setForm({ ...form, internalEventType: event.target.value })} value={form.internalEventType} />
                    <Input label="Resumo" onChange={(event) => setForm({ ...form, internalEventSummary: event.target.value })} value={form.internalEventSummary} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => { setForm(emptyForm); setSimulation(null); }} size="sm" variant="ghost">Limpar</Button>
              <Button loading={saving} onClick={() => void submitRule()} size="sm" variant="primary">{form.id ? "Salvar regra" : "Criar inativa"}</Button>
            </div>
          </div>
        </Surface>
      </div>

      <div className="grid gap-3 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Surface className="overflow-hidden">
          <SectionHeader description="A simulacao valida uma entidade real do tenant e nao grava efeitos." icon={<FlaskConical size={15} />} title="Simulação" />
          <div className="grid gap-3 p-4">
            <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
              <Select label="Entidade" onChange={(event) => setEntityType(event.target.value as "LEAD" | "NEGOCIO")} value={entityType}>
                <option value="LEAD">Lead</option>
                <option value="NEGOCIO">Negocio</option>
              </Select>
              <Input label="ID da entidade" min={1} onChange={(event) => setEntityId(event.target.value)} type="number" value={entityId} />
            </div>
            <Button leftIcon={<FlaskConical size={14} />} onClick={() => void runSimulation()} size="sm" variant="secondary">Simular sem efeitos</Button>
            {simulation && (
              <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-secondary)]">
                <p className="font-semibold text-[var(--text-primary)]">{simulation.entidadeEncontrada ? "Entidade encontrada" : "Entidade nao encontrada"}</p>
                <div className="mt-2 grid gap-1">
                  {simulationConditions.map((item, index) => (
                    <span className="flex items-center gap-2" key={`${item.condition.campo}-${index}`}>
                      {item.aprovada ? <CheckCircle2 className="text-emerald-600" size={13} /> : <AlertTriangle className="text-amber-600" size={13} />}
                      {conditionLabel(item.condition)}
                    </span>
                  ))}
                  {simulationConditions.length === 0 && <span>Sem condicoes adicionais.</span>}
                </div>
                <p className="mt-2">Acoes previstas: {simulationActions.map((action) => actionLabels[action.tipo]).join(", ") || "nenhuma"}</p>
                {simulationIncompatibilities.length > 0 && <p className="mt-2 text-[var(--danger)]">{simulationIncompatibilities.join(" ")}</p>}
              </div>
            )}
          </div>
        </Surface>

        <Surface className="min-w-0 overflow-hidden">
          <SectionHeader description="Falhas podem ser reprocessadas por acao, sem reiniciar a execucao inteira." icon={<History size={15} />} title="Execuções recentes" />
          {executions.length === 0 ? (
            <EmptyState className="min-h-[220px]" description="Execucoes aparecerao aqui quando uma ocorrencia real cruzar uma regra ativa." icon={<Clock size={18} />} title="Nenhuma execução registrada" />
          ) : (
            <div className="divide-y divide-[var(--border-default)]">
              {executions.map((execution) => (
                <article className="grid gap-2 px-4 py-3" key={execution.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{execution.regra?.nome || `Regra ${execution.regraId}`}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{execution.entidadeTipo} #{execution.entidadeId} - versao {execution.regraVersao}</p>
                    </div>
                    <Badge variant={execution.status === "CONCLUIDA" ? "success" : execution.status.includes("FALH") ? "danger" : "neutral"}>{executionStatusLabels[execution.status] || execution.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {execution.jobs.map((job) => (
                      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-1 text-[11px] text-[var(--text-secondary)]" key={job.id}>
                        {actionLabels[job.tipo]}
                        <strong>{executionStatusLabels[job.status] || job.status}</strong>
                        {(job.status === "FALHOU" || job.status === "FALHA_DEFINITIVA") && (
                          <button className="inline-flex items-center text-[var(--primary)] hover:underline" onClick={() => void retryJob(job.id)} type="button">
                            <RotateCcw size={12} /> Retry
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}

function Metric({ label, tone = "neutral", value }: { label: string; tone?: "neutral" | "warning"; value: number }) {
  return (
    <div className={cx("rounded-md border px-3 py-2", tone === "warning" ? "border-amber-200 bg-amber-50" : "border-[var(--border-default)] bg-[var(--bg-muted)]")}>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function buildPayload(form: FormState): AutomationRulePayload {
  return {
    nome: form.nome,
    descricao: form.descricao || null,
    prioridade: Number(form.prioridade || 100),
    gatilho: form.gatilho,
    condicoes: buildConditions(form),
    acoes: [buildAction(form)],
    timezone: form.timezone,
    janela: null,
  };
}

function buildConditions(form: FormState): AutomationCondition[] {
  const conditions: AutomationCondition[] = [];
  if (form.gatilho === "LEAD_CREATED") {
    if (form.origem.trim()) conditions.push({ campo: "origem", operador: "EQUALS", valor: form.origem.trim().toUpperCase() });
    if (form.semResponsavel) conditions.push({ campo: "semResponsavel", operador: "EQUALS", valor: true });
  }
  if (form.gatilho === "LEAD_WITHOUT_FOLLOW_UP") {
    conditions.push({ campo: "tempoSemAcompanhamentoMinutos", operador: "GTE", valor: Number(form.tempoMinutos || 60) });
  }
  if (form.gatilho === "DEAL_STALLED") {
    conditions.push({ campo: "etapa", operador: "EQUALS", valor: form.etapa });
    conditions.push({ campo: "tempoParadoMinutos", operador: "GTE", valor: Number(form.tempoMinutos || 60) });
  }
  return conditions;
}

function buildAction(form: FormState): AutomationAction {
  if (form.acao === "ASSIGN_OWNER") return { tipo: form.acao, usuarioId: Number(form.usuarioId) };
  if (form.acao === "ASSIGN_ROUND_ROBIN") return { tipo: form.acao, usuarioIds: form.usuarioIds };
  if (form.acao === "CREATE_FOLLOW_UP") {
    return {
      tipo: form.acao,
      titulo: form.followUpTitulo,
      descricao: form.followUpDescricao || null,
      delayMinutos: Number(form.followUpDelay || 60),
      prioridade: form.followUpPrioridade,
      tipoAcompanhamento: "RETORNO",
    };
  }
  if (form.acao === "CREATE_INTERNAL_EVENT") return { tipo: form.acao, eventoTipo: form.internalEventType, resumo: form.internalEventSummary };
  return { tipo: form.acao };
}

function ruleToForm(rule: AutomationRule): FormState {
  const firstAction = rule.acoes[0];
  const timeCondition = rule.condicoes.find((condition) => condition.campo === "tempoSemAcompanhamentoMinutos" || condition.campo === "tempoParadoMinutos");
  return {
    ...emptyForm,
    id: rule.id,
    nome: rule.nome,
    descricao: rule.descricao || "",
    prioridade: String(rule.prioridade),
    gatilho: rule.gatilho,
    timezone: rule.timezone,
    origem: String(rule.condicoes.find((condition) => condition.campo === "origem")?.valor || ""),
    semResponsavel: rule.condicoes.some((condition) => condition.campo === "semResponsavel" && condition.valor === true),
    etapa: String(rule.condicoes.find((condition) => condition.campo === "etapa")?.valor || "NOVO"),
    tempoMinutos: String(timeCondition?.valor || "60"),
    acao: firstAction?.tipo || "CREATE_FOLLOW_UP",
    usuarioId: String(firstAction?.usuarioId || ""),
    usuarioIds: firstAction?.usuarioIds || [],
    followUpTitulo: firstAction?.titulo || emptyForm.followUpTitulo,
    followUpDescricao: firstAction?.descricao || "",
    followUpDelay: String(firstAction?.delayMinutos || "60"),
    followUpPrioridade: firstAction?.prioridade || "MEDIA",
    internalEventType: firstAction?.eventoTipo || emptyForm.internalEventType,
    internalEventSummary: firstAction?.resumo || emptyForm.internalEventSummary,
  };
}

function toggleRoundRobinUser(form: FormState, userId: number): FormState {
  return {
    ...form,
    usuarioIds: form.usuarioIds.includes(userId)
      ? form.usuarioIds.filter((id) => id !== userId)
      : [...form.usuarioIds, userId].sort((first, second) => first - second),
  };
}

function conditionLabel(condition: AutomationCondition) {
  if (condition.campo === "tempoSemAcompanhamentoMinutos") return `Tempo sem acompanhamento >= ${condition.valor} min`;
  if (condition.campo === "tempoParadoMinutos") return `Tempo parado >= ${condition.valor} min`;
  if (condition.campo === "semResponsavel") return "Sem responsavel";
  return `${condition.campo} ${condition.operador} ${String(condition.valor)}`;
}

function errorMessage(error: unknown) {
  const apiError = error as ApiHttpError;
  if (apiError?.status === 401) return "Sessao expirada. Entre novamente para continuar.";
  if (apiError?.status === 403) return "Voce nao possui permissao para administrar automacoes.";
  if (apiError?.status === 404) return "Automações ainda não estão habilitadas para esta empresa.";
  if (apiError?.status === 409) return apiError.message || "A regra foi alterada por outra operacao.";
  if (apiError?.status === 422) return apiError.message || "Revise os dados da regra.";
  return "Nao foi possivel atualizar automacoes agora.";
}
