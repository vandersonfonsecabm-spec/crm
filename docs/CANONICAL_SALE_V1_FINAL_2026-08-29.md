# Auditoria do candidato — Contrato de Venda Canônica V1

Data: 2026-08-29

Branch: `feature/canonical-sale-v1`

HEAD inicial verificado: `e9ec77a56868bc97b076cec47e814d2d887e4cc7`

Commit do candidato: `782e2d9` (`feat-canonical-sale-v1`)

Baseline funcional: `79eed4f`

Executor real: Codex root (runtime disponível nesta sessão; não foi exposto um processo separado de Luna Max)

Sol/revisão final: executor principal, com veredito independente ainda pendente

## Estado do candidato

`IMPLEMENTATION_COMPLETE=PASS`

`LOCAL_GATES=PASS`

`POSTGRES_CAUSAL_GATE=PASS`

`GLOBAL_REGRESSION_LOCAL=PASS`

`STAGING=NOT_STARTED`

`FINAL_VERDICT=BLOCKED_INDEPENDENT_REVIEW`

`CANONICAL_SALE_LOCAL_EVIDENCE=VALID`

`EXECUTION_PROVENANCE=CODEX_ROOT`

`LUNA_MAX_EXECUTION_PROVENANCE=UNVERIFIED`

Disponibilidade verificada: não houve processo separado de Sol ou Luna Max
exposto pelas ferramentas desta sessão. O trabalho foi executado pelo Codex
root disponível; a solicitação de operação em “Luna Max” foi preservada como
intenção, mas não é atribuída a um modelo separado sem evidência.

O candidato implementa o Contrato de Venda Canônica V1 sem alterar
`backend/prisma/dev.db`, produção, providers reais ou outbound. A branch ainda
não foi publicada nem recebeu deploy.

## Implementação

- `NegocioContratoVenda` mantém `propostaPrincipalId`, `propostaVencedoraId`,
  `vendaAtivaId` e revisão CAS.
- Um Negócio aceita várias propostas, mas somente uma proposta principal e uma
  vencedora ativa.
- Aceite não fecha o Negócio automaticamente.
- `closeDealAsWon()` cria uma `VendaCanonica` para
  `ACCEPTED_PROPOSAL` ou `MANUAL_CLOSE` em uma transação atômica.
- A venda congela moeda BRL, valores em centavos, revisão, origem, usuário,
  proposta e itens do snapshot.
- Retry, clique duplo e concorrência convergem para uma venda única por
  idempotência, lock e CAS.
- Reabertura invalida a venda anterior com motivo e histórico, preservando a
  fotografia original.
- Propostas aceitas legadas exigem reconciliação explícita; inclusive o caso
  de ponteiro vencedor existente junto com outra proposta aceita.
- Customer 360, dashboard, exportação e relatórios distinguem pipeline,
  estimativa e receita; receita realizada vem somente de `VendaCanonica`.
- Snapshot de venda, itens e histórico não podem ser atualizados ou apagados
  por caminhos diretos; itens não podem ser anexados depois do histórico de
  fechamento.

## Schema e migration

As migrations são aditivas e mantêm o legado sem reinterpretar
`Cliente.valor` ou `Negocio.valor`:

- SQLite:
  `backend/prisma/migrations/20260828130000_add_canonical_sale_v1/migration.sql`
- PostgreSQL:
  `backend/prisma-postgres/migrations/20260828130000_add_canonical_sale_v1/migration.sql`

Hashes SHA-256 verificados:

- SQLite: `23123b6b9f87358a1750c089ae694a7e69fd9f628a85ec76613914d5338c90aa`
- PostgreSQL: `d99fa7fa38ae7f9fcbbad36fd82e5cf21581f04054ee615fe17dab82619b286e`
- Manifesto de fonte do gate PostgreSQL atual:
  `49a555d37f0af6e8037027e0ddb5b47f2ca80f42e010be1003cd27c0c6683830`

O verifier de tenant confirmou 169 relações padrão, manifesto
`d51c4a8801388ae354ba97156c5df80bbe00d29da4611eac5aafe20975125ded`, 257
foreign keys e 32 paises únicos, sem órfãos ou vínculos cruzados.

## Matriz de gates

| Gate | Estado | Evidência principal |
| --- | --- | --- |
| Contrato V1 e state machine | PASS | ADR + testes de transição |
| Migration aditiva e legado preservado | PASS | migrations SQLite/PostgreSQL + verifier |
| Primary/winning proposal | PASS | serviço, CAS, reconciliação e testes |
| CanonicalSale/snapshot | PASS | schema, triggers e testes de ataque |
| Fechamento atômico/idempotência | PASS | SQLite + PostgreSQL concorrente |
| Customer 360/dashboard/export | PASS | testes de proveniência e API |
| UI comercial/QA visual | PASS | 4 resoluções, estados e console limpo |
| Tenant/security | PASS | 169 relações, cross-tenant negativo |
| Regressão local | PASS | backend exit 0; frontend 228/228 |
| PostgreSQL causal atual | PASS | manifesto `49a555d3…`, log `2b0467…` |
| Segundo review independente | BLOCKED_EXTERNAL | limite de uso/disponibilidade do reviewer |
| Staging E2E/soak | PENDING_EXTERNAL | não iniciado enquanto o review estiver bloqueado |

## Testes e evidências

- Prisma `validate` no harness isolado: PASS.
- Migration canônica SQLite: PASS.
- Serviço canônico SQLite, incluindo reconciliação legada, concorrência,
  idempotência, reopen e ataques de snapshot: PASS.
- Frontend focal canônico: 2/2 PASS.
- Regressão frontend completa: 228/228 PASS.
- Build TypeScript/Vite: PASS.
- ESLint: PASS.
- Regressão backend global no sandbox Prisma: exit 0, sem falhas; skips
  PostgreSQL são explícitos e cobertos pelo runner descartável.
- QA visual focal: board, loading, empty, error, manual, proposta,
  vencedora, substituída, legado, perdido e reopen; resoluções 1366×768,
  1440×900, 1920×1080 e 900×768; `scrollWidth == clientWidth` e zero erros
  de console.
- PostgreSQL descartável Railway, fonte atual: teste causal de fechamento,
  aceite, update concorrente e duplicidade: PASS. Evidência:
  `C:\Users\vande\AppData\Local\Temp\crm-postgres-real\20260829223852402-2640-fb6e066dbcbd.json`,
  logs SHA-256 `2b046773e97db8e602e426bd8473a7cd6f8fd2196ecdcb308c9e1e39e39fec03`.
- O projeto temporário e seu proxy foram removidos após o teste. Permanecem
  apenas serviços oficiais existentes; nenhum foi alterado.
- `backend/prisma/dev.db` continua com SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- Varredura de padrões de segredos nos artefatos do candidato: nenhum
  `sk_live_`, `AKIA`, `ghp_` ou private key encontrado.

## RCD, harness e referências

- RCD aplicado: hierarquia por ação, distinção entre dado bruto/insight,
  proveniência financeira explícita, estados honestos, densidade operacional,
  foco único e sinais redundantes de status.
- Harness aplicado: ledger de findings, manifesto de fonte, bancos temporários
  isolados, retry focal, validação causal, cleanup verificado e proibição de
  falso PASS.
- Princípios analisados e rejeitados: usar `Cliente.valor` como receita,
  aceitar automaticamente a última proposta aceita, usar SQLite como prova de
  concorrência PostgreSQL, repetir a suíte remota inteira em loop e iniciar
  provider/outbound real.
- Referências externas abertas nesta execução: nenhuma; as referências de CRM
  foram fornecidas no relatório do usuário e não foram copiadas para código ou
  identidade visual.
- Falhas Vercel reportadas: nenhuma (`VERCEL_FAILURE_CLASSIFIED=NOT_APPLICABLE`).
- Falhas de browser: nenhuma; não houve `BROWSER_CONTROL_FAILURE` ou
  `APP_RUNTIME_FAILURE`. O QA visual local foi `PASS`.

## Ledger de findings

| ID | Severidade | Finding | Causa | Status | Validação |
| --- | --- | --- | --- | --- | --- |
| CV1-01 | HIGH | Aceite não gerava venda canônica única | contrato incompleto | RETESTED | serviço SQLite + PostgreSQL |
| CV1-02 | HIGH | Snapshot aceitava update/delete e item tardio | proteção somente parcial | RETESTED | triggers SQLite/PostgreSQL |
| CV1-03 | HIGH | Aceitas legadas podiam coexistir com vencedor apontado | reconciliação não cobria ponteiro existente | RETESTED | fixture ambígua + fechamento |
| CV1-04 | MEDIUM | Suíte PostgreSQL ampla excedeu o limite do runner remoto | latência da bateria, sem falha funcional canônica | BLOCKED_EXTERNAL | gate canônico focado PASS; suites locais PASS |
| CV1-05 | HIGH | Segunda passagem independente não pôde ser executada | limite de disponibilidade/uso dos reviewers | BLOCKED_EXTERNAL | não marcado como PASS |

Primeiro review: os blockers CV1-01, CV1-02 e CV1-03 foram encontrados por
revisão independente e corrigidos com reteste causal. Segundo review: as
tentativas autorizadas não iniciaram por limite de uso/disponibilidade; por
isso o resultado permanece `BLOCKED_EXTERNAL`, não `SHIP`.

## Produção, staging e integrações

- `PRODUCTION_CHANGED=false`.
- Nenhuma migration foi aplicada em produção.
- Nenhum push, merge ou deploy foi iniciado neste checkpoint.
- `REAL_PROVIDER_CONNECTIONS=0`.
- `REAL_PROVIDER_CREDENTIALS_USED=0`.
- `REAL_OUTBOUND=0`.
- Staging ainda não foi alterado. E2E autenticado, runtime fingerprint e soak
  comercial continuam pendentes até a revisão independente exigida.
- `PENDING_INTERNAL=0` para o candidato local; `UNTESTED_INTERNAL=0` nos gates
  locais declarados; `FALSE_PASS=0` após a reconciliação de evidências.
- Checkpoint do Sol: baseline congelado → contrato/state machine → migration →
  implementação → correções dos findings → retestes SQLite/PostgreSQL →
  regressão local → bloqueio no segundo review.

## Próximos gates mínimos

1. Executar duas passagens independentes limpas ou obter o reviewer autorizado
   para a segunda passagem; o candidato não deve ser chamado `SHIP` antes
   disso.
2. Revisar e criar commit local com stage explícito, preservando o `dev.db`.
3. Com autorização operacional mantida, publicar a branch e validar o destino
   exato de staging antes de qualquer migration/deploy.
4. Aplicar migration no staging, validar API/frontend/runtime parity, executar
   E2E autenticado, concorrência, reopen e soak comercial.
5. Fazer a reconciliação final e então emitir `FINAL_ADVERSARIAL_VERDICT=SHIP`
   ou `FIX_FIRST`.

## Otimizações de execução

- Reutilizadas evidências de migration e suites PostgreSQL não afetadas quando
  schema e arquivos causais permaneceram inalterados.
- Repetidos somente os gates afetados pela correção de propostas legadas e
  pela proteção de snapshots.
- O teste de migration executado fora do harness foi descartado e repetido no
  runner correto, evitando falso diagnóstico de produto.
- A suíte PostgreSQL remota ampla não foi reiniciada em loop; o runner foi
  focado no teste causal atual após a falha por limite de execução.
- O recurso PostgreSQL temporário e o proxy foram removidos após o uso, sem
  tocar nos serviços oficiais.
