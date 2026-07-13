# Deploy operacional

Nenhum deploy foi executado durante a oficializacao desta arquitetura.

## Vercel

- Publica somente `frontend/`.
- O manifesto da raiz instala o frontend, executa seu build e publica `frontend/dist`.
- O fallback de SPA permanece configurado.
- Vercel nao executa Express, Nest, Prisma, seed ou migration.

## Railway

- Plataforma do backend Express.
- Root Directory esperado: `backend`.
- Build rastreado: `npm ci --include=dev --no-audit --no-fund && npm run prisma:generate`.
- Start rastreado: `npm run start:production`.
- Entrypoint final: `backend/src/server.js`.
- Health check: `/health`.
- Build e start nao executam seed, `prisma db push` ou migrations.

O Root Directory configurado no painel da plataforma nao e verificavel pelo repositorio. Antes de uma futura publicacao, ele deve ser confirmado por processo de release; uma configuracao incorreta na raiz falhara pelo root runtime guard em vez de iniciar o Nest.

## SQLite em producao

O provider operacional atual e SQLite. `DATABASE_URL` deve ser definida explicitamente para um arquivo em armazenamento persistente. Um filesystem efemero perde dados entre recriacoes. O runtime bloqueia o banco de desenvolvimento rastreado `backend/prisma/dev.db` em producao e nao imprime a URL configurada.

O caminho do volume pertence a configuracao da plataforma e nao e definido neste repositorio. Nao ha seed, `db push` ou migration automatica no deploy.

## Variaveis por nome

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ALLOW_COMPANY_REGISTRATION`
- `INTEGRATION_ENCRYPTION_KEY`
- `BLING_CLIENT_ID`
- `BLING_CLIENT_SECRET`
- `BLING_REDIRECT_URI`
- `BLING_TIMEOUT_MS`
- `BLING_MAX_PAGES`
- `BLING_PAGE_SIZE`

## Render

O Render nao e uma plataforma ativa deste CRM. O manifesto da raiz foi removido porque executava `prisma db push` e seed automaticamente. Nenhuma configuracao Render permanece apta a autodeteccao.

## Checklist de release futuro

1. Executar `npm run verify:architecture`.
2. Aprovar testes Express, lint e build do frontend.
3. Confirmar Root Directory `backend` no Railway por processo autorizado.
4. Confirmar armazenamento persistente e variaveis apenas por nome.
5. Verificar `/health` antes de liberar trafego.
6. Nao executar seed, `db push` ou migration automaticamente.
7. Em rollback, selecionar o artefato anterior e preservar o arquivo SQLite persistente; qualquer restauracao de banco exige procedimento separado e autorizado.
