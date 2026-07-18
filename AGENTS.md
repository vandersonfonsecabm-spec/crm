# Instrucoes permanentes do projeto

## Leitura obrigatoria

Antes de qualquer tarefa, leia `docs/CODEX_STATE.md` e
`docs/CODEX_RELEASE_PROTOCOL.md`.

Se a documentacao contradisser Git, banco ou ambiente real, confie no estado
real, interrompa, relate a divergencia e nao prossiga com informacao
desatualizada.

## Ambiente

- O ambiente e Windows. Use somente CMD classico e `cd /d` para mudar de
  unidade ou diretorio. Nao use PowerShell.

## Git

- Nunca use `git add .`, `git add -A` ou `git add -u`; faca stage explicito por
  arquivo.
- Nao use force push, reset, rebase, amend, clean, restore ou stash sem
  autorizacao.
- Nao misture a master local divergente ou o trabalho isolado de Estoque com
  releases do CRM.
- Push, merge e deploy somente quando o lote atual autorizar.

## Banco

- `backend/prisma/dev.db` e imutavel.
- Testes Prisma usam sandbox em `%TEMP%\crm-prisma-tests`, com
  `CRM_TEST_DATABASE_URL` obrigatoria quando `NODE_ENV=test`; nunca use o
  `dev.db` como fallback.
- Nao execute `db push`, `migrate reset` ou seed no banco oficial.
- Migration e escrita em producao exigem autorizacao explicita.

## Producao

- Backend oficial: Railway `crm-agro-api`. Nunca opere `crm-agro-demo-api`.
- Frontend oficial: projeto Vercel do CRM.
- Confirme servico, projeto e ambiente antes de operar. Nao publique nem altere
  variaveis sem autorizacao do lote.

## Seguranca

- Nao imprima nem exporte segredos, tokens, cookies, cabecalhos Authorization
  ou credenciais.
- Nao manipule sessao do navegador nem armazene segredos em codigo,
  documentacao ou frontend.
- Operacoes sensiveis devem falhar de forma fechada.

## Navegador

- Use DOM, CDP ou execucao headless. Nao use pyautogui, mouse, coordenadas ou
  automacao da area de trabalho.

## Frontend e design

- Alteracao de estetica, layout, componentes visuais ou UX exige leitura e
  ativacao da skill `interface-design` antes da primeira edicao.
- Tarefas somente de backend, banco ou documentacao nao devem carregar essa
  skill. Nao improvise redesign fora do escopo.

## Economia de execucao

- Inspecione primeiro apenas arquivos ligados a tarefa e amplie a busca somente
  por dependencia concreta. Nao faca auditoria geral sem autorizacao.
- Execute teste minimo, teste focado e uma bateria final. Apos falha, repita
  somente o teste afetado.
- Apos duas falhas pela mesma causa, interrompa e entregue checkpoint.
- Nao repita investigacao ou teste aprovado sem mudanca relacionada.
- Nao faca limpeza ou refatoracao ampla fora do escopo.
