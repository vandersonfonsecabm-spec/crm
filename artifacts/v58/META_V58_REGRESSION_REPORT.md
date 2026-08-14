# V58 — Relatório de regressão

## Código e testes

- Suíte canônica frontend: **159/159 PASS** (`npm test`).
- Build TypeScript/Vite: **PASS** (`npm run build`, 1818 módulos).
- Testes focais V58/shell/Inbox: **PASS**.
- `git diff --check`: **PASS**.
- `backend/prisma/dev.db`: SHA-256 preservado em `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.

## Regressões verificadas

- Visão Geral, Clientes e Integrações mantiveram shell sem clipping e sem overflow horizontal.
- Nenhuma alteração em `backend/`, Prisma, migrations, schema, integrações ou regras comerciais.
- Inbox preservou filtros, seleção, polling, lease, mensagens, badges, responsável, contexto, composer, loading/empty/error e outbound fail-closed.
- Mobile manteve rail desktop oculto e navegação mobile existente.

## Advisory

O salto de breakpoint 1023/1024 px é dívida de composição tablet herdada e foi registrado, sem mudança fora do escopo desktop focal V58.
