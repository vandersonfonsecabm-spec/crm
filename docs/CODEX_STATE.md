# Estado atual do CRM
## Integrações visíveis + observabilidade — último candidato e revisão adversarial (2026-09-01)

- O candidato funcional atual é `85ed8e28a6dae1d02d5ce30834ebcf6af4cf4068`,
  tree `a24ee77a532230bd9da1f5f5421c9146c345b9f4`, alinhado ao remoto. O fix
  rejeita payload genérico cifrado vazio/metadata-only e amplia a redaction de
  userinfo em referências network-path; não há mudança no frontend.
- A API staging está no deployment
  `b5078c3f-a738-4984-94da-5b353512a0ae` (`SUCCESS`), com `/health=200`,
  `/ready=200`, `deploymentIdentityVerified=true`, banco/target verificados e
  manifesto runtime `e8c518dd46d8489fa105c1ea94c4c5fa0ed63d923f92261ec86783dbd3101d3e`.
  Providers, ativação externa e outbound permanecem desligados.
- `META_CREDENTIAL_HEALTH=3/3`, `AUDIT_REASON_REDACTION=3/3`,
  `PLATFORM_OBSERVABILITY=3/3`, `INTEGRATION_SECURITY_HARDENING=6/6` e a
  suíte backend isolada completa passaram; `backend/prisma/dev.db` preservou o
  SHA canônico `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- Os três timeouts do mecanismo adversarial anterior não viram PASS. Uma nova
  revisão independente deve usar caminho/runtime separado sobre `85ed8e2`;
  manter `FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW`,
  `FINAL_SOL_RECONCILIATION=NOT_CLOSED`, `READY_FOR_PRODUCTION=false` e
  `PRODUCTION_CHANGED=false` até o retorno.

## Integrações visíveis + observabilidade — chaves OAuth finais (2026-09-01)

- A revisão independente encontrou `ADV-NEW-001` e `ADV-NEW-002` (HIGH):
  aliases `access_token/accessToken` escapavam do `auditReason`, e chaves
  OAuth `state/code/signature` podiam ser persistidas na configuração genérica.
- A correção está no commit funcional
  `34c5d5c535f416f541c2d44c8db3efc23d6b94ab`, tree
  `0672bc6ad2e025422f300eb2014657b4dde5c2c0`; a API staging foi publicada em
  `abb7d431-f9bf-46d6-9fcb-3210f24667ac`.
- `AUDIT_REASON_REDACTION=3/3`, `INTEGRATION_SECURITY_HARDENING=6/6` e a
  suíte backend isolada completa passaram. Runtime confirmou
  `deploymentId=abb7d431-f9bf-46d6-9fcb-3210f24667ac`,
  `deploymentIdentityVerified=true`, manifesto
  `58018d56190c7d048cd1ea79dce5d0d28e05a6f24441f2fd9e68ae1e333e5bf5`,
  health/readiness 200 e providers/outbound desligados.
- Nova instância adversarial ainda deve auditar este candidato; manter
  `FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW`,
  `FINAL_SOL_RECONCILIATION=NOT_CLOSED`, `READY_FOR_PRODUCTION=false` e
  `PRODUCTION_CHANGED=false`.

## Integrações visíveis + observabilidade — redaction quoted final (2026-09-01)

- O reviewer independente encontrou `ADV-REVIEW-001` e `ADV-REVIEW-002`
  (HIGH): regras de redaction antigas truncavam `password/access_token` e
  `auditReason` no primeiro espaço de valores entre aspas.
- A regra conflitante foi removida e o sanitizer compartilhado foi corrigido
  no commit funcional `98a8cf2428a3b5512565e56d9ed995deb8f75d8d`, tree
  `42014f598424948c0438de7e2d38eb2b4548df83`; o backend foi publicado no
  staging `9a93dc5b-986b-43df-8cfd-b0fa68878fd2`.
- `INTEGRATION_SECURITY_HARDENING=6/6`, `AUDIT_REASON_REDACTION=3/3`,
  `WHATSAPP_INBOUND_PROVISIONING=5/5` e `BACKEND_ISOLATED_SUITE=PASS_EXIT_0`.
  Runtime confirmou `deploymentId=9a93dc5b-986b-43df-8cfd-b0fa68878fd2`,
  `deploymentIdentityVerified=true`, manifesto
  `fede7d09667d155c3cbd00dffdaa51c200bc5c6585414082d4a8925e11d854a0`,
  health/readiness 200 e providers/outbound desligados.
- Nova instância adversarial precisa auditar o candidato `98a8cf2` do zero;
  até lá `FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW`,
  `FINAL_SOL_RECONCILIATION=NOT_CLOSED`, `READY_FOR_PRODUCTION=false` e
  `PRODUCTION_CHANGED=false`.

## Integrações visíveis + observabilidade — pós-fix adversarial (2026-09-01)

- A revisão independente posterior encontrou `ADV-POSTFIX-001` (HIGH): a
  redaction ainda preservava userinfo em referências network-path e parte de
  valores sensíveis entre aspas; e `ADV-POSTFIX-002` (HIGH): o fingerprint não
  vinculava a resposta ao deployment exato.
- Ambos foram corrigidos no commit funcional
  `9814cd0e90bea466f86c088dfe6a75ae5d93705a`, tree
  `137012ed4534c0bba14d910b84c8555dba559e06`, e publicados somente no
  deployment staging `2d6640f9-7046-4f2d-a7e8-30cdc1f78a59`.
- O runtime retornou `deploymentId` igual ao deployment consultado,
  `deploymentIdentityVerified=true`, manifesto
  `df4755d2900e0a61e98b68d98253c59523e6373341ae34ef03af1aeb7d738927`,
  `/health=200`, `/ready=200`, providers conectados `false` e outbound `false`.
  Os hashes dos nove arquivos causais conferem byte a byte com `/app`.
- Retestes de redaction, fingerprint, observabilidade, lifecycle e a suíte
  backend isolada completa passaram; `backend/prisma/dev.db` permanece com o
  SHA canônico `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- Um novo reviewer adversarial independente precisa auditar o candidato
  `9814cd0` do zero. Até seu veredito e a reconciliação do Sol, manter
  `FINAL_ADVERSARIAL_VERDICT=PENDING_POST_FIX_REVIEW`,
  `FINAL_SOL_RECONCILIATION=NOT_CLOSED`, `READY_FOR_PRODUCTION=false` e
  `PRODUCTION_CHANGED=false`.

## Integrações visíveis + observabilidade — correções do adversarial final (2026-09-01)

- O adversarial independente encontrou cinco findings reproduzíveis no
  candidato `fffcb0c`: credenciais Meta ativas sem descriptografia/expiração,
  E-mail `CONNECTED` sem autorização atual, redaction incompleta de
  `cookie/state/code` e network-path, contagem de ciphertext inválido na
  observabilidade e hashes sem vínculo explícito ao deployment final.
- A correção focal foi aplicada e publicada somente no staging no commit
  funcional `32c5466ad8f05fb0d631e2816fe53fe0e9e97b25`, tree
  `c483810ce573aec9ce46e22a3d43babf807d9229`, deployment API
  `0a0e9aa7-e99f-46ee-9889-7b477dee508b`. O runtime retornou health/readiness
  200 e manifesto `f8b3ea62ce52475c2fc9fd606e546fb28ac84e2588deb836e14d550b616ccf21`;
  hashes locais e `/app` conferem para todos os nove arquivos causais.
- Retestes focados, suíte backend isolada completa, redaction, observabilidade,
  fingerprint e lifecycle de WhatsApp/Messenger/Instagram/E-mail passaram.
  `backend/prisma/dev.db` permaneceu com o SHA canônico
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- O fingerprint sanitizado confirma `trackedProviderConnections=false`,
  `externalProviderActivationEnabled=false`, `outboundEnabled=false` e
  `EMAIL=NO_EMAIL_PROVIDER_CREDENTIAL_REGISTRY`. Frontend não mudou nem foi
  republicado; produção, providers reais e outbound permanecem intocados.
- Nova revisão adversarial independente do commit `32c5466` e reconciliação
  final do Sol ainda são obrigatórias. Estado: `FINAL_ADVERSARIAL_VERDICT=
  PENDING_POST_FIX_REVIEW`, `FINAL_SOL_RECONCILIATION=NOT_CLOSED`,
  `READY_FOR_PRODUCTION=false`, `PRODUCTION_CHANGED=false`.
- Autoridade documental: `docs/INTEGRATIONS_UI_OBSERVABILITY_FINAL_2026-09-01.md`
  e `docs/evidence/INTEGRATIONS_UI_OBSERVABILITY_FINAL_2026-09-01.json`.

## Checkpoint atual — execução final do QA Production Harness em produção (2026-08-31)

- A missão de execução do harness QA-only em produção foi concluída com dados
  de aplicação exclusivamente sintéticos. O executor real foi `CODEX_ROOT`;
  a seleção do modelo foi registrada apenas como pré-condição confirmada pelo
  usuário (`MODEL_SELECTION_PRECONDITION=SATISFIED_BY_USER`,
  `RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED`,
  `MODEL_IDENTITY_GATE=NOT_APPLICABLE`). Não há alegação de proveniência Luna
  ou NuAuto atestada pelo host.
- O release funcional base foi `2da896aac84dd683e844b266331716e9600e6357`;
  o candidato do harness foi `957c10d74e2f786a96e903978b2eb6919b150bfb`, tree
  `3aa54bb2c3860482e66929c92e7304f605b7462f`. O worktree da branch
  `feature/canonical-sale-v1` terminou limpo, e
  `backend/prisma/dev.db` preservou SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- O alvo foi verificado como o Railway de produção oficial e o PostgreSQL
  `e9d8a6b8-507b-45fb-92a8-3ab016f865a2`. A API final do harness ficou no
  deployment `2fad0d3a-004e-441b-ae2b-91552285d302` em `SUCCESS/RUNNING`; o
  worker compatível permaneceu em `74ef572c-3f5a-4e7c-8137-2952fcb7e579`; o
  alias Vercel canônico permaneceu 200 em
  `dpl_6ndNu6C75CujS4W3g68wwoPskFoc`.
- A paridade do artefato LF do harness foi comprovada pelo manifesto
  `36069c14396317beb5b2790f94e916fda431959af0151b4634046a7f9aa9f1cd`; a do
  runtime backend completo pelo manifesto
  `bdba055e0e37b8b324d52252ea39a4fbe7ce7e305d0ce6468abaac32eaef89b5`.
  A diferença CRLF observada no checkout Windows foi classificada e não foi
  usada como prova de runtime.
- O backup pré-escrita foi criado sem expor credenciais, protegido fora do
  repositório, com 25.776.513 bytes e SHA-256
  `fa1dd9286440160666f20580991cc17b9ce1e081ef90878dae504ca6aa06ce70`.
  O restore drill PostgreSQL 18.3 descartável passou com 1.351 entradas,
  20 migrations, zero falhas, quatro tabelas canônicas e cleanup concluído.
- O bootstrap interno transacional criou e depois revogou os tenants
  sintéticos `qa-prod-canonical-a` (ID 4) e `qa-prod-canonical-b` (ID 5), com
  cinco usuários temporários. Smoke autenticado, venda por proposta, venda
  manual zero, idempotência, concorrência real, reopen, cross-tenant, RBAC,
  snapshot e soak passaram. QA-A/B foram mantidos inativos para reuso; não há
  usuários ativos, sessões, refresh tokens, leases, outbox, webhooks ou bundle
  de credenciais.
- O incidente de credencial/bundle e os findings de URL stale, upload,
  manifesto, harness de smoke e ACL foram corrigidos e retestados. HMAC foi
  rotacionado, cópias temporárias foram removidas e a varredura final não
  encontrou segredo no repositório, runtime ou logs. A integração Bling global
  existente permaneceu intocada; conexões de providers de produto e outbound
  foram zero. Duas conexões TLS de inicialização do Prisma foram classificadas
  apenas como telemetria.
- Revisões independentes de segurança/operação e o adversarial final
  terminaram `PASS`, `PASS` e `SHIP`; `FINAL_SOL_RECONCILIATION=PASS`, sem
  findings críticos/altos/médios nem pendências internas. A autoridade
  consolidada está em
  `docs/QA_PRODUCTION_HARNESS_PRODUCTION_EXECUTION_REPORT_2026-08-31.md`, com
  índice sanitizado em
  `docs/evidence/QA_PRODUCTION_HARNESS_PRODUCTION_EXECUTION_2026-08-31.json`.
- Estado canônico: `CANONICAL_SALE_V1_PRODUCTION_QA=COMPLETE`,
  `PRODUCTION_CHANGED=true` (somente runtime do harness e fixtures
  sintéticas), `QA_TENANTS_RETAINED=true`, `QA_TENANTS_ACTIVE=false`,
  `QA_USERS_ACTIVE=0`, `QA_SESSIONS=0`, `QA_REFRESH_TOKENS=0`,
  `REAL_PRODUCT_PROVIDER_CONNECTIONS=0`, `REAL_PRODUCT_OUTBOUND=0`.

## Checkpoint atual — incidente de secrets e QA operator do staging (2026-08-31)

- Dados de aplicação da SaaS são sintéticos/de teste; não há pessoas ou
  clientes reais no banco. Infraestrutura, secrets, tokens e providers externos
  continuam classificados como reais até prova contrária.
- O incidente de dump bruto do staging foi encerrado: variáveis de banco,
  JWT, criptografia de integrações e probe foram rotacionadas somente no
  staging; a senha antiga do PostgreSQL foi rejeitada; sessões/refresh tokens
  foram revogados; `INTEGRATION_ENCRYPTION_KEY_PREVIOUS` foi removida.
- `RAW_ENV_DUMP=FORBIDDEN` agora é regra versionada em
  `backend/scripts/qa-staging-env-sanitized.cjs`, com teste focal e saída
  limitada a presença, classificação, contagem e fingerprint.
- O harness está no SHA `957c10d74e2f786a96e903978b2eb6919b150bfb`, tree
  `3aa54bb2c3860482e66929c92e7304f605b7462f`, no staging Railway oficial.
  API e worker terminaram `SUCCESS/RUNNING`, health/readiness=200 e paridade
  de source comprovada por atestado sanitizado.
- O operador reservado de plataforma foi provisionado, usado para o apply,
  revogado e teve a allowlist removida. QA-A/B foram provisionados, testados,
  revogados, reutilizados sem duplicidade e revogados novamente. Bundle de
  credenciais, sessões, tokens e leases terminaram ausentes/zerados; vendas e
  histórico sintéticos permaneceram preservados.
- Smoke autenticado por proposta e `MANUAL_CLOSE` zero, idempotência/replay,
  reopen/revisão, cross-tenant, RBAC, snapshot e soak limitado passaram. O
  relatório sanitizado é `docs/STAGING_SECRET_INCIDENT_AND_QA_OPERATOR_REPORT_2026-08-31.md`.
- Produção não foi escrita nem redeployada nesta retomada:
  `PRODUCTION_CHANGED=false`, `REAL_PROVIDER_CONNECTIONS=0` e
  `REAL_OUTBOUND=0`. Promoção de produção e QA visual de navegador são escopos
  separados e não foram declarados por este checkpoint.
- Revisão operacional final retornou `FINAL_STAGING_AUDIT=PASS`; revisão de
  segurança retornou `PASS_AFTER_LEASE_RETEST` depois de a checagem sanitizada
  confirmar `LEASE_FINAL=ABSENT`, zero leases distribuídos e zero bundles.

## Estado atual — auditoria do QA Production Harness V1 (2026-08-31)

- O comando/decisão do bootstrap QA-only foi auditado antes da execução:
  `MISSION_COMMAND_AUDIT=PASS`. O escopo ficou restrito a implementação,
  testes e auditoria local; nenhum tenant QA, usuário QA, migration, deploy,
  push, provider ou outbound foi criado/executado.
- Candidato do harness congelado em `acbe8fb655c6bd459a8cf75e3271c58838da141c`,
  Git tree `09cf0332095d1103ad971d7b224386843a55c496`, branch
  `feature/canonical-sale-v1`. O manifesto dos cinco arquivos causais é
  `24e16f6b0dd18b99f94f3033f740c8beceb7283d4e3a0c8c62f04940537a13a2`.
- Focos finais passaram: `qa-prod-bootstrap.test.js` + runner de comandos
  `27/27`; sintaxe e `git diff --check` passaram; a regressão backend isolada
  completa terminou com exit 0 e cleanup concluído. O PostgreSQL descartável
  WSL v9 passou a suíte completa (25 harness tests), com manifesto de suíte
  `190d27f647ebb2cdcfe15471776891bc20679e1ff6637fc4eaaa25e9e4559a9e`, log
  sanitizado em `%TEMP%\\crm-postgres-real\\20260831190731800-8304-8b68e93f43cb.log`
  e SHA de log `3b423030acbc1928ad74120e5d4a7c68b2200ea2bcb99dc71527b3125aed5c06`.
- Findings de segurança/operacionais foram corrigidos e retestados: target e
  source parity atestados externamente; lease antes da leitura; confirmação
  emergencial; ciphertext/payload/lease provider limpos; bundles restritos a
  filho direto do TEMP com varredura de órfãos/junctions; nome lógico do banco
  vinculado à URL; convite/reenvio usam CAS de `Empresa.ativo=true`.
- O executor real desta rodada foi `CODEX_ROOT`. A seleção de modelo foi
  registrada somente como pré-condição confirmada pelo usuário:
  `MODEL_SELECTION_PRECONDITION=SATISFIED`,
  `RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED`,
  `MODEL_IDENTITY_GATE=NOT_APPLICABLE`; não há alegação de proveniência
  runtime Luna/NuAuto.
- Estado de produção permanece intocado nesta rodada:
  `PRODUCTION_CHANGED=false`, `REAL_CUSTOMERS_TOUCHED=0`,
  `GLOBAL_BLING_CHANGED=false`, `REAL_PROVIDER_CONNECTIONS_CREATED=0`,
  `REAL_OUTBOUND=0`. A criação real dos tenants/identidades QA exige uma
  missão posterior com atestado externo fresco, backup/restore e autorização
  de escrita no alvo; não é PASS desta auditoria local.
- Relatório canônico desta rodada: `docs/QA_PRODUCTION_HARNESS_AUDIT_2026-08-31.md`.
  O índice sanitizado de evidências está em
  `docs/evidence/QA_PRODUCTION_HARNESS_AUDIT_2026-08-31.json`. Reviewers
  independentes encontraram e tiveram seus findings corrigidos/retestados; uma
  nova instância final solicitada sobre o SHA congelado não retornou pela
  ferramenta e permanece explicitamente `NOT_RETURNED`, sem falso PASS.

## Estado atual — produção Venda Canônica V1 e pré-bootstrap QA (2026-08-31)

- A promoção de produção foi concluída no release funcional
  2da896aac84dd683e844b266331716e9600e6357, Git tree
  5fcb51262f2ca9d68cb6403c41fcbc66cbb40fce. O backend Railway está no
  deployment e865888e-2014-4885-b533-d1ab698b43ce e o worker no deployment
  74ef572c-3f5a-4e7c-8137-2952fcb7e579; o frontend Vercel está no deployment
  dpl_6ndNu6C75CujS4W3g68wwoPskFoc. Produção mudou somente dentro dessa
  promoção autorizada.
- PostgreSQL oficial e9d8a6b8-507b-45fb-92a8-3ab016f865a2 está com 20
  migrations aplicadas, zero falhas e hardening canônico como última. As
  tabelas VendaCanonica, ItemVendaCanonica, HistoricoVendaCanonica e
  NegocioContratoVenda existem e estavam sem linhas no último checkpoint.
- Backup pré-bootstrap permanece fora do repositório, com 23088049 bytes e
  SHA-256 05b0576f61dbb8cbf57f4a01845d6f03d228c61e9b181757593a05b96080acae;
  restore drill WSL passou com 17 migrations/zero falhas e foi limpo.
- Não existem atualmente tenants qa-prod-canonical-a ou qa-prod-canonical-b.
  MetaCredential ativa e canais ativos estão em zero; existe uma integração
  Bling ativa com credencial em outro tenant e ela deve permanecer intocada.
- O próximo escopo aprovado é o bootstrap interno QA-only, sem rota pública,
  sem SQL direto e sem dependência de convite/e-mail. Antes de qualquer
  escrita, o procedimento deve ser implementado, testado em staging e revisado.
- Relatório canônico da promoção:
  docs/CANONICAL_SALE_V1_PRODUCTION_PROMOTION_2026-08-31.md
  e índice docs/evidence/CANONICAL_SALE_V1_PRODUCTION_EVIDENCE_2026-08-31.json.

## Venda Canônica V1 — staging pós-adversarial (2026-08-30)

- O release artifact atual é `2da896aac84dd683e844b266331716e9600e6357`
  na branch `feature/canonical-sale-v1`; o Git tree é
  `5fcb51262f2ca9d68cb6403c41fcbc66cbb40fce`. O commit documental-base é
  `a56f936eae6511bd9f090fa84bed4fadf39b43aa`; commits documentais posteriores
  não mudam a identidade do artefato implantado.
- A reconciliação final foi consolidada em
  `54428fdd8f49efaa2e932c3baea21a19fbea6ba6`; o checkpoint de evidência
  adversarial imediatamente anterior é
  `624d88a7fc9aa576d6fa906efeb762462099d0f0`.
- Staging está no backend Railway
  `313650fd-be82-4a28-a89a-9f1d525b400e` (`SUCCESS`) e frontend Vercel
  `dpl_EmnYbZQWFWxyaD1u8A5fXk19v5Cr` (`READY`) no alias dedicado. O runtime
  confirmou `backend-runtime-v3-lf` e manifesto
  `bef4bab2726db40731ac1473cad95ae623e12cc656c189bb2cd1985a9b84f8d8`,
  com alvo/banco de staging verificados, providers conectados false e outbound
  false.
- O PostgreSQL causal atual passou no source manifest
  `13bafb9812beaa34793cb91cf424a8c308ce64ebadec4f7ff01c040384821ae1`.
  E2E autenticado sintético final, concorrência, idempotência, reopen, receita,
  tenant/RBAC, snapshots e CSV real passaram no release `2da896a`; o CSV
  capturado tem SHA-256
  `4c54ee6e3b0902a149b3be92791e07d161f677bb27311aee88dd4206bba8c44f`.
- O primeiro adversarial final retornou `FIX_FIRST`. Os findings foram
  corrigidos e retestados: LOST sem histórico causal agora falha fechado;
  `LEGACY_WON_UNRECONCILED` continua sem reinterpretação; a exportação CSV é
  executável e testada; o rollback/forward-fix foi ensaiado com falha de deploy
  controlada; os manifests de evidência foram persistidos; e as alegações de
  provider foram estreitadas ao que a missão usou e o runtime mediu.
- O cleanup final não contorna o ledger append-only. As duas empresas e oito
  usuários QA finais foram desativados, sessões/tokens removidos e login
  rejeitado; quatro vendas e três contratos sintéticos permanecem inativos e
  historicamente imutáveis por design. Credencial e manifesto remoto temporário
  foram removidos.
- Produção não recebeu request de aplicação, migration, deploy, escrita ou
  outbound. Somente os deployments oficiais foram consultados read-only e
  permaneceram nos IDs anteriores. Conectores/credenciais reais de produto não
  foram usados por esta missão.
- A revisão adversarial independente pós-fixes retornou
  `FINAL_ADVERSARIAL_VERDICT=SHIP`; o timestamp documental divergente foi
  corrigido em `624d88a` e os 14 artefatos indexados conferiram. O secret sweep
  final e a reconciliação do Sol passaram.
- Estado final: `CANONICAL_SALE_V1=COMPLETE`,
  `READY_FOR_PRODUCTION=YES`, `PENDING_INTERNAL=0`, `UNTESTED_INTERNAL=0` e
  `FALSE_PASS=0`. Isso não autoriza promoção: produção exige missão futura
  separadamente autorizada. `PRODUCTION_CHANGED=false`.
  Autoridade: `docs/CANONICAL_SALE_V1_FINAL_2026-08-29.md` e
  `docs/evidence/CANONICAL_SALE_V1_STAGING_EVIDENCE_2026-08-30.json`.

## STORE-1 — hardening de integridade de valores comerciais (2026-08-28)

- O commit funcional local `79eed4f` endurece precisão/ROUND_HALF_UP, limites `INTEGER`, snapshots catalogados, CAS de `Cliente.valor`, contexto proposta/negócio, importação/Bling, `null` versus zero e apresentação monetária. Leituras/PDF/status/duplicação agora recalculam totais persistidos e falham fechado diante de corrupção.
- Testes disponíveis passaram: backend focal 26/26, suítes SQLite isoladas afetadas, frontend 225/225, focal final 8/8, build, lint e QA visual em 1366×768, 1440×900, 1920×1080 e 900×768. `dev.db` permaneceu no SHA-256 canônico.
- O reviewer adversarial final declarou `RETHINK`: proposta aceita, negócio fechado e valor do cliente continuam sem fonte de verdade transacional; `Cliente.valor`/`Negocio.valor` usam reais inteiros, proposta usa centavos, e não há proposta vencedora/idempotência persistente.
- O gate PostgreSQL causal atual não iniciou porque o daemon Docker local estava indisponível. Nenhum banco oficial/staging foi usado como atalho.
- Produção, cloud, providers reais, outbound, migration, push e deploy permaneceram intocados. Relatório: `docs/STORE1_COMMERCIAL_VALUE_INTEGRITY_FINAL_2026-08-28.md`.

## V73 — publicação da Proposta ↔ Catálogo V1 (2026-08-26)

- A release operacional foi concluída no runtime `eb1cadb8a692dea99a1c0edc888504d22be15a33`, com a migration `20260825170000_add_commercial_proposal_catalog_items` aplicada uma única vez no PostgreSQL oficial 18.6. O banco terminou com 17 migrations, zero falhas, zero `empresaId` nulo e zero runner concorrente.
- A tag imutável `commercial-proposal-catalog-v1-production-pass-2026-08-26` aponta para o runtime publicado. A branch documental `release/ga2-post-e6a` está limpa e alinhada ao remoto; os commits posteriores ao runtime alteram somente ferramentas/documentação.
- Backup oficial custom-format fora do repositório foi restaurado em PostgreSQL 18.6 descartável: `pg_restore --list` com 1.191 entradas, 16 migrations restauradas e zero falhas. O dump contém dados reais, permanece fora do Git e não foi anexado.
- API Railway ficou saudável nos deployments candidatos `af132eb5-ce27-4332-a0af-6aa424200369` e `5bdfb9e8-2e36-4a8c-a177-9595efc36ac5`; Vercel produção está READY em `dpl_GzT5h7Q7paK6mLr7ExAxbkBFFABh`; o worker compatível `db381e6e-3b3a-4c67-a3b9-06a3d52c74d5` executou ciclos sem falhas.
- O freeze de escrita foi aplicado e removido somente após migration/smoke; `health`/`ready` permaneceram disponíveis. A observação pós-release foi curta (`PASS_SHORT_WINDOW`), e não havia propostas reais para smoke legacy/PDF sem criar dados. Testes mutáveis/cross-tenant continuam restritos ao rehearsal/staging.
- Desconto, IA real, Meta, outbound, pedidos, pagamento e reserva permanecem fora da V1. Relatório canônico: `docs/COMMERCIAL_PROPOSAL_CATALOG_V1_PRODUCTION_RELEASE_REPORT_2026-08-26.md`.

## V74 — auditoria pós-release da V1 (2026-08-26)

- A varredura read-only pós-release confirmou worktree/branch remota alinhadas
  em `e5d26a2`, tag apontando para `eb1cadb`, API e worker `SUCCESS`,
  `/health`/`/ready` 200 com banco OK, Vercel canônico 200 e zero eventos de
  erro recentes nos logs consultados.
- Os preflights anteriores receberam banners de snapshot histórico e o
  contrato V1 recebeu addendum operacional; seus resultados originais não foram
  reescritos. O relatório específico está em
  `docs/COMMERCIAL_PROPOSAL_CATALOG_V1_POST_RELEASE_AUDIT_2026-08-26.md`.
- O inventário Railway mostra dois serviços Postgres adicionais online
  (`Postgres` e `Postgres-MpW9`) além do oficial `Postgres-u_yI`. Nenhum foi
  parado ou removido porque a finalidade/dependências não estão comprovadas;
  mapear antes de qualquer limpeza.
- Um reviewer reportou possível saída não sanitizada de variáveis em uma
  consulta operacional anterior. Não há valor em Git, docs ou artefatos, a
  consulta não foi repetida e nenhuma rotação foi feita automaticamente. Se o
  incidente for confirmado, tratar em janela dedicada de rotação, sem expor
  segredos nem interromper produção por tentativa.
- O backup pós-migration foi criado e restaurado em PostgreSQL 18.6
  descartável: 7.574.293 bytes, SHA-256
  `1d1f46505cc397acb60f0a95de05b99e55b28082f2a6fab355b0a79464fb20d9`, 1.201
  entradas, 17 migrations e zero falhas. O dump contém dados reais e permanece
  fora do repositório/anexos.
- A checagem de conexão redigida confirmou o mesmo endpoint, mas credenciais
  diferentes entre API e serviço Postgres (`credentialMatch=false`). Não houve
  sincronização automática; mapear a variável autoritativa e rotacionar em
  janela dedicada é o próximo passo seguro caso o drift seja confirmado.

## V75 — auditoria do comando autônomo de release (2026-08-26)

- O comando foi corrigido e executado como reconciliação idempotente: a V1 já
  estava publicada, a migration já estava aplicada, a tag já apontava para o
  runtime e os serviços estavam saudáveis. Nenhum push, deploy, migration,
  freeze, restart, tag ou escrita foi repetido.
- O relatório da auditoria do comando está em
  `docs/COMMERCIAL_PROPOSAL_CATALOG_V1_AUTONOMOUS_RELEASE_COMMAND_AUDIT_2026-08-26.md`.
- A regra corrigida para futuras execuções é: detectar primeiro o estado
  publicado; se a V1 estiver completa, validar read-only e não reaplicar
  operações irreversíveis. Se a tag apontar para outro SHA ou o schema divergir,
  usar HARD_STOP antes de qualquer escrita.

## V76 — higiene da infraestrutura pós-release (2026-08-26)

- O inventário read-only confirmou `Postgres-u_yI` como banco oficial da API e
  worker. `Postgres` e `Postgres-MpW9` estão online, com volumes próprios e
  dados, mas nenhum URL de conexão da API/worker aponta para eles. Ambos ficam
  intocados até a finalidade e o proprietário serem comprovados.
- A comparação redigida confirmou endpoint e banco iguais entre API e Postgres
  oficial, mas senha diferente (`credentialMatch=false`). O helper foi
  endurecido para usar a fonte efetiva `POSTGRES_DATABASE_URL || DATABASE_URL`
  e nunca emitir valores; nenhuma rotação/sincronização foi feita.
- O relatório sanitizado está em `docs/POST_RELEASE_INFRA_HYGIENE_REPORT_2026-08-26.md`.
  Não houve alteração de produção, migration, deploy, restart ou exclusão.

## V77 — execução das etapas 1 e 3 de higiene (2026-08-26)

- O mapeamento read-only confirmou os dois Postgres extras (`Postgres` e
  `Postgres-MpW9`) como `UNMAPPED_ACTIVE_DATABASE`: ambos online, com volume e
  sem referência nas URLs da API/worker. Nenhum foi parado ou removido.
- A observação curta de produção às 07:15:59 confirmou API, worker e Postgres
  oficial online; `/health=200`, `/ready=200` com banco OK, zero HTTP 5xx no
  lookback, zero erros de API/worker e ciclos de estoque sem falhas.
- Relatório: `docs/POST_RELEASE_INFRA_HYGIENE_STAGE1_3_REPORT_2026-08-26.md`.
  A observação não substitui uma janela histórica longa nem smoke autenticado.

## V78 — auditoria de limpeza dos Postgres extras (2026-08-26)

- A auditoria global cobriu todos os projetos/environments Railway acessíveis,
  referências de conexão, repositório/GitHub e metadados Vercel. Confirmou
  `Postgres--e25` como staging usado por `ga3-bundle-api` e um Postgres separado
  no projeto `crm-postgres-test`; nenhum deles deve ser confundido com os dois
  candidatos de production.
- `Postgres` (83 tabelas, 16 migrations, dados até 28/07) e `Postgres-MpW9`
  (41 tabelas, 1 migration, dados até 28/07) foram inspecionados somente em
  read-only e classificados `UNKNOWN_PRESERVE`. Ambos possuem volumes e dados;
  nenhum backup adicional, stop ou delete foi executado.
- A inspeção pública inicial do banco oficial falhou com credencial stale
  (`28P01`); o probe foi corrigido para usar endpoint público com a credencial
  efetiva da API, e o banco oficial passou com 17 migrations/zero falhas.
- Relatório completo: `docs/POST_RELEASE_DATABASE_CLEANUP_REPORT_2026-08-26.md`.
  Qualquer limpeza futura exige identificação do consumidor de tráfego, dono e
  finalidade; `Postgres-u_yI` permanece protegido por ID e volume.

## V79 — origem/finalidade dos bancos extras (2026-08-26)

- A investigação aprofundada confirmou que `Postgres` (83 tabelas, 16
  migrations, dados até 28/07) e `Postgres-MpW9` (41 tabelas, uma migration,
  dados até 28/07) são snapshots/clones com dados, não bancos vazios. Ambos
  permanecem `UNKNOWN_PRESERVE`.
- O histórico mostra deployments `autoupdate` em 23/08 e deployments removidos
  em 28/07. API/worker continuam exclusivos do `Postgres-u_yI`; staging usa
  `Postgres--e25`; o projeto `crm-postgres-test` possui outro serviço `Postgres`.
  Nomes/hosts não são identidade suficiente.
- O tráfego TCP observado no `Postgres` tem `peerServiceId` indisponível e pode
  incluir o próprio probe via proxy; por isso não foi usado para declarar
  ausência de consumidor. Não houve backup, stop ou delete.
- Relatório: `docs/POST_RELEASE_DATABASE_ORIGIN_AUDIT_2026-08-26.md`.

> **V72 é um snapshot histórico supersedido pela V73/V74.** Os gates de
> produção pendentes abaixo registram o estado anterior à janela oficial.

## V72 — gate PostgreSQL real da proposta ↔ catálogo (2026-08-26)

- O candidato local `release/ga2-post-e6a` está no HEAD
  `0dc7e3f4f8d44f3cdd1921991816e4d922d120d9`, com worktree limpa. O commit
  `0dc7e3f` adiciona somente o relatório; o runtime testado permanece no
  commit `afe830d40972d765d33fd1692c2663f4157c554c`.
- `POSTGRES_REAL_REHEARSAL=PASS_LOCAL_CANDIDATE`: migration boundary, backfill,
  FKs/CHECKs, snapshots, revalidação, ROUND_HALF_UP, CAS e rollback atômico
  passaram em PostgreSQL 18.4 descartável. Frontend `197/197`, build e lint
  também passaram no candidato exato.
- `POSTGRES_REAL_REHEARSAL` não está mais bloqueado por ambiente. Push, backup
  oficial, deploy, migration e smoke de produção continuam pendentes e não
  foram executados. Produção/staging e `backend/prisma/dev.db` permanecem
  intocados.
- A promoção deve usar maintenance read-only, worker parado, backup com
  restore drill e um único dono da migration; o startup normal da API executa
  migrations pendentes automaticamente, portanto canário mutável antes do
  migration gate é proibido.
- O runner PostgreSQL foi ajustado para o layout de volume das imagens 18+;
  a suíte completa e o rollback foram repetidos em `postgres:18.4` com PASS.

## V71 — proposta ↔ catálogo V1 (2026-08-25)

- O contrato aprovado está em
  `docs/COMMERCIAL_PROPOSAL_CATALOG_CONTRACT_V1.md`. A V1 separa
  `CATALOG_ITEM` de `LEGACY_ITEM`, congela preço/moeda/status/SKU/unidade no
  item, mantém ProductOffer como evidência de origem e deixa desconto fora.
- O candidato adiciona migration aditiva SQLite/PostgreSQL para
  `ItemPropostaComercial.empresaId`, quatro FKs compostas tenant-scoped,
  checks de tipo, snapshots, ações de histórico e backfill determinístico dos
  itens existentes como `LEGACY_ITEM`. Nenhuma migration foi aplicada ao banco
  oficial e nenhum deploy foi iniciado neste lote.
- Revalidação server-side ocorre apenas antes de transições materiais de itens
  catalogados; preço, moeda, revisão, validade, estoque e freshness divergentes
  retornam `PROPOSAL_REVALIDATION_REQUIRED` sem alteração silenciosa.
- Sandbox migration `2/2`, testes de serviço `4/4`, PDF/contrato `7/7`,
  frontend global `197/197`, build e lint passaram. PostgreSQL descartável real
  continua bloqueado por ambiente; a suíte global isolada permanece limitada
  pela ausência autorizada do `dev.db` nesta worktree.

## V70 — frontend polling safety (2026-08-25)

- O commit `fbe33dc08e1a9149cfd349b26173dcce6dcad380` reduziu o polling da
  Inbox para 20s e adicionou `AbortController` para cancelar consultas de
  lista, conversa, mensagens, histórico e notas quando a seleção muda ou o
  componente desmonta. Isso evita respostas antigas sobrescrevendo estado e
  reduz chamadas concorrentes sem alterar layout, contrato de dados ou regras
  de negócio.
- Frontend `196/196 PASS`, build TypeScript/Vite e lint PASS. O bundle único
  (~869 kB minificado/~231 kB gzip) permanece apenas como advisory medido;
  nenhum code-split foi feito sem orçamento de produto aprovado.
- Vercel preview e domínio canônico responderam HTTP 200; Railway não recebeu
  mudança de backend. API `/health` respondeu 200 e `/ready` respondeu
  `database=ok`. AI, Meta e outbound permanecem OFF/zero.
- `backend/prisma/dev.db` não foi acessado nem alterado; nenhuma migration,
  schema ou dado oficial mudou.

## V69 — GA3 final runtime hardening (2026-08-25)

- Código final/runtime: `cf7e87f961b05996d4e806ab7bcfd657b2b111f0`; master/release
  apontam para um overlay documental sem mudança de runtime. API Railway `6fe8c55f` e worker `e9fcc843` estão
  SUCCESS/RUNNING; migrations de startup, health/ready e banco OK.
- Sol bloqueadores corrigidos: replay sequencial de opportunity/handoff agora
  revalida parents/ofertas/conversa; redaction profunda trunca em `[truncated]`.
  E6A focal final `45/45 PASS`; regressão global isolada exit 0.
- Tag imutável de runtime: `saas-ga3-final-pass-2026-08-25` aponta para
  `cf7e87f`. A tag intermediária `saas-ga3-performance-security-reliability-pass-2026-08-25`
  permanece intacta em d6 como histórico.
- Vercel continua READY em `dpl_65YLScSrTpiZNnaB5aCiLc2FYwhX` na árvore
  frontend equivalente; AI/Meta/outbound permanecem OFF/zero. PostgreSQL real,
  pg_stat_statements ao vivo e checkpoint >200s continuam gates/advisory honestos.

## V68 — GA3 performance/security/reliability (2026-08-25)

- Código final da rodada: `d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950`; master e
  release apontam para esse SHA. API Railway `59c6142f` e worker `482ac3c0`
  estão SUCCESS/RUNNING; startup concluiu migrations e `/health`/`/ready` 200
  com banco OK.
- Correções causais: contexto AI tenant-scoped, idempotência/runId server-owned,
  ProductOffer revalidado, aprovação sem bypass, settings CAS, evidence
  redaction, allowlist fail-closed, schemas/redaction/TTL de tools, efeitos
  P2002 idempotentes, disponibilidade sem mistura de fontes/unidades, busca
  sem N+1 por padrão e previews bounded, além do bootstrap frontend sem
  `/auth/me` duplicado.
- E6A combinado `43/43 PASS`; regressão backend global isolada no fixture
  temporário terminou exit 0; frontend `195/195`, build e lint PASS. O fixture
  protegido permaneceu SHA `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- Vercel production permanece READY em `dpl_65YLScSrTpiZNnaB5aCiLc2FYwhX`,
  SHA `a3c0600`; a árvore frontend não mudou entre `a3c0600` e `d6b665e`.
- AI/Mock/canary/Meta/outbound permanecem OFF/zero. `POSTGRES_REAL_REHEARSAL`
  e `PG_STAT_STATEMENTS_LIVE` seguem BLOCKED_EXTERNAL por falta de Docker/URL
  descartável; checkpoint histórico ~247s é advisory monitorado, sem tuning
  especulativo. Nenhuma migration/schema/dado oficial foi alterado.

## V67 - publicacao da manutencao pos-GA2 (2026-08-25)

- Source candidato corrigido: `43f6e51`; commit publicado no master: `0a05257`.
- API Railway: `ca0873b5` e redeploy final OFF `a46f7145`, ambos SUCCESS;
  worker: `100c1542`, SUCCESS/RUNNING. `/health` e `/ready` HTTP 200 com banco OK.
- Regressao backend completa em sandbox autorizado: 526 testes descobertos,
  523 pass, 0 falhas e 3 skips explícitos de provas PostgreSQL descartável.
- `CRM_PRISMA_QUERY_OBSERVABILITY` foi ligado somente na API, threshold 50 ms,
  por janela controlada no deploy `3d4d666c`; não houve evento lento/erro e a
  variável voltou a `false` no redeploy `a46f7145`.
- AI/Meta permanecem OFF, allowlist vazia e outbound zero. Nenhuma migration ou
  alteração de dados foi feita. O runner PostgreSQL real segue pendente apenas
  de Docker/URL descartável autorizada.

Data da verificacao: 13/08/2026.

## Checkpoint V48 pre-producao — consultar Git para os refs atuais

- Branch candidata: `feature/postgres-migration-prep`. O SHA exato corrente
  deve ser obtido com `git rev-parse HEAD` e `git ls-remote origin`; este
  documento nao fixa o HEAD criado pelo proprio commit documental.
- O novo RC funcional aprovado nos gates locais e TEST_ONLY da V48 e
  `3271a3de1111edf1a488f7d71f1e989c799d8736`. Ele contem a remediation
  migration-boundary-aware do tenant verifier e o timeout finito das
  transacoes de Email inbound PostgreSQL. Imediatamente antes deste checkpoint,
  a feature estava em `6d9db084a971a79bee9d2828e8ebb937467b3c8c`, com somente
  um commit complementar de teste e runbook depois do RC funcional.
- O RC Meta historico `177d2e192fcc31e0f89542a5c03e8700d9532431`
  permanece na ancestralidade. O baseline V40
  `f47543e5281a8a0c771116878c3d29c324419f79` acrescentou apenas seguranca,
  testes e documentacao sobre o produto aprovado daquela fase.
- No preflight V48, `origin/master` ainda estava em
  `6e39e2a5b9dbb2bba1cf4c0376ef2e09a367db62`; a feature era descendente
  linear e fast-forwardable. Esse e o baseline pre-producao, nao uma afirmacao
  sobre os refs depois da convergencia.
- V48 aprovou antes deste checkpoint: Email inbound PostgreSQL 10/10, bateria
  PostgreSQL completa 74/74, verifier 6/8 -> 7/8 -> 8/8, runner backend
  canonico SQLite, WhatsApp sem provider/outbound real, Meta fail-closed sem
  network real e o `RC_PRECOMMIT_SHIP` do Sol Extra High.
- A producao continuava no SHA antigo `6e39e2a`, PostgreSQL 18.4 com seis
  migrations aplicadas e exatamente duas Meta pendentes, frontend e `/health`
  HTTP 200. Backup logico, restore drill, migrations oficiais, master, deploy
  e smoke de producao ainda nao haviam sido executados neste checkpoint.
- QA V35 no HOMOLOG confirmou card Instagram/Meta visivel, estado
  `NOT_CONFIGURED` e CTA honesto desabilitado por falta de canal real.
- Nenhuma conta Meta foi conectada; Meta Developer, OAuth/E2E real, Graph API,
  token, subscription e outbound continuam fora deste checkpoint.
- `backend/prisma/dev.db` permanece imutavel, SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.

## Estrutura ativa

- Frontend React, Vite e TypeScript em `frontend`.
- Backend Express e Prisma em `backend`; SQLite permanece como schema-fonte e
  banco local protegido, enquanto o runtime oficial usa PostgreSQL.
- Estruturas antigas da raiz `src` e `prisma` estao congeladas; nao remove-las
  nem utiliza-las sem auditoria especifica.

## Git

- Ultimo commit funcional publicado do frontend:
  `9b14b0587fd4a5f223589440f7d4b186e2d91b0e`.
- Historico: o baseline Git do candidato RC1 validado foi o commit exclusivamente documental
  `6e76d9695744da7c2edfa1e4481dfdeb9c750fa4`, posterior ao ultimo commit
  funcional e sem alteracao de produto. A feature Meta avancou depois desse
  checkpoint; imediatamente antes da V45, `origin/master` estava em
  `6e39e2a`. Consultar Git para os refs atuais.
- Branch de trabalho ativa: `feature/postgres-migration-prep`.
- Historico: naquele checkpoint, o candidato RC1 possuia 102 paths explicitamente
  staged para publicacao controlada e o worktree coincidia com o index.
- Historico: ainda nao havia commit, push ou deploy do RC1 naquele checkpoint.
- `feature/customer-360` e uma referencia historica totalmente incorporada em
  `origin/master`; nao representa o fluxo de trabalho ativo.
- A master local divergente preserva o trabalho isolado de Estoque.
- Commit isolado de Estoque: `618a289`.
- Branch de arquivo: `archive/estoque-local-618a289`.
- Novas releases partem de `origin/master` ou da branch de release indicada.

## Producao oficial

- Frontend canonico: https://crm-murex-six-83.vercel.app.
- Backend: https://api-production-875f9.up.railway.app.
- Servico Railway: `api`; nao utilizar `crm-agro-demo-api`.
- A release de Usuarios e Seguranca foi promovida pelo pipeline oficial no SHA
  `eff7bc978a6a38cf690da623725a9410ec43ae4f`. API, worker, frontend e
  PostgreSQL estao online; `/health` e o frontend respondem HTTP 200.
- O frontend do Painel Comercial foi publicado posteriormente no SHA
  `9b14b0587fd4a5f223589440f7d4b186e2d91b0e`. O status Vercel do commit esta
  concluido, o frontend canonico responde HTTP 200 e o bundle publicado contem
  a nova estrutura do Painel Comercial.
- A migration aditiva `20260801150000_add_user_security_foundation` foi
  aplicada pelo startup oficial, sem drop, rename ou backfill. No estado
  oficial historico em `6e39e2a` (antes das migrations Meta exclusivas da
  feature), o gate `production-readonly` reconhece 87 relacoes, zero orfaos e
  zero vinculos cruzados; o RC da feature atual usa o manifesto de 89.
- H2, H3, H4, H5 e H6 estao publicadas. A qualificacao comercial, as propostas,
  a Agenda e Acompanhamentos, o Cliente 360 graus e o tempo de etapa com
  proxima acao estao disponiveis em producao.

### Historico operacional de releases anteriores

- H1.1 foi publicada no commit
  `93e1c0b2ea7d9d4f13b06fba2f8c275c734bb312`. O Railway publicou o deployment
  `769fba0f-d9b5-4076-bbd9-810059f05912` e a Vercel publicou o deployment
  `Ai35r8GaNCQUGLSEoV5nUhSmprbe`, ambos a partir do commit exato; Railway ficou
  `Active`, Vercel ficou `Ready` e o health permaneceu HTTP 200.
- Na release SQLite historica H1.1, `backend/scripts/start-production.cjs`
  executava migrations no processo principal, depois da montagem do volume e
  antes da API; nao usava Pre-Deploy nem executava migration durante o build.
- Naquele runtime SQLite, o entrypoint validava o servico Railway, o volume
  `/app/data`, a `DATABASE_URL` dentro do volume, o schema e a Prisma CLI; uma
  replica era obrigatoria. O startup atual seleciona e valida o provider real,
  e a producao oficial pre-V45 usa PostgreSQL.
- Falha de validacao ou migration continua impedindo a API de iniciar. O
  deployment historico H1.1 confirmou a ordem validacao ->
  `prisma migrate deploy` -> 18 migrations sem pendencias -> API.
- O banco permaneceu com 770.048 bytes, SHA-256 fisico
  `0be2e7280ee4e907d79717c55dfca25c89b8f25ea83afc34225cd007ce2ad30f`,
  `quick_check` `ok`, zero violacao de foreign key, contagens preservadas e
  commercial data fingerprint
  `35745c8292fcb04f43d5c2b76d7db798dbcb59ac4868e8bfe8992384b41aa700`.
  Nenhum restart adicional ou backup novo foi executado; os backups H1P foram
  preservados.
- A automacao nao autoriza migrations futuras sem auditoria, backup, ensaio,
  compatibilidade e rollback. Operacoes destrutivas, etapas contract, colunas
  obrigatorias sem estrategia e data migrations pesadas permanecem bloqueadas
  pelo protocolo de release.
- O WhatsApp permanece pausado, sem flags, capabilities, segredos ou chamada
  externa.

## Banco local protegido

- Arquivo: `backend/prisma/dev.db`.
- Tamanho: 1.282.048 bytes.
- SHA-256: `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- O `dev.db` protegido registra 30 migrations; a arvore de migrations da
  feature possui 32, incluindo as duas migrations Meta. `integrity_check` e
  `quick_check` sao esperados `ok`;
  foreign key check esperado zero.
- Baseline forense de 03/08/2026: paginas de 4.096 bytes, `page_count=313`,
  `freelist_count=0`, 47 tabelas de aplicacao coerentes com os 47 models
  Prisma e nenhum objeto inesperado. O crescimento desde o baseline historico
  de 9 migrations corresponde as 21 migrations aditivas posteriores; os
  registros historicos abaixo preservam os valores observados em suas datas.
- Nunca escrever nesse banco durante testes.

## Reconciliacao read-only do banco de producao

- Em 2026-07-21, uma copia consistente do banco oficial foi inspecionada
  exclusivamente em `%TEMP%\crm-production-db-reconciliation`, sem consulta ou
  escrita direta no arquivo operacional.
- O arquivo principal tinha 770.048 bytes e SHA-256 fisico
  `13aa8b6a88784d48bc4592ff3a2bb33188dcbc51e4ee05af545b822ad206b510`;
  nao havia arquivos WAL ou SHM e o `journal_mode` observado foi `delete`.
- O fingerprint logico deterministico das tabelas comerciais foi
  `30f8f67a2fbce515ed57a8f2d6141adf010d6580eb2b666e9c200f1ef1b71e50`.
- As 17 migrations, schema, indices, contagens comerciais, `quick_check` e
  `foreign_key_check` permaneceram consistentes. A diferenca entre os SHAs
  fisicos historicos foi classificada como nao semantica; a unica variacao
  logica nao comercial foi o registro normal de ultimo login do usuario.
- Conclusao: BANCO LOGICAMENTE INTEGRO E SEM ALTERACAO COMERCIAL INESPERADA.

## Marcos concluidos

- Leads e canais, Inbox colaborativa e captacao de Lead pelo Site.
- Funcionalidades por tenant.
- Conversao de Lead para Negocio e Kanban baseado em Negocio.
- Vinculo legado controlado; novo Kanban ativo somente para empresa 1.

## Estado do Kanban

- Flags globais do novo Kanban ativas e capability ativa somente para
  `empresaId=1`.
- Tenant 1 utiliza um card baseado em Negocio.
- Kanban legado permanece disponivel para rollback e nao deve ser removido nesta
  fase.

## Caixa de Entrada operacional

- H1 publicada no commit `048ab71025bb55e83bd37a9f587fdc39303d00b1`.
  O Railway publicou o deployment
  `e60681ec-89f3-4061-a298-11f24e778066` e a Vercel publicou o deployment
  `4gTzmSXLvVsCBRMaNyvuRjC2ua6L`, ambos a partir do commit exato.
- A producao possui 18 migrations. A migration aditiva
  `20260721123000_add_inbox_operational_history` foi aplicada uma vez e
  acrescentou somente `acaoAtendimento`, `estadoAnterior` e `estadoNovo`, todos
  opcionais, a `HistoricoAtribuicao`.
- O backup consistente pre-H1P
  `/app/data/crm-agro-pre-h1p-20260721T191606Z.db` possui 761.856 bytes e
  SHA-256 `8bce2f9ae7469ee768a8b570fc30ae7a302a8a3dc28d7840618762f6c3644434`.
  O backup consistente pos-H1P
  `/app/data/crm-agro-post-h1p-20260721T193239Z.db` possui 761.856 bytes e
  SHA-256 `8d8e44eea60ba2b076f7219ea9b4a34002ed0c80ee26ac01a5573e5c84498cdf`.
- O banco operacional pos-migration possui 770.048 bytes e SHA-256 fisico
  `8d354f3f0018fd06fd8640fc217c6eaf4ec9d3229fa34a2d829d2c63bb6aa317`.
  O schema fingerprint mudou de
  `215b5db1723bf5c19c46e670e0604ba5e82d302eeb26e8c7bc977f0bfe7c5894`
  para `500ec113babd15f92a0ee876359dd05fadb4739fa39618e6c43960b25738b79b`.
  O commercial data fingerprint permaneceu
  `6096855efb3bb376b99a39580d6ddbf23fcb38e01915700234e4fdb3a8a0ee5e`
  antes e depois da migration.
- As contagens permaneceram: Empresa 1, Usuario 1, Cliente 7, Lead 1,
  Negocio 1, CanalIntegracao 2, ContatoCanal 2, ConversaCanal 2,
  MensagemCanal 21, EventoWebhook 1, Nota 13, Acompanhamento 2 e
  HistoricoAtribuicao 2. `quick_check` permaneceu `ok` e
  `foreign_key_check` permaneceu sem violacoes.
- Estados suportados: `NOVA`, `AGUARDANDO_ATENDIMENTO`, `EM_ATENDIMENTO`,
  `AGUARDANDO_CLIENTE`, `PENDENTE` e `ENCERRADA`.
- A fila compartilhada permite filtrar todas, nao atribuidas, conversas do
  usuario, estados e SLAs em atencao ou critico, sempre no tenant autenticado.
- Assumir, transferir, devolver a fila, aguardar cliente, marcar como pendente,
  encerrar e reabrir usam acoes explicitas, historico e concorrencia atomica.
- O lease existente de resposta foi preservado com duracao de dois minutos e
  relogio do servidor; ele nao altera o responsavel permanente.
- A migration nao foi aplicada ao banco local protegido.
- O SLA e derivado da espera por atencao humana: ate 10 minutos dentro do prazo,
  acima de 10 em atencao, acima de 15 atrasado e acima de 30 critico.
- Mensagens inbound nao lidas sao contadas e marcadas como lidas apenas depois
  do carregamento bem-sucedido da conversa. Transferencia e retorno a fila nao
  apagam esse estado.
- ADMIN, GERENTE e VENDEDOR reutilizam as permissoes existentes de comunicacao;
  o backend impede acesso entre tenants e limita cada acao conforme autoria e
  responsabilidade.
- Testes focados de backend, migration, colaboracao, Site e frontend passaram,
  assim como lint, build, Prisma validate, verificacoes de sintaxe e QA visual
  em 1366x768, 1440x900, 1920x1080 e 900x768.
- O QA publico de producao confirmou health, protecao de autenticacao, acesso
  direto e refresh da Inbox, roteamento SPA e ausencia de overflow nos quatro
  viewports. Nao havia sessao ADMIN oferecida; por isso, QA autenticado, smoke
  operacional e concorrencia em producao nao foram executados. Nenhum dado foi
  alterado e a cobertura dessas operacoes permaneceu nos testes isolados.
- O warning conhecido do bundle acima de 500 kB permanece; o build terminou
  com sucesso.
- Limitacoes: leitura continua sendo global por mensagem, nao por usuario; SLA
  e calculado, nao persistido; nao ha lease estrutural novo nem integracao
  externa nesta release. Nenhum `Negocio` e criado pelas acoes da Inbox.

## Qualificacao comercial pela Caixa de Entrada

- H2 foi publicada no commit
  `2c0dbe3cc8cdebc78b7bdd230ef19899edfd787b`. O Railway publicou o deployment
  `8d28a743-9219-48cb-a8d5-7fe0890df8d9` e a Vercel publicou o deployment
  `FqAAUyaqukGTFCVopYQUsWQngrbq`, ambos a partir do commit exato; Railway ficou
  `Active`, Vercel ficou `Ready` e o health permaneceu HTTP 200.
- O drawer existente da Inbox recebeu um painel comercial compacto para
  qualificar o atendimento, revisar possiveis duplicidades, criar um Negocio
  por confirmacao explicita, vincular um Negocio elegivel e abrir o registro
  correto no Kanban.
- A qualificacao reutiliza `Cliente.interesse`, `Cliente.valor`,
  `Cliente.proximoFollowUp`, `Lead.interesse`, `Lead.status`, `Acompanhamento`
  e o servico oficial `convertLeadToBusiness`. Interesse e proxima acao sao
  obrigatorios; prioridade e obrigatoria, valor e data de retorno sao
  opcionais e validados.
- O vinculo estrutural reutiliza `ConversaCanal.leadId` e o `Negocio.leadId`
  unico. Nenhum Negocio e criado ao abrir, assumir, qualificar ou encerrar uma
  conversa; criacao duplicada concorrente retorna conflito controlado.
- A migration aditiva
  `20260721213000_add_inbox_commercial_qualification` cria somente
  `HistoricoQualificacaoConversa`, com vinculos de tenant, conversa, Cliente,
  Lead, Negocio e autor. Ela foi validada em sandbox e aplicada uma vez pelo
  startup automatico do Railway; a producao possui 19 migrations sem
  pendencias e o `dev.db` protegido permanece com 9 migrations.
- ADMIN e GERENTE podem qualificar, criar e vincular no tenant autenticado.
  VENDEDOR atua somente quando autorizado pela responsabilidade atual; outro
  tenant recebe `404` e ausencia de permissao recebe `403`. `empresaId` do
  frontend nunca e autoridade.
- Testes focais cobriram validacao, isolamento, permissao, duplicidade,
  concorrencia, criacao pelo conversor oficial, vinculo, historico e
  preservacao de conversa e mensagens. Regressoes de H1, G1, G2A, Site e
  frontend passaram, assim como Prisma validate, migration isolada, lint,
  build, `node --check` e `git diff --check`.
- O QA visual local em 1366x768, 1440x900, 1920x1080 e 900x768 validou os
  estados sem qualificacao, qualificado, duplicidade, Negocio vinculado, erro
  recuperavel e falta de permissao. A data de retorno opcional foi corrigida
  para permanecer como nao definida quando omitida. Evidencias ficaram somente
  em `%TEMP%\crm-inbox-h2-visual-qa`. Em producao, a sessao ADMIN oferecida
  confirmou o painel, o vinculo existente e a abertura do Negocio correto no
  Kanban. O smoke completo de qualificacao e criacao nao foi executado porque
  uma fixture ja possuia Negocio e a outra nao possuia Lead valido; nenhum
  Cliente, Lead ou Negocio foi criado ou alterado.
- O backup consistente pre-H2P
  `/app/data/crm-agro-pre-h2p-20260722T005707Z.db` possui 761.856 bytes e
  SHA-256 `f2c987d188608f7963c3c5bac3027d8878555068ee76635f0cd584ac5632455a`.
  O backup consistente pos-H2P
  `/app/data/crm-agro-post-h2p-20260722T010651Z.db` possui 790.528 bytes e
  SHA-256 `8fe3333e94589051c9da9dd64c26c96faa4c6fae3d7fac2d1fba7323cadce6b5`.
- O banco operacional possui 794.624 bytes, SHA-256 fisico
  `4d2c796e577ba5ad00cee37076b19cf541050526cfa5ef957d129f99e94b382b`,
  `quick_check` `ok` e zero violacao de foreign key. As contagens de Cliente 7,
  Lead 1, Negocio 1, ConversaCanal 2, MensagemCanal 21 e EventoWebhook 1 foram
  preservadas. O commercial fingerprint mudou de
  `4fd79f282c7fb18b93256ce15eec2e185a1bbcfc1af3c69b295f3ab810b0544d`
  para `a27794c633f407555def2c7894be6e7a2c7cd79b01b78f885c45fd65729eb676`
  somente pelo smoke autorizado: uma conversa simulada foi assumida e
  devolvida a fila, duas linhas append-only foram adicionadas ao historico e
  as mensagens abertas foram marcadas como lidas.
- Limitacoes: nao existe remocao de vinculo porque nao ha regra de dominio
  aprovada; a busca de Negocios e limitada aos ativos do mesmo Cliente; a data
  interna obrigatoria de `Acompanhamento` usa o momento da qualificacao quando
  nenhuma data de retorno e informada. O smoke comercial completo permanece
  coberto pelos testes isolados porque nao havia fixture produtiva elegivel.
- O WhatsApp continua pausado, sem Meta, chamada externa, flags, capabilities
  ou credenciais ativadas. A integracao de fixture permanece em `MODO_TESTE`,
  sem credencial e sem operacao real.

## Propostas comerciais

- H3 foi publicada no commit
  `7b9f5564272a8df740cfd65e7c10ad9aed234e79`. O Railway publicou o deployment
  `098d27f1-b2d7-486c-874c-4708c8cd223f` e a Vercel publicou o deployment
  `dpl_6ipwitCh318aBnHjdQaLLprwrxUK`; ambos partiram do commit exato, com
  Railway `Active`, Vercel `Ready` e health HTTP 200.
- A migration aditiva `20260722013000_add_commercial_proposals` cria
  `PropostaComercial`, `ItemPropostaComercial` e
  `HistoricoPropostaComercial`, sem alterar registros comerciais existentes.
  Ela foi validada em sandbox e aplicada uma vez pelo startup automatico do
  Railway. A producao possui 20 migrations sem pendencias.
- Propostas pertencem ao tenant, Cliente e Negocio, com Lead opcional,
  responsavel, autor, codigo unico por tenant, versao, revisao e concorrencia
  otimista. Itens e descontos sao validados e os totais sao calculados pelo
  backend.
- Os status suportados sao `RASCUNHO`, `PRONTA`, `ENVIADA`, `ACEITA`,
  `RECUSADA`, `VENCIDA` e `CANCELADA`. Propostas imutaveis exigem duplicacao
  como nova versao; `ENVIADA` e somente um estado manual e nao aciona canal
  externo.
- O fluxo reutiliza o drawer do Negocio para listar, criar e editar rascunhos,
  alterar status, duplicar versao, consultar historico e abrir o PDF gerado no
  backend sem servico externo.
- Testes focais de migration, backend e frontend passaram, junto das regressoes
  de H2 e G2A, Prisma validate, lint, build, `node --check` e
  `git diff --check`. O warning conhecido de chunk acima de 500 kB permanece.
- O QA local em 1366x768, 1440x900, 1920x1080 e 900x768 validou lista,
  formulario, itens, totais, status, versionamento, historico, PDF e erro
  recuperavel, sem overflow horizontal. Evidencias ficaram somente em
  `%TEMP%\crm-h3-proposals-visual-qa`.
- O backup consistente pre-H3P
  `/app/data/crm-agro-pre-h3p-20260722T022813Z.db` possui 790.528 bytes e
  SHA-256 `8fe3333e94589051c9da9dd64c26c96faa4c6fae3d7fac2d1fba7323cadce6b5`.
  O backup consistente pos-H3P
  `/app/data/crm-agro-post-h3p-20260722T023800Z.db` possui 847.872 bytes e
  SHA-256 `6560787a4bc0aa81765fd6267fc490938d1ff45aef9b6498d338bd466b1a6dd7`.
- O schema fingerprint mudou de
  `5e9a0b7f05d9ea323d1841997ed22d8173739b997ae6f7a04164c931d7e0a5b0`
  para `744018a91d1ed1409332a30e22066319674d670109c4c4bfb508c224776656ac`,
  enquanto o commercial data fingerprint comparavel permaneceu
  `71d0be6a879a9e3100cdacf574082b86c5c27084b9f41dbe316b27b2b1b42f02`.
  `quick_check` ficou `ok`, nao houve violacao de foreign key e Cliente 7,
  Lead 1, Negocio 1, ConversaCanal 2 e MensagemCanal 21 foram preservados.
- Nao havia sessao ADMIN oferecida durante a H3P; portanto, o smoke autenticado
  nao foi executado e nenhuma proposta de producao foi criada. A cobertura
  funcional permaneceu nos testes isolados e o acesso publico confirmou SPA,
  alias canonico, health e protecao de autenticacao.
- Limitacoes: nao existe envio externo, faturamento ou aceite automatico; o PDF
  e deliberadamente simples e a proposta permanece vinculada ao contexto do
  Negocio. O WhatsApp continua pausado e nenhuma chamada Meta foi realizada.

## Agenda e acompanhamentos

- H4 publicada no commit
  `0bf2fcf3580552ee5f6383b7ff05f6945d8c415a`. O Railway esta Active no
  deployment `27d5f9b0-95b7-483e-8f69-02b388b0c4df` e a Vercel esta Ready no
  deployment `BUXM5M2QtYDi9y33bRPQnw3ja7VW`, com o alias canonico preservado.
- A migration aditiva `20260722043000_add_agenda_and_followups` foi aplicada
  uma vez pelo startup automatico, elevando producao para 21 migrations. A API
  iniciou somente depois da migration e permanece com health `200`.
- A estrutura de `Acompanhamento` atende tarefas, retornos, reunioes, ligacoes,
  visitas e outros compromissos. Os status publicados sao `PENDENTE`,
  `EM_ANDAMENTO`, `CONCLUIDO` e `CANCELADO`, com atraso derivado pelo servidor.
- A agenda oferece Minha agenda, Hoje, Proximos, Atrasados, Concluidos, Equipe
  e Todos, com filtros por responsavel, tipo, status, prioridade e vinculos a
  Cliente, Lead, Negocio, ConversaCanal e PropostaComercial.
- Criacao, edicao, transferencia, reagendamento, inicio, conclusao idempotente,
  cancelamento e reabertura usam revisao otimista. Conflitos preservam a
  primeira confirmacao e retornam resposta controlada para a segunda.
- `HistoricoAcompanhamento` registra autor, acao, estados, responsaveis, datas e
  observacao sanitizada na mesma transacao. ADMIN e GERENTE possuem visao da
  equipe; VENDEDOR opera somente o escopo permitido do proprio tenant.
- O backup pre-H4P
  `/app/data/crm-agro-pre-h4p-20260722T042210Z.db` possui 847872 bytes e SHA-256
  `42099209ba86c6655b36769d72aa19c907f3b399d90608bcc2a9cae5843b686d`.
  O backup pos-H4P `/app/data/crm-agro-post-h4p-20260722T043522Z.db` possui
  876544 bytes e SHA-256
  `17d11d8a77d4c8fc49409adc228cbf9c7d8359d1f9a9f67e192cbbe8856badd3`.
- O banco pos-migration possui 880640 bytes, SHA-256 fisico
  `2886f176a37fab3e4643101172217e0c7cf4b4235efddb206a2b7f566592c546`,
  `quick_check` ok e zero violacoes de foreign key. O fingerprint comercial
  permaneceu `e2d6ea4c796f56d2871454ae323f3999548927609c20d5ab9e84f91e258766e3`
  e todas as contagens comerciais anteriores foram preservadas.
- Testes de migration, backend, concorrencia, tenant, permissoes e frontend,
  Prisma validate, lint, build, `node --check` e `git diff --check` passaram. O
  warning conhecido do bundle acima de 500 kB permanece.
- O QA de producao em 1366x768, 1440x900, 1920x1080 e 900x768 validou agenda,
  filtros, formulario, responsividade e ausencia de overflow. O smoke de escrita
  nao foi executado porque a automacao DOM/CDP nao conseguiu preencher com
  seguranca os controles nativos de data e hora; nenhuma escrita foi contornada
  por API e `Acompanhamento` permaneceu com 2 registros, sem historico novo.
- Nao houve chamada externa, conexao Meta ou envio. Atrasos nao geram
  notificacao externa e nao existe calendario mensal complexo. O WhatsApp
  continua formalmente pausado aguardando autenticacao manual da Meta.

## Cliente 360 graus

- H5P foi publicada em 26/07/2026 no commit
  `e308b1bd4d554a879dd6a112c4ed82a29598a376`. O Railway esta `Active` no
  deployment `f66f3476-3e04-4973-b5dd-0d75f6c8a656` e a Vercel esta `Ready`
  no deployment `DtRsP7PvEMKBtmthUp7My9hnLgC8`, com o alias canonico
  preservado.
- `Cliente` continua sendo a entidade canonica. A migration aditiva
  `20260722133000_add_customer_360_fields` acrescenta somente `cidade`,
  `estado`, `cpfCnpj` opcionais e `revisao` com valor inicial 1. Ela foi
  aplicada exatamente uma vez em producao pelo startup automatico, elevando o
  total de 21 para 22 migrations, sem pendencias.
- A API oferece `GET /clientes/:id/360`, `GET /clientes/:id/timeline` e
  `PATCH /clientes/:id/cadastro`. Tenant vem exclusivamente da sessao,
  atualizacoes cadastrais usam revisao otimista e conflitos retornam `409`.
  CPF/CNPJ e UF sao normalizados e validados; o fluxo Site preenche cidade e
  estado somente quando os campos existentes estao vazios.
- A visao consolidada reutiliza Leads, Negocios, Propostas, Acompanhamentos,
  Contatos e Conversas do Cliente. A timeline paginada e filtravel deriva
  mensagens, ligacoes, visitas, propostas, negocios, acompanhamentos, notas e
  qualificacoes das entidades reais, preservando proveniencia e navegacao de
  contexto, sem criar uma segunda tabela de historico.
- Compras anteriores sao exibidas somente para `Negocio.etapa = FECHADO`;
  propostas enviadas ou aceitas nao sao inferidas como compra. O resumo usa
  apenas pipeline, responsavel, ultima atividade e contagens obtidas das fontes
  comerciais existentes.
- ADMIN, GERENTE e VENDEDOR reutilizam o acesso comercial atual dentro do
  tenant. Outro tenant recebe `404`; nao existe capability granular de Cliente
  nem responsavel direto no modelo atual, limitacao preservada sem criar regra
  paralela nesta fase.
- Testes focais de migration, backend, CPF/CNPJ, tenant, paginacao, filtros,
  concorrencia, fontes reais e regressao Site passaram. Os 33 testes frontend,
  lint, build, Prisma validate, `node --check` e `git diff --check` tambem
  passaram. O warning conhecido do bundle acima de 500 kB permanece.
- O QA local em 1366x768, 1440x900, 1920x1080 e 900x768 validou cadastro,
  resumo, compras comprovadas, timeline com varios tipos, filtro de mensagens,
  navegacao contextual, edicao e erro recuperavel, sem overflow horizontal.
  Evidencias ficaram somente em `%TEMP%\crm-h5-customer-360-qa`.
- O backup consistente pre-H5P
  `/app/data/crm-agro-pre-h5p-20260726T182022Z.db` possui 876.544 bytes e
  SHA-256
  `b9a219af857b0e2d4678f20c39f4a2677fed40be7000d10092ae64b3aa46b874`.
  O backup consistente pos-H5P
  `/app/data/crm-agro-post-h5p-20260726T182638Z.db` possui 876.544 bytes e
  SHA-256
  `0a1e334a2106d1d9dfcf3bb330045830fdd0c9a03ecef154bc4a9254f62b967b`.
- O banco de producao pos-migration possui 880.640 bytes, SHA-256 fisico
  `04bc3aa2eff00b137ac792c1a989035145dd327d04d75b802e818ff5ac541ac8`,
  `quick_check` `ok`, zero violacoes de foreign key e sem WAL ou SHM. O
  fingerprint estrutural passou de
  `7439fdffae9da1f553c984f655e42b3270f1d9f1209d19efcfa6a28a12283462`
  para
  `602cf1f43bad70d180a421cdcef28703165c2625da98858be0f7762b5bc81172`;
  o fingerprint comercial compativel permaneceu
  `709142ef246109fc1ecfa5749786472253fbe0a31e7da9590e188d2d769f2181`.
- O QA de producao foi somente leitura. Sem sessao ADMIN autenticada
  disponivel, foram validados health HTTP 200, rotas SPA sem 404 de
  infraestrutura, protecao por login e respostas HTTP 401 das APIs H5; a
  cobertura autenticada de cadastro, timeline, filtros e navegacao permanece
  comprovada pelos testes e pelo QA local aprovado.
- O `dev.db` permaneceu intacto com 532.480 bytes, SHA-256
  `cb62b4b2584162c9f66ff8e722319b96cf2697ebe9ea0a745a388d7ca572c26a`,
  9 migrations, `quick_check` `ok`, zero violacoes de foreign key e sem WAL ou
  SHM. Nenhuma chamada externa ocorreu e o WhatsApp continua desligado.

## Tempo de etapa e proxima acao

- H6A e H6B foram publicadas em 26/07/2026 no commit
  `2819c1da4db8c68446df001f996b0d57ab735843`. O Railway esta `Active` no
  deployment `69782023-900a-43c8-9e07-25e84f6e13be` e a Vercel esta `Ready`
  no deployment `5KKhvvV6jgQPNMaiKcAcErxfpja2`, ambos no commit exato e com
  health HTTP 200.
- A migration aditiva
  `20260726123000_add_business_stage_timing` acrescenta a `Negocio` somente as
  datas opcionais de entrada na etapa e ultima movimentacao. O
  `HistoricoAtribuicao` existente foi ampliado com etapa anterior, etapa nova,
  entrada, saida, duracao em segundos e marcador opcional de estimativa. Nao
  foi criada uma segunda timeline ou tabela de historico.
- A movimentacao do Kanban continua tenant-scoped e respeita ADMIN, GERENTE e
  VENDEDOR responsavel. A atualizacao da etapa e o registro do historico
  ocorrem na mesma transacao; duas movimentacoes concorrentes preservam a
  primeira confirmacao e a segunda recebe conflito `409`.
- Negocios novos criados pelo conversor oficial registram a entrada inicial na
  etapa `NOVO`. Para registros anteriores sem a nova data, o backend usa
  `updatedAt` como referencia estimada ate a primeira movimentacao rastreada,
  expondo explicitamente `estimado: true`.
- A proxima acao reutiliza o `Acompanhamento` ativo mais proximo, vinculado ao
  mesmo Negocio e tenant. Alteracoes feitas pela Agenda aparecem na API do
  Kanban sem duplicar persistencia. Negocio ativo e considerado parado quando
  nao possui proxima acao ou quando ela esta atrasada; `FECHADO` e `PERDIDO`
  nunca sao classificados como parados.
- `GET /negocios`, `GET /negocios/:id` e
  `GET /negocios/:id/historico-etapas` entregam a infraestrutura tecnica de
  tempo atual, tempo acumulado, proxima acao, estado parado e movimentos
  registrados. O historico possui paginacao estavel e preserva o isolamento
  por tenant.
- O Kanban apresenta tempo na etapa, proxima acao e indicador moderado de
  negocio parado. Os filtros server-side cobrem negocios parados, sem proxima
  acao, com proxima acao atrasada e com proxima acao hoje.
- O drawer do Negocio apresenta etapa atual, tempo atual, tempo acumulado,
  proxima acao e historico incremental. Referencias estimadas e historicos
  parciais sao identificados explicitamente, e a etapa atual aberta nao e
  confundida com uma movimentacao concluida.
- A carga inicial do historico foi estruturada em fluxo assincrono agendado,
  com sequencia de requisicao e descarte de respostas obsoletas. Isso evita
  atualizacao sincrona de estado no efeito, requisicao duplicada em StrictMode
  e atualizacao apos desmontagem, preservando loading, vazio, erro e paginacao.
- A migration representativa preservou os dados comerciais e completou 23
  migrations em sandbox. Testes focais e regressoes de Kanban, Agenda,
  conversao Lead para Negocio, qualificacao da Inbox, Site e Cliente 360
  passaram, assim como Prisma validate, lint, build, `node --check` e
  `git diff --check`. O warning conhecido do bundle acima de 500 kB permanece.
- O startup oficial do Railway encontrou 23 migrations, aplicou uma unica vez
  `20260726123000_add_business_stage_timing`, concluiu `prisma migrate deploy`
  e iniciou a API somente depois do sucesso. Nao houve comando manual de
  migration nem deployment duplicado.
- O QA local em 1366x768, 1440x900, 1920x1080 e 900x768 validou cards,
  filtros, drawer, tempos, proxima acao, negocio parado, historico paginado,
  estado estimado, textos longos, loading, vazio e erro recuperavel. Nao houve
  erro React no console nem loop observado; as evidencias permaneceram somente
  em `%TEMP%\crm-h6b-stage-timing-qa`.
- O QA autenticado de producao nas mesmas quatro larguras confirmou Kanban,
  filtro operacional, card, tempo estimado na etapa, negocio parado, proxima
  acao, drawer, historico parcial, vazio e paginacao. As rotas de Negocios e
  historico responderam sem HTTP 500 e o console permaneceu sem erros. As
  evidencias ficaram somente em `%TEMP%\crm-h6-production-qa`.
- Limitacoes: o teste legado de integracao de autenticacao tenta copiar o
  `dev.db` protegido e foi bloqueado pelo supervisor antes de executar a
  aplicacao; autenticacao permaneceu coberta pelos testes H6A/H6B. O estado de
  erro recuperavel nao foi provocado deliberadamente em producao. H6 nao
  implementa automacoes, notificacoes, backfill historico nem relatorios.
  O WhatsApp continua desligado e H7 nao foi iniciada.

## Auditoria final do escopo original

- Em 22/07/2026, o documento oficial `Escopo Completo de CRM para Atendimento
  e Gestao de Leads` foi reconciliado com Git, codigo, schema, migrations,
  testes, Railway, Vercel e este documento. Nao foram usados percentuais
  historicos.
- CONCLUIDOS: autenticacao basica; multiempresa e tenant; Clientes, Cliente 360
  graus e Leads
  basicos; captura pelo Site; conversao de Lead para Negocio; Kanban; Inbox
  colaborativa; qualificacao comercial; propostas, versoes, calculos e PDF;
  agenda e acompanhamentos; migrations automaticas; producao Railway e Vercel.
- PARCIAIS: proxima acao e tempo parado; resposta real da Inbox;
  permissoes granulares; relatorios; seguranca, LGPD e
  backups; cobranca; responsividade mobile-first; especializacao agro.
- NAO INICIADOS: automacoes; notificacoes reais e checklist; pos-venda;
  rankings; WhatsApp outbound, midia, templates e status; frete e envio de
  propostas; 2FA; campos e fluxos agro estruturados.
- DEPENDENTE EXTERNO: ativacao do inbound textual WhatsApp pela
  Meta. O WhatsApp continua desligado.
- FORA DO MVP, MAS EXIGIDOS: Instagram; Facebook;
  relatorios avancados; entregas formalmente previstas nas fases posteriores.
- IA permanece uma sugestao, nao uma pendencia obrigatoria. PostgreSQL, AWS,
  DigitalOcean, Google Maps e SMTP sao sugestoes tecnicas. Bling e itens fora
  do escopo original nao entram no calculo de aderencia.
- O `dev.db` permanece intacto com 532.480 bytes, SHA-256
  `cb62b4b2584162c9f66ff8e722319b96cf2697ebe9ea0a745a388d7ca572c26a`,
  9 migrations, `quick_check` `ok`, zero violacoes de foreign key e sem WAL ou
  SHM.

## AUDIT-FIX local

- Em 26/07/2026, a correcao integral dos problemas da auditoria foi executada
  localmente na branch `feature/customer-360`, sem push, deploy, migration nova
  ou escrita em producao. H7 e H8 nao foram iniciadas.
- Autenticacao: login multiempresa passou a aceitar slug opcional quando o
  email for ambiguo, manteve erros genericos e recebeu rate limit em memoria
  por identidade e IP direto. O limitador ignora cabecalhos spoofaveis; em
  topologias com proxy real, a origem confiavel ainda precisa ser formalizada.
- Respostas e logs: handlers de canais, integracoes, estoque, notas, clientes e
  erros globais passaram a responder 5xx sanitizado, sem stack trace, payload
  bruto, objeto Prisma ou identificadores sensiveis no console. Erros 4xx
  controlados permanecem especificos.
- Dados comerciais: validacoes rejeitam payloads invalidos sem sobrescrever
  valores anteriores, tags e booleanos sao tratados estritamente, exclusao de
  Cliente com relacoes retorna conflito controlado e a interface sincroniza o
  drawer apos erro recuperavel.
- Dashboard e Agenda: `/dashboard` passou a usar agregacoes bounded,
  `/clientes` passou a ser paginado e pesquisado no servidor, o detalhe do
  Cliente carrega sob demanda, a busca operacional e server-side e a Agenda
  evita fan-out semanal. O ensaio com 150 clientes e 100 notas manteve duas
  chamadas e reduziu o payload representativo de 80.756 para 15.829 bytes.
- Datas da Agenda: datas impossiveis, formatos sem timezone e intervalos
  invalidos sao rejeitados; resumo e semana usam janelas bounded e preservam
  respostas recuperaveis.
- Testes e supervisor: `backend/scripts/run-isolated-prisma-tests.cjs` passou a
  criar sandboxes somente em `%TEMP%\crm-prisma-tests`, validar Sandbox A limpa
  com 23 migrations e Sandbox B 9 -> 23, e comparar fingerprints dos bancos
  protegidos antes e depois de cada subprocesso. O supervisor bloqueia sidecars
  WAL/SHM e nao copia nem abre os bancos versionados do repositorio.
- Banco historico aceito: `backend/dev.db` e uma excecao historica rastreada no
  Git, com 20.480 bytes e blob
  `08e74cce58db4394dcac2f8568676f4319bf2d2e`. Ele nao foi removido,
  versionado de novo, aberto, migrado ou alterado nesta execucao. A regra
  operacional passa a ser: nenhum banco novo, temporario, WAL ou SHM pode ser
  criado no repositorio e nenhum banco existente pode aparecer no diff.
- Interface: Dashboard e Agenda foram validados localmente em 1366x768,
  1440x900, 1920x1080 e 900x768. As evidencias ficaram somente em
  `%TEMP%\crm-audit-fix-qa-20260726`; nao houve overflow horizontal, erro React
  ou loop de requisicoes observado.
- Testes aprovados: backend completo com 115 testes em 45 arquivos, frontend
  com 42 testes, arquitetura com 3 testes, Prisma validate, lint, build,
  `node --check`, `git diff --check` e QA local. O warning conhecido do bundle
  acima de 500 kB permanece.
- Limitacoes residuais: o frontend ainda guarda JWT em `localStorage`; a
  migracao completa para cookie HttpOnly exige desenho de CSRF, CORS, logout e
  refresh em tarefa propria. O rate limit em memoria e adequado para uma
  replica, mas nao substitui politica distribuida quando houver escala
  horizontal.
- Os bancos `backend/prisma/dev.db` e `backend/dev.db` permaneceram identicos
  ao baseline, sem WAL ou SHM. O WhatsApp continua pausado, sem Meta, flags,
  capabilities, credenciais ou chamada externa.

## Automacoes internas H7

- H7 foi publicada no commit
  `46d4bae6f696e2f1abce045934501b7fc756c0ce`, com Railway oficial saudavel,
  Vercel Ready, migration `20260726203000_add_internal_automations` aplicada e
  24 migrations em producao. O worker permaneceu desligado: a variavel
  `AUTOMATION_WORKER_ENABLED` estava ausente, e ausencia significa `false`.
  Nenhuma capability foi ativada, nenhuma regra foi criada, nenhum job foi
  processado e nenhum backfill ocorreu.
- A implementacao local original da H7 ocorreu na branch
  `feature/h7-automations`; a publicacao posterior preservou Meta e WhatsApp
  desligados e nao habilitou o worker.
- Fonte canonica de trabalho futuro: `Acompanhamento`. Agenda e apenas a
  apresentacao operacional de compromissos com data e hora. `Cliente.proximoFollowUp`
  permanece como projecao derivada do Acompanhamento aberto mais proximo nos
  fluxos criados pela H7; nao houve backfill historico.
- Gatilhos implementados: `LEAD_CREATED`, `LEAD_WITHOUT_FOLLOW_UP` e
  `DEAL_STALLED`. Como nao existe marcador canonico de resposta, a versao H7
  usa Lead sem Acompanhamento humano em vez de Lead sem resposta. Negocio parado
  usa `etapaEntrouEm`, nao apenas `updatedAt`.
- Ativacao: `activatedAt` inicia a observacao de novas ocorrencias, sem
  processamento retroativo. Edicoes incrementam versao e novas ocorrencias usam
  snapshot atualizado; execucoes existentes preservam o snapshot anterior.
- Modelos adicionados por migration aditiva:
  `AutomacaoRegra`, `AutomacaoExecucao`, `AutomacaoAcaoJob`,
  `AutomacaoRoundRobinEstado` e `AutomacaoEventoInterno`. A migration
  `20260726203000_add_internal_automations` eleva os sandboxes para 24
  migrations e nao altera dados comerciais existentes.
- Condicoes disponiveis sao somente as sustentadas pelo schema real: etapa,
  origem, responsavel, ausencia de responsavel, tempo sem Acompanhamento, tempo
  parado, dia da semana, janela e timezone. Regiao e produto nao possuem campos
  canonicos nesta fase e nao foram expostos na API ou UI.
- Acoes implementadas: atribuir responsavel, atribuir por round-robin, criar
  Acompanhamento, criar evento tecnico interno reservado para H8 e recalcular a
  projecao de proximo follow-up. Nenhuma acao envia WhatsApp, e-mail, SMS,
  push, webhook ou mensagem externa.
- Idempotencia: `occurrenceKey`, `idempotencyKey` e `actionKey` impedem
  duplicidade por ocorrencia e por acao. Reprocessamento atua somente em jobs
  falhos elegiveis, preservando acoes concluidas em falhas parciais.
- Round-robin e persistente por tenant e regra, com lista elegivel ordenada de
  forma estavel. O estado so avanca quando a atribuicao realmente vence; Leads
  ou Negocios ja atribuidos nao fazem o ponteiro andar.
- Worker: controlado por `AUTOMATION_WORKER_ENABLED`, desligado por padrao,
  desligado em testes e iniciado uma unica vez no processo da API quando a
  variavel for `true`. Usa lote limitado, lease de 120 segundos, retry por acao
  e recuperacao de lease expirado. SQLite atual permanece limitado a uma
  replica; escala horizontal exige banco compartilhado e coordenacao distribuida.
- Timezone: regras exigem timezone IANA validado e a avaliacao usa `Intl`, sem
  depender do timezone do servidor. Janelas fora do horario mantem jobs
  pendentes com nova tentativa controlada.
- Autorizacao: `AUTOMATIONS` foi adicionada ao modelo de capabilities. ADMIN e
  GERENTE administram regras; tenant sem capability recebe `404` e nao entra em
  varreduras ou execucoes. `empresaId` do frontend nunca e autoridade.
- API local: listar, criar, ler, atualizar, ativar, desativar, simular, listar
  execucoes, listar falhas, reprocessar job falho e consultar resumo.
- Interface: a area existente de Automações foi substituida por workspace
  administrativo compacto com regras, status, prioridade, gatilho, condicoes
  reais, acoes, simulacao sem efeitos, execucoes, falhas e retry. A UI nao
  mostra JSON cru e nao promete notificacoes externas.
- Testes aprovados: backend completo pelo supervisor isolado, incluindo sandbox
  A e upgrade historico 9 -> 24 migrations; frontend completo; teste H7
  frontend; Prisma validate; sintaxe backend; lint; build; verificador
  arquitetural e `git diff --check`.
- QA visual local em 1366x768, 1440x900, 1920x1080 e 900x768 validou lista,
  formulario, simulacao, execucoes, retry, ausencia de overflow horizontal,
  ausencia de erro no console e ausencia de chamada externa. Evidencias ficaram
  somente em `%TEMP%\crm-h7-visual-qa`.
- Limitacoes: nao ha H8, central de notificacoes, backfill, regioes/produtos
  canonicos ou suporte seguro para multiplas replicas SQLite. O worker nao foi
  habilitado em producao. O WhatsApp continua desligado.

## Operacoes seguras de tenants e capabilities H7.1

- H7.1 foi implementada localmente na branch `feature/h7-platform-operations`,
  sem push, deploy, Railway, Vercel, alteracao de capability em producao,
  criacao de JavaGro, regra de automacao, backfill, H8 ou chamada externa.
- Como nao existe papel global seguro no modelo atual e `Usuario` pertence a
  uma unica `Empresa`, a autorizacao global foi implementada por allowlist de
  e-mails em `PLATFORM_ADMIN_EMAILS`. O backend calcula somente o booleano
  `isPlatformOperator` para a sessao, com deny-by-default quando a variavel
  esta ausente ou vazia, trim e comparacao case-insensitive. A allowlist nao e
  retornada ao frontend, persistida ou registrada em logs.
- ADMIN, GERENTE e VENDEDOR continuam papeis restritos ao tenant. Somente
  usuario autenticado, ativo, existente e presente na allowlist acessa
  `/platform/*`; usuario sem sessao recebe `401` e usuario tenant-scoped fora
  da allowlist recebe `403`.
- Rotas locais criadas: `GET /platform/tenants`,
  `GET /platform/tenants/:tenantId`,
  `POST /platform/tenants`,
  `PATCH /platform/tenants/:tenantId/capabilities/automations` e
  `GET /platform/tenants/:tenantId/capabilities/automations/audit`.
  A listagem e paginada, busca por nome ou slug e retorna somente dados
  minimos de identificacao e o estado da capability `AUTOMATIONS`.
- H7.2 adicionou localmente a exposicao segura do proprio e-mail no payload
  autenticado de `/auth/me`, sem listar outros usuarios e preservando
  `isPlatformOperator`.
- H7.2 adicionou localmente `POST /platform/tenants`, exclusivo para operador
  da plataforma, com payload fechado para nome do tenant, slug, administrador,
  e-mail e senha inicial. O endpoint reutiliza a validacao do cadastro oficial,
  normaliza slug/e-mail, gera hash com o mesmo algoritmo, cria `Empresa` e
  primeiro `Usuario ADMIN` em transacao e bloqueia slug ou e-mail existentes.
- A criacao interna de tenant nao habilita `/auth/register-company`, nao envia
  e-mail, nao ativa capability, nao cria regra, job, execucao, backfill,
  integracao ou dado comercial.
- A fonte canonica de capability continua sendo `EmpresaFuncionalidade`, a
  mesma consumida pela H7. Nao foi criada segunda tabela de capability, segundo
  enum ou feature gate paralelo.
- A auditoria de capability reutiliza `AuditoriaFuncionalidade`; alteracoes
  reais em `AUTOMATIONS` sao transacionais e registram actor derivado da sessao,
  estado anterior, estado novo, motivo sanitizado e tenant. Operacoes
  idempotentes retornam `changed: false` e nao criam auditoria falsa.
- H7.2 criou a migration aditiva
  `20260727103000_add_platform_tenant_audit` com `PlatformTenantAudit` para
  registrar `TENANT_CREATED` sem misturar criacao de tenant com auditoria de
  capability. A auditoria registra actor, tenant criado, slug, primeiro ADMIN e
  data, sem senha, hash, token, cookie ou cabecalhos.
- A area interna `/platform/tenants` aparece no menu somente quando
  `isPlatformOperator === true` e permite busca, lista paginada, detalhe minimo,
  criacao individual de tenant, ativacao/desativacao individual de `AUTOMATIONS`,
  confirmacao explicita, motivo opcional, feedback, loading, vazio, erro e
  historico paginado. Nao ha JSON cru, dados comerciais, impersonacao, edicao em
  massa ou "ativar para todos".
- Ativar `AUTOMATIONS` por esta area nao cria regra, job, execucao, backfill ou
  worker. Desativar bloqueia novas execucoes pelo gate existente da H7 e
  preserva regras e historico.
- Testes focais H7.1 passaram para backend e frontend, cobrindo allowlist,
  acesso negado por padrao, usuario inativo, ADMIN/GERENTE fora da allowlist,
  listagem, busca, detalhe, ativacao, desativacao, idempotencia, auditoria,
  payload invalido, limite de motivo, ausencia de acao em massa, mesma fonte de
  capability da H7 e ausencia de regra, job ou backfill.
- Bancos protegidos `backend/prisma/dev.db` e `backend/dev.db` permanecem fora
  dos testes e nao devem aparecer no diff. O worker segue desligado, o WhatsApp
  continua pausado e H8 nao foi iniciada.

## H8.1 - Fundacao segura do worker de automacoes

- H8.1 parte do checkpoint publicado `b719be343a16c031376ed9204e37e512c3375e55`
  e endurece o scaffold existente sem criar migration 26: os modelos atuais ja
  possuem `status`, `tentativas`, `nextAttemptAt`, `leaseOwner`,
  `leaseExpiresAt`, `actionKey` e `idempotencyKey`.
- O worker deixou de ser iniciado pelo processo HTTP. A execucao operacional
  futura usa processo dedicado via `npm run worker:automations` em `backend/`.
  `AUTOMATION_WORKER_ENABLED` continua deny-by-default; apenas `true` ou `1`
  ligam o processo, e em `NODE_ENV=test` ele permanece desligado.
- Defaults documentados: lote 5, polling 5000 ms, lease 60000 ms, timeout de
  acao 30000 ms e maximo de 3 tentativas, todos com limites minimos e maximos.
  Valor invalido volta ao default seguro.
- O ciclo H8.1 processa somente jobs ja existentes; nao varre gatilhos temporais
  nem produz jobs. Claim e feito um job por vez com update atomico no SQLite,
  respeitando `nextAttemptAt`, limite de tentativas, lease ativo e recuperacao
  de lease expirado.
- A unica acao com execucao real nesta fundacao e `CREATE_INTERNAL_EVENT`.
  Acoes como atribuicao, round-robin, Acompanhamento, projecao, WhatsApp,
  e-mail ou webhook nao sao executadas pelo worker H8.1; quando aparecem em job
  real, falham definitivamente de forma sanitizada e sem efeito comercial.
- `CREATE_INTERNAL_EVENT` permanece idempotente pelo indice unico
  `[empresaId, idempotencyKey]`; reprocessamento nao duplica evento interno.
  Jobs concluidos nao voltam a pendente; jobs falhos podem ser reprocessados de
  forma controlada pelo endpoint existente, sem tocar em tenant alheio.
- Logs do worker usam uma linha JSON por transicao confirmada. O ciclo cobre
  `job_claimed`, `execution_started`, `action_started`,
  `action_succeeded`, `action_failed`, `job_succeeded`,
  `job_attempt_failed`, `job_retry_scheduled`, `job_failed`,
  `job_permanent_failure`, `job_attempts_exhausted` e
  `job_lease_recovered`, alem de `worker_started`, `worker_poll_error`,
  `worker_stopping` e `worker_stopped`. Polling vazio nao gera ruido em nivel
  normal.
- O callback recebe um unico envelope allowlisted; `Error` bruto, stack, campos
  desconhecidos e objetos aninhados nao atravessam a fronteira. Os campos ficam
  restritos a timestamp, servico, provider, instancia do worker,
  IDs tecnicos, tipo da acao/gatilho, tentativa, status, duracao, retry, lease,
  `final`, `willRetry`, `permanent` e `failureReason`. Erros inesperados usam
  mensagem generica por classe/codigo tecnico; a defesa adicional cobre
  Authorization Basic/Bearer, JWT, Cookie/Set-Cookie completos, URL/string de
  conexao, e-mail, telefone, CPF/CNPJ, senha, token, secret, API key e payload
  Prisma. Payload, headers, stack, objeto Prisma e dump de ambiente nunca sao
  serializados.
- `action_failed` registra somente a excecao da acao, sem antecipar decisao.
  `job_attempt_failed` registra a tentativa apos a persistencia, inclusive a
  ultima tentativa antes de `job_attempts_exhausted`; `job_failed` e exclusivo
  de encerramento definitivo. `job_permanent_failure` separa erro permanente
  precoce de `job_attempts_exhausted`, emitido apenas quando
  `attempt >= maxAttempts`. Eventos de sucesso, retry e encerramento aparecem
  depois da respectiva transicao persistida; lease recuperado so aparece depois
  do claim real. `job_found` foi removido porque, antes do claim atomico, podia
  duplicar em corrida sem representar transicao confirmada.
  `retryable` descreve a natureza tecnica do erro; `willRetry` registra a
  decisao operacional autoritativa para a tentativa atual.
  Falha do polling usa `worker_poll_error`, sem atribuir falsamente a falha a
  um job nao reivindicado.
- Risco funcional preexistente e mantido fora deste patch: o adiamento por
  janela acontece depois que o claim incrementa `tentativas`, podendo consumir
  a ultima tentativa sem executar a acao. A correcao exige tarefa funcional
  separada; a logica de janela nao foi alterada aqui.
- Shutdown por `SIGTERM`/`SIGINT` para de agendar novo polling, aguarda o ciclo
  em andamento e desconecta o Prisma. A infraestrutura SQLite segue limitada a
  uma replica; escala horizontal exige banco compartilhado e coordenacao
  distribuida antes de habilitar worker em producao.
- Testes focais H8.1 cobrem gate, defaults, concorrencia entre dois workers
  logicos, lease valido, lease expirado, idempotencia de evento interno, acao
  desconhecida/nao suportada sem efeito, reprocessamento e shutdown. Bancos de
  teste ficam exclusivamente em `%TEMP%`.
- Produção deve receber apenas o codigo da fundacao: `AUTOMATION_WORKER_ENABLED`
  permanece ausente ou `false`, a regra piloto JavaGro segue desativada, nenhum
  job ou execucao real deve existir, WhatsApp permanece desligado. Antes da
  etapa seguinte, H8.2 ainda nao havia sido iniciada.

## H8.2 - Produtor controlado e piloto interno

- H8.2 parte do checkpoint publicado `374f0bb8c39453b1acbdb53d564abbb7ab4328f4`
  e adiciona o produtor interno controlado para o primeiro piloto real da
  JavaGro, sem migration 27. O schema existente ja possui as restricoes unicas
  necessarias em `AutomacaoExecucao`, `AutomacaoAcaoJob` e
  `AutomacaoEventoInterno`.
- O contrato interno `produceAutomationEvent` aceita evento normalizado com
  tenant obrigatorio, `LEAD_CREATED`, `PILOT_SYNTHETIC`, `sourceId`,
  `idempotencyKey`, `occurredAt` e payload minimo. O produtor respeita
  `AUTOMATIONS_ENABLED`, capability `AUTOMATIONS`, regra ativa, gatilho,
  condicoes, tenant e acoes suportadas. Ele cria somente execucoes e jobs; nao
  executa a acao no processo HTTP.
- A rota temporaria `POST /automacoes/piloto/eventos` fica atras de
  autenticacao, usuario ativo, operador da plataforma, capability do tenant,
  gate global `AUTOMATIONS_ENABLED` e gate temporario
  `AUTOMATION_PILOT_TRIGGER_ENABLED`. Com o gate temporario ausente ou `false`,
  retorna `404`. O tenant e sempre derivado da sessao.
- O payload do piloto e fechado e aceita somente `name` e `origin` sinteticos,
  sem telefone, e-mail, documento, endereco, segredo, escolha de tenant, ruleId,
  action, lote ou criacao manual de job.
- A protecao contra loop separa evento de entrada sintetico, evento tecnico de
  saida, auditoria e simulacao. `CREATE_INTERNAL_EVENT` nao chama o produtor e
  nao pode alimentar novamente `LEAD_CREATED`.
- A execucao real continua limitada a `CREATE_INTERNAL_EVENT`, idempotente por
  `event:${actionKey}`. Para evento sintetico, o worker resolve a entidade pelo
  `resumoJson` da execucao e nao grava FK de Lead, preservando zero Lead,
  Cliente, Negocio e Acompanhamento.
- O resumo de automacoes agora retorna tambem contagens de jobs, jobs pendentes,
  processando, concluidos, execucoes, execucoes concluidas e eventos internos,
  mantendo os campos antigos.
- Foi corrigido um bug focal existente nas rotas de regra: `updateRule`,
  `activateRule` e `deactivateRule` agora usam o ID inteiro validado em vez do
  parametro string original antes de chamar Prisma.
- Testes H8.2 cobrem gates, endpoint piloto, operador, payload fechado,
  idempotencia sequencial e concorrente, regra desativada sem job, gate global
  desligado sem job, worker processando exatamente uma vez, ausencia de loop e
  zero efeito comercial. Bancos de teste ficam exclusivamente em `%TEMP%`.
- Publicacao e piloto operacional: criar servico Railway dedicado
  `automation-worker` com Root Directory `backend`, Start Command
  `npm run worker:automations`, uma replica, sem dominio publico,
  `AUTOMATIONS_ENABLED=true` e `AUTOMATION_WORKER_ENABLED=true`. O servico
  `api` deve manter `AUTOMATION_WORKER_ENABLED` ausente ou `false`; o gate
  `AUTOMATION_PILOT_TRIGGER_ENABLED` deve ser ativado somente durante o piloto e
  removido depois.
- WhatsApp, e-mail, webhook, backfill, dados comerciais e H8.3 permanecem fora
  do escopo.

## Plano oficial pos-auditoria

- H5 - Cliente 360 graus (publicada)
- H6 - Tempo de etapa e proxima acao (publicada)
- H7 - Automacoes
- H8 - Notificacoes e checklist
- H9 - Pos-venda
- H10 - Relatorios reais
- H11 - Equipe e permissoes
- H12 - Complementos de propostas
- H13 - Seguranca e LGPD
- H14 - WhatsApp outbound
- H15 - Ativacao Meta
- H16 - Vertical agro
- H17 - Instagram
- H18 - Facebook

Dependencias: H6 alimenta H7 e H10; H7 alimenta H8 e H9; H14 permanece
desligada ate H15; H15 depende de autorizacao externa; H17 e H18 dependem de
integracoes autorizadas.

## WhatsApp

- Nenhuma credencial Meta esta configurada e nenhuma chamada externa foi feita.
- Reutilizar `CanalIntegracao`, `ContatoCanal`, `ConversaCanal`,
  `MensagemCanal` e `EventoWebhook`; ampliar `CanalIntegracao`, sem estrutura
  paralela.
- Piloto manual com uma WABA e numero de teste para empresa 1; SaaS definitivo
  com Embedded Signup.
- Tenant mapping por WABA ID e Phone Number ID; nunca aceitar `empresaId` do
  payload.
- No piloto, segredos ficam na Railway e o banco guarda somente referencias.
- Capabilities planejadas: `WHATSAPP_INTEGRATION`, `WHATSAPP_INBOUND` e
  `WHATSAPP_OUTBOUND`.
- F1A-1P publicada no commit
  `f59c5f52784552936a20c7d99a6477ce38c67383`, com a migration
  `20260718184500_add_whatsapp_integration_foundation` aplicada em producao.
- Producao possui 16 migrations; a fundacao esta implantada, mas permanece
  operacionalmente desligada.
- Flags globais continuam `false` e nenhuma capability WhatsApp foi atribuida.
- O gate ADMIN `GET /integracoes/whatsapp/status` retorna `404` enquanto a
  fundacao permanece desligada.
- Nenhuma credencial Meta foi configurada, nenhuma chamada a Meta foi feita e o
  frontend nao foi alterado.
- F1A-2P publicada no commit
  `4fea3d532030a5de2914258eb7dd634813ec413a`; o callback GET e POST esta
  implantado em `/webhooks/whatsapp`.
- Producao continua com 16 migrations; flags e capabilities WhatsApp seguem
  desligadas, sem Verify Token ou App Secret configurados.
- O callback publico retorna `404`, nao processa nem persiste eventos e nenhuma
  chamada a Meta foi feita.
- O frontend nao recebeu deploy nesta release.
- F1B-0SP publicada no commit
  `8d68687e68a979f2d79e080c04b21fb16eb025e9`; producao possui 17
  migrations, incluindo
  `20260718205500_add_event_webhook_atomic_payload`.
- `EventoWebhook.payloadJson` esta disponivel como campo opcional; eventos
  legados permanecem com `payloadJson` nulo e o fluxo Site continua compativel.
- Na F1B-0SP, o callback WhatsApp ainda nao utilizava `payloadJson` nem aceitava
  eventos operacionalmente; GET e POST publicos retornavam `404`.
- Flags e capabilities permanecem desligadas, sem Verify Token, App Secret,
  credencial Meta ou chamada a Meta.
- O frontend nao recebeu deploy nesta release.
- F1B-1P publicada no commit
  `10fea4c80a065c63cb7b37acbc0369f37f73613a`; producao continua com 17
  migrations e a aceitacao duravel esta implantada.
- `EventoWebhook.payloadJson` e `payloadHash` armazenam o evento atomico, com
  idempotencia baseada no wamid e HTTP 200 somente apos persistencia confirmada
  ou retry materialmente equivalente.
- O callback GET e POST continua retornando `404` pelos gates desligados;
  nenhuma mensagem WhatsApp foi persistida em producao e nenhuma entidade
  comercial foi criada.
- Flags e capabilities continuam desligadas, sem Verify Token, App Secret,
  credencial Meta ou chamada a Meta; o frontend nao recebeu deploy.
- F1B-2P publicada no commit
  `517fdd7f51c4f310b9a601cae1431af6512fabaf`; producao continua com 17
  migrations e o processador interno esta implantado.
- O processador permanece sem acionamento automatico: o callback, as rotas, o
  startup e qualquer job nao o chamam.
- Nenhum `EventoWebhook` foi processado em producao e nenhum Cliente, Lead,
  `ContatoCanal`, `ConversaCanal` ou `MensagemCanal` foi criado.
- O callback GET e POST continua retornando `404`; flags e capabilities
  permanecem desligadas, sem Verify Token, App Secret, credencial Meta ou
  chamada a Meta, e o frontend nao recebeu deploy.
- Baseline oficial: `551dee5c785ddb1579214ce7bbb3bf459cfcf5c0`.
- F1B-3P publicada; a producao continua com 17 migrations.
- A orquestracao completa esta implantada: o callback conecta o intake duravel
  ao processador somente depois do commit do `EventoWebhook`.
- HTTP 200 depende do processamento completo ou de retry equivalente.
- O callback continua retornando HTTP 404 porque flags e capabilities estao
  desligadas e Verify Token e App Secret permanecem ausentes.
- Nenhum `EventoWebhook` WhatsApp ou entidade comercial foi criado em producao;
  nenhuma chamada Meta ou resposta outbound ocorreu.
- O frontend permaneceu sem deploy.
- Baseline oficial do repositorio e do frontend:
  `40c9465b9cbbd38865eb76d805d8cc3a4b21907c`.
- F1UI-1P publicada com o painel administrativo nas rotas `/integracoes` e
  `/integracoes/whatsapp`, reutilizando a area Integracoes e o acesso ADMIN.
- O painel suporta os estados `NOT_CONFIGURED`, `WAITING_META_AUTH`,
  `CONFIGURED_INACTIVE`, `CONNECTED`, `PAUSED`, `ERROR` e `UNAVAILABLE`.
- O estado real permanece `NOT_CONFIGURED`; o endpoint de status continua
  retornando `404` para ADMIN enquanto os gates estiverem desligados.
- `Conectar WhatsApp` abre somente o modal informativo e `Continuar na Meta`
  permanece desabilitado; nenhuma autenticacao Meta foi iniciada.
- A URL publica do webhook pode ser copiada. Nenhuma credencial e solicitada,
  exibida ou armazenada, e as acoes operacionais permanecem desabilitadas.
- O backend funcional ativo permanece no commit
  `551dee5c785ddb1579214ce7bbb3bf459cfcf5c0`; o Railway ignorou o push por nao
  haver diff em `backend`, e a producao permanece com 17 migrations.
- Flags, capabilities e segredos permanecem ausentes; nenhuma mensagem real ou
  chamada Meta ocorreu. Outbound nao esta implementado.
- WhatsApp formalmente pausado aguardando autenticacao manual da Meta.
- A publicacao H1 nao ativou flags, capabilities, segredos ou integracao
  operacional do WhatsApp. Os callbacks GET e POST continuam retornando `404`,
  nenhuma mensagem real foi recebida e nenhuma chamada externa foi realizada.
- Proxima release: F1C-1, ativacao controlada do piloto Meta quando houver
  autenticacao manual disponivel.

## PostgreSQL migration prep

- Preparacao local para migracao SQLite -> PostgreSQL adicionada na branch
  `feature/postgres-migration-prep`; nenhum cutover de producao foi executado.
- O schema operacional SQLite em `backend/prisma/schema.prisma` permanece
  canonico. Scripts em `backend/scripts/postgres-prisma.cjs` derivam um schema
  PostgreSQL temporario em `%TEMP%`, validam o provider e geram uma baseline
  SQL reproduzivel para banco PostgreSQL vazio.
- `backend/scripts/migrate-sqlite-to-postgres.cjs` ensaia ou executa copia de
  snapshot SQLite para PostgreSQL com origem read-only, batches, ordem por
  foreign keys, preservacao de IDs/timestamps/tenant/chaves de idempotencia,
  `ON CONFLICT DO NOTHING`, reset de sequences e validacao de contagens.
- `backend/scripts/check-postgres-connection.cjs` valida conectividade
  PostgreSQL sem imprimir URL ou segredo.
- Guards de runtime passam a reconhecer `postgresql://` para a janela futura,
  mantendo a protecao atual do SQLite em volume e bloqueio do `dev.db`.
- Docker local nao estava disponivel nesta execucao; testes PostgreSQL reais
  dependem de `POSTGRES_TEST_DATABASE_URL` e devem ser executados antes do
  cutover.
- `docs/POSTGRES_CUTOVER_RUNBOOK.md` documenta pre-requisitos, backup,
  congelamento de escrita, baseline, importacao, validacao, troca controlada de
  `DATABASE_URL`, smoke tests e rollback.
- Producao oficial, Railway/Vercel oficiais, worker, piloto JavaGro, tenant
  principal e WhatsApp nao foram alterados nesta preparacao; o Railway/Vercel
  HOMOLOG foi apenas o alvo de deploy/QA read-only documentado acima.

## H8 encerrada

- Em 29/07/2026, a H8 foi encerrada com a API de producao operando em
  PostgreSQL e o dashboard autenticado validado no commit
  `68c7d1c6b3e298e5c087ed2e9b0a58d430faf30a`.
- O worker dedicado permanece ativo com uma replica, sem dominio publico e
  ocioso. O processo da API continua sem worker interno. Os logs estruturados
  allowlisted, a idempotencia concorrente e a recuperacao de lease permanecem
  ativas sem expor payload, PII ou segredos.
- O adiamento por janela foi corrigido e validado: esperar o horario permitido
  nao consome tentativa real, libera o lease e preserva a elegibilidade do job.
- A consulta de score do dashboard usa SQL portavel entre SQLite e PostgreSQL,
  preserva o filtro por tenant e nao voltou a produzir `P2010`. O smoke
  autenticado somente leitura confirmou `/auth/me`, `/dashboard` e a listagem
  comercial em tres chamadas separadas durante mais de cinco minutos.
- JavaGro mantem a capability `AUTOMATIONS` ativa, com regra piloto desativada
  e gate piloto desligado. CRM Agro SaaS continua sem essa capability e sem
  regra ativa.
- Filas em producao terminaram com `pending=0`, `processing=0` e `failed=0`,
  sem lease vencido e sem job elegivel preso. O smoke nao alterou jobs,
  execucoes ou eventos e nao disparou integracao externa.
- O SQLite anterior, os backups e os PostgreSQLs preservados continuam
  disponiveis conforme o runbook. Maintenance permanece desligado.
- Nesse checkpoint, H8.3 ainda nao havia sido iniciada; seu escopo, gates de
  rollout e rollback deveriam ser definidos antes de habilitar uma nova acao
  real.

## H8.3 - ASSIGN_OWNER

- Em 29/07/2026, a H8.3 foi iniciada com a publicacao do commit funcional
  `a3d5ab483ca5cf2bbdc0fc0d124d78f2ba8f3233`.
- A fonte canonica de acoes liberadas mantem `CREATE_INTERNAL_EVENT` e
  `ASSIGN_OWNER` disponiveis para o worker real. O piloto sintetico continua
  restrito exclusivamente a `CREATE_INTERNAL_EVENT`.
- O piloto controlado da JavaGro validou `ASSIGN_OWNER` em um lead tecnico sem
  responsavel: um job e uma execucao concluiram na primeira tentativa, o
  responsavel do mesmo tenant foi atribuido e exatamente um
  `HistoricoAtribuicao` automatico foi criado.
- A protecao contra sobrescrita tambem foi validada com uma entidade tecnica
  ja atribuida: o responsavel foi preservado e nenhum historico adicional foi
  criado.
- Os dois jobs terminaram `CONCLUIDO`, sem retry, duplicacao, lease preso,
  evento interno inesperado ou integracao externa. A observacao posterior de
  dez minutos nao mostrou loop nem novo processamento.
- A regra JavaGro ficou desativada, sua condicao original foi restaurada e o
  gate do piloto sintetico permaneceu desligado. As filas terminaram sem jobs
  pendentes, processando ou falhos; o worker dedicado permaneceu saudavel e
  ocioso.
- CRM Agro SaaS permaneceu sem a capability `AUTOMATIONS`, sem regra, job ou
  execucao de automacao.
- Proximo passo recomendado: auditar os registros tecnicos preservados do
  piloto e planejar a proxima acao interna de baixo risco, mantendo rollout
  isolado por tenant e rollback operacional explicito.

## H8.3 - UPDATE_NEXT_FOLLOW_UP_PROJECTION

- Em 29/07/2026, a projecao de proximo acompanhamento foi consolidada com
  `Acompanhamento` como fonte canonica e a acao
  `UPDATE_NEXT_FOLLOW_UP_PROJECTION` foi liberada somente para o worker real.
  O piloto sintetico continua restrito a `CREATE_INTERNAL_EVENT`.
- O fluxo oficial de desativacao passou a reconciliar jobs cancelados e suas
  execucoes na mesma transacao. A reconciliacao e protegida por tenant e
  estado, preserva execucoes terminais e e idempotente diante de repeticao ou
  concorrencia.
- O registro tecnico anterior, composto por um job `CANCELADO` e uma execucao
  `PENDENTE`, foi reconciliado pelo proprio servico de dominio. O job
  permaneceu `CANCELADO`, a execucao terminou `CANCELADA` e uma segunda
  chamada foi um no-op.
- O piloto final da JavaGro processou exatamente um job e uma execucao na
  primeira tentativa. A projecao passou a apontar para o menor acompanhamento
  ativo, em ISO, e a revisao do cliente tecnico foi incrementada uma unica
  vez.
- A observacao posterior de cinco minutos confirmou a sequencia
  `job_claimed`, `execution_started`, `action_started`, `action_succeeded` e
  `job_succeeded`, sem `P2010`, retry, duplicacao, loop, lease preso ou
  integracao externa.
- A regra JavaGro terminou desativada, o gate do piloto sintetico permaneceu
  desligado e as filas terminaram sem jobs pendentes, processando ou falhos.
  CRM Agro SaaS permaneceu sem capability ou regra ativa de automacoes.
- Nao houve migration, alteracao de schema ou backfill global. O proximo passo
  recomendado e definir o contrato e os gates da proxima acao interna da
  H8.3 antes de qualquer nova liberacao.

## H8.3 - CREATE_FOLLOW_UP

- Em 29/07/2026, `CREATE_FOLLOW_UP` foi liberada somente para o worker real.
  O piloto sintetico permanece restrito a `CREATE_INTERNAL_EVENT`; nenhuma
  acao externa foi habilitada.
- O handler valida cliente e autor ativos no mesmo tenant antes da criacao.
  Cliente ou autor invalido encerra o job como erro permanente sanitizado, sem
  criar efeito parcial. Os tipos externos de acompanhamento continuam
  rejeitados.
- A criacao do `Acompanhamento`, do `HistoricoAcompanhamento`, do evento
  tecnico idempotente e a reconciliacao de `Cliente.proximoFollowUp` ocorrem
  na mesma transacao. A chave da acao impede duplicacao em retry ou
  concorrencia.
- O piloto controlado da JavaGro executou exatamente um job e uma execucao na
  primeira tentativa. Foram persistidos exatamente um acompanhamento interno,
  um historico e um evento tecnico; a projecao foi atualizada e a revisao do
  cliente tecnico incrementou uma unica vez.
- A regra JavaGro terminou desativada, o gate do piloto sintetico permaneceu
  desligado e as filas terminaram sem jobs pendentes, processando ou falhos.
  CRM Agro SaaS permaneceu sem capability ou regra ativa de automacoes.
- A observacao posterior de cinco minutos confirmou o ciclo completo sem
  `P2010`, retry, duplicacao, loop, lease preso, erro recorrente ou integracao
  externa. Nao houve migration nem backfill.
- Proximo passo recomendado: definir e auditar o contrato de concorrencia de
  `ASSIGN_ROUND_ROBIN` antes de considerar sua liberacao.

## H8.3 - ASSIGN_ROUND_ROBIN e encerramento

- Em 30/07/2026, `ASSIGN_ROUND_ROBIN` foi validada no worker real com um
  piloto controlado da JavaGro. O piloto sintetico permaneceu restrito a
  `CREATE_INTERNAL_EVENT`.
- A primeira verificacao operacional interpretou incorretamente o retorno de
  `enqueueLeadCreated`: o contrato real e `queued.created`, e nao
  `createdExecutions`. O verificador temporario foi corrigido para exigir
  `queued.created === 1`; nenhum codigo funcional ou contrato do dominio foi
  alterado.
- O job e a execucao cancelados pela verificacao anterior permanecem como
  evidencia terminal: tentativa zero, sem historico, cursor ou efeito. Eles
  nao foram apagados nem reprocessados.
- O piloto final criou exatamente uma execucao e um job, ambos concluidos na
  primeira tentativa. O lead tecnico recebeu o unico usuario elegivel, foi
  criado exatamente um `HistoricoAtribuicao` automatico e o cursor da regra
  avancou uma unica vez.
- A observacao posterior de cinco minutos confirmou exatamente uma sequencia
  `job_claimed`, `execution_started`, `action_started`, `action_succeeded` e
  `job_succeeded`, sem `P2010`, retry, duplicacao, conflito CAS em loop, lease
  preso, erro recorrente ou integracao externa.
- A regra JavaGro terminou desativada, o gate do piloto sintetico permaneceu
  desligado e as filas terminaram sem jobs pendentes, processando ou falhos.
  CRM Agro SaaS permaneceu sem capability ou regra ativa de automacoes.
- As cinco acoes internas liberadas sao `CREATE_INTERNAL_EVENT`,
  `ASSIGN_OWNER`, `UPDATE_NEXT_FOLLOW_UP_PROJECTION`, `CREATE_FOLLOW_UP` e
  `ASSIGN_ROUND_ROBIN`. A H8.3 esta encerrada sem migration ou backfill.
- Proximo passo recomendado: planejar as integracoes omnichannel em uma tarefa
  separada, com contrato, gates, rollout e rollback proprios.

## Instagram Direct - fundacao estrutural

- Em 30/07/2026, a fundacao estrutural do Instagram Direct foi publicada no
  commit `b85cad72f03da62e53e303570782ff3258773fca`.
- `CanalIntegracao` recebeu o tipo `INSTAGRAM_META`, identidade dedicada
  `instagramBusinessAccountId` e metadata mascarada, sem reutilizar `wabaId`,
  `phoneNumberId` ou configuracao do WhatsApp.
- As capabilities aditivas sao `INSTAGRAM_INTEGRATION` e
  `INSTAGRAM_INBOUND`. Nenhuma delas foi criada ou ativada em producao.
- A identidade Instagram e globalmente unica; o futuro canal real usara a
  chave canonica `instagram-meta-inbound-real`, protegida pela unique de
  tenant e chave. Writers genericos bloqueiam canais Instagram reais e
  respostas simuladas de saida.
- As migrations SQLite e PostgreSQL sao aditivas. A baseline PostgreSQL
  congelada foi comparada por leitura com o checksum registrado em producao,
  e somente a migration incremental do Instagram foi aplicada.
- SQLite e PostgreSQL descartavel validaram coexistencia com WhatsApp,
  `SITE_FORM`, canal de teste, isolamento multi-tenant, upgrade com dados
  existentes e preservacao das capabilities publicadas.
- A API e o worker terminaram saudaveis em PostgreSQL, com `/health = 200`.
  Producao permaneceu com zero canal e zero capability Instagram, sem Meta,
  segredo, outbound ou alteracao em tenant.
- Proximo passo recomendado: implementar o provisionamento platform-only do
  canal Instagram inativo, preservando a chave canonica, CAS, auditoria e
  bloqueio fail-closed de legado divergente.

## Instagram Direct - provisionamento platform-only

- Em 31/07/2026, o provisionamento platform-only do Instagram inbound foi
  publicado nos commits `b705c47f6468c251c0f1a9e37ee8a5c1af88f4ed` e
  `d91d20380314576a04e764c31f241f21c05d0acd`.
- A rota `PUT /platform/tenants/:tenantId/integrations/instagram/inbound`
  cria somente o slot real canonico inativo. Identidade, metadata, CAS,
  conflito global, legado, auditoria sanitizada e replay idempotente foram
  validados sem ativar capabilities ou timestamps.
- A consulta platform-only `GET /status` retorna estado e checklist
  sanitizados. Em producao, a JavaGro permaneceu `NOT_CONFIGURED`, sem
  identidade Instagram, canal, capability ou timestamp.
- SQLite e PostgreSQL 16 descartavel aprovaram os cinco grupos focais,
  incluindo corridas com dois Prisma Client independentes, unique global,
  slot por tenant, CAS, rollback e isolamento.
- A API e o worker terminaram `SUCCESS`, `/health = 200`, e as contagens de
  canal, capability, evento, mensagem, contato e conversa Instagram
  permaneceram em zero antes e depois do smoke read-only.
- WhatsApp e `SITE_FORM` permaneceram inalterados. Nao houve Meta,
  accessTokenRef, outbound, schema, migration ou alteracao em tenant.
- Proximo passo recomendado: implementar o lifecycle platform-only do
  Instagram inbound (`activate`, `pause` e `reactivate`) em tarefa separada.

## Instagram Direct - lifecycle platform-only

- Em 31/07/2026, o lifecycle platform-only do Instagram inbound foi publicado
  no commit `055a1a00c2de9ccd136d85dc1a232c8a76ce329f`.
- As rotas `POST /activate`, `POST /pause` e `POST /reactivate` exigem operador
  de plataforma, `reason` e CAS por `expectedUpdatedAt`. Canal, capabilities
  `INSTAGRAM_INTEGRATION`/`INSTAGRAM_INBOUND` e
  `AuditoriaFuncionalidade` mudam na mesma transacao.
- A ativacao local termina em `WAITING_META_AUTH`; a pausa desativa somente o
  inbound e preserva a capability de integracao, identidade, metadata e
  timestamps. Replay exato e idempotente, CAS perdedor nao produz auditoria
  duplicada e as escritas de capability reafirmam tenant, chave e estado
  esperado.
- SQLite e PostgreSQL 16 descartavel aprovaram os cinco grupos focais,
  incluindo RBAC direto dos tres POSTs, CAS, concorrencia real, rollback,
  auditoria e isolamento multi-tenant. O PostgreSQL temporario terminou sem
  registros e o Prisma SQLite foi restaurado.
- A API e o worker terminaram `SUCCESS`, com `/health = 200`. O smoke
  autenticado somente leitura confirmou a JavaGro em `NOT_CONFIGURED`, com
  zero canal, capability, auditoria, evento, mensagem, contato ou conversa
  Instagram antes e depois.
- Nao houve schema, migration, Meta, Graph API, OAuth, accessTokenRef,
  outbound, preenchimento de timestamp ou ativacao de tenant em producao.
- Proximo passo recomendado: implementar o webhook/intake Instagram em fase
  separada, mantendo a JavaGro sem provisionamento ate existir identidade Meta
  real.

## Instagram Direct - webhook inbound

- Em 31/07/2026, o webhook Instagram Direct foi publicado nos commits
  `73015ccb39313dff6d27a98ac5731881beed01f3` e
  `a12a9adcc0a327405e59d6a6bebd338515af1be3`.
- `GET/POST /webhooks/instagram` reutilizam o contrato Meta de challenge e
  HMAC SHA-256 sobre o corpo bruto. O intake exige identidade canonica, canal
  real ativo, App ID/ambiente globais e as capabilities
  `INSTAGRAM_INTEGRATION` e `INSTAGRAM_INBOUND`.
- Texto Direct cria a cadeia tenant-scoped de evento, contato, Cliente, Lead,
  conversa e mensagem. Replay e concorrencia preservam uma unica cadeia;
  `is_echo`, status, midia e eventos desconhecidos terminam sem mensagem
  textual falsa.
- A reconciliacao de falha usa reserva transacional do `EventoWebhook`: uma
  falha atrasada nao sobrescreve processamento ja concluido. Pausa concorrente
  reverte os efeitos comerciais e nao deixa falha operacional indevida.
- SQLite e PostgreSQL 16 descartavel aprovaram os seis grupos focais. O Prisma
  SQLite foi restaurado, o `dev.db` permaneceu no hash protegido e o
  PostgreSQL temporario foi removido.
- API e worker foram publicados no SHA funcional `a12a9ad`, terminaram
  `SUCCESS`/`Online` e `/health` permaneceu HTTP 200 durante a observacao. Os
  gates Instagram continuam ausentes, GET e POST publicos permanecem em 404 e
  o simulador nao possui rota de producao.
- Nenhum canal, capability, identidade, timestamp ou efeito Instagram foi
  criado por esta release. Nao houve Meta, Graph API, OAuth, accessTokenRef,
  outbound, schema ou migration.
- Antes de ativar Meta real, ainda devem ser definidos limite atomico por lote,
  comportamento para lotes com multiplas identidades e rejeicao explicita de
  `Content-Encoding` duplicado.

## Instagram Direct - hardening do webhook

- Em 31/07/2026, o transporte e o intake do Instagram Direct foram endurecidos
  nos commits `c199da4` e `1406f0c`.
- O corpo bruto permanece limitado a 1 MiB. O intake aceita no maximo 3
  `entry`, 5 eventos por `entry` e 10 eventos por request. Excesso retorna
  `413 WEBHOOK_BATCH_LIMIT_EXCEEDED` antes de consulta ou escrita.
- Todos os eventos processaveis do lote devem usar a mesma identidade
  Instagram. Identidades diferentes retornam erro sanitizado e o lote inteiro
  termina sem `EventoWebhook`, timestamp ou efeito comercial parcial.
- `Content-Encoding` aceita somente ausencia ou um unico `identity`.
  Duplicidade, lista concatenada, `gzip`, `deflate` e `br` retornam 415 antes
  do parser comercial. Corpo bruto, HMAC SHA-256 e challenge stateless foram
  preservados sem alterar o transporte do WhatsApp.
- SQLite e PostgreSQL 16 descartavel aprovaram os oito grupos focais, incluindo
  limites exatos e excedidos, header HTTP bruto duplicado, replay,
  concorrencia, isolamento multi-tenant e simulador bloqueado em producao.
- A API foi publicada no deployment
  `d854b10d-0d9e-40e0-8e14-1f27773a12f8` e o worker no deployment
  `1ae0e48a-dc5f-464c-ba3f-fc3ec8c51c89`, ambos com `SUCCESS`. O health
  permaneceu HTTP 200 e nao houve erro novo durante a observacao.
- Os gates Instagram permanecem desligados; webhook e simulador continuam em
  404, e a rota platform-only sem autenticacao continua em 401. Nao houve
  canal, capability, Meta, Graph API, outbound, accessTokenRef, schema ou
  migration.
- Riscos residuais nao bloqueantes: lotes validos sao processados atomicamente
  por evento, nao por request inteiro; e os limites conservadores devem ser
  reavaliados somente quando houver envelope Meta real autorizado.

## Facebook Messenger - inbound pronto para configuracao Meta

- Em 31/07/2026, a fundacao completa do Facebook Messenger inbound foi
  publicada nos commits `356d06e`, `6f738c3`, `2ce438e`, `7907fec` e
  `a421d6b`.
- Messenger possui tipo `MESSENGER_META`, capabilities
  `MESSENGER_INTEGRATION`/`MESSENGER_INBOUND`, identidade de canal dedicada
  `messengerPageId` e metadata mascarada. O Page ID e globalmente unico; o
  remetente usa PSID opaco e permanece isolado por canal e tenant.
- A migration aditiva `20260731120000_add_messenger_direct_schema_foundation`
  foi validada em SQLite e PostgreSQL 16 descartavel e aplicada uma vez pelo
  startup oficial. WhatsApp, Instagram e `SITE_FORM` mantiveram seus campos,
  constraints e comportamento.
- O provisionamento, status e lifecycle sao platform-only, com allowlist,
  identidade imutavel, CAS, idempotencia, auditoria e conflito fail-closed de
  legado. A ativacao local nao chama a Meta e nao preenche timestamps.
- `GET/POST /webhooks/messenger` usam challenge stateless, corpo bruto, HMAC
  SHA-256, Content-Type/Content-Encoding estritos e limites de 1 MiB, 3
  entries, 5 eventos por entry e 10 eventos por request. Payload multi-Page e
  rejeitado integralmente antes de qualquer escrita.
- Texto inbound cria a cadeia tenant-scoped de evento, contato, Cliente, Lead,
  conversa e mensagem, visivel na Inbox e no Cliente 360. Replay e
  concorrencia preservam uma unica cadeia; echo, attachment e evento
  desconhecido terminam sem mensagem falsa ou outbound.
- Os testes focais passaram em SQLite e PostgreSQL, incluindo migrations,
  provisionamento, lifecycle, guards, HMAC, replay, concorrencia, rollback,
  isolamento pelo mesmo PSID em tenants distintos e simulador bloqueado em
  producao. Tres revisores independentes nao encontraram bloqueante de
  arquitetura, seguranca ou operacao para gates desligados.
- A API foi publicada no deployment
  `6870805b-a10f-46fd-bdf3-c7e3e441a226` e o worker no deployment
  `2f8b18d5-3716-4740-9d7d-99bb32268455`, ambos com `SUCCESS`; `/health`
  permaneceu HTTP 200.
- Em producao, os gates Messenger permanecem desligados, a JavaGro esta
  `NOT_CONFIGURED`, e canais, capabilities, eventos, mensagens, contatos e
  conversas Messenger permaneceram em zero antes e depois do smoke read-only.
  Webhook e simulador retornam 404, e status sem autenticacao retorna 401.
- Nao houve Meta, Graph API, OAuth, Page Access Token funcional,
  accessTokenRef, outbound, Page ID sintetico ou alteracao em tenant real.
- Proximo passo: quando houver ativos Meta reais autorizados, medir o prazo do
  lote maximo, configurar gates/callback/subscriptions, provisionar a Page,
  ativar um piloto isolado e validar o primeiro Messenger real com rollback por
  pausa disponivel.

## Inbox multicanal - fundacao visual e operacional

- Em 31/07/2026, a Inbox unificada foi reformulada nos commits `82516b5`,
  `cbc6678` e `2595b6c`.
- Site, WhatsApp, Instagram e Messenger possuem mapeamentos visuais e textuais
  explicitos. Canal desconhecido falha para um rotulo neutro, sem reutilizar a
  semantica de outro provedor.
- A fila ganhou busca e filtros combinaveis de escopo, status, SLA,
  responsavel, canal e lead. A selecao passou a ser explicita e a paginacao
  existente foi preservada.
- O layout usa tres regioes em desktop, duas em tablet e navegacao progressiva
  em mobile. O contexto comercial abre como painel contextual sem duplicar o
  Cliente 360.
- Outbound continua fail-closed. Site e os canais Meta reais mostram o aviso
  de indisponibilidade; resposta simulada permanece disponivel somente para
  WhatsApp com `modoTeste=true` e permissao explicita da API.
- Loading, vazio, erro, foco por teclado, retorno mobile e polling de novas
  mensagens foram cobertos sem marcar mensagens fora da area visualizada como
  lidas.
- Quatorze testes focais passaram, assim como ESLint focal, TypeScript/build e
  `git diff --check`. A revisao visual cobriu 390, 1024, 1366, 1440 e 1920 px
  sem overflow horizontal ou erro de console no cenario sintetico autorizado.
- O deploy Vercel do frontend terminou com sucesso. API e worker nao foram
  reconstruidos por se tratar de mudanca somente de frontend; ambos
  permaneceram online e `/health` permaneceu HTTP 200.
- Nao houve alteracao de backend, schema, migration, gates, autenticacao,
  tenant, canal, capability, Meta, Graph API ou outbound.
- Riscos residuais fora deste patch: o endpoint backend de resposta simulada
  deve receber uma revisao propria para exigir `modoTeste=true`; e a derivacao
  comercial de follow-up ainda possui fallback telefonico para canais sem
  telefone. E-mail e Telegram devem ganhar contratos explicitos antes de serem
  adicionados ao mesmo mapeamento da Inbox.

## Seguranca de resposta simulada e follow-up multicanal

- Em 31/07/2026, os dois riscos residuais da Inbox foram auditados e
  confirmados como bugs locais.
- Os dois writers de mensagens simuladas agora reutilizam uma politica
  server-side unica. Somente canal `WHATSAPP_META` com `modoTeste=true`,
  carregado do banco e tenant-scoped, aceita mensagens simuladas.
- WhatsApp real, Instagram, Messenger e SITE_FORM falham antes de qualquer
  escrita com `CHANNEL_SIMULATION_UNAVAILABLE`. O payload nao controla tenant,
  tipo ou modo de teste.
- O follow-up de WhatsApp permanece `WHATSAPP`. Instagram, Messenger e
  SITE_FORM passam a usar `OUTRO`, apresentado como acompanhamento neutro na
  Agenda e no Cliente 360, sem inventar ligacao ou telefone.
- External IDs opacos e PSIDs continuam separados do telefone. Telefone real
  previamente cadastrado e preservado.
- A matriz focal SQLite cobriu os quatro canais, ambas as direcoes, payload
  forjado, isolamento por tenant, chamada direta aos services, zero mutacao em
  rejeicoes e semantica de follow-up. PostgreSQL nao foi repetido porque nao
  houve mudanca de transacao, concorrencia, unique ou query dependente de
  engine.
- Nao houve schema, migration, Meta, Graph API, accessTokenRef ou outbound
  real.

## Piloto sintetico multicanal sem Meta

- Em 31/07/2026, o piloto sintetico multicanal foi consolidado nos commits
  `287bf7c3706aea1496793f7f68c4aeec95b96b70`,
  `1bcdab8b47d2d5f430703dda60f980ff29acb717` e
  `3b08378745744b9c855ddfe6ff1ff11f14e8539b`.
- WhatsApp, Instagram e Messenger percorreram os webhooks e o pipeline
  comercial reais em bancos temporarios. Cada canal produziu evento, contato,
  Cliente, Lead, conversa e mensagem tenant-scoped, visiveis na Inbox e no
  Cliente 360, sem compartilhar identificadores entre canais ou tenants.
- O WhatsApp passou a deduplicar eventos por tenant e canal, rejeitar lotes e
  Content-Encoding ambiguos antes da persistencia e preservar sucesso diante
  de falha atrasada ou pausa concorrente. Os limites focais sao 1 MiB de body,
  3 entries, 5 changes por entry, 5 eventos por change e 10 eventos por
  request.
- Respostas simuladas permanecem exclusivas de WhatsApp test-only e agora sao
  apresentadas na Inbox e no Cliente 360 como simulacao nao enviada. Canais
  reais, Instagram, Messenger e SITE_FORM continuam sem outbound.
- SQLite aprovou os testes focais de transporte, lifecycle, seguranca de
  resposta e o piloto cruzado. PostgreSQL 16 descartavel aprovou o piloto e o
  lifecycle afetado; o cluster foi removido e o Prisma SQLite restaurado.
- A validacao visual local cobriu desktop e mobile com dados criados pelo
  pipeline real. Site, WhatsApp, Instagram e Messenger apareceram separados,
  Messenger mostrou o aviso inbound-only, nao houve overflow horizontal nem
  erro de console.
- Nenhum schema, migration, Meta, Graph API, token real, accessTokenRef,
  outbound real, canal, capability ou tenant de producao foi alterado.
- Proximo passo: quando existirem ativos Meta autorizados, executar um piloto
  real por canal com gates graduais, rollback por pausa e observacao de
  envelopes, permissoes e callbacks externos.

## E-mail inbound - fundacao agnostica de provider

- Em 31/07/2026, foi implementada a fundacao aditiva do canal `EMAIL`, com
  capabilities `EMAIL_INTEGRATION` e `EMAIL_INBOUND`, identidade primaria e
  aliases dedicados, metadata MIME 1:1 e threading persistente.
- O provisionamento e lifecycle sao platform-only, usam CAS e auditoria e nao
  configuram credencial, provider real ou outbound.
- O adapter inicial `GENERIC` normaliza MIME em memoria. Raw e binarios nao sao
  persistidos; HTML e sanitizado e a interface renderiza apenas texto.
- O simulador e importavel, test-only, reservado a `@example.test` e
  indisponivel em `production`; nenhuma rota de simulacao foi criada.
- Texto sintetico percorre EventoWebhook, ContatoCanal, Cliente, Lead,
  ConversaCanal, MensagemCanal, Inbox e Cliente 360. Replay e concorrencia
  convergem para uma cadeia, e auto-reply, bounce e anexo sem texto sao
  terminais sem escrita comercial.
- A Inbox identifica E-mail separadamente, mostra assunto/remetente/anexos e
  informa que respostas por E-mail ainda nao estao habilitadas.
- Proximo passo externo: escolher Gmail API, Microsoft Graph ou IMAP,
  implementar o adapter real e executar o runbook de ativacao com gates OFF
  ate a janela de piloto aprovada.

## Isolamento estrutural multi-tenant

- Em 01/08/2026, 83 relacoes tenant-scoped passaram a usar foreign keys
  compostas por tenant em SQLite e PostgreSQL. Atores globais de plataforma,
  produtos e categorias globais mantiveram sua semantica intencional.
- A migration `20260801123000_enforce_tenant_safe_relations` executa preflight
  antes de DDL, falha fechado diante de orfao ou vinculo cruzado e nao faz
  backfill, remocao ou reescrita de dados.
- Writers de integracoes, imports e automacoes foram escopados pelo tenant; as
  consultas de propostas validam o contexto das relacoes antes de responder.
  O importador SQLite para PostgreSQL valida contagens antes do commit e
  reverte integralmente qualquer divergencia.
- SQLite validou migrate-empty, upgrade historico, preservacao de fixture e
  rejeicao pre-DDL. PostgreSQL 16.14 validou as 83 constraints, P2003,
  rollback, duas conexoes concorrentes, upgrade incremental e zero drift.
- O preflight read-only de producao encontrou zero orfao e zero vinculo
  cruzado. Um backup logico pre-migration foi verificado com `pg_restore
  --list` antes do deploy.
- A API aplicou a migration uma unica vez pelo startup oficial e iniciou com
  PostgreSQL. O smoke pos-migration confirmou 83/83 constraints, zero
  incompatibilidade e `/health = 200`; o worker permaneceu saudavel.
- Os commits locais anteriores de autorizacao, OAuth Bling e sessao frontend
  foram preservados sem squash ou rebase. O proximo passo e manter o verifier
  read-only no checklist de migrations que adicionem novas relacoes tenant.

## Usuarios e Seguranca - estado publicado

- Em 01/08/2026, o modulo de Usuarios e Seguranca foi publicado pelo pipeline
  oficial no SHA `eff7bc978a6a38cf690da623725a9410ec43ae4f`.
- A release inclui sessoes persistidas, refresh token opaco armazenado por
  hash, rotacao e protecao contra replay, logout e revogacao, troca e
  recuperacao de senha, convites, administracao de usuarios, protecao do
  ultimo ADMIN, coordenacao multiaba, auditoria sanitizada e interfaces
  frontend.
- A migration `20260801150000_add_user_security_foundation` e exclusivamente
  aditiva e foi aplicada uma vez pelo mecanismo oficial. O codigo anterior
  permanece compativel com as novas tabelas para rollback de artefato.
- API e worker Railway terminaram `SUCCESS`, PostgreSQL permaneceu saudavel e
  o frontend publicou novos assets. O smoke read-only confirmou `/health = 200`,
  rotas protegidas sem autenticacao em 401 e paginas publicas de login,
  recuperacao, redefinicao e convite em 200.
- No checkpoint publicado antes da feature Meta, o verifier produtivo aprovou
  87 relacoes tenant-scoped, 134 foreign keys e 17 parents unique, com zero
  orfaos e zero vinculos cruzados; esse numero e historico do oficial em
  `6e39e2a`, nao a contagem do RC atual (89).
- A entrega real de e-mail permanece pendente de provider. Nenhum SMTP, Gmail
  ou Microsoft Graph foi integrado e nenhum e-mail real foi enviado.

## Proxima fase visual

- A reformulacao do Painel Comercial ja foi iniciada e publicada. O commit
  `0189e8d1fcf31b70a283928adb4ea84ec2907264` reestruturou a experiencia do
  dashboard comercial, e o commit
  `9b14b0587fd4a5f223589440f7d4b186e2d91b0e` removeu os icones decorativos de
  prioridade.
- O blueprint amplo do design system, shell, navegacao e Painel Comercial foi
  concluido com base em padroes atuais de SaaS B2B maduras. A proxima etapa e
  implementar, no projeto principal e sem copia paralela, a fundacao visual, o
  shell desktop e o Painel Comercial para validacao visual antes de publicar.
- O custom agent `design_worker` esta configurado e disponivel para delegacao,
  usando `gpt-5.6-terra` com reasoning `high`. A skill local
  `interface-design` permanece a autoridade principal para UI/UX.

## Onda 4 - Clientes + Negocios

- A nomenclatura canonica foi normalizada em 08/08/2026: a Onda 4 compreende
  conjuntamente Clientes e Negocios.
- Historico da normalizacao: a Onda 4 permaneceu local na branch
  `feature/postgres-migration-prep`, no HEAD `6e76d9695744da7c2edfa1e4481dfdeb9c750fa4`,
  alinhado ao upstream na relacao `0 0`, com index vazio. Depois, os commits
  Meta `38fda4b`, `377cffa` e `177d2e1` avancaram somente a feature; nao foram
  incorporados ao `origin/master`.

### Clientes

- Clientes foi implementado e validado preservando o contrato real do backend:
  Cliente, localizacao, contato, status, score explicitamente indisponivel
  quando nao ha fonte confiavel, proxima acao e acoes existentes. O Cliente 360,
  favoritos, paginacao, busca e filtros foram preservados.
- O QA visual controlado aprovou 1366x768, 1440x900, 1920x1080 e 900x768, sem
  overflow da pagina ou erros no console. O smoke funcional aprovou abertura e
  fechamento acessivel do Cliente 360, retorno de foco e estados recuperaveis
  de erro.
- As adaptacoes por contratos ausentes permanecem explicitas: a listagem nao
  inventa responsavel nem valor individual de Cliente, e nao projeta score ou
  receita sem fonte confiavel. O teste focal ativo e
  `frontend/tests/wave4-clients.test.mjs`.

### Negocios

- Negocios foi implementado e validado preservando `Negocio` como fonte de
  verdade, o pipeline real, o feature flag, a capability, o drag-and-drop e o
  movimento otimista com rollback. As etapas `Fechado` e `Perdido` permanecem
  no quadro; valores usam BRL e os estados parado e atrasado sao semanticos.
- O QA visual aprovou 1366x768, 1440x900, 1920x1080 e 900x768, sem overflow da
  pagina ou erros no console. O drawer aprovou foco inicial, contencao de Tab,
  Escape, bloqueio e restauracao do scroll e retorno do foco ao card de origem.
- O teste focal ativo foi normalizado para
  `frontend/tests/wave4-negocios.test.mjs`; nenhuma logica de produto foi
  alterada pela renomeacao.

### Evidencias, deltas e limites

- As validacoes funcionais e visuais anteriores permanecem validas: 12/12
  testes focais, ESLint alvo, `git diff --check`, 91/91 testes do frontend e
  build. O aviso conhecido de chunk acima de 500 kB permanece sem regressao.
- Os artefatos canonicos sao `WAVE_4_CLIENTS_DELTA.patch`,
  `WAVE_4_DEALS_DELTA.patch` e `WAVE_4_DELTA.patch`, derivados mecanicamente
  dos marcos existentes, sem selecao manual de hunks. As evidencias historicas
  `WAVE_4_MARK_A.patch` e `WAVE_4_CLIENTES_PARTIAL_DELTA.patch` permanecem
  imutaveis.
- Permanecem como divida funcional futura, fora desta normalizacao: responsavel
  na listagem de Clientes, definicao oficial do valor individual de Cliente,
  fluxo real de Novo negocio e agregado confiavel de receita por etapa.
- `backend/prisma/dev.db` permaneceu imutavel, com SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
  Nao houve alteracao de backend, API, banco, Prisma, schema ou migration.
- Producao nao foi acessada nem alterada. Nao houve browser, nova implementacao,
  mudanca visual, commit, push, deploy ou inicio da Onda 5 nesta normalizacao.

## Estado visual canonico - normalizacao administrativa

- As Ondas 1 a 6 estao concluidas: fundacao e shell, Visao Geral, Painel
  Comercial, Clientes + Negocios, Agenda + Caixa de Entrada e o redesign visual
  final. O redesign visual e o redesign composicional foram implementados e
  aprovados.
- O Gate Final de Acessibilidade Funcional foi concluido com
  `ACCESSIBILITY_GATE_PASS`.
- O RC1 foi publicado anteriormente pelo fluxo oficial no SHA
  `544f9da7617e3bd5ae3c8453fcc73ac39185f252`; naquele checkpoint, o HEAD local
  e `origin/master` permaneciam nesse SHA, na relacao `0 0`, sem codigo local
  pendente para publicar. Esse registro e historico.
- Depois do RC1, o Teste Luna #2 aprovou dois deltas do Site Form:
  `backend/src/site-leads/service.js` e
  `backend/tests/site-lead-capture-d1.test.js`. Esses deltas integram o pacote
  de publicacao controlada correspondente a este checkpoint; este registro nao
  antecipa o resultado de commit, push ou deploy.
- O deploy Vercel foi concluido e o smoke publico de producao foi aprovado no
  escopo autorizado. O Railway nao precisou de novo deploy porque nenhum path
  observado exigia publicacao de backend.
- A producao permanece intacta quanto a banco, backend, ambiente, dependencias
  e dados; nenhum outbound ou alteracao de dados reais ocorreu.

## V54 — release do redesign V52 (2026-08-13)

- O runtime funcional publicado permanece no SHA
  `7e6d5f0544cf53f105ab7623e91bcc0405dd1270`; os refs finais foram conferidos
  novamente com Git. Os commits posteriores documentais nao alteram o produto.
- A producao oficial e o projeto Railway `glistening-playfulness`, ambiente
  `e18f76b1-e38f-468e-91fe-1eff6db9a5f8`, com API `api` e worker `crm`; os IDs
  dos deployments e a paridade frontend/backend estao registrados nos
  relatorios V54. PostgreSQL 18.4 terminou com 9 migrations aplicadas.
- As invariantes pos-migration passaram: campos de lifecycle presentes, zero
  status invalido, zero inconsistencia de arquivamento, zero orfao, zero
  vinculo cross-tenant, FK Nota→Cliente em RESTRICT e zero lock residual.
- Os backups pre e pos-release foram criados fora do repositorio, tiveram hash
  SHA-256 e `pg_restore --list` verificados; o restore privado e o ensaio de
  migration foram concluídos sem expor linhas ou dados reais.
- O redesign teve gates funcionais, visuais desktop/mobile e evidencias
  sanitizadas. Nao houve provider real, Meta/Graph/OAuth, outbound ou dado
  sintetico persistente em producao. Nao havia sessao autenticada segura nem
  pacote axe disponivel para um smoke autenticado/axe completo; essa limitacao
  permanece explicitamente registrada nos relatorios, sem mascarar o resultado.
- Limite de rollback: Mark A/V50 so pode ser usado como fallback temporario com
  escrita pausada e prova de zero estados de lifecycle; depois da primeira
  gravacao real de arquivamento, somente recovery/forward-fix compativel com
  V54 e seguro.
- Evidencia consolidada: `artifacts/v54/META_V54_REPORT_AND_DOCUMENTS.zip`.

## V58 — sidebar compacta e Inbox full-workspace (2026-08-14)

- O runtime frontend V58 foi publicado no SHA funcional
  `c91976d6538608e527ceb3784e1e4ee0d4d6131f`; os commits V58 foram
  `5e36287`, `fc8d0a9`, `ceb1ebf` e `c91976d`. O backend, banco, schema,
  migrations e integrações não mudaram.
- A sidebar passou de 224/68 px para 208/64 px, com collapse persistente,
  ARIA, foco e teclado. A Inbox usa frame específico com 10 px de respiro,
  grids 25/75 ou 25/50/25, Chat dominante, scroll interno e composer ancorado.
- A produção Vercel está no deployment
  `dpl_6Qg8JXe6ncoay817CFYTo1fmKMBR`, com aliases oficiais e HTTP 200. O
  Railway/backend foi reutilizado; `/health` permaneceu HTTP 200.
- A suíte frontend terminou 159/159, o build TypeScript/Vite passou e o
  `dev.db` protegido preservou SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- QA autenticado confirmou 1440×900, 1366×768, drawer compacto 1280×800 e
  sentinel 390×844, sem overflow horizontal e sem erros/avisos no console.
  A limitação explícita é `AXE_AUTOMATED_RUN=NOT_AVAILABLE`; DOM/ARIA,
  teclado, foco e overflow foram verificados manualmente.
- As evidências sanitizadas estão em `artifacts/v58/`. Captures anexáveis são
  JPEG reais (`*.jpg`); os nomes `*.png` históricos não são usados como prova
  MIME. O breakpoint 1023/1024 e o alinhamento topbar/Inbox permanecem
  advisories fora do escopo desktop focal.

## V61 — Inbox operacional e timestamp de chat (2026-08-14)

- O runtime funcional V61 está no SHA
  `411c99c04147cb049dbbb7446c6be2e59669ad01`; origin/feature e
  origin/master foram conferidos no mesmo SHA.
- A fila usa status, responsável/lease e Acompanhamento existentes; não há
  schema, migration, provider ou outbound real novo. Reagendamento do mesmo
  lembrete sincroniza aguardandoDesde, CAS perdedor falha fechado e o ator
  automático é o usuário interno Sistema. A identidade `sistema@crm.internal`
  é reservada por tenant, oculta de listas/equipes e bloqueada contra login,
  reset, reativação, edição e atribuição; o inbound repara metadados canônicos.
- Frontend canonical 161/161 e build TypeScript/Vite passaram. Suites isoladas
  de V61, WhatsApp, Messenger, Instagram e Email passaram; dev.db preservou
  SHA-256 `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- A Vercel publicou `dpl_B3U4uJu2ybJQrnLpSR9F7qgtNpH2` em READY no SHA exato;
  Railway API e worker também estão SUCCESS/RUNNING no SHA exato
  `411c99c04147cb049dbbb7446c6be2e59669ad01`; a API oficial respondeu HTTP 200.
- QA Chrome autenticado manual DOM/ARIA/teclado/overflow passou em 1440×900,
  1366×768 e sentinel 390×844. Chat foi a maior coluna, composer ficou dentro
  da viewport, rail 208/64 persistiu por reload/rota e o console não registrou
  erros. axe automatizado não estava disponível.
- Evidências individuais, sem ZIP, estão em `artifacts/v61/`; as imagens foram
  anexadas e o relatório foi colado na conversa fixada do SaaS. O seletor do
  Chrome bloqueou o upload dos documentos locais; eles permanecem disponíveis
  no diretório para recuperação.

## Integrações visíveis + observabilidade — checkpoint inicial (superseded) (2026-09-01)

- O candidato local final é `bb9ec6da0587793415b6cd25f030e41611cd8dbc`, tree
  `a520a9aa10f00b84c15bc69ce1ee43261a2ac5bd`, com manifesto backend
  `4b85aa5cfb0e78c0d64dec37365362e5db4651a1bcde80cce3ce683719a32868`.
- A superfície canônica de integrações exibe seis providers com estados
  textuais verdadeiros; a observabilidade técnica é somente leitura e restrita
  ao operador de plataforma. Escritas genéricas de credenciais permanecem
  bloqueadas fora de ativação externa explícita; revogação local segura não
  inicia provider.
- Testes locais: frontend 239/239, ESLint/build PASS, suíte backend isolada
  exit 0; banco protegido preservou SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- Staging Railway API `9934b1a7-8dba-4029-9a27-c16e164cd4e6` e worker
  `ebefe2db-ad83-4446-978f-c495c30a0810` estão SUCCESS; `/health` e `/ready`
  responderam HTTP 200. Vercel staging `dpl_8Qcax4sG949hnPDKJqozqdnxpj43`
  está READY no alias `crm-ga3-bundle-staging.vercel.app`.
- Nenhuma conta/provider real, credencial de produto ou outbound foi usado.
  Produção não foi publicada nem alterada por esta missão.
- E2E autenticado e revisão adversarial autenticada de staging continuam sem
  sessão QA segura; a tentativa de controle de navegador foi classificada como
  `BROWSER_CONTROL_FAILURE`. O reviewer independente solicitado para o SHA
  final não retornou na janela operacional e foi interrompido, portanto o
  veredito adversarial final permanece `BLOCKED_EXTERNAL`. Não declarar
  promoção para produção até obter essas evidências externas.

## Integrações visíveis + observabilidade — checkpoint pós-QA autenticado (2026-09-01)

- O bloqueio de login foi diagnosticado como configuração do artefato estático:
  `VITE_API_URL` do Preview continha `/api`, mas não havia rewrite no deploy
  anterior. O resolver passou a fixar o host oficial de staging quando o
  hostname canônico é reconhecido; `vercel.json` foi incluído no upload para
  rewrite/API e deep-link SPA. A correção funcional está em
  `a3458c232283f68ca2894b1986ced9f581c8798d`, tree
  `8ca0d6fb61e159267ac974f26fd1f83db5d0ff70`.
- Frontend 239/239, lint e build passaram; branch remota está alinhada ao
  mesmo SHA. O Vercel staging está em `dpl_AksDEPAeM6a6WoesaF3dA1fZp6GK`;
  `index.html`, JS principal e CSS publicados conferem byte a byte com o build
  local. `/api/health` e `/integracoes` respondem 200; Railway `/health` e
  `/ready` respondem 200.
- O ADMIN QA autenticou no staging e validou os seis cards de Integrações. A
  API e a UI convergiram para `UNAVAILABLE`/`NOT_CONFIGURED`/`DISABLED` sem
  falso `CONNECTED`; nenhum OAuth, provider request, credencial de provider ou
  outbound foi iniciado. Tabs, ARIA, ArrowRight/Home/End e retry de leitura
  foram exercitados.
- O operador temporário autenticou e abriu Observabilidade técnica somente
  leitura. O ADMIN QA comum recebeu 403 `PLATFORM_FORBIDDEN`. O painel exibiu
  alerta honesto de checkpoint ausente, sem chamar isso de worker saudável e
  sem expor segredo.
- O run QA foi revogado com atestado fresco. `qa-prod-canonical-a`,
  `qa-prod-canonical-b` e `qa-platform-operator-staging` estão `REVOKED`, com
  zero usuários ativos, sessões, refresh tokens, integrações, canais, outbox e
  leases. `PLATFORM_ADMIN_EMAILS` foi removida do staging e a API foi
  redeployada; produção permaneceu intocada.
- A capacidade de viewport do conector Chrome não alterou o viewport efetivo;
  por isso a matriz live de cinco resoluções e `CONSOLE_ERRORS=0` não são
  declarados como provados. Fixtures locais cobrem 390×844 e 1440×900; Vercel
  não registrou runtime errors nas últimas duas horas.
- O Reviewer B encontrou e o executor corrigiu um vazamento de URI em motivos
  de auditoria/lifecycle de E-mail; a função compartilhada
  `backend/src/security/auditReason.js` foi testada e publicada no backend
  staging `e666eff2-7fa0-452b-b0f4-83c96d3d8ad6`. O commit funcional atual é
  `35cf6cef70489a4c55f4c4fa257c5c17b982d773`, tree
  `bf1420363e9bc2e48685927f6613c506454f46ab`.
- O Reviewer A encontrou e o executor corrigiu códigos internos na UI de
  requisitos, enums crus no filtro de Importações e vazio semântico errado no
  card de credenciais. A suíte frontend continua 239/239, lint/build PASS; o
  candidato é `daef225348f715edf079c0e3f2a051b062318531`, tree
  `f1eb9ea120f9f9d58e633853885af5b8ac2ffc93`.
- O frontend final está no Vercel staging `dpl_5mG6xZWnTDszcmG7TMRv1wQYMFx3`;
  o backend final no Railway staging é `35e96728-ba1e-4bcf-a99d-62785ea90256`.
  Rechecagem autenticada confirmou rótulos humanos, Importações sem enums,
  observabilidade com vazio de credenciais correto e 403 para ADMIN de tenant.
- Duas revisões novas, independentes e read-only foram concluídas para o SHA
  final: `REVIEW_A_FINAL=PASS_AFTER_RECHECK` e `REVIEW_B_FINAL=PASS`. O
  adversarial final foi tentado novamente em uma instância limpa e em um
  runtime alternativo, mas as três tentativas não retornaram dentro da janela
  operacional e foram interrompidas; classificar o mecanismo como
  `FINAL_ADVERSARIAL_REVIEWER_INFRA=UNAVAILABLE` e manter
  `FINAL_ADVERSARIAL_VERDICT=BLOCKED_EXTERNAL_REVIEWER_TIMEOUT`,
  `FINAL_SOL_RECONCILIATION=NOT_CLOSED` e `READY_FOR_PRODUCTION=false`.
- Autoridade documental: `docs/INTEGRATIONS_UI_OBSERVABILITY_FINAL_2026-09-01.md`.
- A revisão adversarial independente encontrou `INT-ADV-001` (HIGH): rotas
  mutáveis de operador para provisionamento/ativação de providers não aplicavam
  o freeze global. O fix compartilhado está em `2214b846`, com teste focal,
  H7.1 e suíte backend isolada passando; o backend foi republicado no staging
  como `f03b3cf7-fce2-4923-ad47-ebdc476b0fd5`, health/ready 200 e hashes dos
  arquivos causais conferidos no runtime. `pause` continua permitido como
  disable local seguro. O finding está `RETESTED`; nova revisão adversarial do
  SHA `2214b846` ainda é necessária antes de `SHIP`.
- A revisão pós-correção encontrou `INT-ADV-002` (HIGH), redaction incompleta
  para esquemas URI opacos, e `INT-ADV-003` (MEDIUM), ausência de hashes
  backend no índice. Ambos foram corrigidos e retestados no commit funcional
  `696e2a7`, com suíte backend isolada PASS e hashes dos arquivos causais
  conferidos byte a byte no deployment de staging `63d3924d`; nova revisão
  adversarial limpa permanece obrigatória.
- O candidato intermediário da correção de redaction foi `696e2a7`, tree
  `d416ba96a5817540f70c198617e330286d8607a4`; a branch também contém apenas
  o teste/documentação posterior `ca4127d`. O backend staging está no deploy
  `63d3924d`, com health/ready 200 e paridade dos hashes backend registrada no
  evidence index.
- A revisão adversarial seguinte encontrou `INT-ADV-004` (HIGH): o redactor
  genérico de respostas de Integrações ainda expunha URI opacas (`mailto:`,
  `urn:`, `data:` e esquemas customizados). O fix foi aplicado e retestado em
  `4a5fb66b3d8f08d6cdf2b1e1fa9ba3f784b15aa7`, tree
  `3e80ad611ef489ed6e0f771201f1d319f5258c8b`; a suíte backend isolada,
  `integration-security-hardening` e `audit-reason-redaction` passaram. O API
  foi republicado no staging como `54d0f59f-fd49-4e4c-9345-40ff9873f7c8`,
  health/ready 200 e os hashes causais conferem no runtime. `INT-ADV-004` está
  `RETESTED`; nova revisão adversarial limpa e a reconciliação do Sol continuam
  obrigatórias, mantendo `READY_FOR_PRODUCTION=false`.
- A revisão adversarial do candidato seguinte encontrou `INT-ADV-005` e
  `INT-ADV-006` (HIGH), além de `OBS-001` e `OBS-002` (MEDIUM): reativação
  genérica sob freeze, URI opaca prefixada, leases distribuídos e contagem de
  credenciais de Integração/Bling. Os fixes foram aplicados em `0fa94b0` e
  `f7865f7`, com testes focados e suíte backend isolada passando. O API foi
  republicado no staging como `79455b2b-c659-4ecf-9394-0988bb88f3a0`, health/
  ready 200, e os hashes causais conferem byte a byte. O candidato vigente é
  `f7865f7f85962f5d33148e19031e3b0bb36d221e`, tree
  `50f1db6fd8dba1d01a53a1cdc496f846e0517965`; os quatro findings estão
  `RETESTED`, mas a nova revisão adversarial limpa e a reconciliação do Sol
  continuam obrigatórias.
- A revisão subsequente encontrou `INT-ADV-007` e `INT-ADV-008` (HIGH):
  redaction hierárquica incompleta e troca de tipo/configuração em integração
  ativa durante o freeze. Também confirmou `INT-ADV-009` (HIGH), falso
  `CONNECTED` de WhatsApp/Messenger sem `MetaCredential` ativa, e classificou
  `OBS-003` (MEDIUM) como fora do contrato porque a observabilidade pública é
  deliberadamente agregada e sanitizada. Os fixes foram aplicados em `fffcb0c`
  e `7b9251e`, com suíte backend isolada PASS_EXIT_0 e lifecycle/webhook
  autenticados passando. O API staging está no deployment
  `cbd75a4e-2f0e-40e6-9e75-815099c667d8`, health/ready 200, e os hashes causais
  conferem byte a byte. O candidato funcional vigente é `fffcb0c0de0e7f6c7a42b3ab91e8d7f4eb821026`,
  tree `e3eb8c0ae2320c5fbbb9727015e9c24969451f78`; a revisão adversarial limpa
  final e a reconciliação do Sol continuam obrigatórias.
