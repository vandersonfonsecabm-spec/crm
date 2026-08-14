# META V58 — Mark A (baseline)

Data: 2026-08-13

## Estado de controle

- Branch: `feature/postgres-migration-prep`
- HEAD local: `01a4c640a9a6b3c6d6d55a9edfdd5dc4720428e0`
- `origin/feature/postgres-migration-prep`: `01a4c640a9a6b3c6d6d55a9edfdd5dc4720428e0`
- `origin/master`: `a0c485885a5f12924d5b3d39b91bbe6db0e4ffd5`
- Worktree/index/untracked: limpos antes da edição V58.
- Backend, banco, schema, migrations e integrações: fora do escopo V58.
- SHA SHA-256 de `backend/prisma/dev.db`: `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.

## Medição autenticada — produção V56/V57

Medição DOM em zoom 100%, sem alteração de dados reais, usando a sessão autenticada existente.

### 1440 × 900, Inbox sem conversa selecionada

- Sidebar expandida: 224 px.
- Conteúdo principal: x=224, largura=1216 px.
- Inbox: x=258, largura=1148 px, y=140, altura=720 px.
- Gap efetivo sidebar→Inbox: 34 px.
- Margem direita efetiva: 34 px.
- Espaço inferior efetivo: 40 px.
- Documento: `scrollWidth=1440`, `clientWidth=1440` (sem overflow horizontal).

### 1440 × 900, conversa/contexto selecionados

- Workspace: 1148 × 720 px.
- Lista: 275,125 px.
- Chat: 596,125 px.
- Contexto: 275,125 px.
- Composer dentro do workspace, com base em y≈859 px.

### 1366 × 768, conversa/contexto selecionados

- Sidebar expandida: 224 px.
- Conteúdo principal: x=224, largura≈1142,4 px.
- Workspace: x=258, largura≈1074,4 px, y=140, altura≈588 px.
- Lista: ≈257,462 px.
- Chat: ≈555,338 px.
- Contexto: ≈260 px.
- Gap efetivo sidebar→Inbox: 34 px.
- Margem direita efetiva: ≈33,6 px.
- Espaço inferior efetivo: 40 px.
- Documento: `scrollWidth=1366`, `clientWidth=1366` (sem overflow horizontal).

## Hipótese V58

Reduzir os tokens do shell para 208/64 e aplicar um frame específico da Inbox com respiro de 8–12 px, mantendo a Inbox em flex/grid de altura integral. A hierarquia de três colunas será mantida, com Chat como coluna dominante e sem alterar a lógica de filas, seleção, mensagens, contexto ou composer.
