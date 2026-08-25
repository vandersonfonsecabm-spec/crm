# Runner PostgreSQL real descartavel

O comando `test:postgres:real` executa a validacao PostgreSQL em uma instancia
descartavel. Ele deriva o workspace Prisma de teste, aplica as migrations
versionadas no banco temporario e delega a suite PostgreSQL ao runner canonico
`backend/scripts/run-postgres-tests.cjs`.
O primeiro arquivo da suite e o harness de preparacao com 22 testes focados;
os demais arquivos cobrem as regressoes PostgreSQL relacionadas.

## Uso local

No diretorio `backend`:

```cmd
npm run test:postgres:real
```

Ou a partir da raiz:

```cmd
npm --prefix backend run test:postgres:real
```

O fluxo local exige Docker Desktop (CLI e daemon acessiveis). A imagem
padrao e `postgres:16-alpine`; uma tag numerica pinada pode ser escolhida para
testar outra major:

```cmd
set POSTGRES_TEST_IMAGE=postgres:16.14-alpine
npm run test:postgres:real
```

O runner cria nome de container, volume temporario e porta publicados
aleatoriamente, espera o healthcheck `pg_isready`, executa migrations e a
suite, coleta logs sanitizados com SHA-256 e remove container e volume em
`finally`. A URL, senha e credenciais nunca sao impressas. O arquivo de
evidencia fica em `%TEMP%\crm-postgres-real\`.

Para conferir o plano sem consultar Docker ou alterar qualquer estado:

```cmd
npm run test:postgres:real -- --dry-run
```

## URL externa explicitamente autorizada

Uma URL externa somente e aceita com uma confirmacao especifica. Isso nunca
autoriza URL oficial ou de producao, que e rejeitada pelo runner:

```cmd
set POSTGRES_TEST_DATABASE_URL=postgresql://usuario:senha@127.0.0.1:55432/crm_test
set CRM_POSTGRES_REAL_CONFIRM=disposable-external
npm run test:postgres:real
```

Sem a confirmacao, a execucao falha antes de iniciar Docker ou abrir conexao.
Variaveis de runtime como `DATABASE_URL`, `POSTGRES_DATABASE_URL` e
`POSTGRES_TARGET_URL` nao sao usadas como fallback, evitando que o banco
oficial seja atingido por engano.

## Escopo e falha fechada

O runner nao edita schema ou migrations, nao executa seed/import, nao publica e
nao faz deploy. Docker indisponivel, daemon sem permissao, imagem mutable,
URL invalida, URL oficial ou falha da suite retornam codigo diferente de zero.
Mesmo em falha depois da criacao do container, a limpeza e tentada e a
evidencia sanitizada registra o resultado.
