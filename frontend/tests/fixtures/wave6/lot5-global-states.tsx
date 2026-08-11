import { AlertTriangle, CheckCircle2, LockKeyhole, PackageX, SearchX, ShieldAlert } from "lucide-react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Select, StatusBadge, Surface, Textarea } from "../../../src/components/ui";
import "../../../src/index.css";

const root = document.getElementById("root");

if (!root) throw new Error("WAVE6_GLOBAL_STATES_ROOT_MISSING");

export function FixtureState({ children, state, title }: { children: ReactNode; state: string; title: string }) {
  return (
    <Surface className="min-w-0 overflow-hidden" data-wave6-state={state}>
      <header className="border-b border-[var(--border-default)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">QA sintético e somente leitura</p>
      </header>
      {children}
    </Surface>
  );
}

createRoot(root).render(
  <main className="min-h-screen bg-[var(--bg-app)] p-4 md:p-6" data-wave6-fixture="global-states">
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Wave 6 · QA local · sem sessão, token, cookie, fetch ou mutação</p>
        <h1 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Estados globais</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Amostras de feedback e controles para revisão visual; não representam novos contratos de produto.</p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <FixtureState state="filled" title="Conteúdo operacional">
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--text-primary)]">Registro disponível</p><p className="mt-1 text-xs text-[var(--text-muted)]">Dados preenchidos usam estrutura neutra e números tabulares.</p></div><Badge variant="info">Contexto</Badge></div>
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--border-default)] pt-3 text-xs"><span className="text-[var(--text-muted)]">Prazo</span><span className="text-right font-semibold tabular-nums text-[var(--text-primary)]">14:30</span><span className="text-[var(--text-muted)]">Situação</span><span className="text-right font-semibold text-[var(--text-primary)]">Em andamento</span></div>
          </div>
        </FixtureState>

        <FixtureState state="empty" title="Vazio real"><EmptyState description="Nenhum registro foi criado para esta área ainda." title="Nenhum item disponível" /></FixtureState>
        <FixtureState state="no-results" title="Sem resultado"><EmptyState description="A busca e os filtros atuais não retornaram registros." icon={<SearchX size={18} />} state="no-results" title="Nenhum resultado para este filtro" /></FixtureState>
        <FixtureState state="error"><ErrorState description="Não foi possível concluir a consulta. Nenhuma alteração foi feita." title="Falha ao carregar" /></FixtureState>
        <FixtureState state="restricted"><EmptyState description="A permissão atual não permite consultar esta informação." icon={<LockKeyhole size={18} />} state="restricted" title="Acesso restrito" /></FixtureState>
        <FixtureState state="unavailable"><EmptyState description="A origem necessária não está disponível neste momento." icon={<PackageX size={18} />} state="unavailable" title="Recurso indisponível" /></FixtureState>
        <FixtureState state="loading"><LoadingState className="p-4" label="Carregando dados sintéticos" rows={3} /></FixtureState>
        <FixtureState state="selected" title="Seleção e foco">
          <div className="space-y-2 p-4">
            <button aria-current="true" className="w-full rounded-[5px] border border-[var(--selected-border)] border-l-[3px] border-l-[var(--selected-marker)] bg-[var(--selected-subtle)] px-3 py-2.5 text-left text-xs font-semibold text-[var(--selected-text)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" type="button">Registro selecionado · tonal + marcador + peso</button>
            <button className="w-full rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" type="button">Registro neutro</button>
          </div>
        </FixtureState>
        <FixtureState state="disabled" title="Desabilitado">
          <div className="grid gap-3 p-4"><Input disabled label="Campo indisponível" value="Sem permissão de edição" readOnly /><Select disabled label="Seleção indisponível" value="bloqueado"><option value="bloqueado">Sem alteração</option></Select><Button disabled size="sm">Ação indisponível</Button></div>
        </FixtureState>
        <FixtureState state="semantic" title="Sinais semânticos">
          <div className="flex flex-wrap items-center gap-2 p-4"><StatusBadge status="sucesso" /><StatusBadge status="alerta" /><StatusBadge status="erro" /><Badge variant="info"><ShieldAlert size={12} />Contexto</Badge><Badge variant="warning"><AlertTriangle size={12} />Atenção</Badge><Badge variant="danger"><AlertTriangle size={12} />Risco</Badge><Badge variant="success"><CheckCircle2 size={12} />Concluído</Badge></div>
        </FixtureState>
        <FixtureState state="field-focus" title="Campo e leitura">
          <div className="grid gap-3 p-4"><Input label="Campo de busca" placeholder="Digite para revisar o foco" /><Textarea label="Observação" placeholder="Placeholder legível e sem ação" /><Button size="sm">Ação existente</Button></div>
        </FixtureState>
      </div>
    </div>
  </main>,
);
