# Integrações visíveis e observabilidade — relatório canônico final

Data: 2026-09-01  
Escopo: staging do CRM; nenhuma promoção para produção.  
Executor real: `CODEX_ROOT`. A seleção de modo/modelo foi uma pré-condição confirmada pelo usuário; não há atestado de runtime e não se afirma execução por Luna Max.

## Decisão e escopo

O comando foi auditado antes da execução. A missão foi limitada à superfície de
Integrações e à observabilidade autenticada em staging. Todos os registros da
aplicação usados no QA são sintéticos. Railway, Vercel, banco, credenciais de
infraestrutura e qualquer conta de provider continuam tratados como reais.

```text
MISSION_COMMAND_AUDIT=PASS_WITH_CORRECTIONS
CANONICAL_SALE_V1=CLOSED_UNTOUCHED
QA_PRODUCTION_HARNESS=CLOSED_UNTOUCHED
PRODUCTION_CHANGED=false
REAL_PROVIDER_CONNECTIONS_CREATED=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
```

## Candidato e paridade

```text
BRANCH=feature/canonical-sale-v1
RELEASE_HEAD=a3458c232283f68ca2894b1986ced9f581c8798d
RELEASE_TREE=8ca0d6fb61e159267ac974f26fd1f83db5d0ff70
BACKEND_CAUSAL_HEAD=e044d5852de15ad52b69f4025db9b80b3fec822b
BASELINE_FUNCTIONAL=79eed4f
FRONTEND_SOURCE_FIX=API fallback canônico de staging + teste de regressão
REMOTE_BRANCH_SHA=a3458c232283f68ca2894b1986ced9f581c8798d
```

O frontend recebeu uma correção mínima porque o bundle estático publicado
resolvia a API para `/api`, mas o projeto de staging não tinha rewrite ativo.
O resolver agora fixa o host oficial de staging quando o hostname canônico é
reconhecido; o deploy também recebeu `vercel.json` com filesystem fallback,
SPA deep-link e rewrite `/api`. O teste legado que esperava o componente
removido `WhatsAppIntegrationCard` foi alinhado ao `LazyWhatsAppConnectionPanel`.

## Evidência local

```text
FRONTEND_TESTS=239/239 PASS
FRONTEND_LINT=PASS
FRONTEND_BUILD=PASS
BACKEND_ISOLATED_SUITE=PASS_EXIT_0
PROTECTED_DEV_DB_HASH=6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533
```

## Alvos e deployments de staging

```text
RAILWAY_PROJECT=ddfbf66c-e274-47b1-9493-286232d2f426
RAILWAY_ENVIRONMENT=d6b6f137-cffd-4647-a102-3619fc54133a
RAILWAY_API_SERVICE=8af12b8e-4f4d-498c-9ceb-3182417905f8
RAILWAY_WORKER_SERVICE=25dab463-52c0-4425-825e-c7dcf6a65332
RAILWAY_DATABASE_SERVICE=f3a2862b-2371-4ab3-b4db-1e91680ee3b7
RAILWAY_API_DEPLOYMENT_AFTER_CLEANUP=460b39a2-629b-43e6-accc-affb7b182010
RAILWAY_WORKER_DEPLOYMENT=ebefe2db-ad83-4446-978f-c495c30a0810
VERCEL_PROJECT=prj_AJE06pNRGunJoguCNWee0RgZV6t8
VERCEL_DEPLOYMENT=dpl_AksDEPAeM6a6WoesaF3dA1fZp6GK
STAGING_ALIAS=crm-ga3-bundle-staging.vercel.app
```

Verificações read-only após a publicação:

```text
GET /                       = 200
GET /api/health             = 200
GET /integracoes            = 200 (SPA deep-link)
GET Railway /health         = 200
GET Railway /ready          = 200
Vercel runtime errors (2h)  = none
```

O HTML, o JavaScript principal e o CSS publicados foram comparados byte a
byte com o build local:

```text
index.html                 479/479 bytes  SHA-256 1ee21f34c9c572eda4167d6554b40d8b1c115ebccefede132dffd7dfd645d660
assets/index-C7jV2jGh.js   287275/287275  SHA-256 2659b0dd2206430156b3ec32825ef75488c0fffe7c0908804019607ea3c9f3ab
assets/index-BEaUgWO8.css  92545/92545    SHA-256 f36904c468185ce582fd7ff0357cc5737c021a20bce6a93fb49da7c8ccdf2072
SOURCE_RUNTIME_PARITY=PASS_FOR_PUBLISHED_ASSETS
```

## QA autenticado executado

Foi aberto um run de QA somente em staging com dois tenants sintéticos e cinco
identidades temporárias. O ADMIN de QA autenticou no alias de staging depois da
correção do fallback de API. O operador de plataforma autenticou em uma aba
separada e acessou a área técnica.

### Estados dos seis providers

Os estados visuais foram comparados às respostas tenant-scoped da API, sem
tratar erro de leitura como conexão:

| Provider | API observada | UI observada | Resultado |
|---|---:|---|---|
| WhatsApp | 404 `NOT_FOUND` | Indisponível / estado não confirmado | coerente |
| Instagram | 200 `NOT_CONFIGURED` | Não conectado | coerente |
| Messenger | 404 `NOT_FOUND` | Indisponível / estado não confirmado | coerente |
| Bling | 200, lista vazia | Não conectado | coerente |
| E-mail | 200 `NOT_CONFIGURED` | Não conectado | coerente |
| IA Comercial | 404 `AI_COMMERCE_DISABLED` | Desativado | coerente |

O quadro mostrou explicitamente que é somente leitura e que a ativação externa
está bloqueada. O botão de atualização repetiu a leitura sem iniciar OAuth ou
sincronização.

```text
STAGING_QA_AUTHENTICATED_SESSION=PASS
INTEGRATION_STATUS_TRUTH=PASS_AUTHENTICATED
FALSE_CONNECTED_STATES=0
USER_OBSERVABILITY=PASS_AUTHENTICATED
SECRET_FRONTEND_EXPOSURE=0
QA_OAUTH_STARTED=0
QA_PROVIDER_REQUESTS=0
QA_PROVIDER_CONNECTIONS_CREATED=0
QA_PROVIDER_CREDENTIALS_USED=0
QA_OUTBOUND=0
GLOBAL_BLING_CHANGED=false
```

### Observabilidade de plataforma e RBAC

Com o operador temporário, `/platform/tenants` exibiu `Observabilidade técnica`
em modo somente leitura, com worker/checkpoints, leases, retries, execuções,
webhooks, outbox, erros e estado de credenciais sanitizados. O painel reportou
corretamente `Worker sem checkpoint persistido` como alerta; isso não foi
convertido em “saudável”.

O mesmo endpoint chamado com o token do ADMIN comum de QA retornou 403
`PLATFORM_FORBIDDEN`. O tenant ADMIN não recebeu acesso por ser ADMIN.

```text
PLATFORM_OBSERVABILITY=PASS_AUTHENTICATED_OPERATOR
PLATFORM_ADMIN_TENANT_BYPASS=0
PLATFORM_OBSERVABILITY_REDACTION=PASS
```

### Navegação e acessibilidade observadas

As tabs Conexões/Importações/Catálogo/Simulador foram alternadas e o painel
permaneceu isolado. ArrowRight, Home e End mudaram a seleção ARIA corretamente.
O deep-link `/integracoes` respondeu 200 no servidor e carregou no shell
autenticado.

```text
INTEGRATION_TABS=PASS
KEYBOARD_TABS=PASS
ARIA_TAB_CONTRACT=PASS
DEEP_LINK_ROUTE=PASS
```

A capability de viewport do conector Chrome não alterou o viewport efetivo
(as cinco tentativas reportaram 746×678). Portanto, a matriz live
390×844/900×768/1366×768/1440×900/1920×1080 não pode ser declarada como
completamente executada neste conector. As fixtures visuais locais existentes
cobrem 390×844 e 1440×900.

```text
VIEWPORT_CONTROL=UNAVAILABLE_IN_CHROME_CONNECTOR
STAGING_BROWSER_QA=PASS_WITH_VIEWPORT_LIMITATION
CONSOLE_ERRORS=NOT_OBSERVABLE_BY_CONNECTOR
```

`CONSOLE_ERRORS` não é tratado como zero sem telemetria; não houve erro visual
ou runtime error retornado pelo Vercel no período consultado.

## Cleanup e isolamento

Depois dos testes, a revogação foi executada com atestado fresco, em transação,
e o operador também foi revogado. O allowlist temporário de plataforma foi
removido do serviço API e o serviço foi redeployado para carregar a remoção.

Inventário read-only final no PostgreSQL de staging:

```text
qa-prod-canonical-a             REVOKED  activeUsers=0 activeSessions=0 activeRefreshTokens=0 activeIntegrations=0 activeChannels=0 pendingOutbox=0 totalWebhooks=0 activeLeases=0
qa-prod-canonical-b             REVOKED  activeUsers=0 activeSessions=0 activeRefreshTokens=0 activeIntegrations=0 activeChannels=0 pendingOutbox=0 totalWebhooks=0 activeLeases=0
qa-platform-operator-staging   REVOKED  activeUsers=0 activeSessions=0 activeRefreshTokens=0 activeIntegrations=0 activeChannels=0 pendingOutbox=0 totalWebhooks=0 activeLeases=0
PLATFORM_ADMIN_EMAILS_RUNTIME=ABSENT
```

Os tenants sintéticos permanecem retidos e inativos para futuros testes. As
credenciais temporárias não fazem parte deste relatório; os arquivos locais
de credencial/atestado e scripts operacionais devem estar ausentes antes do
encerramento do lote.

## Reviewers e gate final

As revisões históricas corrigiram os findings conhecidos (redaction, estado
Instagram, fingerprint, outbox, revogação local, gate genérico e card
duplicado). Duas revisões novas e independentes foram abertas para o SHA
`a3458c2`: Reviewer A (UI/UX) e Reviewer B (segurança/runtime). Elas devem
retornar `PASS` ou `FIX_FIRST`; nenhum agente executor pode autocertificar a
própria mudança.

Enquanto os reviewers novos não retornarem e a limitação de console/viewport
não tiver evidência equivalente, o estado honesto é:

```text
REVIEW_A_FINAL=IN_PROGRESS
REVIEW_B_FINAL=IN_PROGRESS
FINAL_ADVERSARIAL_VERDICT=NOT_EXECUTED
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
```

Não houve alteração de produção, migration oficial, provider real, credencial
real de produto ou outbound.

## Addendum — correção do finding de segurança (13:50–13:52 BRT)

O Reviewer B encontrou um vazamento reproduzível em `reason` de auditoria:
URLs com `userinfo` podiam ser persistidas por `setTenantFeature` e retornadas
pela auditoria de plataforma; o mesmo limite existia no `sanitizeReason` do
lifecycle de E-mail. O finding foi classificado como falha funcional de
segurança, não como falha de navegador.

Correção aplicada em `35cf6cef70489a4c55f4c4fa257c5c17b982d773` (tree
`bf1420363e9bc2e48685927f6613c506454f46ab`):

- novo `backend/src/security/auditReason.js` compartilhado;
- redaction de URI com qualquer esquema, inclusive userinfo vazio, query e
  fragmento;
- redaction de bearer/JWT e pares sensíveis (`state`, `signature`, `code`,
  `secret`, `credential`, etc.);
- sanitização na escrita e na leitura da auditoria de capabilities;
- `emailFoundation.sanitizeReason` reutiliza a mesma fronteira;
- testes unitários e teste HTTP de auditoria cobrem o payload malicioso.

Retestes causais:

```text
AUDIT_REASON_REDACTION_TEST=2/2 PASS
PLATFORM_OPERATIONS_H7_1=PASS
EMAIL_INBOUND_LIFECYCLE=5 PASS, 1 SKIP PostgreSQL descartável
BACKEND_NODE_SUITE=PASS_EXIT_0
```

O backend foi republicado somente no staging como deployment
`e666eff2-7fa0-452b-b0f4-83c96d3d8ad6`, `SUCCESS`; `/health=200`, `/ready=200`
e endpoint protegido sem token continua 401. Um smoke read-only dentro do
container confirmou que a nova função redige `userinfo` e devolve somente
`credentialsInOutput=0`. Nenhuma alteração de produção ocorreu.

O allowlist temporário já havia sido removido; tenants, operador, sessões,
tokens, integrações, outbox, webhooks e leases permanecem revogados/zerados.
Duas novas revisões independentes foram abertas sobre o SHA `35cf6ce`; o
adversarial final e a reconciliação do Sol continuam pendentes até seus
retornos.

## Addendum — correções de produto da revisão A e rechecagem autenticada

O Reviewer A encontrou três problemas de apresentação, corrigidos sem alterar
contratos de dados:

- códigos internos de `nextRequirement` agora recebem rótulos humanos no quadro
  dos seis providers;
- o filtro de Importações mostra “Mapeamento pendente”, “Concluído com erros”
  etc., mantendo os valores internos somente no atributo de seleção;
- o vazio do card de credenciais agora diz “Nenhuma credencial configurada.”,
  em vez de reutilizar “Nenhuma operação pendente.”.

Os testes frontend focal e a suíte completa voltaram a passar (`239/239`), com
lint e build. O commit funcional corrente é `daef225348f715edf079c0e3f2a051b062318531`,
tree `f1eb9ea120f9f9d58e633853885af5b8ac2ffc93`, alinhado ao remoto.

O frontend foi republicado no Vercel staging como
`dpl_5mG6xZWnTDszcmG7TMRv1wQYMFx3`; os assets finais conferem byte a byte:

```text
index.html                 479 bytes   SHA-256 e35a3ebef6f7ddc9cd0791857f3c48cc4fb106a0901da69b44f5412ab7cd3ead
assets/index-kHoJ1Ly6.js   287275      SHA-256 e9ec5882b7bf241dff7b98aa37741ec7c29ad08e88e866ebbf9ff69428445e0f
assets/index-DnvstQIY.css  92545       SHA-256 4148c1a6ae931f29534c41e14e11fcf5280afed06fd41e7eae19253a22ecbbf6
```

O backend com redaction está no Railway staging deployment final
`35e96728-ba1e-4bcf-a99d-62785ea90256`, `SUCCESS`; `/health=200`,
`/ready=200` e `/platform/observability/summary` sem token = 401.

Uma segunda sessão autenticada sintética confirmou no alias final: login ADMIN,
seis estados sem enums crus, Importações sem enums crus, Observabilidade de
plataforma com vazio de credenciais correto, e 403 para ADMIN tenant-scoped.
Depois, o segundo run foi revogado e o allowlist temporário removido novamente;
os três tenants QA terminaram `REVOKED`, zero usuários/sessões/tokens/leases,
e `PLATFORM_ADMIN_EMAILS` ausente no runtime.

O Reviewer B independente reavaliou o finding de segurança e retornou `PASS`.
O Reviewer A independente retornou `PASS_AFTER_RECHECK` depois das correções
de apresentação. Uma instância adversarial final foi aberta com contexto limpo,
mas não retornou dentro da janela operacional e foi interrompida; isso é uma
lacuna externa de evidência, não um PASS.
Até uma nova execução adversarial disponível e a reconciliação final do Sol,
manter:

```text
REVIEW_A_FINAL=PASS_AFTER_RECHECK
REVIEW_B_FINAL=PASS
FINAL_ADVERSARIAL_VERDICT=BLOCKED_EXTERNAL_REVIEWER_TIMEOUT
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
```
