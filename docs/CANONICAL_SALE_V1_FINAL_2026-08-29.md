# Venda Canônica V1 — relatório canônico consolidado

Data de consolidação: 2026-08-30

Branch: `feature/canonical-sale-v1`

Estado deste documento: `FINAL`

Este documento substitui o relatório local anterior, que registrava staging
como não iniciado. Ele consolida somente fatos comprovados até o artefato de
release atual. O primeiro adversarial retornou `FIX_FIRST`; os findings foram
corrigidos e retestados. A revisão adversarial independente pós-fixes retornou
`SHIP`, o secret sweep final passou e o Sol reconciliou a matriz. `SHIP` aqui
significa staging verificado e prontidão para uma promoção futura separadamente
autorizada; produção não foi promovida nem alterada.

## 1. Veredito atual

```text
MISSION_COMMAND_AUDIT=PASS
MODEL_SELECTION_PRECONDITION=SATISFIED
RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED
MODEL_IDENTITY_GATE=NOT_APPLICABLE

RELEASE_ARTIFACT_HEAD=2da896aac84dd683e844b266331716e9600e6357
RELEASE_GIT_TREE=5fcb51262f2ca9d68cb6403c41fcbc66cbb40fce
REPORT_COMMIT=a56f936eae6511bd9f090fa84bed4fadf39b43aa

IMPLEMENTATION_COMPLETE=PASS
LOCAL_GATES=PASS
GLOBAL_REGRESSION_LOCAL=PASS_WITH_PROPORTIONAL_RETEST
POSTGRES_CAUSAL_GATE=PASS

CONTROLLED_PUSH=PASS
STAGING_MIGRATION=PASS
STAGING_BACKEND_RUNTIME=PASS
STAGING_FRONTEND_RUNTIME=PASS
SOURCE_RUNTIME_PARITY=PASS
STABLE_ALIAS_PARITY=PASS
FINAL_RUNTIME_QA=PASS

CANONICAL_SALE_STAGING_E2E=PASS
STAGING_IDEMPOTENCY=PASS_WITH_POST_FINDING_CAUSAL_RETEST
STAGING_CONCURRENCY=PASS
STAGING_REOPEN=PASS_AFTER_FAIL_CLOSED_HARDENING
STAGING_REVENUE_PROVENANCE=PASS
STAGING_CSV_EXPORT=PASS_AUTHENTICATED_DOWNLOAD
STAGING_TENANT_SECURITY=PASS
STAGING_SNAPSHOT_IMMUTABILITY=PASS
STAGING_BROWSER_QA=PASS
CONTINUOUS_USE_REVIEW=PASS
COMMERCIAL_TRANSACTION_SOAK=PASS_WITH_CAUSAL_SUPPLEMENT
STAGING_QA_CLEANUP=PASS_DEACTIVATE_AND_RETAIN_APPEND_ONLY_HISTORY
ROLLBACK_FORWARD_FIX_REHEARSAL=PASS

STAGING_AUDIT_SWEEP_1=PASS_AFTER_RETESTS
STAGING_AUDIT_SWEEP_2=PASS_AFTER_RETESTS
SECOND_REVIEW_FINDING_IDEMPOTENCY_RECOVERY=RETESTED
FINAL_SECRET_SWEEP=PASS
FIRST_FINAL_ADVERSARIAL_VERDICT=FIX_FIRST
FIRST_FINAL_ADVERSARIAL_FINDINGS=RETESTED_RECONCILED
FINAL_ADVERSARIAL_VERDICT=SHIP
FINAL_SOL_RECONCILIATION=PASS

CANONICAL_SALE_V1=COMPLETE
READY_FOR_PRODUCTION=YES
PRODUCTION_CHANGED=false
REAL_PRODUCT_PROVIDER_CONNECTIONS_USED_BY_THIS_MISSION=0
REAL_PRODUCT_PROVIDER_CREDENTIALS_USED_BY_THIS_MISSION=0
REAL_OUTBOUND=0
HOSTING_CONTROL_PLANE=STAGING_ONLY
```

O limite máximo desta missão continua sendo prontidão futura para produção.
Nenhuma promoção para produção está autorizada ou foi realizada.

## 2. Estado inicial e evolução do candidato

- Baseline funcional: `79eed4f`.
- Código comercial inicialmente validado: `5d45ace`.
- Correção original do harness PostgreSQL: `3525651`.
- Candidato de UI estabilizado após `DRAWER-ASYNC-01`: `5d0e427`.
- Hardening aditivo de ledger/migration/runtime: `f8f4961`.
- Correção funcional encontrada no segundo sweep: `3b2e462`.
- Correções do primeiro adversarial — reopen fail-closed, CSV executável e
  evidência final: `2da896a`.
- HEAD remoto da branch após push controlado: exatamente `2da896a`.
- Manifesto de fonte do release: Git tree
  `5fcb51262f2ca9d68cb6403c41fcbc66cbb40fce`.
- `backend/prisma/dev.db` permaneceu imutável, SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.

O release atual não refaz o contrato comercial. Ele agrega correções causais
descobertas pelos reviewers, migrations forward-only, provas de runtime e
evidências de staging.

## 3. Contrato implementado

O contrato congelado em `docs/ADR_CANONICAL_SALE_CONTRACT_V1.md` permanece a
autoridade de domínio:

- Negócio é a entidade comercial central.
- Um Negócio possui zero ou uma proposta principal e zero ou uma proposta
  vencedora ativa.
- Proposta aceita não fecha automaticamente o Negócio nem cria receita.
- Fechamento por proposta e fechamento manual geram `VendaCanonica` em uma
  transação atômica.
- Venda ativa é a única fonte de receita realizada.
- `Cliente.valor`, `Negocio.valor` e proposta aceita isoladamente nunca são
  receita.
- Dinheiro canônico usa centavos, BRL e preserva `null != 0`.
- Snapshot monetário, itens, origem e revisão são históricos.
- Reopen invalida a venda anterior com motivo e preserva a fotografia.
- Reopen de Negócio `PERDIDO` exige histórico causal da transição terminal
  atual; histórico ausente, inválido ou antigo falha fechado com
  `LOST_REOPEN_HISTORY_INVALID`, sem fallback implícito para `PROPOSTA`.
- `LEGACY_WON_UNRECONCILED` sem venda ativa falha fechado com
  `ACTIVE_SALE_MISSING`; nenhum valor legado é reinterpretado como snapshot.
- Retry, CAS, locks e idempotência convergem para uma operação lógica.
- Relações são sempre fechadas por tenant, Cliente, Negócio e papel.

## 4. Freeze, alvos e push controlado

O preflight confirmou worktree, branch, ancestry, status, arquivos não
rastreados, `dev.db`, ausência de segredo conhecido e HEAD exato. O push foi
feito somente para `feature/canonical-sale-v1`; não houve merge em `main`.

| Camada | Alvo canônico de staging |
| --- | --- |
| Railway project | `ddfbf66c-e274-47b1-9493-286232d2f426` |
| Railway environment | `d6b6f137-cffd-4647-a102-3619fc54133a` (`ga3-bundle-staging`) |
| API | `8af12b8e-4f4d-498c-9ceb-3182417905f8` (`ga3-bundle-api`) |
| Worker | `25dab463-52c0-4425-825e-c7dcf6a65332` (`store1-worker`) |
| PostgreSQL | `f3a2862b-2371-4ab3-b4db-1e91680ee3b7` (`Postgres--e25`) |
| Vercel project | `prj_AJE06pNRGunJoguCNWee0RgZV6t8` |
| Vercel alias | `crm-ga3-bundle-staging.vercel.app` |

Os alvos de produção são distintos. A API de produção permaneceu no deployment
`5bdfb9e8-2e36-4a8c-a177-9595efc36ac5`; o alias de frontend de produção
permaneceu no deployment `dpl_GzT5h7Q7paK6mLr7ExAxbkBFFABh`; o worker de
produção permaneceu em `db381e6e-3b3a-4c67-a3b9-06a3d52c74d5`.

## 5. Migration, backup e rollback

As migrations canônicas são aditivas e forward-only:

| Migration | Plataforma | SHA-256 |
| --- | --- | --- |
| `20260828130000_add_canonical_sale_v1` | SQLite | `00d7064d74e167503280b625f6a5a076efedf1824c4c9bf8f284b8b0430b8d37` |
| `20260828130000_add_canonical_sale_v1` | PostgreSQL | `b9d6e0f3f56181f1a1fde44a7c454a2f525a8733eb9c065c1e900fdfa65971e1` |
| `20260830133500_harden_canonical_sale_delete_guard` | SQLite | `69aa03b4cd09c5e3f232a9d56e146ec8623c342bb42e451ee35a9274cc83b4dd` |
| `20260830133500_harden_canonical_sale_delete_guard` | PostgreSQL | `14349f98eda3b066c0abc8ce236387f90b2fe8c77f816601d3533932b9492be4` |

O banco de staging terminou com 20 migrations aplicadas e sem migration falha.
O verifier confirmou a última migration, oito triggers protegidos, bypass por
sessão bloqueado, `TRUNCATE` bloqueado e zero empresas QA no checkpoint
pré-E2E final. As fixtures criadas depois foram desativadas e retidas conforme
o contrato append-only, como detalhado no cleanup final.

O backup pré-hardening `canonical-sale-staging-pre-delete-hardening.dump` tem
670217 bytes e SHA-256
`95fa106ec98a615528a5260b422174b3ae5eb8476b10f6d6f8d5d71a953f2a`.
Seu restore drill passou com 1330 entradas, 19 migrations no snapshot
pré-hardening, zero falhas, 91 tabelas e cinco tabelas-chave verificadas. Um
backup anterior à migration inicial também foi ensaiado; o índice sanitizado
ancora o backup mais recente cujo hash completo foi revalidado.

O rollback contratual permanece forward-fix ou pausa de escrita; não existe
`DROP`, reset ou reinterpretação silenciosa de legado. O rehearsal executou um
deploy intencionalmente falho (`254bb33d-48d9-4a7e-b67f-4472ba93d9d8`), sem
migration. O bridge migration-aware `3b2e462`/`ecc3a785` permaneceu ativo com
health, readiness, banco e fingerprint corretos, zero writes e zero outbound.
O forward-fix `2da896a`/`313650fd` então assumiu saudável e com paridade exata.
O resultado sanitizado está em
`docs/evidence/CANONICAL_SALE_V1_ROLLBACK_FORWARD_FIX_REHEARSAL_2026-08-30.json`.

```text
ROLLBACK_FORWARD_FIX_REHEARSAL=PASS
```

## 6. Deploy e paridade source/runtime

Deploys atuais do release `2da896a`:

- Railway API: `313650fd-be82-4a28-a89a-9f1d525b400e`, `SUCCESS`, image digest
  `sha256:70e89dd1d625a7eb08214b6da0af0b8733f97ca656860d5ecbfff3418dc18580`.
- Vercel frontend final: `dpl_EmnYbZQWFWxyaD1u8A5fXk19v5Cr`, `READY`,
  vinculado ao alias estável de staging, com `gitCommitSha/releaseHead=2da896a`
  e `gitDirty=false` a partir de worktree detached limpo.
- O E2E e a captura CSV rodaram antes no deployment
  `dpl_DvVGWZV8Mb4HWbKtyfKTk3uk8r1k`, de fonte `2da896a` idêntica. Esse ID é
  preservado como deployment de execução, não como alias final.
- Worker staging permaneceu saudável e não participa do caminho causal da
  Venda Canônica V1.

`/health` e `/ready` responderam 200; readiness confirmou banco acessível. O
runtime expôs:

```text
SOURCE_MANIFEST_VERSION=backend-runtime-v3-lf
SOURCE_MANIFEST_SHA256=bef4bab2726db40731ac1473cad95ae623e12cc656c189bb2cd1985a9b84f8d8
TARGET_VERIFIED=true
DATABASE_VERIFIED=true
PROVIDERS_CONNECTED=false
OUTBOUND_ENABLED=false
```

Branch, Git tree, backend deployment, frontend deployment, migrations, banco
e alias estável convergiram para o mesmo release. `SOURCE_RUNTIME_PARITY=PASS`.
Na janela final, backend teve zero error logs e zero HTTP 5xx; o banco tinha 20
migrations aplicadas e zero falhas. Evidência sanitizada:
`docs/evidence/CANONICAL_SALE_V1_FINAL_RUNTIME_RESULTS_2026-08-30.json`.

## 7. PostgreSQL causal final

O gate final foi executado em PostgreSQL 18.6 descartável no WSL, com
banco/usuário exclusivos e cleanup externo. Nenhum banco oficial foi usado.

- Harness tests: 24.
- Manifesto de fonte:
  `13bafb9812beaa34793cb91cf424a8c308ce64ebadec4f7ff01c040384821ae1`.
- Manifesto de evidência:
  `20260830151754600-1400-280f48eef1c6.json`.
- SHA-256 do manifesto:
  `6e5343ca12fa3065a5868aefa3dbfc53440c1df7b71e72a8eb89ae55fd6c35c0`.
- SHA-256 dos logs sanitizados:
  `f27b7b9ef544a0ee436a183cc1988e0de4325b1f97ed13171c196ddf0fbffd44`.

Migration, constraints, CAS, locks, close/accept/update concorrentes,
idempotência, replay divergente/invalidation, tenant, snapshots e cleanup
passaram no código atual.

## 8. E2E autenticado e fixtures sintéticas

O usuário confirmou que login e dados eram sintéticos. O fluxo autenticado em
staging cobriu:

```text
login → Cliente → Negócio → Propostas A/B → principal → aceita/vencedora
→ fechamento → Venda Canônica → Customer 360 → dashboard → relatório/exportação
```

Também foram exercitados fechamento manual com zero, `null != 0`, retry,
clique duplo, duas chaves, duas abas, concorrência close/accept/update, reopen,
nova revisão, paginação com 101 propostas, cross-client, cross-tenant e RBAC de
ADMIN/GERENTE/VENDEDOR.

- hash do run E2E final no release `2da896a`: `76faf8cc92984ed808da`;
- fixture run ID: `bf1d9e90d8dd9af9`;
- SHA-256 do manifesto de fixtures:
  `ee8f850c915cffe0d8621b77c46e275041876a33d528709c20cd23a4e58d5355`;
- fixtures: 2 empresas, 8 usuários, 5 clientes, 5 negócios, 104 propostas e
  4 vendas sintéticas.

A execução ocorreu no backend `313650fd-be82-4a28-a89a-9f1d525b400e` e no
frontend `dpl_DvVGWZV8Mb4HWbKtyfKTk3uk8r1k`, ambos com source `2da896a` e
runtime manifest
`bef4bab2726db40731ac1473cad95ae623e12cc656c189bb2cd1985a9b84f8d8`.
O resultado sanitizado está em
`docs/evidence/CANONICAL_SALE_V1_E2E_RESULTS_2026-08-30.json`.

DB, API e UI convergiram para a mesma venda ativa e proveniência de receita.

## 9. Idempotência e finding do segundo sweep

O segundo sweep encontrou um bug real no recovery dos erros transacionais
`P2002`, `P2028` e `P2034`: o fallback validava fingerprint, mas podia devolver
como replay uma venda já `INVALIDATED`. A correção `3b2e462` exige status
`ACTIVE`; caso contrário responde
`IDEMPOTENCY_KEY_REPLAY_INVALIDATED`.

Retestes após a correção:

- teste focal dos três códigos: 3/3 PASS;
- suíte canônica SQLite: PASS;
- suíte focal canônica PostgreSQL: PASS;
- gate PostgreSQL completo: PASS;
- o finding permaneceu fechado nos testes do release posterior `2da896a`;
- branch remota e runtime staging atualizados para `2da896a`;
- fingerprint final confirmado.

O reviewer independente repetiu a revisão após os retestes e retornou `SHIP`,
sem finding remanescente em seu escopo. Logo:

```text
STAGING_AUDIT_SWEEP_2=PASS_AFTER_RETESTS
SECOND_REVIEW_FINDING_IDEMPOTENCY_RECOVERY=RETESTED
```

## 10. Segurança, tenant e imutabilidade

Requests reais tentaram acesso cross-tenant, proposal/sale/client forjados e
bypass direto para ADMIN, GERENTE e VENDEDOR. Os escopos falharam fechados.
Ataques tentaram update/delete de snapshot, item tardio, reativação de venda
invalidada, mudança de valor e efeito retroativo do catálogo; o histórico
permaneceu imutável.

O hardening `f8f4961` adicionou guardas permanentes de `DELETE` e `TRUNCATE`
para `NegocioContratoVenda` e o ledger canônico. O verifier provou que uma GUC
de sessão não libera o apagamento.

Limite operacional explícito: as provas cobrem o papel e o caminho normal da
aplicação. Um papel PostgreSQL proprietário/superusuário possui poderes fora
desse contrato; segregação de ownership é controle de infraestrutura, não uma
garantia inventada neste relatório.

## 11. Receita, Customer 360, dashboard e exportação

A mesma fixture foi comparada em banco, API, Customer 360, dashboard e
exportação. Foi provado que receita é somente `VendaCanonica ACTIVE`; venda
invalidada, `Cliente.valor`, `Negocio.valor` e proposta aceita isoladamente
ficam fora. Pipeline e estimativa permanecem separados; zero é conhecido e
`null` é desconhecido; BRL, centavos, subtotal, desconto e total convergem.

O primeiro adversarial não aceitou a tentativa anterior, em que o controlador
de navegador não capturou arquivo. O export foi extraído para uma unidade
executável, endurecido contra formula injection e corrigido em `2da896a`.
Depois disso:

- testes focais CSV: 4/4 PASS;
- frontend completo: 232/232 PASS;
- build e lint: PASS;
- download autenticado no staging: PASS;
- arquivo capturado: 531 bytes, 4 linhas, SHA-256
  `4c54ee6e3b0902a149b3be92791e07d161f677bb27311aee88dd4206bba8c44f`;
- header, BRL, centavos, zero/null, origem, status, proposta e revisão: PASS;
- console do browser: zero erros.

A cópia rastreada foi sanitizada em
`docs/evidence/CANONICAL_SALE_V1_STAGING_EXPORT_2026-08-30.csv`; nenhuma
credencial ou dado real foi incorporado. O manifesto executável está em
`docs/evidence/CANONICAL_SALE_V1_EXPORT_RESULTS_2026-08-30.json`.

## 12. Browser QA e uso contínuo

O QA autenticado cobriu 900×768, 1366×768, 1440×900 e 1920×1080, board,
loading, empty, error, venda manual, proposta, vencedora, substituída, legado,
perdido e reopen.

- nenhum overflow relevante;
- zero erros de console no fluxo final;
- deep link e refresh direto preservaram autenticação/drawer;
- três refreshes consecutivos: 3/3 PASS;
- troca rápida de Negócio convergiu para o estado mais recente;
- duas abas, mutações repetidas, close/reopen e sessão renovada sem stuck state.

`DRAWER-ASYNC-01` foi corrigido em `a00b4c4`, `de4ebd8`, `186fb4b`, `478c70e`
e `5d0e427`. Após o fix do CSV em `2da896a`, a regressão frontend final passou
232/232, lint e build. O download autenticado foi repetido no deployment de
execução `dpl_DvVGWZV8Mb4HWbKtyfKTk3uk8r1k`, e o alias final foi redeployado
de worktree limpo no deployment `dpl_EmnYbZQWFWxyaD1u8A5fXk19v5Cr`.
O manifesto durável do QA está em
`docs/evidence/CANONICAL_SALE_V1_BROWSER_QA_RESULTS_2026-08-30.json`.

## 13. Soak comercial

| Métrica | Fase 1 | Fase 2 | Total |
| --- | ---: | ---: | ---: |
| Iterações | 15 | 15 | 30 |
| Requests | 156 | 156 | 312 |
| Duração ativa | 288 s | 287 s | 575 s |
| Falhas | 0 | 0 | 0 |
| HTTP 5xx | 0 | 0 | 0 |
| Timeouts | 0 | 0 | 0 |
| Vendas duplicadas | 0 | 0 | 0 |
| Operações travadas | 0 | 0 | 0 |
| Drift de valor | 0 | 0 | 0 |

- fase 1 SHA-256:
  `b2ef2c3678676298aebdcb59babe32537feb1cd162366e7c87761f699a15b51e`;
- fase 2 SHA-256:
  `702d681a25adc7e32dff84cd18b52e88dd9ce93f6cb79b80e87e6bb25c678676`;
- restart controlado: PASS;
- produção 0, providers reais 0, outbound real 0.

O soak rodou em `5d0e427`. Os deltas posteriores foram cobertos
proporcionalmente: hardening/migration/runtime em `f8f4961`, recovery de
idempotência em `3b2e462`, reopen fail-closed e CSV em `2da896a`. O release
final passou focal, SQLite, PostgreSQL completo, frontend 232/232 e novo E2E
autenticado. Por isso o gate é `PASS_WITH_CAUSAL_SUPPLEMENT`, sem afirmar que o
soak inteiro foi repetido no novo SHA.

As duas fases foram copiadas para manifests sanitizados duráveis em
`docs/evidence/CANONICAL_SALE_V1_SOAK_PHASE1_2026-08-30.json` e
`docs/evidence/CANONICAL_SALE_V1_SOAK_PHASE2_2026-08-30.json`.

## 14. Cleanup

O cleanup final respeitou a imutabilidade recém-endurecida:

```text
STAGING_QA_CLEANUP=PASS
CLEANUP_MODE=DEACTIVATE_AND_RETAIN_APPEND_ONLY_HISTORY
```

- 2 empresas e 8 usuários QA foram desativados;
- 2 features foram desativadas;
- 7 refresh tokens e 6 sessões foram removidos;
- empresas ativas, usuários ativos, sessões e refresh tokens QA: zero;
- novo login sintético foi rejeitado;
- reload do browser voltou à tela de login;
- arquivo local de credencial e manifesto remoto de fixtures foram removidos;
- PostgreSQL temporário foi encerrado e sua porta ficou fechada;
- 4 vendas e 3 contratos sintéticos permaneceram retidos, inativos e
  imutáveis por desenho append-only.

O cleanup anterior ao hardening havia apagado dados QA descartáveis, inclusive
64 vendas, quando o contrato ainda permitia a operação. Isso é evidência
histórica, não o método final. O cleanup atual não bypassou triggers nem
apagou o ledger para satisfazer artificialmente uma contagem zero.
O resultado durável está em
`docs/evidence/CANONICAL_SALE_V1_CLEANUP_RESULTS_2026-08-30.json`.

## 15. Ledger canônico de findings

| ID | Sev. | Finding | Correção | Estado |
| --- | --- | --- | --- | --- |
| CV1-R1–R4 | HIGH | cross-client, replay invalidado, reativação e escrita terminal | guards, lifecycle, CAS e testes | RETESTED |
| CV1-R5–R14 | MEDIUM | proveniência, UX, paginação, reopen e legado | serviço, API, UI e testes | RETESTED |
| DRAWER-ASYNC-01 | MEDIUM | resposta antiga sobrescrevia estado novo | sequência/sessão/unmount/loading | RETESTED |
| PG-IDEMPOTENCY-01 | HIGH | harness esperava erro errado após mudar fingerprint | `3525651` | RETESTED |
| STG-S1-DELETE-01 | HIGH | GUC liberava delete e faltava guard de truncate | `f8f4961` | RETESTED local/staging |
| STG-S1-CONTRACT-01 | HIGH | delete de contrato ocultava receita ativa | `f8f4961` | RETESTED |
| STG-S1-RUNTIME-01 | MEDIUM | manifesto omitia normalização `.toml` | runtime v3-lf | RETESTED |
| STG-S1-EVIDENCE-01 | MEDIUM | soak sem atribuição/cleanup consolidado | relatório e manifests duráveis | RETESTED |
| STG-S2-IDEMP-01 | HIGH | recovery aceitava venda invalidada | `3b2e462` | RETESTED; reviewer SHIP |
| ADV-FIX-REOPEN | gate blocker | LOST sem histórico causal tinha fallback implícito; legado WON não podia ser reinterpretado | `2da896a`, fail-closed | RETESTED SQLite/PG/E2E |
| ADV-FIX-CSV | gate blocker | export não possuía prova executável/download capturado | utilitário/testes/download `2da896a` | RETESTED 4/4, 232/232, browser |
| ADV-FIX-ROLLBACK | gate blocker | rollback/forward-fix pós-migration não estava ensaiado | bridge + falha intencional + forward-fix | RETESTED em staging |
| ADV-FIX-CLEANUP | gate blocker | cleanup físico conflitaria com ledger append-only | desativar e reter histórico | RETESTED; login rejeitado |
| ADV-FIX-PROVIDER | gate blocker | alegação de ausência de toda credencial era ampla demais | claims estreitos ao escopo verificado | RECONCILED |

As severidades individuais dos cinco findings adversariais não foram
reclassificadas neste relatório; todos bloquearam o gate `FIX_FIRST` e foram
tratados como obrigatórios. Não há finding conhecido sem correção.

## 16. Auditorias independentes

O primeiro sweep retornou `FIX_FIRST` para delete/truncate, contrato,
manifesto e deriva documental. As correções entraram em `f8f4961`, passaram
nos testes causais e na revisão independente de security/runtime.

O segundo sweep do zero encontrou `STG-S2-IDEMP-01`; após `3b2e462`, focal,
SQLite, PostgreSQL completo, redeploy e fingerprint, o reviewer repetiu a
revisão e retornou `SHIP` sem finding remanescente.

O primeiro adversarial final, executado depois dos dois sweeps, retornou
`FIX_FIRST` para: semântica fail-closed do reopen LOST/legado WON, prova
executável do CSV, rehearsal de rollback/forward-fix, cleanup compatível com
append-only e amplitude das alegações de provider. `2da896a` e os manifests
duráveis corrigiram/retestaram todos esses pontos. O primeiro veredito não foi
reescrito retroativamente. Uma nova instância independente reavaliou o
candidato inteiro, validou os artefatos e corrigiu somente um timestamp
documental em `624d88a`; depois retornou `SHIP` sem finding bloqueante.

```text
STAGING_AUDIT_SWEEP_1=PASS_AFTER_RETESTS
STAGING_AUDIT_SWEEP_2=PASS_AFTER_RETESTS
FIRST_FINAL_ADVERSARIAL_VERDICT=FIX_FIRST
FIRST_FINAL_ADVERSARIAL_FINDINGS=RETESTED_RECONCILED
FINAL_ADVERSARIAL_VERDICT=SHIP
```

Evidência durável: `docs/evidence/CANONICAL_SALE_V1_FINAL_ADVERSARIAL_RESULTS_2026-08-30.json`.

## 17. Matriz de gates

| Gate | Estado | Evidência |
| --- | --- | --- |
| Contrato/state machines | PASS | ADR + suítes locais/PG |
| Migration aditiva | PASS | hashes, restore drill, verifier staging |
| Primary/winning proposal | PASS | E2E, 101 propostas, tenant/conflitos |
| Atomic/manual close | PASS | SQLite, PG e staging |
| Idempotência | PASS_WITH_POST_FINDING_CAUSAL_RETEST | 3/3 + SQLite + PG + redeploy |
| Concorrência/CAS/locks | PASS | PostgreSQL causal + staging |
| Reopen/histórico | PASS_AFTER_FAIL_CLOSED_HARDENING | LOST causal + legacy WON fail-closed + SQLite/PG/E2E |
| Money/receita | PASS | DB/API/UI/360/dashboard/export |
| Tenant/RBAC | PASS | requests reais + constraints |
| Snapshot imutável | PASS | ataques update/delete/truncate/item tardio |
| CSV autenticado | PASS | 531 bytes, 4 rows, SHA, console 0, 4/4 e 232/232 |
| Browser/continuous | PASS | 4 viewports, refresh, duas abas, 232/232 |
| Soak | PASS_WITH_CAUSAL_SUPPLEMENT | 30 iterações + reteste do delta |
| Cleanup | PASS | desativação, auth revogada e ledger retido imutável |
| Rollback/forward-fix | PASS | failure intencional, bridge saudável, forward-fix 2da |
| Runtime/parity/final QA | PASS | deployments, SHA, manifest, health, logs 0, 5xx 0 |
| Sweep 1 | PASS_AFTER_RETESTS | findings corrigidos/revistos |
| Sweep 2 | PASS_AFTER_RETESTS | finding corrigido; reviewer SHIP |
| Secret sweep final | PASS | varredura final sanitizada, sem segredo real |
| Adversarial final | SHIP | re-auditoria pós-fixes sem finding bloqueante |

## 18. Produção, providers e segredos

```text
PRODUCTION_APPLICATION_REQUESTS=0
PRODUCTION_CONTROL_PLANE_READ_ONLY_CHECKS=true
PRODUCTION_CHANGED=false
REAL_PRODUCT_PROVIDER_CONNECTIONS_USED_BY_THIS_MISSION=0
REAL_PRODUCT_PROVIDER_CREDENTIALS_USED_BY_THIS_MISSION=0
REAL_OUTBOUND=0
HOSTING_CONTROL_PLANE=STAGING_ONLY
```

Não houve request de aplicação, migration, deploy, escrita, provider ou
outbound em produção. Houve somente inspeção read-only do plano de controle
para confirmar que os deployments oficiais permaneceram inalterados. Este
relatório usa “provider” para os conectores de produto (Meta, WhatsApp, Bling,
e-mail e IA); os planos de controle Railway/Vercel foram usados somente no
staging declarado. O verifier de runtime prova flags de outbound e linhas
ativas de `MetaCredential`/integração Bling; ele não prova ausência de toda e
qualquer credencial armazenada em todos os subsistemas. A alegação correta é
que esta missão não conectou nem utilizou credencial real de provider de
produto. O relatório não contém URL com credencial, token, cookie, senha,
private key ou dado real. `FINAL_SECRET_SWEEP=PASS` no estado final.

O índice sanitizado central desta missão é
`docs/evidence/CANONICAL_SALE_V1_STAGING_EVIDENCE_2026-08-30.json`; ele aponta
para E2E, browser, CSV, soak, rollback/forward-fix e cleanup duráveis.

## 19. Encerramento

O secret sweep do relatório/índice passou, a revisão adversarial independente
pós-fixes retornou `SHIP`, e o Sol reconciliou runtime, Git, migrations,
PostgreSQL causal, E2E, browser, CSV, cleanup, rollback e produção distinta.

```text
OPEN_CRITICAL=0
OPEN_HIGH=0
OPEN_MEDIUM=0
PENDING_INTERNAL=0
UNTESTED_INTERNAL=0
UNTESTED_PRODUCT_SCOPE=0
FALSE_PASS=0
FINAL_SECRET_SWEEP=PASS
FINAL_ADVERSARIAL_VERDICT=SHIP
FINAL_SOL_RECONCILIATION=PASS
CANONICAL_SALE_V1=COMPLETE
READY_FOR_PRODUCTION=YES
PRODUCTION_CHANGED=false
```

`READY_FOR_PRODUCTION=YES` não autoriza nem executa promoção. Produção exige
uma missão futura própria com autorização, preflight, backup, janela de
migration e verificação pós-promoção.
