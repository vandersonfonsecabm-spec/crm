# STORE-1 — Pente-fino final e reconciliação de release

Data: 2026-08-27
Escopo: candidato local isolado `codex/store1-release-reconcile`
Produção: somente leitura; nenhum push, deploy, migration, variável ou dado foi alterado.

## Veredito executivo

```text
FIXABLE_CODE_FINDINGS=0
LOCAL_CANDIDATE_WORKTREE_CLEAN=true
FRONTEND_REGRESSION=PASS
FRONTEND_BUILD=PASS
FRONTEND_LINT=PASS
ARCHITECTURE_GUARD=PASS
SECURITY_POLICY_TESTS=PASS
DEPENDENCY_AUDIT_HIGH=0
LOCAL_HTTP_SMOKE=PASS
PRODUCTION_TOUCHED=false

SOURCE_RUNTIME_PARITY=BLOCKED
STAGING_REDEPLOY=NOT_EXECUTED
BACKEND_GLOBAL_SUITE=BLOCKED_PROTECTED_FIXTURE_MISSING
BROWSER_RETEST_OF_NEW_UI=UNTESTED_TOOLING_UNAVAILABLE
DEAD_BUTTONS_GLOBAL=UNTESTED_RUNTIME_COVERAGE
STORE1_FINAL_RELEASE_READINESS=BLOCKED
```

O código corrigível encontrado no pente-fino foi resolvido no candidato. O
veredito permanece `BLOCKED` apenas porque ainda não existe uma prova operacional
do artefato publicado e duas validações dependem de ambiente/ferramenta externa.

## Auditoria do comando antes da execução

O comando foi lido integralmente e corrigido antes de executar:

1. A matriz histórica apontava para `c7889848`, enquanto o candidato de release
   estava em outra linhagem. Foi criada uma worktree limpa baseada em
   `3151cec0d3950abd0364e90f340918aca0baf196` e os deltas V1/frontend foram
   aplicados sem usar a worktree principal suja.
2. O candidato inicialmente não continha o lazy loading do Dashboard. O commit
   `30e82bf` foi integrado e os testes de split foram atualizados para aceitar o
   componente lazy sem perder as guardas.
3. A matriz tratava estoque como se houvesse entrada/saída/ajuste manual. O
   backend atual só oferece fontes, sincronização e importação CSV canônica; a
   auditoria foi corrigida para esse contrato, sem inventar feature.
4. `job_retry_scheduled` foi separado de `job_lease_recovered`; restart sozinho
   não é prova de retry transitório.
5. O rewrite hardcoded de produção foi substituído por `vercel.mjs` com allowlist
   de project IDs produção/staging e falha fechada para projeto desconhecido.
6. `VITE_API_URL`, webhook do WhatsApp e CORS foram fechados contra destinos
   arbitrários; headers HSTS e `Cache-Control: no-store` foram tornados
   reproduzíveis.
7. A confirmação CSV que existia somente em chamada direta foi ligada à UI,
   com idempotência, confirmação/cancelamento e criação/validação de fonte.
8. A rota/busca/menu de Automações passou a exigir flag e capability simultâneas.
9. Seis componentes sem consumidor no source atual foram removidos somente após
   busca global sem referência.

## Candidato e linhagem

```text
BASE_RELEASE=3151cec0d3950abd0364e90f340918aca0baf196
FINAL_LOCAL_HEAD=3599a0973ddf9a58e62bb285848f6861768be341
BRANCH=codex/store1-release-reconcile
WORKTREE=C:\Users\vande\AppData\Local\Temp\crm-store1-release-reconcile-20260827
WORKTREE_CLEAN=true
```

Commits funcionais do lote:

```text
182fd4c  perf-dashboard-code-split
271a29f  perf-navigation-latency
0e81c80  fix-frontend-gate-automation-navigation
bae734f  fix-stock-canonical-csv-flow
37b1068  harden_runtime_and_proxy_routing
3599a09  harden_cors_and_remove_proven_dead_ui
```

## Correções realizadas

| ID | Achado | Correção | Reteste |
|---|---|---|---|
| FRS-001 | Candidato sem lazy loading completo do Dashboard | Integração focal dos commits de split, preservando V1 e acessibilidade | `ga3-bundle-split`: 3/3 |
| FRS-002 | Testes exigiam imports síncronos após lazy split | Expectativas atualizadas para guardas e wrappers lazy, sem relaxar contrato | suíte frontend 213/213 |
| FRS-003 | Rewrite `/api/*` hardcoded para produção | `vercel.mjs` raiz/frontend por project ID, fail-closed | 6 testes de configuração |
| FRS-004 | `VITE_API_URL` arbitrária em build de produção | Resolver aceita somente same-origin em produção e localhost/staging aprovados em desenvolvimento | user-security PASS |
| FRS-005 | Webhook de produção aparecia em staging | URL derivada da origem same-origin autorizada (`/api/webhooks/whatsapp`) | resolver + F1UI PASS |
| FRS-006 | CORS aceitava origens malformadas/wildcard | Política isolada, HTTPS exato, falha no startup para configuração inválida | 4/4 testes |
| FRS-007 | Respostas sem `no-store`/HSTS reproduzíveis | Headers globais no backend e Vercel | build/source checks PASS |
| FRS-008 | Estoque CSV não fechava na UI | Criar/validar fonte, preview idempotente, confirmar/cancelar e sync suportado | E4 + build PASS |
| FRS-009 | Automações expostas sem capability/flag | Guardas em rota direta, sidebar, topbar e busca | 213/213 |
| FRS-010 | Seis componentes sem consumidor | Remoção focal após busca global; sem referência residual | build/lint PASS |

## Evidências executadas

### Frontend

```text
FRONTEND_TESTS=213/213 PASS
TYPESCRIPT_VITE_BUILD=PASS
VITE_BUILD_INITIAL_JS=285.72 kB / 89.40 kB gzip
VITE_BUILD_DASHBOARD=393.30 kB / 99.07 kB gzip
LINT=PASS
GIT_DIFF_CHECK=PASS
ARCHITECTURE_GUARD=PASS
```

O aumento pequeno do chunk inicial em relação à baseline anterior é explicado
pelas ações reais de estoque adicionadas à tela lazy; o Dashboard continua fora
do bootstrap e a funcionalidade não foi removida para reduzir bytes.

### Backend e segurança

```text
NODE_CHECK_server.js=PASS
NODE_CHECK_origin-policy.js=PASS
ORIGIN_POLICY_TESTS=4/4 PASS
NPM_AUDIT_FRONTEND_HIGH=0
NPM_AUDIT_BACKEND_HIGH=0
SECRET_SCAN_NEW_FILES=0_MATCHES
```

O runner global `backend/npm test` não pôde iniciar nesta worktree porque o
arquivo protegido `backend/prisma/dev.db` não está presente nela. O runner exige
esse fixture imutável antes de criar a sandbox. O arquivo não foi criado,
copiado nem alterado; isso é uma limitação de ambiente, não foi convertido em
PASS.

### Smoke local

O Vite iniciou em `127.0.0.1:5173`; as rotas `/`, `/estoque`, `/automacoes` e
`/integracoes/whatsapp` responderam `200` com o shell da SPA. O servidor foi
encerrado após o smoke.

A CLI `agent-browser` não está instalada nesta máquina. Por isso não foi
declarado QA visual/authenticated novo para as alterações recentes; a evidência
browser anterior só foi reutilizada onde o código não mudou.

## Inventário reconciliado

```text
BACKEND_ROUTE_DEFINITIONS=229
BACKEND_ROUTE_FILES=16
SERVER_ROUTE_MOUNT_GROUPS=18
FRONTEND_PRIMARY_ROUTE_LITERALS=13
FRONTEND_DETAIL_AND_SUBROUTE_FAMILIES=14
STATIC_INTERACTIVE_TAGS=465 (indicador estrutural, não cobertura comportamental)
PROVEN_DEAD_COMPONENTS_REMOVED=6
```

As famílias adicionais que agora ficam explicitamente cobertas na matriz são:

- Site Lead Capture (painel/configuração/rotação e endpoint público);
- Catálogo comercial e ProductOffer;
- AI Commerce em estado OFF/mock controlado;
- estoque canônico (fontes, validação, sincronização, importação,
  confirmação/cancelamento, freshness, qualidade, regras e avaliações);
- tenants de plataforma e auditoria de capability;
- registro público, import hub e qualidade de dados;
- destinos de notificações para produto/lote/fonte.

Os 465 elementos são apenas um inventário estático de tags interativas. Não são
usados para alegar que cada clique foi exercitado; controles de comportamento
continuam dependentes de QA browser no staging.

## Segurança e isolamento

- Os dois `vercel.json` hardcoded foram removidos; só existe configuração
  programática com upstream selecionado por project ID conhecido.
- Projeto desconhecido ou identidade ausente sem host conhecido falha no build,
  em vez de assumir produção.
- Produção e staging têm upstreams distintos e o proxy permanece same-origin.
- O frontend não aceita URL arbitrária para enviar token em build de produção.
- O webhook do WhatsApp não contém origem Railway no bundle; usa `/api` same-origin.
- CORS rejeita wildcard, HTTP em produção, credenciais embutidas e caminhos.
- API responde com `Cache-Control: no-store`; produção inclui HSTS sem preload.
- Nenhum segredo, token, cookie, dump ou credencial foi impresso ou anexado.
- Produção não recebeu request de teste, escrita, migration, deploy ou variável.

As regras programáticas de Vercel seguem a capacidade documentada de usar
`vercel.mjs` para gerar configuração no build e variáveis de sistema para
seleção de ambiente: [documentação oficial de configuração programática](https://vercel.com/docs/project-configuration/vercel-ts)
e [variáveis de sistema](https://vercel.com/docs/environment-variables/system-environment-variables).

## Pendências honestas

```text
SOURCE_RUNTIME_PARITY=BLOCKED
```

O deployment atual da API Railway de produção foi publicado por upload e seu
metadata não expõe commit Git. O deployment staging histórico também estava
`gitDirty=1`; este candidato ainda não foi enviado/redeployado. Portanto, não é
possível afirmar que o artefato publicado é este SHA.

```text
BACKEND_GLOBAL_SUITE=BLOCKED_PROTECTED_FIXTURE_MISSING
```

O candidato limpo não contém `backend/prisma/dev.db`; o runner oficial para antes
dos testes para proteger esse fixture. A correção segura é disponibilizar o
fixture imutável pelo procedimento do projeto ou executar a suíte em uma
worktree autorizada que já o possua. Não copiar dados para dentro do artefato.

```text
BROWSER_RETEST_OF_NEW_UI=UNTESTED_TOOLING_UNAVAILABLE
DEAD_BUTTONS_GLOBAL=UNTESTED_RUNTIME_COVERAGE
```

Os contratos, testes, build e smoke local passam; a prova final autenticada deve
ser repetida no staging por uma ferramenta browser instalada/autorizada. Não há
bug conhecido nesses dois pontos, mas não há evidência suficiente para fingir
que foram fechados.

Integrações continuam separadas do núcleo interno:

```text
INBOX/LEADS_EXTERNAL_CHANNELS=PENDING_INTENTIONAL_OFF
META_REAL=PENDING_EXTERNAL_PROVIDER
WHATSAPP_REAL=PENDING_EXTERNAL_PROVIDER
INSTAGRAM_REAL=PENDING_EXTERNAL_PROVIDER
FACEBOOK/MESSENGER_REAL=PENDING_EXTERNAL_PROVIDER
AI_REAL_PROVIDER=PENDING_EXTERNAL_PROVIDER
EMAIL_DELIVERY_REAL=PENDING_EXTERNAL_PROVIDER
```

## Próximo passo mínimo e seguro

1. Disponibilizar o `dev.db` protegido conforme o procedimento do projeto e
   repetir somente o runner backend global.
2. Publicar/redeployar este SHA em staging, nunca em produção, mantendo o
   proxy por project ID.
3. Executar QA autenticado em dois contextos de navegador no staging para
   Estoque e Automações, incluindo confirmação/cancelamento CSV, URL direta,
   loading/error e console.
4. Reconciliar o SHA/digest da API/worker/frontend publicados.
5. Só se esses gates passarem, atualizar o veredito para readiness de release.

## Resultado final desta rodada

```text
FINAL_SWEEP_FIXABLE_FINDINGS=0
LOCAL_CANDIDATE=READY_FOR_STAGING_VALIDATION
STORE1_FINAL_RELEASE_READINESS=BLOCKED_BY_OPERATIONAL_EVIDENCE
PRODUCTION_TOUCHED=false
```
