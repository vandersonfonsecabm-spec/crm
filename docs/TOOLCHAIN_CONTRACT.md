# Toolchain contract

`CURRENT_STATE_AS_OF=2026-08-23`

## Runtime oficial

- Frontend: instalar e testar somente em `frontend/`; Vite/React/TypeScript
  geram o artefato servido pelo projeto Vercel CRM.
- Backend: instalar e testar somente em `backend/`; Express + Prisma 6.19.3
  geram API e worker Railway. O schema canônico é
  `backend/prisma/schema.prisma`; o workspace PostgreSQL é derivado por
  `backend/scripts/postgres-prisma.cjs`.
- Banco de teste: os runners oficiais criam cópias em `%TEMP%\crm-prisma-tests`.
  `backend/prisma/dev.db` continua protegido e não é runtime de produção.

## Raiz legada

O `package.json`/`package-lock.json` da raiz é tooling histórico (Nest/Prisma
7.x) e não participa dos scripts oficiais Vercel/Railway. Ele não deve ser
instalado para validar o runtime CRM, nem misturado aos manifests de
`frontend/` ou `backend/`. Nenhum deploy oficial usa os scripts da raiz.

As dependências do Prisma oficial permanecem alinhadas em 6.19.3 no backend;
uma atualização major da raiz não é uma correção válida para o produto.

## Gates

`TOOLCHAIN_CONTRACT=PASS`

`LEGACY_ROOT_AMBIGUITY=RESOLVED`

Evidência: manifests e scripts foram inventariados, `npm install --package-lock-only`
foi executado separadamente em frontend/backend, e os testes/builds oficiais
devem sempre ser rodados com `npm --prefix frontend ...` e
`npm --prefix backend ...`. O lockfile legado não é alterado por esta auditoria.
