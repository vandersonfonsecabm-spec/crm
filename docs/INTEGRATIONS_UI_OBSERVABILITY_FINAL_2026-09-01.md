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

## Addendum — correções do adversarial final e novo candidato (2026-09-01)

O reviewer adversarial independente retornou `FIX_FIRST` para o candidato
`fffcb0c` com cinco findings reproduzíveis. A correção focal foi aplicada no
commit funcional `32c5466ad8f05fb0d631e2816fe53fe0e9e97b25`, tree
`c483810ce573aec9ce46e22a3d43babf807d9229`, e publicada somente na API de
staging no deployment `0a0e9aa7-e99f-46ee-9889-7b477dee508b` (`SUCCESS`).

Uma revisão independente posterior encontrou dois casos-limite adicionais no
mesmo candidato. Eles foram corrigidos no commit funcional
`9814cd0e90bea466f86c088dfe6a75ae5d93705a`, tree
`137012ed4534c0bba14d910b84c8555dba559e06`, e publicados na API staging no
deployment `2d6640f9-7046-4f2d-a7e8-30cdc1f78a59` (`SUCCESS`).

Findings tratados:

- `ADV-FINAL-001` (HIGH): WhatsApp, Instagram e Messenger agora exigem
  ciphertext descriptografável com o contexto AAD correto, `accessToken`
  presente e `expiresAt` válido/futuro antes de anunciar `CONNECTED`.
- `ADV-FINAL-002` (HIGH): a fundação provider-neutral de E-mail não anuncia
  `CONNECTED` sem autorização atual de provider; `verifiedAt` histórico não é
  autorização.
- `ADV-FINAL-003` (HIGH): configuração e redaction genéricas agora bloqueiam
  `cookie/state/code` fora de URL e referências network-path (`//host/path`),
  além dos esquemas já cobertos.
- `ADV-FINAL-004` (MEDIUM): observabilidade classifica ciphertext ativo
  indecifrável como `INVALID`, em vez de contá-lo como `ATIVA`.
- `ADV-FINAL-005` (MEDIUM): o manifesto e os hashes dos arquivos backend foram
  reconciliados e vinculados ao deployment final `0a0e9aa7`.
- `ADV-POSTFIX-001` (HIGH): redaction remove userinfo de referências
  network-path e valores sensíveis inteiros entre aspas, inclusive espaços.
- `ADV-POSTFIX-002` (HIGH): o fingerprint retorna e valida
  `RAILWAY_DEPLOYMENT_ID`, vinculando a evidência à instância exata.

Retestes causais do novo candidato:

```text
META_CREDENTIAL_HEALTH=2/2 PASS
INTEGRATION_SECURITY_HARDENING=6/6 PASS
AUDIT_REASON_REDACTION=3/3 PASS
EMAIL_INBOUND_LIFECYCLE=6 PASS, 1 SKIP PostgreSQL descartável
WHATSAPP_INBOUND_LIFECYCLE=4/4 PASS
MESSENGER_INBOUND_LIFECYCLE=6/6 PASS
INSTAGRAM_INBOUND_LIFECYCLE=5/5 PASS
PLATFORM_OBSERVABILITY=3/3 PASS
RUNTIME_FINGERPRINT=3/3 PASS
POSTFIX_REDACTION_NETWORK_USERINFO=PASS
POSTFIX_REDACTION_QUOTED_VALUES=PASS
POSTFIX_DEPLOYMENT_ID_ATTESTATION=PASS
BACKEND_ISOLATED_SUITE=PASS_EXIT_0
PROTECTED_DEV_DB_UNCHANGED=PASS
```

Paridade runtime da API foi comprovada byte a byte no deployment `2d6640f9`.
O manifesto `backend-runtime-v3-lf` retornado pelo runtime e pelo worktree é
`df4755d2900e0a61e98b68d98253c59523e6373341ae34ef03af1aeb7d738927`.
O runtime retornou `deploymentId=2d6640f9-7046-4f2d-a7e8-30cdc1f78a59` e
`deploymentIdentityVerified=true`.
`/health=200`, `/ready=200` e o fingerprint protegido confirmaram staging,
PostgreSQL de staging, providers conectados `false`, ativação externa `false`
e outbound `false`.

Hashes SHA-256 locais e `/app`:

```text
src/integrations/metaCredentialHealth.js       7e243d1a5c3f838d8435d632f659238d3a05ad6dc8373720fc23726e074d7371
src/integrations/whatsappInboundLifecycle.js   2282c886e32b73ca9966362bbfd0190ae5e1bfa52d038ea70290a33cbc9a9ab8
src/integrations/messengerInboundLifecycle.js  473e5f122f45fc89b583795ff2a1e7cecb9822d43ed5abd4cabe0fed06ce202c
src/integrations/instagramInboundLifecycle.js  c1a31c03642fccbd7c1f2ba811649c7b0574342750ce657aa1026b100fe9156f
src/integrations/emailInboundLifecycle.js      739b7432662d50007e5513af14d33e5ae6dc50e06be7040d1713aeeec7d4720c
src/integrations/routes.js                     0e11f7a052cdbdca01a179da4fcaff1a91260e694ef7b036c8f85ac8b371873d
src/platform/observability.js                  d6a70266ad01cf8b889ca61404b454ecff7de687778b35158f6fd78fec1e12e0
src/runtime-fingerprint.js                     dc075fbe1e5810346daed3f6cfc23c72b6831219968ac7f07ff07870b5fe4f10
src/security/auditReason.js                    89dbd8aa9ac2d60a552f43405d55efed1c15cc1cefa6905d7ad1c96b376f5167
BACKEND_RUNTIME_HASH_PARITY=PASS
```

O frontend não mudou; permanece no bundle Vercel previamente homologado. A
tentativa anterior de deploy Vercel continua registrada como falha de
autenticação sem deployment criado, portanto não foi repetida.

O novo reviewer adversarial independente e a reconciliação final do Sol ainda
são obrigatórios. Até ambos retornarem, o estado canônico é:

```text
RELEASE_FUNCTIONAL_HEAD=9814cd0e90bea466f86c088dfe6a75ae5d93705a
RELEASE_FUNCTIONAL_TREE=137012ed4534c0bba14d910b84c8555dba559e06
REMOTE_BRANCH_SHA=9814cd0e90bea466f86c088dfe6a75ae5d93705a
RAILWAY_API_DEPLOYMENT=2d6640f9-7046-4f2d-a7e8-30cdc1f78a59
REVIEW_A_FINAL=PASS_AFTER_RECHECK
REVIEW_B_FINAL=PASS
FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
PRODUCTION_CHANGED=false
REAL_PROVIDER_CONNECTIONS_CREATED=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
```

## Addendum — hardening final de status, redaction e observabilidade (2026-09-01)

Uma revisão adversarial independente do candidato intermediário `f7865f7`
identificou `INT-ADV-007` e `INT-ADV-008` (HIGH), além de confirmar
`INT-ADV-009` (HIGH): redaction hierárquica incompleta, mutação de tipo/config
de integração ativa durante o freeze e falso `CONNECTED` de WhatsApp/Messenger
quando a referência não apontava para uma `MetaCredential` ativa.

Correções aplicadas:

- `fffcb0c0de0e7f6c7a42b3ab91e8d7f4eb821026`: redaction agora substitui
  caminho/query/fragmento de URLs hierárquicas desconhecidos e o freeze bloqueia
  alterações de tipo/configuração em integrações ativas;
- `7b9251e4d24224ae59351b84ef5d5d8d104f2a25`: WhatsApp e Messenger só
  declaram `CONNECTED` quando existe credencial Meta ativa, tenant-scoped e
  ligada à referência atual; fixtures foram alinhadas ao contrato.

O finding histórico `OBS-003` (fonte de credenciais não exibida no painel) foi
reclassificado como fora do contrato: o painel existente exibe o contador
agregado sanitizado, e o backend agora agrega `MetaCredential` e credenciais
cifradas de `Integracao` sem expor origem ou segredo. Não foi criado um novo
campo visual que exigisse um deployment Vercel adicional.

Retestes finais:

```text
INTEGRATION_SECURITY_HARDENING=6/6 PASS
PLATFORM_OBSERVABILITY=2/2 PASS
INTEGRATION_HUB=PASS
WHATSAPP_INBOUND_LIFECYCLE=PASS
MESSENGER_INBOUND_LIFECYCLE=PASS
WHATSAPP_WEBHOOK_LIFECYCLE=PASS
BACKEND_ISOLATED_SUITE=PASS_EXIT_0
PROTECTED_DEV_DB_UNCHANGED=PASS
INT_ADV_007=RETESTED
INT_ADV_008=RETESTED
INT_ADV_009=RETESTED
OBS_001=RETESTED
OBS_002=RETESTED
OBS_003=CLOSED_BY_CONTRACT_SCOPE
```

O API foi republicado somente no staging como deployment
`cbd75a4e-2f0e-40e6-9e75-815099c667d8`, `SUCCESS`, com `/health=200` e
`/ready=200`. Os hashes locais e do runtime `/app` conferem para as rotas de
Integrações, observabilidade, WhatsApp, Messenger, provider activation,
plataforma e redaction. A tentativa de deploy Vercel com o projeto de staging
explicitamente identificado falhou antes da criação de deployment por
autenticação ausente do CLI (`Not authorized`); o bundle frontend publicado
permanece o mesmo artefato já homologado e não houve alteração externa.

Uma nova revisão adversarial limpa ainda é obrigatória para o candidato final.
Até ela retornar `SHIP` ou `FIX_FIRST`, o estado permanece:

```text
REVIEW_A_FINAL=PASS_AFTER_RECHECK
REVIEW_B_FINAL=PASS
FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
PRODUCTION_CHANGED=false
REAL_PROVIDER_CONNECTIONS_CREATED=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
```

## Addendum — freeze genérico e cobertura de observabilidade (2026-09-01)

A revisão adversarial independente do candidato `4a5fb66` retornou `FIX_FIRST`
com quatro achados adicionais:

- `INT-ADV-005` (HIGH): `PATCH /integracoes/:id` podia reativar uma integração
  genérica já validada enquanto `EXTERNAL_PROVIDER_ACTIVATION_ENABLED=false`;
- `INT-ADV-006` (HIGH): valores opacos prefixados por `/` (por exemplo
  `/mailto:` e `/data:`) escapavam da fronteira de redaction;
- `OBS-001` (MEDIUM): `OperacaoDistribuidaLease` não era incluída na contagem
  de leases ativos/expirados da observabilidade;
- `OBS-002` (MEDIUM): a contagem de credenciais considerava apenas
  `MetaCredential`, omitindo credenciais cifradas de `Integracao`/Bling.

Os dois primeiros foram corrigidos em `0fa94b044a9b7434b71bab3a992b6f72b2d9ec8f`
e os dois últimos em `f7865f7f85962f5d33148e19031e3b0bb36d221e`, tree
`50f1db6fd8dba1d01a53a1cdc496f846e0517965`. A transição agora aplica o freeze
somente quando há uma ativação real (sem bloquear renomeações ou pausa), e o
redactor processa primeiro URLs hierárquicas e depois qualquer esquema opaco,
inclusive quando está prefixado por uma barra. A observabilidade soma leases
 distribuídos e agrega fontes de credenciais sem sobrescrever status; o painel
 continua deliberadamente agregado e sanitizado, sem expor origem ou segredo.

Retestes causais:

```text
INTEGRATION_SECURITY_HARDENING=6/6 PASS
PLATFORM_OBSERVABILITY=2/2 PASS
INTEGRATION_HUB=PASS
PLATFORM_PROVIDER_ACTIVATION_GATE=PASS
BACKEND_ISOLATED_SUITE=PASS_EXIT_0
PROTECTED_DEV_DB_UNCHANGED=PASS
INT_ADV_005=RETESTED
INT_ADV_006=RETESTED
OBS_001=RETESTED
OBS_002=RETESTED
```

O API foi republicado somente no staging como deployment
`79455b2b-c659-4ecf-9394-0988bb88f3a0`, `SUCCESS`, com `/health=200` e
`/ready=200`. Os hashes locais e do runtime `/app` conferem para
`integrations/routes.js`, `platform/observability.js`, `providerActivation.js`,
`platform/routes.js` e `security/auditReason.js`. Não houve migration,
alteração de produção, provider real, credencial real de produto ou outbound.

Uma revisão adversarial nova, limpa e específica para o candidato
`f7865f7f85962f5d33148e19031e3b0bb36d221e` ainda é obrigatória. Até seu retorno,
o estado permanece:

```text
REVIEW_A_FINAL=PASS_AFTER_RECHECK
REVIEW_B_FINAL=PASS
FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
PRODUCTION_CHANGED=false
REAL_PROVIDER_CONNECTIONS_CREATED=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
```

## Candidato e paridade

```text
BRANCH=feature/canonical-sale-v1
RELEASE_HEAD=32c5466ad8f05fb0d631e2816fe53fe0e9e97b25
RELEASE_TREE=c483810ce573aec9ce46e22a3d43babf807d9229
BACKEND_CAUSAL_HEAD=e044d5852de15ad52b69f4025db9b80b3fec822b
BASELINE_FUNCTIONAL=79eed4f
FRONTEND_SOURCE_FIX=API fallback canônico de staging + teste de regressão
REMOTE_BRANCH_SHA=32c5466ad8f05fb0d631e2816fe53fe0e9e97b25
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
RAILWAY_API_DEPLOYMENT_AFTER_CLEANUP=63d3924d-fddb-46b2-bc50-7a2809d46186
RAILWAY_API_DEPLOYMENT_AFTER_GENERIC_REDACTION_FIX=54d0f59f-fd49-4e4c-9345-40ff9873f7c8
RAILWAY_API_DEPLOYMENT_AFTER_ACTIVATION_OBSERVABILITY_FIX=79455b2b-c659-4ecf-9394-0988bb88f3a0
RAILWAY_API_DEPLOYMENT_AFTER_FINAL_HARDENING=cbd75a4e-2f0e-40e6-9e75-815099c667d8
RAILWAY_WORKER_DEPLOYMENT=ebefe2db-ad83-4446-978f-c495c30a0810
VERCEL_PROJECT=prj_AJE06pNRGunJoguCNWee0RgZV6t8
VERCEL_DEPLOYMENT=dpl_5mG6xZWnTDszcmG7TMRv1wQYMFx3
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
index.html                 479/479 bytes  SHA-256 e35a3ebef6f7ddc9cd0791857f3c48cc4fb106a0901da69b44f5412ab7cd3ead
assets/index-kHoJ1Ly6.js   287275/287275  SHA-256 e9ec5882b7bf241dff7b98aa37741ec7c29ad08e88e866ebbf9ff69428445e0f
assets/index-DnvstQIY.css  92545/92545    SHA-256 4148c1a6ae931f29534c41e14e11fcf5280afed06fd41e7eae19253a22ecbbf6
SOURCE_RUNTIME_PARITY=PASS_FOR_PUBLISHED_ASSETS_AND_BACKEND_HASHES
```

Hashes SHA-256 dos arquivos backend causais do candidato foram comparados
byte a byte com os arquivos no runtime `/app` do deployment final
`cbd75a4e-2f0e-40e6-9e75-815099c667d8`:

```text
src/integrations/providerActivation.js  f055733b498962e729b6d886098585c83a915dce38735c95a318d88ceb24375d
src/platform/routes.js                  8aa2be8a92d2c2dc3aa61c9078889e26320d50d3d30c98cf14e42a9e2c43d150
src/integrations/routes.js              b50569eeea8073753ada23c6db6749e0d5644c08f114848e94da5f086070646f
src/platform/observability.js           574bb2a5767c858bfdb3315848535eef976e82be30716b432c74e3b2fc1f8d5f
src/integrations/whatsappInboundLifecycle.js 5812742615437b8d227c918f0f4074cab9a9d1f60692286127365bfb1d2faea7
src/integrations/messengerInboundLifecycle.js ca466788c55fd22220a39a1823e092cc8f41dec662d15d7e6150335c3daf4d3e
src/security/auditReason.js             f979ff314da0972f58b1c27c7e944e7a5048a6aa48429a7f9441db4770405026
BACKEND_RUNTIME_HASH_PARITY=PASS
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
duplicado). Reviewer A (UI/UX) e Reviewer B (segurança/runtime) concluíram a
rechecagem independente do candidato funcional `daef225`; nenhum agente
executor pode autocertificar a própria mudança.

O snapshot inicial abaixo foi supersedido pelos addenda de segurança e UI. O
estado canônico após as rechecagens é:

```text
REVIEW_A_FINAL=PASS_AFTER_RECHECK
REVIEW_B_FINAL=PASS
FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
```

## Addendum — redaction universal e paridade backend (2026-09-01)

A revisão adversarial pós-correção encontrou `INT-ADV-002` (HIGH): o helper
compartilhado não redigia URI schemes opacos (`mailto:`, `urn:`, `data:`) e
seis módulos ainda mantinham lógica local duplicada. Encontrou também
`INT-ADV-003` (MEDIUM): o índice não trazia hashes verificáveis dos arquivos
backend no runtime.

Correção aplicada no commit funcional
`696e2a7e0bac6e1e85484a5ad9819e7b36f6c27c`, tree
`d416ba96a5817540f70c198617e330286d8607a4`:

- `auditReason` passou a redigir qualquer esquema URI, inclusive opaco;
- provisionamento/lifecycle de WhatsApp, Instagram e Messenger delegam ao
  helper compartilhado;
- o formato canônico de chaves sensíveis (`phoneNumberId=[REDACTED]`, etc.)
  foi preservado;
- o teste focal cobre esquemas opacos e a ausência de sanitizadores duplicados.

Retestes:

```text
AUDIT_REASON_REDACTION_TEST=3/3 PASS
BACKEND_ISOLATED_SUITE=PASS_EXIT_0
SOURCE_RUNTIME_BACKEND_HASH_PARITY=PASS
RAILWAY_STAGING_DEPLOYMENT=63d3924d-fddb-46b2-bc50-7a2809d46186 SUCCESS
```

O evidence index agora inclui os hashes backend comparados com `/app`:

```text
providerActivation.js=f055733b498962e729b6d886098585c83a915dce38735c95a318d88ceb24375d
platform/routes.js=8aa2be8a92d2c2dc3aa61c9078889e26320d50d3d30c98cf14e42a9e2c43d150
integrations/routes.js=cea9af5a370cffccc1e7d8d4e2606d405a9c019db08737ce4022d77472cab64c
security/auditReason.js=f979ff314da0972f58b1c27c7e944e7a5048a6aa48429a7f9441db4770405026
```

Os findings `INT-ADV-002` e `INT-ADV-003` estão `RETESTED`. Nova revisão
adversarial limpa ainda é obrigatória antes da reconciliação final; manter
`READY_FOR_PRODUCTION=false`.

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

## Addendum — nova tentativa adversarial independente (2026-09-01)

Uma nova instância read-only recebeu contexto limpo, o contrato, o candidato
`daef225348f715edf079c0e3f2a051b062318531`, a árvore
`f1eb9ea120f9f9d58e633853885af5b8ac2ffc93` e o índice de evidências. A instância
foi aguardada por uma janela operacional e não retornou; foi interrompida após
o timeout. Não houve alteração de código, ambiente, banco, provider ou
outbound.

```text
FINAL_ADVERSARIAL_ATTEMPT_1=BLOCKED_EXTERNAL_REVIEWER_TIMEOUT
FINAL_ADVERSARIAL_ATTEMPT_2=INTERRUPTED_AFTER_TIMEOUT
FINAL_ADVERSARIAL_ATTEMPT_3=RUNTIME_SWITCH_TIMEOUT
FINAL_ADVERSARIAL_REVIEWER_INFRA=UNAVAILABLE
FINAL_ADVERSARIAL_VERDICT=BLOCKED_EXTERNAL_REVIEWER_TIMEOUT
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
```

Esse resultado é uma indisponibilidade do mecanismo de revisão adversarial,
mesmo após a troca de runtime. Ele não autoriza converter o gate em `SHIP` nem
reabrir o código sem um finding causal.

## Addendum — finding adversarial e correção server-side (2026-09-01)

Uma revisão independente em sessão separada encontrou `INT-ADV-001` (HIGH):
as rotas mutáveis do operador de plataforma para provisionamento e ativação de
providers não aplicavam o mesmo freeze global usado pelas rotas tenant-scoped.
Isso permitiria ativar um canal externo com
`EXTERNAL_PROVIDER_ACTIVATION_ENABLED=false`.

Correção focal aplicada no commit `2214b846585dbb454e1349c1fd7018b848c120e5`,
tree `87bf14a075cc8beb1c101980b0fa4976ed04ee9a`:

- novo módulo compartilhado `backend/src/integrations/providerActivation.js`;
- guard middleware nas rotas de provisionamento de WhatsApp, Instagram,
  Messenger e E-mail;
- guard nas transições `activate`/`reactivate` do operador de plataforma;
- `pause` permanece permitido como desativação local segura;
- teste de registro das rotas e resposta fail-closed `503 PROVIDER_ACTIVATION_PAUSED`.

Retestes causais:

```text
PLATFORM_PROVIDER_ACTIVATION_GATE=PASS
INTEGRATION_PROVIDER_ACTIVATION_GATE=PASS
PLATFORM_OPERATIONS_H7_1=PASS
BACKEND_ISOLATED_SUITE=PASS_EXIT_0
```

O backend foi publicado somente no staging no deployment
`f03b3cf7-fce2-4923-ad47-ebdc476b0fd5`, `SUCCESS`; `/health=200` e
`/ready=200`. Os hashes SHA-256 dos dois arquivos causais foram conferidos
byte a byte entre o worktree e `/app` no runtime. Nenhum provider, outbound,
produção ou banco oficial foi tocado.

O finding `INT-ADV-001` está corrigido e aguarda revisão adversarial limpa no
novo SHA. Até essa revisão e a reconciliação do Sol, manter:

```text
REVIEW_A_FINAL=PASS_AFTER_RECHECK
REVIEW_B_FINAL=PASS
INT_ADV_001=RETESTED
FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
```

## Addendum — redaction do endpoint genérico e novo candidato (2026-09-01)

O reviewer adversarial independente encontrou `INT-ADV-004` (HIGH): o
redactor genérico das respostas de Integrações ainda deixava passar URI
opacas, como `mailto:`, `urn:`, `data:` e esquemas customizados, podendo
expor payloads privados em mensagens de erro. O finding foi reproduzido no
teste do endpoint; não foi classificado como falha de provider, tenant ou
outbound.

A correção focal foi aplicada em `backend/src/integrations/routes.js` e o
contrato foi coberto em
`backend/tests/integration-security-hardening.test.js`. O redactor agora
remove qualquer esquema opaco antes da exposição, preservando a forma já
existente para URLs hierárquicas com `://` e sem alterar o contrato de chaves
redigidas.

O candidato funcional atual é:

```text
RELEASE_HEAD=4a5fb66b3d8f08d6cdf2b1e1fa9ba3f784b15aa7
RELEASE_TREE=3e80ad611ef489ed6e0f771201f1d319f5258c8b
REMOTE_BRANCH_SHA=4a5fb66b3d8f08d6cdf2b1e1fa9ba3f784b15aa7
INT_ADV_004=RETESTED
```

Retestes causais do candidato:

```text
AUTH_INTEGRATION_TEST=1/1 PASS
INTEGRATION_SECURITY_HARDENING=6/6 PASS
AUDIT_REASON_REDACTION=3/3 PASS
BACKEND_ISOLATED_SUITE=PASS_EXIT_0
PROTECTED_DEV_DB_UNCHANGED=PASS
```

O API foi republicado somente no staging como deployment
`54d0f59f-fd49-4e4c-9345-40ff9873f7c8`, com `SUCCESS`, `/health=200` e
`/ready=200`. Os hashes dos quatro arquivos backend causais conferem entre o
worktree e o runtime `/app`; o hash atualizado de
`src/integrations/routes.js` é
`425c7e40c69e5d34339acf8afcb831a0306ff7be3a9c5764cbac7776ca7fa63c`.
Não houve migration, alteração de produção, provider real, credencial real de
produto ou outbound.

Uma tentativa anterior de passar dois arquivos ao runner focal foi rejeitada
pelo próprio contrato operacional (`node-test` aceita exatamente um arquivo).
Os testes foram então executados separadamente e passaram; isso foi
classificado como erro de harness, não como falha do produto.

O finding `INT-ADV-004` está retestado, mas uma nova revisão adversarial limpa
ainda é obrigatória. Até ela retornar `SHIP` ou `FIX_FIRST`, o estado honesto
permanece:

```text
REVIEW_A_FINAL=PASS_AFTER_RECHECK
REVIEW_B_FINAL=PASS
FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW
FINAL_SOL_RECONCILIATION=NOT_CLOSED
READY_FOR_PRODUCTION=false
PRODUCTION_CHANGED=false
REAL_PROVIDER_CONNECTIONS_CREATED=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
```
