# CRM Agro SaaS

CRM para atendimento e gestão comercial, com frontend React/Vite e backend Express + Prisma/SQLite.

## Estrutura

- `frontend/`: frontend oficial React/Vite publicado pela configuração Vercel.
- `backend/`: único backend operacional, com Express, Prisma e SQLite.
- `src/` e `prisma/`: Nest/PostgreSQL legado congelado, fora do runtime e do deploy.
- `docs/ARCHITECTURE.md`: fonte de verdade da arquitetura.
- `docs/DEPLOYMENT.md`: comandos e restrições de publicação.
- `docs/LEGACY_NEST.md`: limites do código legado preservado.

## Comandos explícitos

Na raiz, comandos genéricos de runtime falham de propósito para impedir que o Nest seja iniciado por engano.

```bash
npm run backend:dev
npm run backend:start
npm run backend:test
npm run frontend:dev
npm run frontend:build
npm run frontend:lint
npm run verify:architecture
```

## Backend Express

Configure `backend/.env` a partir de `backend/.env.example`, gere o cliente Prisma e inicie a API:

```bash
cd backend
npm run prisma:generate
npm start
```

O acesso exige uma empresa e um administrador persistidos. Para criar o primeiro administrador local, defina as variáveis `BOOTSTRAP_COMPANY_NAME`, `BOOTSTRAP_COMPANY_SLUG`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` somente no ambiente local e execute:

```bash
npm run admin:create
```

O script não contém credenciais fixas e recusa sobrescrever uma empresa existente.

## Frontend

```bash
cd frontend
npm run dev
```

Para apontar o frontend para a API:

```bash
VITE_API_URL=http://localhost:3001
```

Abra `http://localhost:5173` e autentique-se pelo formulário normal. Sem uma sessão validada em `/auth/me`, nenhuma tela privada é montada.

O Railway deve usar `backend/` como Root Directory. O Vercel constrói exclusivamente `frontend/`. O build nao executa seed nem `prisma db push`; em producao, o startup versionado do backend roda `prisma migrate deploy` somente no Railway oficial, depois do volume SQLite persistente estar montado e antes da API iniciar.

## Automacoes internas

A H7 adiciona automacoes internas locais para regras por tenant, execucoes,
jobs por acao, round-robin, Acompanhamentos automaticos, simulacao sem efeitos
e historico tecnico. O worker e controlado por `AUTOMATION_WORKER_ENABLED` e
fica desligado por padrao; a ativacao futura exige uma unica replica SQLite,
backup e protocolo de release. Nenhuma automacao envia WhatsApp, e-mail, SMS,
push, webhook ou mensagem externa.

## Operacoes da plataforma

A H7.1 adiciona uma area interna em `/platform/tenants` para operadores da
plataforma localizarem tenants e ativarem ou desativarem somente a capability
`AUTOMATIONS` de forma individual, transacional e auditada. A H7.2 adiciona o
provisionamento interno de tenant com primeiro usuario ADMIN, tambem restrito ao
operador da plataforma. O acesso usa `PLATFORM_ADMIN_EMAILS` como allowlist
deny-by-default de usuarios autenticados e ativos; ADMIN e GERENTE continuam
limitados ao proprio tenant. Esta area nao possui impersonacao, nao ativa
capability automaticamente, nao ativa worker, nao cria regras e nao executa
automacoes.
