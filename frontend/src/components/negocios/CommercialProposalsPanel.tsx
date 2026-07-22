import { CopyPlus, Download, FileText, History, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiHttpError,
  changeCommercialProposalStatus,
  createCommercialProposal,
  duplicateCommercialProposal,
  fetchBusinessProposals,
  fetchCommercialProposal,
  fetchCommercialProposalHistory,
  fetchCommercialProposalPdf,
  updateCommercialProposal,
} from "../../services/crmApi";
import type {
  CommercialProposal,
  CommercialProposalHistory,
  CommercialProposalPayload,
  CommercialProposalStatus,
} from "../../services/crmApi";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Select, Textarea } from "../ui";

type Props = { businessId: number; onChanged?: () => void };
type FormItem = { key: string; descricao: string; quantidade: string; valorUnitario: string; desconto: string };
type ProposalForm = {
  titulo: string;
  descricao: string;
  validade: string;
  descontoGeral: string;
  observacoes: string;
  condicoesComerciais: string;
  itens: FormItem[];
};

const statusLabels: Record<CommercialProposalStatus, string> = {
  RASCUNHO: "Rascunho",
  PRONTA: "Pronta",
  ENVIADA: "Enviada",
  ACEITA: "Aceita",
  RECUSADA: "Recusada",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
};

const nextStatuses: Record<CommercialProposalStatus, CommercialProposalStatus[]> = {
  RASCUNHO: ["PRONTA", "CANCELADA"],
  PRONTA: ["RASCUNHO", "ENVIADA", "ACEITA", "RECUSADA", "CANCELADA"],
  ENVIADA: ["ACEITA", "RECUSADA", "VENCIDA", "CANCELADA"],
  ACEITA: [],
  RECUSADA: [],
  VENCIDA: [],
  CANCELADA: [],
};

export default function CommercialProposalsPanel({ businessId, onChanged }: Props) {
  const [proposals, setProposals] = useState<CommercialProposal[]>([]);
  const [selected, setSelected] = useState<CommercialProposal | null>(null);
  const [history, setHistory] = useState<CommercialProposalHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProposalForm>(() => emptyForm());
  const [statusChoice, setStatusChoice] = useState<CommercialProposalStatus | "">("");
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchBusinessProposals(businessId);
      setProposals(response.data);
    } catch (nextError) {
      setError(proposalErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const previewTotals = useMemo(() => calculatePreview(form), [form]);

  async function selectProposal(id: number) {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const proposal = await fetchCommercialProposal(id);
      setSelected(proposal);
      setHistory(proposal.historico ?? []);
      setEditing(false);
      setShowHistory(false);
      setStatusChoice("");
    } catch (nextError) {
      setError(proposalErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  function beginCreate() {
    setSelected(null);
    setForm(emptyForm());
    setEditing(true);
    setFeedback("");
    setError("");
  }

  function beginEdit() {
    if (!selected) return;
    setForm(formFromProposal(selected));
    setEditing(true);
    setError("");
  }

  async function save() {
    const validation = validateForm(form);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = formPayload(form);
      const proposal = selected
        ? await updateCommercialProposal(selected.id, { ...payload, revisao: selected.revisao })
        : await createCommercialProposal(businessId, payload);
      setSelected(proposal);
      setHistory(proposal.historico ?? []);
      setEditing(false);
      setFeedback(selected ? "Rascunho atualizado." : "Proposta criada como rascunho.");
      await refreshList(proposal.id);
      onChanged?.();
    } catch (nextError) {
      setError(proposalErrorMessage(nextError));
      if (nextError instanceof ApiHttpError && nextError.status === 409 && selected) await selectProposal(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus() {
    if (!selected || !statusChoice) return;
    setBusy(true);
    setError("");
    try {
      const proposal = await changeCommercialProposalStatus(selected.id, statusChoice, selected.revisao);
      setSelected(proposal);
      setHistory(proposal.historico ?? []);
      setStatusChoice("");
      setFeedback(`Status alterado para ${statusLabels[proposal.status]}.`);
      await refreshList(proposal.id);
    } catch (nextError) {
      setError(proposalErrorMessage(nextError));
      if (nextError instanceof ApiHttpError && nextError.status === 409) await selectProposal(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const proposal = await duplicateCommercialProposal(selected.id);
      setSelected(proposal);
      setForm(formFromProposal(proposal));
      setEditing(true);
      setFeedback("Nova versão criada como rascunho.");
      await refreshList(proposal.id);
    } catch (nextError) {
      setError(proposalErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const blob = await fetchCommercialProposalPdf(selected.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (nextError) {
      setError(proposalErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory() {
    if (!selected) return;
    const next = !showHistory;
    setShowHistory(next);
    if (!next || history.length) return;
    try {
      setHistory((await fetchCommercialProposalHistory(selected.id)).data);
    } catch (nextError) {
      setError(proposalErrorMessage(nextError));
    }
  }

  async function refreshList(selectedId: number) {
    const response = await fetchBusinessProposals(businessId);
    setProposals(response.data);
    const listItem = response.data.find((proposal) => proposal.id === selectedId);
    if (listItem && !editing) setSelected((current) => current?.id === selectedId ? { ...current, ...listItem } : current);
  }

  if (loading) return <LoadingState label="Carregando propostas" rows={3} />;
  if (error && !editing && proposals.length === 0) return <ErrorState description="O Negócio permanece disponível." onRetry={() => void load()} title={error} />;

  return (
    <section aria-label="Propostas comerciais" className="space-y-3" data-testid="commercial-proposals-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]"><FileText size={14} /> Propostas comerciais</h3>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Valores calculados pelo servidor e vinculados a este Negócio.</p>
        </div>
        <div className="flex gap-1.5">
          <Button aria-label="Atualizar propostas" disabled={busy} onClick={() => void load()} size="sm" variant="ghost"><RefreshCw size={13} /></Button>
          <Button disabled={busy || editing} leftIcon={<Plus size={13} />} onClick={beginCreate} size="sm">Nova proposta</Button>
        </div>
      </div>

      {feedback && <div aria-live="polite" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">{feedback}</div>}
      {error && <div aria-live="assertive" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">{error}</div>}

      {!editing && proposals.length === 0 && <EmptyState description="Crie um rascunho somente quando houver uma oportunidade comercial confirmada." icon={<FileText size={18} />} title="Nenhuma proposta neste Negócio" />}

      {!editing && proposals.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {proposals.map((proposal) => (
            <button className={`min-w-0 rounded-md border px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${selected?.id === proposal.id ? "border-[var(--primary)] bg-emerald-50/40" : "border-[var(--border-default)] hover:border-[var(--border-strong)]"}`} key={proposal.id} onClick={() => void selectProposal(proposal.id)} type="button">
              <div className="flex items-start justify-between gap-2"><span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{proposal.codigo}</span><ProposalStatus status={proposal.status} /></div>
              <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{proposal.titulo}</p>
              <p className="mt-1 text-[10px] tabular-nums text-[var(--text-muted)]">v{proposal.versao} · {formatMoney(proposal.totalCentavos)}</p>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <ProposalEditor busy={busy} form={form} onCancel={() => { setEditing(false); setError(""); }} onChange={setForm} onSave={() => void save()} totals={previewTotals} />
      )}

      {!editing && selected && (
        <div className="space-y-3 border-t border-[var(--border-default)] pt-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-l-2 border-[var(--primary)] pl-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">{selected.codigo} · versão {selected.versao}</span><ProposalStatus status={selected.status} /></div>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{selected.titulo}</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Válida até {formatDate(selected.validade)} · revisão {selected.revisao}</p>
            </div>
            <div className="text-right"><p className="text-[9px] font-semibold uppercase text-[var(--text-muted)]">Total</p><p className="mt-1 text-base font-semibold tabular-nums text-[var(--text-primary)]">{formatMoney(selected.totalCentavos)}</p></div>
          </div>

          <div className="overflow-hidden rounded-md border border-[var(--border-default)]">
            {selected.itens.map((item) => <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--border-default)] px-3 py-2 text-[11px] last:border-b-0" key={item.id}><div className="min-w-0"><p className="truncate font-medium text-[var(--text-primary)]">{item.descricao}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{item.quantidade} × {formatMoney(item.valorUnitarioCentavos)}{item.descontoCentavos ? ` · desconto ${formatMoney(item.descontoCentavos)}` : ""}</p></div><span className="tabular-nums text-[var(--text-secondary)]">{formatMoney(item.totalCentavos)}</span></div>)}
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--border-default)] text-right text-[10px]">
            <Total label="Subtotal" value={selected.subtotalCentavos} />
            <Total label="Desconto geral" value={selected.descontoGeralCentavos} />
            <Total emphasis label="Total" value={selected.totalCentavos} />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {nextStatuses[selected.status].length > 0 && selected.permissoes.alterarStatus && <Select aria-label="Novo status da proposta" containerClassName="min-w-[180px] flex-1" onChange={(event) => setStatusChoice(event.target.value as CommercialProposalStatus | "")} value={statusChoice}><option value="">Alterar status…</option>{nextStatuses[selected.status].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</Select>}
            {statusChoice && <Button disabled={busy} onClick={() => void updateStatus()} size="sm">Confirmar status</Button>}
            {selected.permissoes.editar && <Button leftIcon={<Save size={13} />} onClick={beginEdit} size="sm" variant="secondary">Editar rascunho</Button>}
            {selected.permissoes.duplicar && <Button disabled={busy} leftIcon={<CopyPlus size={13} />} onClick={() => void duplicate()} size="sm" variant="secondary">Nova versão</Button>}
            <Button disabled={busy} leftIcon={<Download size={13} />} onClick={() => void openPdf()} size="sm" variant="secondary">Abrir PDF</Button>
            <Button leftIcon={<History size={13} />} onClick={() => void toggleHistory()} size="sm" variant="ghost">Histórico</Button>
          </div>

          {showHistory && <ProposalHistory entries={history} />}
        </div>
      )}
    </section>
  );
}

function ProposalEditor({ busy, form, onCancel, onChange, onSave, totals }: { busy: boolean; form: ProposalForm; onCancel: () => void; onChange: (form: ProposalForm) => void; onSave: () => void; totals: { subtotal: number; discount: number; total: number } }) {
  function updateItem(index: number, patch: Partial<FormItem>) {
    onChange({ ...form, itens: form.itens.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  }
  return (
    <div className="space-y-3 border-t border-[var(--border-default)] pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input containerClassName="sm:col-span-2" label="Título" maxLength={160} onChange={(event) => onChange({ ...form, titulo: event.target.value })} placeholder="Ex.: Proposta para renovação de maquinário" value={form.titulo} />
        <Input label="Validade" onChange={(event) => onChange({ ...form, validade: event.target.value })} type="date" value={form.validade} />
        <Input inputMode="decimal" label="Desconto geral (R$)" min="0" onChange={(event) => onChange({ ...form, descontoGeral: moneyInput(event.target.value) })} value={form.descontoGeral} />
        <Textarea containerClassName="sm:col-span-2" label="Descrição curta" maxLength={500} onChange={(event) => onChange({ ...form, descricao: event.target.value })} rows={2} value={form.descricao} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-[var(--text-primary)]">Itens</p><Button leftIcon={<Plus size={12} />} onClick={() => onChange({ ...form, itens: [...form.itens, emptyItem()] })} size="sm" variant="ghost">Adicionar item</Button></div>
        {form.itens.map((item, index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_72px_105px_105px_32px] items-end gap-2 rounded-md border border-[var(--border-default)] p-2.5 max-[640px]:grid-cols-2" key={item.key}>
            <Input containerClassName="max-[640px]:col-span-2" label="Descrição" maxLength={240} onChange={(event) => updateItem(index, { descricao: event.target.value })} value={item.descricao} />
            <Input inputMode="decimal" label="Qtd." min="0.001" onChange={(event) => updateItem(index, { quantidade: decimalInput(event.target.value) })} value={item.quantidade} />
            <Input inputMode="decimal" label="Unitário (R$)" min="0" onChange={(event) => updateItem(index, { valorUnitario: moneyInput(event.target.value) })} value={item.valorUnitario} />
            <Input inputMode="decimal" label="Desconto (R$)" min="0" onChange={(event) => updateItem(index, { desconto: moneyInput(event.target.value) })} value={item.desconto} />
            <Button aria-label={`Remover item ${index + 1}`} disabled={form.itens.length === 1} onClick={() => onChange({ ...form, itens: form.itens.filter((_, itemIndex) => itemIndex !== index) })} size="sm" title="Remover item" variant="ghost"><Trash2 size={13} /></Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--border-default)] text-right text-[10px]">
        <Total label="Subtotal" value={totals.subtotal} />
        <Total label="Descontos" value={totals.discount} />
        <Total emphasis label="Total" value={totals.total} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea label="Condições comerciais" maxLength={1500} onChange={(event) => onChange({ ...form, condicoesComerciais: event.target.value })} rows={3} value={form.condicoesComerciais} />
        <Textarea label="Observações" maxLength={1500} onChange={(event) => onChange({ ...form, observacoes: event.target.value })} rows={3} value={form.observacoes} />
      </div>
      <div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={onCancel} size="sm" variant="ghost">Cancelar</Button><Button disabled={busy} leftIcon={<Save size={13} />} onClick={onSave} size="sm">{busy ? "Salvando…" : "Salvar rascunho"}</Button></div>
    </div>
  );
}

function ProposalHistory({ entries }: { entries: CommercialProposalHistory[] }) {
  if (!entries.length) return <p className="text-[11px] text-[var(--text-muted)]">Nenhuma alteração registrada.</p>;
  return <ol className="space-y-2 border-l border-[var(--border-default)] pl-3">{entries.map((entry) => <li className="text-[10px]" key={entry.id}><p className="font-medium text-[var(--text-primary)]">{historyLabel(entry)}</p><p className="mt-0.5 text-[var(--text-muted)]">{entry.autor.nome} · {new Date(entry.createdAt).toLocaleString("pt-BR")}</p>{entry.observacao && <p className="mt-0.5 text-[var(--text-secondary)]">{entry.observacao}</p>}</li>)}</ol>;
}

function ProposalStatus({ status }: { status: CommercialProposalStatus }) {
  const variant = status === "ACEITA" ? "success" : status === "RECUSADA" || status === "CANCELADA" ? "danger" : status === "VENCIDA" ? "warning" : status === "PRONTA" || status === "ENVIADA" ? "primary" : "neutral";
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}

function Total({ emphasis, label, value }: { emphasis?: boolean; label: string; value: number }) {
  return <div className={`bg-[var(--bg-surface)] px-3 py-2 ${emphasis ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}><p className="text-[9px] font-medium text-[var(--text-muted)]">{label}</p><p className={`mt-0.5 tabular-nums ${emphasis ? "text-sm font-semibold" : "font-medium"}`}>{formatMoney(value)}</p></div>;
}

function emptyForm(): ProposalForm {
  const date = new Date();
  date.setDate(date.getDate() + 15);
  return { titulo: "", descricao: "", validade: date.toISOString().slice(0, 10), descontoGeral: "0,00", observacoes: "", condicoesComerciais: "", itens: [emptyItem()] };
}

function emptyItem(): FormItem {
  return { key: `${Date.now()}-${Math.random()}`, descricao: "", quantidade: "1", valorUnitario: "0,00", desconto: "0,00" };
}

function formFromProposal(proposal: CommercialProposal): ProposalForm {
  return {
    titulo: proposal.titulo,
    descricao: proposal.descricao ?? "",
    validade: proposal.validade.slice(0, 10),
    descontoGeral: centsToInput(proposal.descontoGeralCentavos),
    observacoes: proposal.observacoes ?? "",
    condicoesComerciais: proposal.condicoesComerciais ?? "",
    itens: proposal.itens.map((item) => ({ key: String(item.id), descricao: item.descricao, quantidade: item.quantidade, valorUnitario: centsToInput(item.valorUnitarioCentavos), desconto: centsToInput(item.descontoCentavos) })),
  };
}

function formPayload(form: ProposalForm): CommercialProposalPayload {
  return { titulo: form.titulo.trim(), descricao: form.descricao.trim() || null, validade: form.validade, observacoes: form.observacoes.trim() || null, condicoesComerciais: form.condicoesComerciais.trim() || null, descontoGeralCentavos: inputToCents(form.descontoGeral), itens: form.itens.map((item) => ({ descricao: item.descricao.trim(), quantidade: item.quantidade.replace(",", "."), valorUnitarioCentavos: inputToCents(item.valorUnitario), descontoCentavos: inputToCents(item.desconto) })) };
}

function validateForm(form: ProposalForm) {
  if (!form.titulo.trim()) return "Informe o título da proposta.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.validade)) return "Informe uma validade válida.";
  if (!form.itens.length || form.itens.some((item) => !item.descricao.trim() || Number(item.quantidade.replace(",", ".")) <= 0)) return "Preencha a descrição e a quantidade positiva de todos os itens.";
  const totals = calculatePreview(form);
  if (totals.total < 0) return "Os descontos não podem gerar total negativo.";
  return "";
}

function calculatePreview(form: ProposalForm) {
  const itemTotals = form.itens.map((item) => Math.max(0, Math.round(Number(item.quantidade.replace(",", ".")) * inputToCents(item.valorUnitario)) - inputToCents(item.desconto)));
  const subtotal = itemTotals.reduce((sum, value) => sum + value, 0);
  const discount = inputToCents(form.descontoGeral);
  return { subtotal, discount, total: subtotal - discount };
}

function moneyInput(value: string) {
  const normalized = value.replace(/[^\d,.]/g, "").replace(".", ",");
  const [whole = "", decimals = ""] = normalized.split(",");
  return `${whole.slice(0, 10)}${normalized.includes(",") ? `,${decimals.slice(0, 2)}` : ""}`;
}

function decimalInput(value: string) {
  const normalized = value.replace(/[^\d,.]/g, "").replace(",", ".");
  const [whole = "", decimals = ""] = normalized.split(".");
  return `${whole.slice(0, 9)}${normalized.includes(".") ? `.${decimals.slice(0, 3)}` : ""}`;
}

function inputToCents(value: string) {
  const parsed = Number(value.replace(".", "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function centsToInput(value: number) {
  return (value / 100).toFixed(2).replace(".", ",");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function historyLabel(entry: CommercialProposalHistory) {
  if (entry.acao === "CRIAR") return "Proposta criada";
  if (entry.acao === "ATUALIZAR") return "Rascunho atualizado";
  if (entry.acao === "DUPLICAR_VERSAO") return `Versão ${entry.versao} criada`;
  return `Status: ${entry.statusAnterior ? statusLabels[entry.statusAnterior] : "—"} → ${entry.statusNovo ? statusLabels[entry.statusNovo] : "—"}`;
}

function proposalErrorMessage(error: unknown) {
  if (!(error instanceof ApiHttpError)) return "Não foi possível atualizar as propostas agora.";
  if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error.status === 403) return "Você não tem permissão para operar propostas deste Negócio.";
  if (error.status === 404) return "A proposta ou o Negócio não foi encontrado.";
  if (error.status === 409) return error.message || "A proposta foi alterada por outro usuário.";
  if (error.status === 422) return error.message || "Revise os dados da proposta.";
  return "Não foi possível atualizar as propostas agora.";
}
