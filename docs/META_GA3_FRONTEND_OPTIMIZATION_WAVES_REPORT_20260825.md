# GA3 — relatório de ondas de otimização frontend

Data: 25/08/2026
Worktree: `C:\Users\vande\crm-saas-frontend-bundle-release`
Branch: `feature/ga3-bundle-release`
Head: `55aac370880fb17b46d5da88f6320613bf8e742f`

## Baseline congelada

- V1 proposal/catalog permanece separada e sem deploy.
- O bundle usa a linha do candidato local, não a branch suja
  `feature/postgres-migration-prep`.
- Entry inicial: 284,05 kB minificado / 88,83 kB gzip.
- Dashboard diferido: 589,26 kB / 145,19 kB gzip.
- Baseline `origin/master` pré-split: 869,25 kB / 231,30 kB gzip.
- Redução causal: 67,3% minificado / 61,6% gzip.

## Wave 0 — mapa e baseline

PASS read-only. Build Vite, árvore de rotas/chunks, worktree, testes e limites
foram identificados. A redução de 67,3% é somente do entry inicial; não é uma
redução do total transferível após abrir o Dashboard.

## Wave 1 — split inicial

PASS. `App → Dashboard` usa `React.lazy`, fallback acessível e boundary de erro
com retry. A sessão e as props do Dashboard permaneceram iguais.

Evidência: `198/198` testes frontend, `19/19` autenticação, build, lint, teste focal do split e
revisão adversarial PASS.

## Wave 2 — requests, polling e waterfalls

AUDIT PASS / NO_CHANGE.

- AbortController, cancelamento de polling e troca de conversa já estavam
  implementados no lote anterior.
- Bootstrap de sessão já reutiliza a sessão validada.
- O polling da Inbox já tem intervalo de 20s e cancelamento.
- O fetch de clientes em rotas sem necessidade aparece como candidato de
  medição, mas não foi removido sem benchmark autenticado e regra de dados.
- Nenhuma request foi alterada nesta wave.

## Wave 3 — React/effects/rerenders

AUDIT PASS / NO_CHANGE.

Não existe React Profiler/harness com commits, `actualDuration` ou contador de
renders. Não foram adicionados `useMemo`, `useCallback`, Context ou refactors
sem prova causal.

## Wave 4 — acessibilidade e estados UX

AUDIT SEPARADO / NÃO ALTERADO.

Foram registrados para missão própria:

- labels ausentes em alguns inputs/selects;
- errors sem `aria-live` em Integrações;
- dialogs de Integrações/Agenda sem cobertura completa de foco/Escape;
- sobreposição mobile de modais `z-50` com navegação `z-60`;
- CSV formula injection e hardening de uploads/legacy import.

Esses itens não foram misturados ao lote de bundle porque alteram comportamento,
segurança ou acessibilidade além de bytes/carregamento.

## Wave 5 — code-health e código morto

AUDIT PASS / NO REMOVAL.

Dependências e componentes sem referência textual são apenas candidatos. Nenhum
foi removido porque ainda faltam prova de uso dinâmico, histórico, build e
compatibilidade. Não houve alteração de lockfile ou instalação.

## Wave 6 — preview/release

PASS frontend-only.

- Staging Railway/Vercel isolado validou login sintético, rotas diretas,
  refresh, logout/login, mobile, console e CORS sem requests equivalentes na
  produção.
- O Preview Vercel do SHA da release ficou READY e foi promovido ao Vercel
  oficial sem alterar backend, worker, migration ou V1.
- Não há CI oficial no repositório; os gates locais reproduzíveis foram
  executados no SHA da release.

## Resultado

```text
GA3_FRONTEND_INITIAL_BUNDLE_OPTIMIZATION=PASS
GA3_REQUEST_WAVE=NO_CHANGE_WITH_EXISTING_FIXES
GA3_REACT_RENDER_WAVE=NO_CHANGE_NO_PROFILER
GA3_A11Y_WAVE=SEPARATE_MISSION
GA3_CODE_REMOVAL=NONE_WITHOUT_PROOF
GA3_PREVIEW_RELEASE=PASS
GA3_PRODUCTION_FRONTEND_ONLY=PASS
PRODUCTION_BACKEND=UNCHANGED
```

## Próxima ação segura

Não fazer segundo split enquanto a fronteira de rota não for medida. Métricas
autenticadas de LCP/INP/CLS, memória e chunk failure real permanecem uma missão
posterior de performance.
