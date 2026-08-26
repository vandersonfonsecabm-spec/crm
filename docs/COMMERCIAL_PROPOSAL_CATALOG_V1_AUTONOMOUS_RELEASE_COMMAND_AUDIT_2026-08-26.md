# Auditoria do comando de liberação autônoma — Proposta ↔ Catálogo V1

Data: 2026-08-26
Escopo: auditoria, correção e execução idempotente do comando de promoção
autônoma enviado após a V1 já ter sido publicada.

## Decisão operacional

```text
COMMAND_AUDIT=PASS_WITH_CORRECTIONS
EXECUTION_MODE=POST_RELEASE_RECONCILIATION_IDEMPOTENT_NO_OP
PRODUCTION_RELEASE_ALREADY_COMPLETE=true
RUNTIME_PUBLISHED=eb1cadb8a692dea99a1c0edc888504d22be15a33
V1_MIGRATION_ALREADY_APPLIED=true
NEW_PRODUCTION_WRITE=0
NEW_MIGRATION=0
NEW_DEPLOY=0
NEW_PUSH=0
NEW_TAG=0
```

O comando não podia ser executado literalmente: ele não começava verificando
se a migration, o runtime, o deploy e a tag já existiam. Reexecutá-lo poderia
duplicar migration, redeploy, restart, backup, push e tag em produção. A
execução segura foi transformar a missão em reconciliação read-only.

## Falhas encontradas e correções

1. **Idempotência ausente — crítico.** Adicionado o gate inicial:
   `v1Applied=true` + tag aponta para o runtime + API/worker/Vercel saudáveis
   significa pular push, migration, freeze, redeploy, restart e nova tag.
2. **Baseline antigo — alto.** `afe830d` é a referência do rehearsal; o
   runtime real publicado é `eb1cadb`. O HEAD atual `28c3c34` contém somente
   documentação/ferramentas posteriores. A comparação correta é por paths de
   runtime, não por igualdade do Git inteiro.
3. **Snapshot Railway ambíguo — alto.** Snapshot nativo é
   `NOT_AVAILABLE_WITH_REASON` quando não houver API/garantia do provedor;
   backup lógico com restore drill é o gate obrigatório já comprovado.
4. **Login durante maintenance — alto.** Login é mutação e pode retornar 503;
   autenticar antes do freeze ou usar sessão existente. Durante maintenance,
   smoke deve ser apenas GET/read-only.
5. **Rollback antigo — médio.** Não presumir down migration nem compatibilidade
   do runtime antigo. Usar recovery/forward-fix após novas escritas; não
   repetir migration oficial para obter uma evidência já resolvida.
6. **Autodeploy — médio.** Consultar deploy atual antes de push; se o runtime
   já estiver correto, não fazer push. Em release futura, congelar autodeploy e
   usar um único migration owner.
7. **Limpeza — médio.** Destruir somente recursos temporários registrados como
   criados nesta execução. Os Postgres adicionais existentes não são alvos
   válidos de limpeza automática.
8. **Tag/relatório — médio.** Se a tag existente aponta para `eb1cadb`, marcar
   PASS; se apontar para outro SHA, parar. Atualizar relatório somente com
   evidência nova.
9. **Observação — advisory.** Definir duração e thresholds antes de chamar uma
   janela prolongada de PASS. A evidência atual continua honesta como
   `PASS_SHORT_WINDOW`.
10. **Entrega — operacional.** Se o upload não estiver disponível, não afirmar
    que anexou; preservar o arquivo e registrar métodos tentados.

## Execução efetivamente realizada

- Git: worktree limpa; branch `release/ga2-post-e6a` e remoto alinhados em
  `28c3c34`.
- Runtime: nenhum diff em `backend/src`, `backend/prisma-postgres` ou
  `frontend` desde a tag de produção `eb1cadb`.
- Tag: `commercial-proposal-catalog-v1-production-pass-2026-08-26` já existe e
  aponta para `eb1cadb`; não foi recriada.
- Railway: projeto `glistening-playfulness`, environment production, API/worker
  online; Postgres oficial identificado como `Postgres-u_yI`.
- Saúde: `/health=200`, `/ready=200`, `database=ok`.
- Logs recentes: nenhum erro em API ou worker.
- Vercel canônico: HTTP 200; evidência anterior do deployment READY permanece
  causalmente válida porque os paths de runtime não mudaram.
- Nenhum push, deploy, migration, restart, freeze, alteração de variável,
  restore oficial ou escrita de dados foi repetido.

## Pendências preservadas sem ação destrutiva

- `Postgres` e `Postgres-MpW9` continuam online e sem finalidade mapeada;
  identificar dependências antes de qualquer remoção.
- A checagem redigida encontrou endpoint igual, mas `credentialMatch=false`
  entre API e serviço Postgres. Não sincronizar/rotacionar secret no escuro;
  tratar em janela dedicada com inventário e validação.
- Não há propostas reais para smoke legacy/PDF sem criar dados em produção;
  o resultado correto permanece `READ_ONLY_SCHEMA_PASS_NO_LEGACY_ROWS`.

## Resultado

```text
CORRECTED_COMMAND_EXECUTED=PASS
PRODUCTION_RUNTIME_UNCHANGED=PASS
PRODUCTION_HEALTH=PASS
PRODUCTION_RELEASE_DUPLICATION_AVOIDED=PASS
POST_RELEASE_SWEEP=PASS_WITH_ADVISORIES
```

Relatórios relacionados:

- `docs/COMMERCIAL_PROPOSAL_CATALOG_V1_PRODUCTION_RELEASE_REPORT_2026-08-26.md`
- `docs/COMMERCIAL_PROPOSAL_CATALOG_V1_POST_RELEASE_AUDIT_2026-08-26.md`
