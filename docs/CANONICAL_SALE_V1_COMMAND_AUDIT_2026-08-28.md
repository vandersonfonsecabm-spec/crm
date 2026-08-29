# Auditoria do comando — Venda Canônica V1

Data: 2026-08-28

## Objetivo preservado

Criar uma fonte de verdade transacional, tenant-safe e auditável para vendas
realizadas, mantendo o Negócio como eixo comercial, permitindo venda com
proposta aceita ou fechamento manual, sem reinterpretar valores legados e sem
tocar produção ou providers reais.

## Estado real adotado

- Worktree de execução:
  `C:\Users\vande\AppData\Local\Temp\crm-store1-release-reconcile-20260827`.
- Baseline funcional de hardening: `79eed4f379cfd58839136cad2932e7d1af8330ca`.
- Baseline documental: `e9ec77a56868bc97b076cec47e814d2d887e4cc7`.
- Branch dedicada: `feature/canonical-sale-v1`.
- O checkout principal `feature/postgres-migration-prep` está muito sujo e não
  será editado, limpo, misturado ou publicado.
- `backend/prisma/dev.db` permanece imutável no SHA-256
  `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.

## Falhas graves encontradas e correções

1. O plano listava treze reviewers, enquanto o usuário limitou a execução ao
   root mais dois agentes. Correção: root é o único mutator; dois reviewers
   permanecem read-only e são reutilizados nos gates.
2. O plano alternava nomes genéricos (`OPEN/WON/LOST`, `SUPERSEDED`) com os
   estados reais do produto. Correção: o contrato mapeia os conceitos para
   `NOVO/CONTATO/PROPOSTA`, `FECHADO`, `PERDIDO` e `SUBSTITUIDA`.
3. O endpoint genérico de Kanban permitia fechar e reabrir sem venda,
   idempotência ou motivo. Correção: movimentos terminais passam a comandos de
   domínio dedicados; o PATCH genérico fica restrito a etapas abertas.
4. `primary`, `winner`, aceite, substituição e legado não eram determinísticos.
   Correção: aceite define a primeira vencedora; substituição/reconciliação são
   explícitas, transacionais, auditadas e não silenciosas.
5. O plano não definia a venda manual sem itens. Correção: zero itens é válido
   para `MANUAL_CLOSE`; o snapshot de cabeçalho é obrigatório e usa
   subtotal=total, desconto=0.
6. Reabertura não definia revisão, invalidação ou etapa de retorno. Correção:
   venda ativa é invalidada, nunca apagada; a etapa aberta anterior é
   restaurada; novo fechamento cria revisão monotônica.
7. Campos ponteiro no `Negocio` exigiriam rebuild da tabela SQLite. Correção:
   uma tabela aditiva de contrato por Negócio guarda principal, vencedora,
   venda ativa e revisão com FKs compostas tenant/deal-safe.
8. O plano poderia sugerir que staging fosse consequência automática do
   trabalho local. Correção: staging é uma fase externa condicional, permitida
   somente depois de todos os gates locais/PostgreSQL/adversariais e de
   confirmação inequívoca de branch, SHA, projeto, serviço, ambiente e banco.
9. Produção, banco oficial, providers, OAuth, credenciais e outbound ficam
   explicitamente fora do escopo.

## Sequência corrigida

1. Congelar contrato e state machines.
2. Criar migration estritamente aditiva e ensaiá-la em sandbox.
3. Implementar proposta principal/vencedora e venda canônica.
4. Implementar fechamento, idempotência, concorrência e reabertura.
5. Migrar leituras de receita para Venda Canônica ativa.
6. Integrar UI e exportação sem estados enganosos.
7. Executar testes progressivos e PostgreSQL causal.
8. Executar dois sweeps read-only e adversarial final.
9. Somente com todos os gates: staging, E2E sintético e soak comercial focal.
10. Reconciliar uma única matriz final e enviar artefatos sanitizados ao chat
    fixado `Saas adm`.

## Critérios de parada

HARD STOP somente diante de divergência Git/banco inexplicada, `dev.db`
alterado, migration destrutiva, segredo exposto, alvo externo não comprovado,
risco de perda de dados, ação irreversível não autorizada ou ambiguidade de
produto que altere materialmente o contrato congelado.

## Resultado da auditoria

```text
OBJECTIVE_PRESERVED=YES
ROOT_SINGLE_MUTATOR=YES
READ_ONLY_REVIEWERS=2
PRODUCTION_IN_SCOPE=NO
REAL_PROVIDER_IN_SCOPE=NO
STAGING_CONDITIONAL=YES
COMMAND_EXECUTABLE=YES
```
