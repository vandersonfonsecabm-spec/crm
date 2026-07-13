import { Bell, Clock3, Flame, MessageCircle, RotateCcw, Search, ShieldCheck, Target, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge, Button, EmptyState, Input, SectionHeader, StatusBadge, Surface, Toolbar } from "../ui";

type AutomationView = "all" | "rules" | "templates";

type AutomationRule = {
  title: string;
  description: string;
  trigger: string;
  action: string;
  icon: ReactNode;
};

type CommercialTemplate = {
  title: string;
  description: string;
  icon: ReactNode;
};

const automationRules: AutomationRule[] = [
  {
    title: "Acompanhamento de proposta",
    description: "Mantém propostas abertas no radar do time comercial.",
    trigger: "Cliente em proposta por 2 dias",
    action: "Gerar lembrete comercial",
    icon: <Bell size={15} />,
  },
  {
    title: "Cliente sem contato",
    description: "Sinaliza clientes que perderam ritmo de relacionamento.",
    trigger: "5 dias sem interação",
    action: "Sinalizar prioridade",
    icon: <Clock3 size={15} />,
  },
  {
    title: "Oportunidade quente",
    description: "Destaca oportunidades com score alto e ticket relevante.",
    trigger: "Score acima de 85",
    action: "Marcar oportunidade quente",
    icon: <Flame size={15} />,
  },
  {
    title: "Carteira em risco",
    description: "Apoia o gestor na revisão de contas com queda de atividade.",
    trigger: "Risco comercial alto",
    action: "Alertar responsável",
    icon: <ShieldCheck size={15} />,
  },
];

const commercialTemplates: CommercialTemplate[] = [
  {
    title: "Recuperar proposta parada",
    description: "Retomada objetiva para negociação sem resposta.",
    icon: <MessageCircle size={14} />,
  },
  {
    title: "Lembrar acompanhamento de hoje",
    description: "Prioriza clientes com janela aberta no dia.",
    icon: <Bell size={14} />,
  },
  {
    title: "Reativar cliente silencioso",
    description: "Sinaliza contas sem contato recente.",
    icon: <RotateCcw size={14} />,
  },
  {
    title: "Marcar oportunidade quente",
    description: "Destaca maior chance de fechamento.",
    icon: <Flame size={14} />,
  },
];

export default function DashboardAutomationsPanel() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<AutomationView>("all");
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

  const filteredRules = useMemo(() => automationRules.filter((rule) => matchesSearch([
    rule.title,
    rule.description,
    rule.trigger,
    rule.action,
  ], normalizedSearch)), [normalizedSearch]);

  const filteredTemplates = useMemo(() => commercialTemplates.filter((template) => matchesSearch([
    template.title,
    template.description,
  ], normalizedSearch)), [normalizedSearch]);

  const showRules = view !== "templates";
  const showTemplates = view !== "rules";
  const hasResults = (showRules && filteredRules.length > 0) || (showTemplates && filteredTemplates.length > 0);

  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden">
        <SectionHeader
          description="Os padrões abaixo são referências documentadas. Nenhuma regra é executada ou publicada por esta tela."
          icon={<Zap size={16} />}
          status={<StatusBadge label="Em preparação" status="planejado" />}
          title="Motor de automação"
        />
        <div className="px-4 py-3 text-[11px] leading-5 text-[var(--text-secondary)]">
          A ativação, a edição e o histórico de execuções dependem de um motor de regras e de contratos de backend ainda não disponíveis.
        </div>
      </Surface>

      <Surface className="p-3">
        <Toolbar>
          <div className="min-w-[240px] flex-[1_1_360px]">
            <Input
              aria-label="Buscar regras e modelos"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar regra, gatilho ou ação..."
              value={search}
            />
          </div>
          <div aria-label="Visualização das automações" className="flex items-center gap-1 rounded-md bg-[var(--bg-muted)] p-1" role="group">
            <ViewButton active={view === "all"} label="Todos" onClick={() => setView("all")} />
            <ViewButton active={view === "rules"} label="Regras" onClick={() => setView("rules")} />
            <ViewButton active={view === "templates"} label="Modelos" onClick={() => setView("templates")} />
          </div>
          {search && <Button leftIcon={<Search size={13} />} onClick={() => setSearch("")} size="sm" variant="secondary">Limpar</Button>}
        </Toolbar>
      </Surface>

      {!hasResults && (
        <Surface>
          <EmptyState
            action={<Button onClick={() => { setSearch(""); setView("all"); }} size="sm" variant="secondary">Limpar consulta</Button>}
            description="Revise o termo ou volte a exibir todos os padrões documentados."
            title="Nenhuma automação encontrada"
          />
        </Surface>
      )}

      {showRules && filteredRules.length > 0 && (
        <Surface className="overflow-hidden">
          <SectionHeader
            description="Gatilhos e respostas comerciais definidos como referência de produto."
            status={<Badge>{filteredRules.length} padrões</Badge>}
            title="Regras documentadas"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left">
              <thead className="bg-[var(--bg-muted)] text-[10px] font-semibold text-[var(--text-muted)]">
                <tr>
                  <th className="w-[34%] px-4 py-2.5">Automação</th>
                  <th className="w-[24%] px-4 py-2.5">Gatilho</th>
                  <th className="w-[27%] px-4 py-2.5">Ação prevista</th>
                  <th className="w-[15%] px-4 py-2.5">Disponibilidade</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule) => (
                  <tr className="border-t border-[var(--border-default)] align-top transition-colors hover:bg-[var(--bg-muted)]" key={rule.title}>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--icon-default)]">{rule.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--text-primary)]">{rule.title}</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{rule.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] leading-4 text-[var(--text-secondary)]">{rule.trigger}</td>
                    <td className="px-4 py-3 text-[11px] leading-4 text-[var(--text-secondary)]">{rule.action}</td>
                    <td className="px-4 py-3"><StatusBadge label="Referência" status="planejado" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {showTemplates && filteredTemplates.length > 0 && (
        <Surface className="overflow-hidden" id="automation-templates">
          <SectionHeader
            description="Ideias de fluxo preservadas como material de planejamento, sem disparo automático."
            icon={<Target size={15} />}
            status={<Badge>{filteredTemplates.length} modelos</Badge>}
            title="Modelos comerciais"
          />
          <div className="divide-y divide-[var(--border-default)]">
            {filteredTemplates.map((template) => (
              <div className="flex items-start gap-3 px-4 py-3" key={template.title}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-muted)] text-[var(--icon-default)]">{template.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{template.title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{template.description}</p>
                </div>
                <Badge className="shrink-0">Modelo</Badge>
              </div>
            ))}
          </div>
        </Surface>
      )}
    </div>
  );
}

function ViewButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`h-7 rounded px-2.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] ${
        active ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function matchesSearch(values: string[], search: string) {
  return !search || values.some((value) => value.toLocaleLowerCase("pt-BR").includes(search));
}
