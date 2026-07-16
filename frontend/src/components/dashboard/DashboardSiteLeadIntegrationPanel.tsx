import { Clipboard, Globe2, Loader2, Plus, RefreshCw, RotateCw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { createSiteFormIntegration, fetchSiteFormIntegrations, getApiBaseUrl, rotateSiteFormPublicId, updateSiteFormIntegration, type SiteFormIntegration } from "../../services/crmApi";
import { Button, EmptyState, ErrorState, Input, LoadingState as BaseLoadingState, StatusBadge, Surface } from "../ui";
import { CommunicationModal } from "../leads-communication/CommunicationOverlay";

type Draft = { nome: string; identificacao: string; origens: string; politicaPrivacidade: string };
const emptyDraft: Draft = { nome: "", identificacao: "", origens: "http://127.0.0.1:4178\nhttp://localhost:4178", politicaPrivacidade: "politica-local-v1" };

function CommunicationOverlay({ mode, ...props }: Omit<ComponentProps<typeof CommunicationModal>, "open"> & { mode?: "modal" }) { void mode; return <CommunicationModal {...props} open />; }
function LoadingState({ className, description }: { className?: string; description: string }) { return <BaseLoadingState className={className} label={description} />; }

export default function DashboardSiteLeadIntegrationPanel() {
  const [items, setItems] = useState<SiteFormIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SiteFormIntegration | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<SiteFormIntegration | null>(null);

  async function load() { setLoading(true); setError(""); try { setItems((await fetchSiteFormIntegrations()).data); } catch (cause) { setError(message(cause, "Não foi possível carregar as integrações do Site.")); } finally { setLoading(false); } }
  useEffect(() => {
    let active = true;
    void fetchSiteFormIntegrations()
      .then((response) => {
        if (!active) return;
        setItems(response.data);
        setError("");
      })
      .catch((cause) => {
        if (active) setError(message(cause, "Não foi possível carregar as integrações do Site."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function openForm(item?: SiteFormIntegration) {
    setEditorOpen(true);
    setEditing(item ?? null);
    setDraft(item ? { nome: item.nome, identificacao: item.identificacao, origens: item.origensPermitidas.join("\n"), politicaPrivacidade: item.politicaPrivacidade } : emptyDraft);
  }

  async function save() {
    setBusy(true); setError("");
    try {
      const payload = { nome: draft.nome, identificacao: draft.identificacao, origensPermitidas: draft.origens.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean), politicaPrivacidade: draft.politicaPrivacidade };
      const saved = editing ? await updateSiteFormIntegration(editing.id, payload) : await createSiteFormIntegration(payload);
      setItems((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setEditorOpen(false); setEditing(null); setDraft(emptyDraft); setToast(editing ? "Integração atualizada." : "Integração criada.");
    } catch (cause) { setError(message(cause, "Não foi possível salvar a integração.")); } finally { setBusy(false); }
  }

  async function toggle(item: SiteFormIntegration) {
    setBusy(true); try { const saved = await updateSiteFormIntegration(item.id, { ativo: !item.ativo }); setItems((current) => current.map((entry) => entry.id === saved.id ? saved : entry)); setToast(saved.ativo ? "Integração ativada." : "Integração desativada."); } catch (cause) { setError(message(cause, "Não foi possível alterar a integração.")); } finally { setBusy(false); }
  }

  async function rotate() {
    if (!rotateTarget) return;
    setBusy(true); try { const saved = await rotateSiteFormPublicId(rotateTarget.id); setItems((current) => current.map((item) => item.id === saved.id ? saved : item)); setRotateTarget(null); setToast("Identificador público rotacionado. O endereço anterior foi invalidado."); } catch (cause) { setError(message(cause, "Não foi possível rotacionar o identificador.")); } finally { setBusy(false); }
  }

  async function copyExample(item: SiteFormIntegration) {
    const endpoint = publicUrl(item);
    const example = `const submissionId = crypto.randomUUID();\nawait fetch("${endpoint}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify({ submissionId, nome, telefone, email, produtoInteresse, mensagem, paginaOrigem: location.href, aceitePoliticaPrivacidade: true, versaoPoliticaPrivacidade: "${item.politicaPrivacidade}" })\n});`;
    await navigator.clipboard.writeText(example); setToast("Exemplo copiado.");
  }

  return (
    <Surface className="p-4" aria-label="Captação de Leads pelo Site">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Globe2 size={16} className="text-[var(--primary)]"/><h2 className="text-sm font-semibold">Formulários do Site</h2></div><p className="mt-1 text-[11px] text-[var(--text-secondary)]">Configure entradas públicas controladas para Leads e Caixa de Entrada.</p></div><div className="flex gap-2"><Button leftIcon={<RefreshCw size={13}/>} onClick={() => void load()} size="sm" variant="secondary">Atualizar</Button><Button leftIcon={<Plus size={13}/>} onClick={() => openForm()} size="sm">Nova integração</Button></div></div>
      {toast && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">{toast}</div>}
      {error && <ErrorState className="mt-3" description={error} onRetry={() => void load()} title="Falha na integração do Site"/>}
      {loading ? <LoadingState className="mt-3" description="Consultando configurações locais."/> : items.length === 0 ? <EmptyState className="mt-3" description="Crie uma integração para gerar um endereço público controlado." icon={<Globe2 size={18}/>} title="Nenhum formulário configurado"/> : <div className="mt-3 grid gap-3 xl:grid-cols-2">{items.map((item) => <article className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold">{item.nome}</p><p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{item.identificacao}</p></div><StatusBadge label={item.ativo ? "Ativa" : "Inativa"} status={item.ativo ? "sucesso" : "inativo"}/></div><dl className="mt-3 grid gap-2 text-[11px]"><Info label="URL pública" value={publicUrl(item)}/><Info label="Identificador público" value={item.publicId}/><Info label="Origens permitidas" value={item.origensPermitidas.join(", ")}/><Info label="Atualizada" value={new Date(item.updatedAt).toLocaleString("pt-BR")}/></dl><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => openForm(item)} size="sm" variant="secondary">Configurar</Button><Button leftIcon={<Clipboard size={13}/>} onClick={() => void copyExample(item)} size="sm" variant="secondary">Copiar exemplo</Button><Button onClick={() => void toggle(item)} size="sm" variant="secondary">{item.ativo ? "Desativar" : "Ativar"}</Button><Button leftIcon={<RotateCw size={13}/>} onClick={() => setRotateTarget(item)} size="sm" variant="secondary">Rotacionar ID</Button></div></article>)}</div>}
      {editorOpen && <CommunicationOverlay description="Defina a origem e a política apresentada pelo formulário." mode="modal" onClose={() => { setEditorOpen(false); setEditing(null); setDraft(emptyDraft); }} title={editing ? "Configurar integração" : "Nova integração do Site"}><div className="space-y-3"><Input label="Nome" value={draft.nome} onChange={(event) => setDraft((current) => ({ ...current, nome: event.target.value }))}/><Input label="Site ou formulário" value={draft.identificacao} onChange={(event) => setDraft((current) => ({ ...current, identificacao: event.target.value }))}/><label className="block text-[11px] font-medium">Origens permitidas<textarea className="mt-1 min-h-24 w-full rounded-md border border-[var(--border-default)] bg-white p-2 text-[12px]" value={draft.origens} onChange={(event) => setDraft((current) => ({ ...current, origens: event.target.value }))}/></label><Input label="Política de privacidade (versão ou URL)" value={draft.politicaPrivacidade} onChange={(event) => setDraft((current) => ({ ...current, politicaPrivacidade: event.target.value }))}/><div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-[11px] text-sky-800"><ShieldCheck size={14} className="mb-1"/>Somente origens exatas cadastradas poderão enviar formulários.</div><div className="flex justify-end gap-2"><Button onClick={() => { setEditorOpen(false); setEditing(null); setDraft(emptyDraft); }} variant="secondary">Cancelar</Button><Button disabled={busy} leftIcon={busy ? <Loader2 className="animate-spin" size={13}/> : <Save size={13}/>} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar"}</Button></div></div></CommunicationOverlay>}
      {rotateTarget && <CommunicationOverlay description="O endereço atual deixará de aceitar submissões imediatamente." mode="modal" onClose={() => setRotateTarget(null)} title="Rotacionar identificador público"><div className="flex justify-end gap-2"><Button onClick={() => setRotateTarget(null)} variant="secondary">Cancelar</Button><Button disabled={busy} onClick={() => void rotate()}>Confirmar rotação</Button></div></CommunicationOverlay>}
    </Surface>
  );
}

function publicUrl(item: SiteFormIntegration) { return `${getApiBaseUrl().replace(/\/$/, "")}${item.endpointPath}`; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">{label}</dt><dd className="mt-0.5 break-all text-[var(--text-primary)]">{value || "Não informado"}</dd></div>; }
function message(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
