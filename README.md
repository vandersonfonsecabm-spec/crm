# CRM Agro SaaS

CRM para atendimento e gestão comercial, com frontend React/Vite e backend Express + Prisma/SQLite no fluxo operacional local atual.

## Estrutura

- `frontend/`: aplicação web React.
- `backend/`: API Express usada pelo frontend atual.
- `src/` e `prisma/`: backend Nest/PostgreSQL legado, congelado até a decisão arquitetural posterior.

## Backend Express local

Configure `backend/.env` a partir de `backend/.env.example`, gere o cliente Prisma e inicie a API pelos scripts existentes:

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
