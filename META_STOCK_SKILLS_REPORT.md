# E1 — skills e protocolos

CURRENT_STATE_AS_OF=2026-08-23T17:51:15Z
BASELINE_SHA=a5a280c3ebc54741ced02a77d4da5ec51834d583
ARCHITECTURE_VERSION=E1-v1.0
DOCUMENT_STATUS=FINAL

## Recursos lidos

| Recurso | Estado | Uso nesta missão |
|---|---|---|
| `safe-command-architect` | LOADED | correção de sintaxe/ordem, separação read-only/mutation e critérios de parada |
| `saas-goal-guard` | LOADED | preservação da baseline, escopo e evidência |
| `interface-design` | LOADED | contrato de UI/UX futuro, sem implementação visual |
| `vercel:verification` | LOADED | desenho de verificação de fluxo, sem E2E de feature não implementada |
| `vercel:deployments-cicd` | LOADED | desenho conceitual de rollout/rollback, sem deploy |
| architecture/design dedicado | NOT_EXPOSED | coberto pelos contratos locais e ADRs desta missão |
| PostgreSQL/data-modeling dedicado | NOT_EXPOSED | modelagem baseada no schema real e nos contratos do projeto |
| accessibility dedicado | NOT_EXPOSED | requisitos futuros registrados no contrato UI/testes |
| security dedicado | NOT_EXPOSED | threat model registrado no contrato de segurança |

## Regras aplicadas

- Nenhum código de runtime, migration, banco, flag, credencial ou deploy foi alterado.
- A branch `architecture/stock-source-agnostic-v1` foi criada em worktree separado diretamente da tag congelada.
- A referência histórica `archive/estoque-local-618a289` (`618a2895b53cb71e96b465a7a8da112cc82dc993`) foi apenas lida.
- O documento separa fatos observados, decisões arquiteturais, inferências e decisões de produto pendentes.
