# Arquitetura oficial

## Fonte de verdade

- `frontend/` e o frontend oficial: React, Vite e TypeScript.
- `backend/` e o unico backend operacional do CRM: Express, Prisma e SQLite.
- `backend/src/server.js` e o entrypoint da API utilizada pelo frontend.
- `backend/prisma/schema.prisma` e o schema do runtime operacional.

O frontend autentica pela API Express, valida a sessao em `/auth/me` e envia o JWT normal nas rotas privadas. A API deriva a empresa do usuario persistido e aplica o isolamento por `empresaId`.

## Execucao local

Na raiz, use comandos explicitos:

```text
npm run backend:dev
npm run backend:start
npm run backend:test
npm run frontend:dev
npm run frontend:build
npm run frontend:lint
npm run verify:architecture
```

`npm start`, `npm run dev`, `npm run build`, `npm run start:dev` e `npm run start:prod` na raiz falham de forma intencional. Isso impede autodeteccao ou operacao humana de iniciar a arquitetura errada.

## Backend legado

`src/` e `prisma/` na raiz pertencem ao NestJS/PostgreSQL legado. Eles nao participam do runtime, build ou deploy operacional. Consulte `docs/LEGACY_NEST.md`.
