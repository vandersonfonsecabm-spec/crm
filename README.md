# CRM SaaS

CRM SaaS para atendimento e gestão comercial de leads, com frontend React/Vite e backend oficial em NestJS + Prisma + PostgreSQL.

## Estrutura

- `frontend/`: aplicação web React publicada na Vercel.
- `src/`: backend oficial NestJS.
- `prisma/`: schema, migrations e seed do backend oficial.
- `backend/`: backend Express + SQLite mantido apenas como demo/local legado.

## Backend Oficial

Configure a raiz do projeto com PostgreSQL:

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start
```

Variáveis principais:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
PORT=3001
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=troque-este-segredo
```

Usuário demo criado pelo seed:

```bash
demo@crm.com
123456
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Para apontar o frontend para a API:

```bash
VITE_API_URL=http://localhost:3001
```

## Fluxo Recomendado

1. Rodar PostgreSQL.
2. Aplicar migrations do diretório `prisma/`.
3. Rodar seed da raiz.
4. Subir o backend Nest da raiz em `3001`.
5. Subir o frontend em `5173`.

O backend Express em `backend/` não deve ser usado como base de produção.
