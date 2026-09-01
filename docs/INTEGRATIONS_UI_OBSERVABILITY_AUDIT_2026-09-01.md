# Integrações visíveis + observabilidade — auditoria e execução

Data: 2026-09-01
Executor real: `CODEX_ROOT`
Modo: seleção externa confirmada pelo usuário (`MODEL_SELECTION_PRECONDITION=SATISFIED`; atestado de runtime não requerido)
Escopo: visibilidade/verdade de estados, observabilidade restrita e proteção contra ativação externa acidental.

## Resultado executivo

O comando foi auditado, corrigido e executado até a publicação controlada em
staging. A produção não foi publicada nesta rodada. O candidato local está
verde; o staging está saudável e serve o bundle completo. A limitação externa
restante é não haver uma sessão QA autenticada segura para executar o fluxo de
browser autenticado e validar a área de integrações com dados do tenant.

```text
MISSION_COMMAND_AUDIT=PASS_WITH_CORRECTIONS
LOCAL_REGRESSION=PASS
LOCAL_FRONTEND_TESTS=239/239
LOCAL_BACKEND_SUITE=PASS_EXIT_0
FRONTEND_LINT=PASS
FRONTEND_BUILD=PASS
LOCAL_VISUAL_QA=PASS_DESKTOP_MOBILE
STAGING_API_DEPLOY=PASS_FINAL
STAGING_WORKER_DEPLOY=PASS_FINAL_AFTER_START_COMMAND_FIX
STAGING_FRONTEND_DEPLOY=PASS
STAGING_HEALTH=200
STAGING_READY=200_DATABASE_OK
STAGING_AUTHENTICATED_E2E=NOT_EXECUTED_STAGING_SESSION_UNAVAILABLE
PRODUCTION_DEPLOY=NOT_EXECUTED
PRODUCTION_CHANGED_BY_THIS_MISSION=false
REAL_PROVIDER_CONNECTIONS_CREATED=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
```

## Candidato e alvos

```text
BRANCH=feature/canonical-sale-v1
RELEASE_HEAD=bb9ec6da0587793415b6cd25f030e41611cd8dbc
RELEASE_TREE=a520a9aa10f00b84c15bc69ce1ee43261a2ac5bd
BACKEND_SOURCE_MANIFEST_SHA256=4b85aa5cfb0e78c0d64dec37365362e5db4651a1bcde80cce3ce683719a32868
BASELINE_FUNCTIONAL=79eed4f
CANONICAL_SALE=preservada
QA_HARNESS=preservado
```

Staging usado, confirmado por IDs explícitos:

```text
RAILWAY_PROJECT=ddfbf66c-e274-47b1-9493-286232d2f426
RAILWAY_ENVIRONMENT=d6b6f137-cffd-4647-a102-3619fc54133a
API_SERVICE=8af12b8e-4f4d-498c-9ceb-3182417905f8
WORKER_SERVICE=25dab463-52c0-4425-825e-c7dcf6a65332
DATABASE_SERVICE=f3a2862b-2371-4ab3-b4db-1e91680ee3b7
API_DEPLOYMENT=9934b1a7-8dba-4029-9a27-c16e164cd4e6
WORKER_DEPLOYMENT=ebefe2db-ad83-4446-978f-c495c30a0810
VERCEL_PROJECT=prj_AJE06pNRGunJoguCNWee0RgZV6t8
VERCEL_DEPLOYMENT=dpl_4nw8KZFmRqHHL3p6DgvrRJHLaQLT
STAGING_ALIAS=crm-ga3-bundle-staging.vercel.app
```

O backend publicado no deployment `9934b1a7-8dba-4029-9a27-c16e164cd4e6`
permanece causalmente idêntico ao subcommit backend `e044d58`; os deltas até
`bb9ec6d` são somente os ajustes do frontend (fallback de erro e callback
opcional da fixture) e seus testes. O
frontend foi republicado após esse delta.

Produção foi apenas consultada read-only para confirmar o alvo; a API e o banco
oficiais continuam separados do staging. Nenhum deployment, migration ou
escrita de produção foi feito por esta missão.

## Auditoria do comando e correções

O primeiro passe encontrou ações que poderiam iniciar OAuth/sincronização real,
estados de Instagram que caíam para “preparado” após erro, falha parcial que
apagava leituras válidas, ausência de E-mail/IA no quadro, falta de relação
ARIA nas tabs, redaction incompleta e ausência de observabilidade de plataforma.

Correções aplicadas:

- `IntegrationStatusBoard` read-only com WhatsApp, Instagram, Messenger, Bling,
  E-mail e IA, estado canônico textual, última atualização e próximo requisito.
- E-mail passou a usar `/integracoes/email/inbound/status`, tenant-scoped, com
  o lifecycle real (`WAITING_PROVIDER_AUTH`, `ERROR`, `PAUSED`, etc.).
- OAuth, armazenamento de credenciais, teste, sincronização e ações do Bling
  ficam bloqueados enquanto `EXTERNAL_PROVIDER_ACTIVATION_ENABLED` não for
  explicitamente `true`; fora de `NODE_ENV=test` o guard é deny-by-default.
- Status Instagram retorna `canalIntegracaoId` e `credentialConfigured`; erro
  401 invalida a sessão de forma consistente.
- Leituras do Hub usam `Promise.allSettled`; se todas falharem, a tela entra em
  erro em vez de fabricar listas vazias.
- Tabs receberam `role=tablist/tab/tabpanel`, `aria-controls`, foco roving,
  setas/Home/End e alvo mínimo de toque.
- Configuração/metadados legados redigem tokens em chaves, URLs, userinfo,
  query/fragmento OAuth (`state`, `code`, `secret`, `apiKey`, etc.).
- Integração genérica não pode ser criada/alterada como `ATIVA` sem credencial e
  validação bem-sucedida.
- Redaction cobre userinfo de qualquer URI (`postgresql`, `redis`, `amqps` e
  HTTP), além de query/fragmento OAuth; esses valores também são rejeitados em
  configuração legada antes de persistir.
- A saúde do worker considera somente checkpoints operacionais conhecidos, não
  locks/leases de QA ou subsistemas auxiliares.
- O backend não declara Instagram `CONNECTED` sem credencial Meta ativa; o
  fingerprint explicita cobertura por provider e marca IA como não rastreada,
  sem convertê-la em falso `false`.
- Contadores coincidentes de outbox são somados por estado e a revogação local
  de credencial permanece disponível enquanto a ativação externa está pausada.
- O status do Instagram expõe a revisão da credencial ativa e permite
  revogação local tenant-scoped; o Bling permite desativação local segura sem
  iniciar revogação externa quando a ativação está pausada.
- Escritas genéricas de credenciais em POST/PATCH são bloqueadas pelo mesmo
  gate de ativação externa, com código público sanitizado para pausa.
- A superfície antiga de readiness e o card duplicado do WhatsApp foram
  removidos do overview; o `IntegrationStatusBoard` é a fonte canônica dos seis
  providers.
- O fallback de erro do Hub usa o número real de consultas e o componente de
  readiness aceita fixture sem callback de logout, eliminando dois erros de
  runtime observados no modo local.
- Endpoint `/platform/observability/summary` e painel restrito a operador de
  plataforma expõem somente contadores, timestamps, saúde/freshness do worker,
  retries, execuções, webhooks, outbox, erros abertos e estado de credenciais.
- Fingerprint inclui `EXTERNAL_PROVIDER_ACTIVATION_ENABLED` e
  `BLING_EXTERNAL_NETWORK_ENABLED` como flags de outbound.
- Resolver de API aceita o endpoint oficial de staging quando explicitamente
  fornecido no build, evitando `/api` sem rewrite.

A separação por `PLATFORM_ADMIN_EMAILS` permanece uma allowlist operacional
explícita existente no contrato de plataforma; não há elevação automática por
ser `ADMIN` sem estar na allowlist.

## Evidência local

- Suíte frontend: 239 testes, 239 pass.
- ESLint frontend: pass.
- TypeScript/Vite build: pass.
- Suíte backend isolada (`run-isolated-prisma-tests.cjs node-suite`): exit 0,
  sandbox temporário removido e `backend/prisma/dev.db` preservado.
- Focais backend finais: segurança/redaction 5/5, observabilidade 2/2,
  lifecycle Instagram 5/5 e fingerprint 2/2; os demais focais do lote também
  permaneceram verdes na suíte isolada.
- Fixture visual do quadro: seis cards, desktop 1440×900 e mobile 390×844,
  sem overflow e sem erros de console; estados `UNAVAILABLE`,
  `CONFIGURATION_INCOMPLETE`, `DISCONNECTED`, `NOT_CONFIGURED` e
  `READY_TO_CONNECT` foram exercitados, com requisitos explícitos.
- Banco protegido: hash canônico do `backend/prisma/dev.db` permaneceu
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.

## Evidência de staging

Railway confirmou API e worker `SUCCESS/RUNNING`. A API respondeu:

```text
/health = 200 {status:"ok", service:"crm-agro-api"}
/ready  = 200 {status:"ready", database:"ok"}
```

O worker inicialmente falhou porque o upload genérico aplicou o start command
da API. O incidente foi classificado como falha de empacotamento, não de
produto; um bundle temporário sem banco protegido foi criado com
`node src/automations/worker.js` e o deployment final passou.

O frontend de staging teve uma implantação mínima acidental durante a
descoberta da API do conector Vercel. Ela foi imediatamente substituída por um
deployment completo e depois republicada no alvo production do projeto de
staging; o alias final serve `index.html` e todos os assets do build final. A
configuração de API foi corrigida no código para usar o endpoint oficial de
staging quando informado. O root público responde 200 e aponta para o bundle
`index-CTDf6uOx.js`; o refresh sem sessão retorna o 401 esperado.
O metadado do deployment Vercel não expôs um SHA Git; a paridade do frontend
foi verificada pelo build determinístico local, nomes/conteúdo dos assets e
upload explícito para o projeto/alias de staging. Isso não substitui um smoke
autenticado.

Não foi possível executar o E2E autenticado sem uma sessão QA segura no
ambiente do executor. A aba autenticada encontrada foi confirmada como
produção (`crm-murex-six-83.vercel.app`) e não foi reutilizada no staging; a
aba nova do staging exibiu o fluxo de sessão indisponível. A tentativa inicial
de controle do navegador integrado excedeu o tempo e foi classificada como
`BROWSER_CONTROL_FAILURE`, não como falha da aplicação.
Não foram criadas contas, tenants ou credenciais novas em staging para contornar
essa limitação.

## Reviewers e reconciliação

Os reviewers independentes encontraram e o executor corrigiu os pontos de
ativação externa, estados falsos, redaction, E-mail tenant-scoped, freshness do
worker, requisitos de próxima ação, cobertura do fingerprint, contadores de
outbox e revogação local. Uma nova revisão independente foi solicitada para o
SHA final, mas o agente reviewer não retornou dentro da janela operacional e
foi interrompido; isso é uma lacuna externa de evidência, não um PASS.
sem uma sessão autenticada segura, não declarar
`INTEGRATIONS_UI_OBSERVABILITY=COMPLETE` nem promover para produção.

```text
REVIEW_A_LOCAL=FINAL_REVIEW_BLOCKED_REVIEWER_TIMEOUT
REVIEW_B_LOCAL=FINAL_REVIEW_BLOCKED_REVIEWER_TIMEOUT
FINAL_ADVERSARIAL_AUTHENTICATED=NOT_EXECUTED_NO_SAFE_SESSION
FINAL_ADVERSARIAL_REVIEW=BLOCKED_EXTERNAL_REVIEWER_TIMEOUT
PENDING_INTERNAL=0
UNTESTED_INTERNAL=0
FALSE_PASS=0
```

## Próximo gate mínimo

Usar uma sessão QA autenticada já autorizada, sem criar dados fora do harness:

```text
login QA
→ Integrações como ADMIN
→ verificar seis cards e estados da API
→ verificar painel de observabilidade como operador de plataforma
→ confirmar 403 para ADMIN de tenant não allowlisted
→ tabs/refresh/deep-link em desktop e mobile
→ confirmar zero OAuth/provider/outbound
→ revogar sessão QA
```

Depois disso o Sol pode reconciliar o sweep final. Produção continua fora desta
execução até `FINAL_ADVERSARIAL_VERDICT=SHIP` com evidência autenticada.
