# Fundacao SaaS de autenticacao

Esta fundacao adiciona empresas, usuarios, JWT e papeis ao backend Express atual. Os modelos comerciais ainda nao possuem `empresaId`; a migracao desses dados sera feita separadamente.

## Variaveis

- `JWT_SECRET`: segredo longo e aleatorio. Obrigatorio quando `NODE_ENV=production`.
- `JWT_EXPIRES_IN`: duracao aceita por `jsonwebtoken`; padrao local `8h`.
- `ALLOW_COMPANY_REGISTRATION`: habilita `POST /auth/register-company`. O padrao e `true` fora de producao e `false` em producao.

Nunca versione um segredo real. Sem `JWT_SECRET`, o desenvolvimento usa um segredo local temporario e emite um aviso; a producao recusa a inicializacao.

## Rotas

- `POST /auth/demo`: preserva o token demonstrativo legado.
- `POST /auth/login`: recebe `email`, `senha` e, quando o mesmo e-mail existir em mais de uma empresa, `empresaSlug`.
- `POST /auth/register-company`: recebe `empresaNome`, `adminNome`, `email`, `senha` e `slug` opcional. Cria empresa e ADMIN na mesma transacao.
- `GET /auth/me`: retorna usuario, empresa, papel e contexto demo.
- `GET /usuarios`: ADMIN ou GERENTE; suporta `page`, `limit` e `busca`.
- `POST /usuarios`: somente ADMIN; recebe `nome`, `email`, `senha` e `papel`.
- `PATCH /usuarios/:id`: somente ADMIN; altera `nome`, `papel` e `ativo` dentro da propria empresa.

Papeis: `ADMIN`, `GERENTE` e `VENDEDOR`. O token demo continua autorizado nas rotas antigas, mas e recusado nas rotas administrativas de usuarios.

## Respostas e seguranca

Os JWTs carregam `sub`, `empresaId` e `papel`, com emissor `crm-agro-saas-api` e audiencia `crm-agro-saas`. Senhas sao armazenadas exclusivamente como hash bcrypt. `senhaHash` nunca e selecionada nas respostas administrativas.

Erros novos usam `{ "erro": "...", "codigo": "..." }`, incluindo `AUTH_INVALID_CREDENTIALS`, `AUTH_TOKEN_REQUIRED`, `AUTH_TOKEN_INVALID`, `AUTH_FORBIDDEN`, `COMPANY_INACTIVE`, `USER_INACTIVE`, `EMAIL_ALREADY_EXISTS` e `LAST_ADMIN_REQUIRED`.

## Desenvolvimento e testes

```sh
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npm test
```

Os testes criam uma copia SQLite descartavel, aplicam as migrations nessa copia e removem o arquivo ao terminar. A migration de producao nao deve ser executada antes de configurar `JWT_SECRET` e receber autorizacao explicita.

## Antes da producao

1. Configurar `JWT_SECRET` seguro no Railway.
2. Manter `ALLOW_COMPANY_REGISTRATION=false` ate definir o fluxo publico de onboarding.
3. Fazer backup do volume SQLite.
4. Aplicar `prisma migrate deploy` em uma etapa controlada.
5. Validar login demo, login real e isolamento de usuarios.
6. Migrar `empresaId` para os modulos comerciais apenas em pacote posterior.
