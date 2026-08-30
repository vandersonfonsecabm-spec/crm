# Auditoria do candidato — Contrato de Venda Canônica V1

Data: 2026-08-29

Branch: `feature/canonical-sale-v1`

HEAD verificado: `020394acc65f0f653ea8d4cb7b14d0844d13b50e`

Commit do candidato: `020394a` (`close-terminal-commercial-ui-gaps`)

Baseline funcional: `79eed4f`

Executor real: Codex root (runtime disponível nesta sessão; não foi exposto um processo separado de Luna Max)

Sol/revisão final: reconciliação supervisionada; passagens independentes limpas concluídas

## Estado do candidato

`IMPLEMENTATION_COMPLETE=PASS`

`LOCAL_GATES=PASS`

`POSTGRES_CAUSAL_GATE=UNTESTED`

`GLOBAL_REGRESSION_LOCAL=PASS`

`STAGING=NOT_STARTED`

`FINAL_VERDICT=BLOCKED_EXTERNAL_POSTGRES`

`CANONICAL_SALE_LOCAL_EVIDENCE=VALID`

`EXECUTION_PROVENANCE=CODEX_ROOT`

`LUNA_MAX_EXECUTION_PROVENANCE=UNVERIFIED`

`MODEL_SELECTION_PRECONDITION=SATISFIED`

`MODEL_SELECTION_SOURCE=USER_CONFIRMED_UI`

`RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED`

`MODEL_IDENTITY_GATE=NOT_APPLICABLE`

`EXECUTION_AUTHORIZED=true`

`EXECUTION_MODE=USER_SELECTED`

`MODEL_PROVENANCE=USER_CONFIRMED_NOT_RUNTIME_ATTESTED`

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

- SQLite: `00d7064d74e167503280b625f6a5a076efedf1824c4c9bf8f284b8b0430b8d37`
- PostgreSQL: `b9d6e0f3f56181f1a1fde44a7c454a2f525a8733eb9c065c1e900fdfa65971e1`
- Manifesto de fonte do gate local:
  `d51c4a8801388ae354ba97156c5df80bbe00d29da4611eac5aafe20975125ded`

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
| Fechamento atômico/idempotência | PASS local | SQLite; PostgreSQL causal não executado neste checkpoint |
| Customer 360/dashboard/export | PASS | testes de proveniência e API |
| UI comercial/QA visual | PASS contratual | build + 228 testes; ajuste de CTA coberto localmente |
| Tenant/security | PASS | 169 relações, cross-tenant negativo |
| Regressão local | PASS | backend exit 0; frontend 228/228 |
| PostgreSQL causal atual | UNTESTED/BLOCKED_EXTERNAL | Docker indisponível e nenhuma URL descartável autorizada |
| Passagem independente 1 | PASS após correções | findings CV1-R1–CV1-R12 retestados |
| Passagem independente 2 | PASS | reviewer limpo sobre SHA `020394a` |
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
- O gate PostgreSQL causal foi tentado no runner seguro e não iniciou porque
  Docker está indisponível; não há `POSTGRES_TEST_DATABASE_URL` nem outro
  PostgreSQL descartável autorizado. SQLite não é usado como substituto.
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
| CV1-R1 | HIGH | proposta cross-client/reparenting | enforcement cliente–negócio–proposta incompleto | RETESTED | triggers permanentes e testes diretos |
| CV1-R2 | HIGH | replay após invalidação | chave antiga podia convergir para nova venda | RETESTED | `IDEMPOTENCY_KEY_REPLAY_INVALIDATED` |
| CV1-R3 | HIGH | invalidada→ativa | lifecycle permitia reativação indireta | RETESTED | guards de lifecycle + ataque direto |
| CV1-R4 | HIGH | escrita de proposta após fechamento | etapa terminal não era revalidada | RETESTED | create/update/status + corrida |
| CV1-R5 | MEDIUM | dashboard desconhecido→zero | flag monetária global única | RETESTED | flags independentes + null/zero |
| CV1-R6 | MEDIUM | proposta mascarada como pedido recente | fonte de receita não canônica | RETESTED | pedidos recentes descontinuados |
| CV1-R7 | MEDIUM | CTA comercial stale | UI não refletia contrato após mutação | RETESTED | refresh de estado |
| CV1-R8 | MEDIUM | histórico do drawer stale | fechamento/reabertura sem refresh | RETESTED | `refreshCanonicalState()` |
| CV1-R9 | MEDIUM | disponibilidade escondia receita conhecida | pipeline desconhecido contaminava métricas | RETESTED | `wonValueAvailable` independente |
| CV1-R10 | MEDIUM | status sem `onChanged` | callback de atualização ausente | RETESTED | `863c65c` + suíte frontend |
| CV1-R11 | MEDIUM | vencedor oculto após 100 propostas | paginação só da primeira página | RETESTED | fetch de todas as páginas |
| CV1-R12 | MEDIUM | motivo de invalidação vazio | CHECK não exigia texto efetivo | RETESTED | CHECK trimmed + migration test |
| CV1-R13 | MEDIUM | “Nova proposta” no terminal | CTA não recebia etapa/permissão | RETESTED | `020394a` + build/suíte |
| CV1-R14 | MEDIUM | “Reabrir” em FECHADO legado sem venda | permissão ignorava venda ativa | RETESTED | `020394a` + teste API |
| CV4-01 | HIGH | ausência de guards permanentes (repetido) | contradito pelo schema atual | REJECTED | triggers permanentes + testes estruturais |

Os findings CV1-R1–CV1-R12 foram corrigidos com reteste causal antes do SHA
atual. CV1-R13 e CV1-R14 foram corrigidos em `020394a`. CV4-01 foi
reconciliado como falso positivo, pois a migration atual contém os triggers
permanentes e os testes os exercitam diretamente. A segunda passagem limpa
independente retornou `FINDINGS=NONE`; PostgreSQL causal continua externo e
não deve ser chamado de PASS.

## Produção, staging e integrações

- `PRODUCTION_CHANGED=false`.
- Nenhuma migration foi aplicada em produção.
- Nenhum push, merge ou deploy foi iniciado neste checkpoint.
- `REAL_PROVIDER_CONNECTIONS=0`.
- `REAL_PROVIDER_CREDENTIALS_USED=0`.
- `REAL_OUTBOUND=0`.
- Staging ainda não foi alterado. E2E autenticado, runtime fingerprint e soak
  comercial continuam pendentes para a fase separada de staging.
- `PENDING_INTERNAL=0` e `FALSE_PASS=0` após a reconciliação local; o único
  gate externo não testado neste checkpoint é o PostgreSQL causal.
- Checkpoint do Sol: baseline congelado → contrato/state machine → migration →
  implementação → correções dos findings → retestes SQLite/PostgreSQL →
  regressão local → bloqueio no segundo review.

## Próximos gates mínimos

1. Registrar o resultado das duas passagens independentes e o ledger final;
   o candidato não deve ser chamado `SHIP` de produção neste checkpoint.
2. Executar o gate PostgreSQL causal em ambiente descartável autorizado; Docker
   indisponível permanece `UNTESTED/BLOCKED_EXTERNAL`.
3. Com autorização operacional mantida, publicar a branch e validar o destino
   exato de staging antes de qualquer migration/deploy.
4. Aplicar migration no staging, validar API/frontend/runtime parity, executar
   E2E autenticado, concorrência, reopen e soak comercial.
5. Fazer a reconciliação final e então emitir `FINAL_ADVERSARIAL_VERDICT=SHIP`
   ou `FIX_FIRST`.

## Otimizações de execução

- Reutilizadas evidências de migration e suites não afetadas quando
  schema e arquivos causais permaneceram inalterados.
- Repetidos somente os gates afetados pela correção de propostas legadas e
  pela proteção de snapshots.
- O teste de migration executado fora do harness foi descartado e repetido no
  runner correto, evitando falso diagnóstico de produto.
- O gate PostgreSQL causal não foi substituído por SQLite após Docker falhar;
  permanece explicitamente `UNTESTED/BLOCKED_EXTERNAL`.

## Retomada controlada sob pré-condição de seleção do usuário

Esta retomada aplica o perfil vigente em que a seleção do modelo é uma
pré-condição externa já satisfeita pelo usuário. A falta de telemetria do host
não é blocker e não deve ser convertida em atestado técnico:

```text
MODEL_SELECTION_PRECONDITION=SATISFIED
MODEL_SELECTION_SOURCE=USER_CONFIRMED_UI
RUNTIME_MODEL_ATTESTATION=NOT_REQUIRED
MODEL_IDENTITY_GATE=NOT_APPLICABLE
EXECUTION_AUTHORIZED=true
EXECUTION_MODE=USER_SELECTED
MODEL_PROVENANCE=USER_CONFIRMED_NOT_RUNTIME_ATTESTED
EXECUTOR_ACTUAL=CODEX_ROOT
LUNA_MAX_EXECUTION_PROVENANCE=UNVERIFIED
```

Nenhuma implementação foi refeita. As evidências técnicas do candidato foram
preservadas separadamente da provenance do executor. As duas passagens
independentes foram executadas sobre o SHA congelado, sem deploy, providers ou
outbound; a segunda retornou `FINDINGS=NONE`.

```text
SECOND_REVIEW_PASS_1=PASS_AFTER_RETESTS
SECOND_REVIEW_PASS_2=PASS
STALLED_GATE=NONE
LAST_KNOWN_GOOD=CANDIDATE_020394a
ATTEMPTED_SAFE_ALTERNATIVES=bounded_wait + focused_local_retests + independent_reviewer_retry
RISK=no code/database mutation observed outside candidate worktree
NEXT_MINIMUM_SAFE_ACTION=gate PostgreSQL causal descartável e fase staging separada
```

O resultado não altera a evidência técnica existente:

```text
CANONICAL_SALE_LOCAL_EVIDENCE=VALID
EXECUTION_PROVENANCE=CODEX_ROOT
LUNA_MAX_EXECUTION_PROVENANCE=UNVERIFIED
```
