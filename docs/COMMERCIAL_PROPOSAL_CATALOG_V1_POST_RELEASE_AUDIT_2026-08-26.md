# Auditoria pós-release — Proposta ↔ Catálogo V1

Data: 2026-08-26
Escopo: varredura read-only após a publicação; nenhum código, schema, dado ou
configuração de produção foi alterado nesta auditoria.

## Resultado

```text
POST_RELEASE_SWEEP=PASS_WITH_ADVISORIES
BLOCKING_RUNTIME_FINDINGS=0
GIT_STATE=PASS
TAG_RUNTIME_MATCH=PASS
API_DEPLOYMENT=PASS
WORKER_DEPLOYMENT=PASS
HEALTH_READY=PASS
VERCEL_CANONICAL=PASS
RECENT_API_ERRORS=0
RECENT_WORKER_ERRORS=0
DOCUMENTATION_CONTEXT=CORRECTED
PRODUCTION_CLEANUP=NOT_EXECUTED_TARGET_AMBIGUOUS
CREDENTIAL_ROTATION=NOT_EXECUTED_DEDICATED_WINDOW_REQUIRED
POST_RELEASE_BACKUP=PASS
POST_RELEASE_BACKUP_RESTORE_DRILL=PASS
```

## Evidências verificadas

- Worktree limpa; branch `release/ga2-post-e6a` alinhada ao remoto em
  `e5d26a2e9fcef672a39c80b143973881ef491c53`.
- A tag `commercial-proposal-catalog-v1-production-pass-2026-08-26` aponta
  exatamente para o runtime publicado `eb1cadb8a692dea99a1c0edc888504d22be15a33`.
- Railway: API `5bdfb9e8-2e36-4a8c-a177-9595efc36ac5` e worker
  `db381e6e-3b3a-4c67-a3b9-06a3d52c74d5` em `SUCCESS`/online.
- `/health` respondeu `200`; `/ready` respondeu `200` com `database=ok`.
- Vercel canônico respondeu `HTTP 200`.
- Logs recentes da API e do worker não retornaram eventos de erro.
- O backup/restore e seus bytes/hash continuam coerentes com o relatório de
  produção; o dump com dados reais permanece fora do Git e dos anexos.
- Um backup pós-migration adicional foi criado fora do repositório e restaurado
  em PostgreSQL 18.6 descartável: 7.574.293 bytes, SHA-256
  `1d1f46505cc397acb60f0a95de05b99e55b28082f2a6fab355b0a79464fb20d9`, 1.201
  entradas, 17 migrations e zero falhas.
- Nenhum segredo foi encontrado no Git, nos documentos ou nos scripts auditados.

## Achado de código não reproduzido

Um reviewer levantou a hipótese de um fallback `stockMaterialVersion || 0`.
Uma busca focal no estado atual não encontrou esse fallback em código, testes,
schema ou migration; apenas o campo canônico nullable aparece. Portanto não há
correção de runtime justificada neste lote e o alerta foi classificado como
falso positivo no estado atual.

## Correções aplicadas nesta varredura

1. Os dois preflights pré-release foram marcados como snapshots históricos
   supersedidos, preservando seus valores originais `NOT_RUN`.
2. O contrato V1 recebeu um addendum operacional: as decisões de produto
   continuam congeladas, e o status atual é o do relatório de produção.
3. O relatório e o `CODEX_STATE` já reconciliados continuam sendo a fonte
   vigente; não houve alteração de runtime.

## Achados sem ação destrutiva

### Serviços PostgreSQL adicionais

O ambiente Railway production mostra três serviços Postgres online além de
API/worker: `Postgres-u_yI` (oficial identificado no release), `Postgres` e
`Postgres-MpW9`. Os dois últimos não estão ligados à API pelo estado observado,
mas a propriedade/uso não foi comprovada apenas pelo inventário. Nenhum foi
apagado ou parado: remover um banco sem mapear dependências seria destrutivo.

Próxima ação segura, em lote separado: mapear dependências e finalidade de cada
serviço; só então decidir se há limpeza autorizada.

### Saída de variáveis em sessão operacional

Uma checagem redigida confirmou endpoints iguais entre API e Postgres oficial,
mas `credentialMatch=false`; isso é drift de configuração compatível com uma
variável do serviço Postgres stale. Nenhum valor foi exposto no relatório, Git
ou arquivo, e a consulta não será repetida. Sincronizar/rotacionar credenciais
agora sem identificar a chave autoritativa poderia derrubar API, worker ou
integrações; por isso fica como operação dedicada, com janela, inventário,
rotação segura e validação próprios. Não é um defeito comprovado do runtime
publicado, mas é uma pendência de procedimento que não deve ser esquecida.

## Evidência reutilizada

Como os commits de runtime não mudaram desde a publicação, não foram repetidos
testes completos de frontend/backend, migration, backup ou deploy. Foram feitas
somente as verificações causais atuais (Git/tag, Railway, health/ready, Vercel e
logs de erro), conforme o protocolo de não repetição.

## Conclusão

Não há falha bloqueante no runtime publicado nem pendência obrigatória para
manter a V1 online. Permanecem dois advisories operacionais: mapear os bancos
Railway adicionais antes de qualquer limpeza e planejar uma eventual rotação
de credenciais somente se a exposição de variáveis for confirmada.

Relatório de release relacionado:
`docs/COMMERCIAL_PROPOSAL_CATALOG_V1_PRODUCTION_RELEASE_REPORT_2026-08-26.md`.
