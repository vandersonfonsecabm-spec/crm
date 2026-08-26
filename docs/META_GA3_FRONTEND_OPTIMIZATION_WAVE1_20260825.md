# GA3 — Onda 1 de otimização do frontend

Data: 25/08/2026  
Escopo: frontend/performance em staging; produção e V1 de propostas fora do lote.

## Estado e paridade

- Branch: `feature/ga3-bundle-release`
- Commit do lote: `57ae45eaf11d0863a95b65770c580b69de18e064`
- Worktree de release: limpo após o commit
- API, schema, migrations, worker e dados reais: não alterados
- Produção Vercel: não publicada nesta onda (`dpl_AzPsrmVSAwQ1FLn9pH1zUaFLM2Dx` permanece READY)
- Produção Railway: não publicada nesta onda

## Evidência de composição

O Dashboard importava eager painéis que só aparecem em rotas raras. A análise do
chunk anterior identificou como maiores superfícies os painéis de Integrações,
Inbox, Agenda, Leads, Usuários, Automações, Propostas e Negócios.

Esta onda separou somente as fronteiras de baixa dependência e uso raro:

- Agenda;
- Estoque;
- Integrações e Site Leads;
- WhatsApp;
- Usuários/perfil;
- Automações;
- Tenants da plataforma.

Inbox, Leads, Negócios e Catálogo permanecem estáticos para uma onda posterior,
porque têm contratos compartilhados e exigem medição própria.

## Correções implementadas

### 1. Lazy loading de painéis raros

Os módulos acima usam `React.lazy` e carregam somente quando a rota os renderiza.
O fallback reutiliza `LoadingState`, preservando o shell, a hierarquia visual e
o estado acessível de carregamento. O rollback é a remoção dos imports dinâmicos.

### 2. Overfetch de clientes

O efeito de clientes agora consulta `/clientes` apenas em:

`dashboard`, `comercial`, `leads`, `clientes`, `kanban` e `agenda`.

Usuários, perfil, Estoque, Integrações, Automações e Tenants não fazem mais essa
consulta apenas por montarem o Dashboard.

## Métricas do build

Antes desta onda:

- entry JS: ~284,38 kB minificado / ~88,96 kB gzip;
- chunk Dashboard: ~589,45 kB / ~145,26 kB gzip.

Depois desta onda:

- entry JS: **284,56 kB / 89,03 kB gzip**;
- chunk Dashboard: **392,66 kB / 98,94 kB gzip**;
- redução do chunk Dashboard: **196,79 kB minificado (~33,4%)**;
- novos chunks de rota: Agenda, Estoque, Integrações, Usuários, Automações,
  Tenants e WhatsApp.

O entry aumentou somente ~0,18 kB minificado; o custo foi deslocado para a rota
que realmente utiliza cada módulo. O warning de chunk acima de 500 kB deixou de
ocorrer nesta build.

## Staging e QA

- Projeto Vercel: `crm-ga3-bundle-staging`
- Deployment final desta onda: `dpl_CWNVTXHoHFeqAtMJNFPg2qSVxKmt` — READY
- Alias: `https://crm-ga3-bundle-staging.vercel.app`
- API: `ga3-bundle-api-ga3-bundle-staging.up.railway.app`
- Rewrite `/api/*`: staging apenas; nenhum rewrite para produção
- O primeiro deploy sem `vercel.json` foi descartado por 404 em deep link.
- O segundo deploy foi descartado porque o build não recebeu `VITE_API_URL=/api`.
- O terceiro deploy incluiu rewrite SPA, headers e `VITE_API_URL=/api` e passou.

Rotas verificadas no bundle final:

- `/visao-geral`;
- `/agenda`;
- `/estoque`;
- `/integracoes`;
- `/usuarios`;
- `/automacoes`.

Todas renderizaram o módulo esperado, sem `NOT_FOUND`, sem erro de chunk e sem
erro/warning no console. No viewport 390×844:

- `scrollWidth=382`;
- `clientWidth=382`;
- overflow horizontal: não observado.

Na rota `/usuarios`, após a correção, não houve nova chamada `/clientes` em uma
janela de 30 segundos. A rota Agenda continua autorizada a buscar clientes,
porque o formulário real de acompanhamento depende dessa lista.

Logs HTTP do staging não registraram respostas 5xx durante a validação.

## Testes

- Focados da onda: **25/25 PASS**;
- TypeScript: PASS;
- ESLint: PASS;
- Vite build: PASS;
- `git diff --check`: PASS;
- QA browser desktop: PASS;
- QA browser mobile 390×844: PASS;
- API staging `/api/health`: 200;
- produção Vercel/Railway: sem alteração.

Uma tentativa da bateria ampla no worktree limpo terminou com 139/150 porque
parte dos testes históricos depende de `node_modules` local e da árvore legada
`src/`, que não é a fonte do frontend atual. Isso foi classificado como gate de
infraestrutura/fixture, não como PASS global; os testes causais da onda foram
reexecutados com as dependências somente leitura compartilhadas e passaram.

## Limitações e próxima onda

- A composição do Inbox, Leads, Negócios e Catálogo ainda não foi dividida.
- Rerenders React, heap soak e long tasks ainda precisam de harness dedicado.
- O staging permanece com flags de comunicação/notificações parcialmente
  desabilitadas; dois endpoints de notificações retornam 404 nesse baseline e
  não foram mascarados por alteração de produção.
- Nenhuma mutação de dados foi feita.

## Resultado

`GA3_FRONTEND_OPTIMIZATION_WAVE1=PASS_WITH_STAGING_QA`  
`DASHBOARD_CHUNK_REDUCTION=33.4%`  
`CLIENT_OVERFETCH_GUARD=PASS`  
`STAGING_ROUTE_QA=PASS`  
`PRODUCTION_UNTOUCHED=TRUE`  
`V1_PROPOSALS_UNTOUCHED=TRUE`
