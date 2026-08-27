# Auditoria de prontidão das integrações externas

Data: 2026-08-27
Escopo: auditar WhatsApp, Instagram, Messenger, e-mail, Bling, IA Commerce,
Site Form e a cadeia Vercel/Preview; corrigir falhas internas seguras sem
conectar contas reais ou ativar outbound.

## Veredito executivo

```text
EXTERNAL_INTEGRATIONS_AUDIT=COMPLETE_WITH_PROVIDER_BLOCKERS
COMMAND_AUDIT=PASS
PRODUCTION_WRITE=0
PRODUCTION_DEPLOY=0
REAL_AI_ACCOUNT_CONNECTED=false
REAL_META_ACCOUNT_CONNECTED=false
REAL_EMAIL_PROVIDER_CONNECTED=false
REAL_BLING_ACCOUNT_CONNECTED=false
OUTBOUND_EXTERNAL_MESSAGES=0
```

A base de segurança e os fluxos test-only estão consistentes, mas não seria
correto dizer que todas as integrações estão prontas para uso real. WhatsApp,
Instagram e Messenger possuem intake, isolamento, idempotência e lifecycle
testáveis; Instagram ainda não tinha transporte OAuth real conectado. E-mail
continua sendo somente fundação sintética, e IA continua sem connector real,
como autorizado. Bling tem OAuth/sincronização somente leitura e foi endurecido,
mas ainda exige prova com a conta do provedor e lock distribuído antes de uso
operacional concorrente.

## Auditoria do comando

O comando foi lido integralmente e corrigido antes da execução. As principais
correções de execução foram:

- separar “pronto para configurar” de “E2E pronto com provider real”;
- não transformar mock, fixture ou endpoint existente em prova de conexão real;
- manter IA, Meta, e-mail outbound, pagamentos e ERP desligados;
- auditar o source atual e o deployment atual, sem confiar em SHA histórico;
- tratar falhas corrigíveis com correção focal e reteste;
- manter produção read-only;
- validar arquivos estáticos reais do Preview, não apenas o schema do config;
- não repetir migrations, deploys de produção ou testes já comprovados sem
  mudança relacionada.

## Source e ambientes

```text
BRANCH=codex/store1-release-reconcile
AUDITED_RUNTIME_SHA=4b0b6beeb1d7cc9fa33d072b6dd0eb5e4463329f
REPORT_SHA=2ee92a0
REMOTE_HEAD=2ee92a0
WORKTREE_CLEAN=true
PROTECTED_DEV_DB_LINK=REMOVED

RAILWAY_PRODUCTION_PROJECT=ddfbf66c-e274-47b1-9493-286232d2f426
RAILWAY_PRODUCTION_ENVIRONMENT=e18f76b1-e38f-468e-91fe-1eff6db9a5f8
RAILWAY_STAGING_ENVIRONMENT=d6b6f137-cffd-4647-a102-3619fc54133a
OFFICIAL_POSTGRES=Postgres-u_yI
STAGING_POSTGRES=Postgres--e25
```

Produção permaneceu com API/worker/banco oficiais online. Não houve migration,
alteração de variável, deploy de produção, escrita de dado, conexão de
provedor ou envio externo.

## Vercel: incidente, causa e correção

### Histórico dos e-mails/deploys de erro

Os erros observados eram históricos de configuração, não falhas atuais do
runtime:

| Deployment | Estado | Causa observada |
|---|---|---|
| `dpl_HWLscmYBm4jQwNvGNRy2zbyQ4AuM` | ERROR | `rewrites[0]` sem `destination` |
| `dpl_3sAn3spkEjdnwVexMSPN4TPL8NDB` | ERROR | `headers[0]` sem propriedade `headers` |
| `dpl_EN9PHdksczUCpZZ6Wp3roHvxaX5i` | ERROR | `headers[0]` sem propriedade `headers` |
| `dpl_DSHbuv91B2sH69PUJDBhWtkwRfDt` | ERROR | configuração antiga inválida |
| `dpl_9CeZFEEYH2aUgrs76XBAWvnNtuCD` | ERROR | root directory procurou `frontend/package.json` no caminho errado |

### Falha funcional encontrada no Preview

O Preview de staging respondia 200, mas o catch-all da SPA reescrevia
`/assets/*.js` e `/assets/*.css` para `index.html`. O HTML chegava, porém o
React não montava e a tela ficava branca. O teste anterior validava somente a
estrutura compilada do config e não o conteúdo/MIME dos assets publicados.

### Correção aplicada

Os dois configs (`vercel.mjs` da raiz e `frontend/vercel.mjs`) agora mantêm a
ordem:

```text
headers
→ /api/* proxy
→ handle: filesystem
→ fallback /index.html
```

O Vercel documenta `handle: "filesystem"` como a fase que permite servir o
arquivo estático antes do fallback; a regra foi aplicada somente ao roteamento
do Preview/projeto, sem alterar o alias de produção.

### Prova pós-correção

```text
STAGING_VERCEL_DEPLOYMENT=dpl_93YQPNrgEbSoPvDJFxRQFUhwxQVn
STAGING_VERCEL_STATE=READY
STAGING_VERCEL_SOURCE_SHA=4b0b6beeb1d7cc9fa33d072b6dd0eb5e4463329f
ROOT_INDEX=200
MAIN_JS=200, Content-Type=application/javascript
MAIN_CSS=200, Content-Type=text/css
DASHBOARD_CHUNK=200, Content-Type=application/javascript
STAGING_RUNTIME_ERRORS_24H=0
PRODUCTION_RUNTIME_ERRORS_24H=0
```

Um path de JS de um build antigo foi testado por engano uma vez e retornou
`index.html`; ele não existia no deployment novo. A checagem foi corrigida para
usar exatamente os paths publicados no `index.html` atual, que passaram.

## Matriz de prontidão

| Integração | Evidência interna | Estado honesto | O que falta para real |
|---|---|---|---|
| WhatsApp inbound | HMAC, content-type/limites, tenant mapping, retry/CAS/lease, cadeia Inbox/360 e testes 6/6 | `READY_FOR_PROVIDER_CONFIGURATION` / `PENDING_EXTERNAL_PROVIDER` | credencial Meta autorizada, callback verificado e piloto real |
| Instagram inbound/OAuth | intake/lifecycle/testes 8/8, state persistente, URL allowlistada, status dinâmico no painel | `READY_FOR_PROVIDER_CONFIGURATION` / `PENDING_EXTERNAL_PROVIDER` | transporte Meta real, App/secret/redirect e subscription real |
| Messenger inbound | intake/lifecycle/testes 9/9, PSID/page binding, tenant isolation | `READY_FOR_PROVIDER_CONFIGURATION` / `PENDING_EXTERNAL_PROVIDER` | Page token, Graph validation e política de outbound |
| E-mail inbound | MIME parser/sanitização/threading/replay sintético; testes 9/10 + 5/6 | `PARTIAL` / `PENDING_EXTERNAL_PROVIDER` | escolher Gmail API, Graph ou IMAP; ingress autenticado; cursor/ack/retry |
| Bling | OAuth state, cifragem, refresh, paginação, leitura; integração 13/13 | `READY_FOR_PROVIDER_CONFIGURATION` com advisory operacional | conta real, sandbox/provider E2E e lock distribuído de sync |
| IA Commerce | mock determinístico, ferramentas bounded, aprovação humana, outbound 0 | `INTENTIONAL_OFF` / `PENDING_EXTERNAL_PROVIDER` | adapter, segredo, timeout/retry, PII/retention, validação de saída e anti-replay real |
| Site Form | origem same-origin, rate limit, persistência e testes existentes | `PASS` | nenhum provider externo necessário |

## Correções implementadas neste lote

### Retry Meta recuperado

Foi corrigido um bug real nos três canais: uma falha transitória seguida de
sucesso deixava `lastFailureAt/lastFailureCode` no canal, mantendo o estado
operacional em erro. O intake também atualizava `lastWebhookAt` em replay, o que
confundia a janela de falha.

Correções:

- `EventoWebhook.recebidoEm` passa a usar o timestamp do intake;
- replay idempotente não altera `lastWebhookAt`;
- sucesso limpa falha somente quando o canal ainda aponta para aquele webhook;
- uma falha de evento mais novo nunca é apagada por um retry antigo;
- o mesmo comportamento foi aplicado a WhatsApp, Instagram e Messenger.

### Segredos fracos

Os gates públicos e lifecycles Meta agora exigem segredo/verify token com pelo
menos 8 caracteres, alinhado ao gate de credenciais já existente. Nenhum segredo
foi criado ou lido em produção.

### Instagram

- foi adicionado o endpoint administrativo tenant-scoped
  `/integracoes/instagram/status`;
- o painel consulta o status real e usa fallback local somente quando o ambiente
  está indisponível;
- estados `CONNECTED`, `WAITING_META_AUTH`, `ERROR`, `PAUSED` e
  `NOT_CONFIGURED` não são mais mascarados como “preparado”;
- nomes de configuração `META_INSTAGRAM_*` e aliases documentados
  `INSTAGRAM_*` são aceitos de forma explícita.

### Bling

- resposta OAuth incompleta agora falha fechado;
- refresh pode manter o refresh token anterior quando o provider não o rotaciona;
- validade numérica inválida é rejeitada;
- preços usam conversão inteira com `ROUND_HALF_UP`, sem float, truncamento ou
  preço negativo;
- sincronização `CONCLUIDA_COM_ERROS` não atualiza `ultimoSucessoEm`.

### IA frontend

Resultados de execução não são mais classificados automaticamente como
`MOCK_AVAILABLE`. O frontend só exibe mock quando o backend o declara
explicitamente; caso contrário usa `NOT_CONNECTED`.

## Evidência de testes

```text
FRONTEND_TESTS=213/213 PASS
FRONTEND_BUILD=PASS
FRONTEND_LINT=PASS
VERCEL_CONFIG_TESTS=6/6 PASS
META_PROVIDER_TRANSPORT=9/9 PASS
META_OAUTH_SUITE=18/18 PASS
WHATSAPP_INBOUND_WEBHOOK=6/6 PASS
INSTAGRAM_INBOUND_WEBHOOK=8/8 PASS
MESSENGER_INBOUND_WEBHOOK=9/9 PASS
BLING_CONTRACT_HARDENING=2/2 PASS
BLING_INTEGRATION=13/13 PASS
NODE_SYNTAX_CHECK=PASS
NPM_AUDIT_BACKEND_HIGH=0
NPM_AUDIT_FRONTEND_HIGH=0
```

Uma execução da suíte backend ampla chegou a executar todos os testes exibidos
sem falha até a superfície perder o stdout e deixar um processo órfão. O
processo foi encerrado, o hardlink temporário do `dev.db` removido e o resultado
não foi contado como PASS global. Os testes focados afetados têm evidência
completa e passaram após as correções.

## Segurança e limites restantes

Confirmado:

- nenhum token de Meta/IA/e-mail/Bling foi impresso ou persistido em relatório;
- credenciais Meta permanecem cifradas e tenant/channel-scoped;
- webhooks usam HMAC, limites e fail-closed;
- nenhum outbound real foi chamado;
- produção e o banco oficial permaneceram intactos;
- CORS de Preview efêmero continua limitado: QA autenticado deve usar o alias
  staging permitido, sem wildcard amplo;
- não há outbox/ledger produtivo ligado ao envio Meta;
- aprovação IA ainda usa o contrato de fundação e precisa de token server-side
  real antes de provider real;
- e-mail real não tem adapter/ack/ingress montado;
- sincronizações Bling concorrentes ainda precisam de coordenação distribuída.

Esses itens não foram “resolvidos” por mock ou alteração cosmética; permanecem
explicitamente bloqueadores de provider/produção para não induzir uma conexão
insegura.

## Git e deploy

```text
RUNTIME_COMMIT=4b0b6beeb1d7cc9fa33d072b6dd0eb5e4463329f
REPORT_COMMIT=2ee92a0
PUSH=PASS (origin/codex/store1-release-reconcile)
STAGING_VERCEL_PREVIEW=PASS
PRODUCTION_DEPLOY=NOT_EXECUTED
PRODUCTION_ALIAS_CHANGED=false
PRODUCTION_API_CHANGED=false
PRODUCTION_DB_CHANGED=false
```

## Resultado final

```text
EXTERNAL_INTEGRATIONS_READINESS=COMPLETE_WITH_PROVIDER_BLOCKERS
VERCEL_DEPLOY_ERRORS_CURRENT=0
VERCEL_HISTORICAL_ERRORS=FIXED_IN_CANDIDATE
INTERNAL_SECURITY_REGRESSIONS=0
REAL_PROVIDER_E2E=NOT_CLAIMED
AI_REAL_CONNECTION=DEFERRED_AS_REQUESTED
NEXT_SAFE_STEP=provider-specific activation runbook and sandbox E2E
```
