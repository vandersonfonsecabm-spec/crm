# Estado atual do CRM

Data da verificacao: 22/07/2026.

## Estrutura ativa

- Frontend React, Vite e TypeScript em `frontend`.
- Backend Express, Prisma e SQLite em `backend`.
- Estruturas antigas da raiz `src` e `prisma` estao congeladas; nao remove-las
  nem utiliza-las sem auditoria especifica.

## Git

- Baseline oficial publicado: `e308b1bd4d554a879dd6a112c4ed82a29598a376`.
- Branch local: `feature/customer-360`, com um commit documental local a frente
  de `origin/master`, zero atras e worktree limpo apos a publicacao H5P.
- A master local divergente preserva o trabalho isolado de Estoque.
- Commit isolado de Estoque: `618a289`.
- Branch de arquivo: `archive/estoque-local-618a289`.
- Novas releases partem de `origin/master` ou da branch de release indicada.

## Producao oficial

- Frontend canonico: https://crm-murex-six-83.vercel.app.
- Backend: https://api-production-875f9.up.railway.app.
- Servico Railway: `api`; nao utilizar `crm-agro-demo-api`.
- Railway esta `Active`, Vercel esta `Ready` e producao possui 22 migrations;
  health esperado HTTP 200.
- H2, H3, H4 e H5 estao publicadas. A qualificacao comercial, as propostas, a
  Agenda e Acompanhamentos e o Cliente 360 graus estao disponiveis em
  producao.
- H1.1 foi publicada no commit
  `93e1c0b2ea7d9d4f13b06fba2f8c275c734bb312`. O Railway publicou o deployment
  `769fba0f-d9b5-4076-bbd9-810059f05912` e a Vercel publicou o deployment
  `Ai35r8GaNCQUGLSEoV5nUhSmprbe`, ambos a partir do commit exato; Railway ficou
  `Active`, Vercel ficou `Ready` e o health permaneceu HTTP 200.
- `backend/scripts/start-production.cjs` executa migrations no processo
  principal, depois da montagem do volume e antes da API. Nao utiliza
  Pre-Deploy e nao executa migration durante o build.
- O entrypoint valida o servico Railway, o volume `/app/data`, a
  `DATABASE_URL` SQLite dentro do volume, o schema e a Prisma CLI. Fora do
  Railway, inicia somente o servidor e nao migra automaticamente o banco local.
- Falha de validacao ou migration impede a API de iniciar. O SQLite operacional
  exige uma unica replica, e o processo encaminha sinais ao servidor filho.
- O deployment confirmou uma replica, Prisma CLI no runtime, volume
  `/app/data` e a ordem validacao -> `prisma migrate deploy` -> 18 migrations
  sem pendencias -> API. `prisma migrate status` confirmou o schema atualizado.
- O banco permaneceu com 770.048 bytes, SHA-256 fisico
  `0be2e7280ee4e907d79717c55dfca25c89b8f25ea83afc34225cd007ce2ad30f`,
  `quick_check` `ok`, zero violacao de foreign key, contagens preservadas e
  commercial data fingerprint
  `35745c8292fcb04f43d5c2b76d7db798dbcb59ac4868e8bfe8992384b41aa700`.
  Nenhum restart adicional ou backup novo foi executado; os backups H1P foram
  preservados.
- A automacao nao autoriza migrations futuras sem auditoria, backup, ensaio,
  compatibilidade e rollback. Operacoes destrutivas, etapas contract, colunas
  obrigatorias sem estrategia e data migrations pesadas permanecem bloqueadas
  pelo protocolo de release.
- O WhatsApp permanece pausado, sem flags, capabilities, segredos ou chamada
  externa.

## Banco local protegido

- Arquivo: `backend/prisma/dev.db`.
- Tamanho: 532.480 bytes.
- SHA-256: `cb62b4b2584162c9f66ff8e722319b96cf2697ebe9ea0a745a388d7ca572c26a`.
- Migrations locais: 9; quick check esperado `ok`; foreign key check esperado
  zero.
- Nunca escrever nesse banco durante testes.

## Reconciliacao read-only do banco de producao

- Em 2026-07-21, uma copia consistente do banco oficial foi inspecionada
  exclusivamente em `%TEMP%\crm-production-db-reconciliation`, sem consulta ou
  escrita direta no arquivo operacional.
- O arquivo principal tinha 770.048 bytes e SHA-256 fisico
  `13aa8b6a88784d48bc4592ff3a2bb33188dcbc51e4ee05af545b822ad206b510`;
  nao havia arquivos WAL ou SHM e o `journal_mode` observado foi `delete`.
- O fingerprint logico deterministico das tabelas comerciais foi
  `30f8f67a2fbce515ed57a8f2d6141adf010d6580eb2b666e9c200f1ef1b71e50`.
- As 17 migrations, schema, indices, contagens comerciais, `quick_check` e
  `foreign_key_check` permaneceram consistentes. A diferenca entre os SHAs
  fisicos historicos foi classificada como nao semantica; a unica variacao
  logica nao comercial foi o registro normal de ultimo login do usuario.
- Conclusao: BANCO LOGICAMENTE INTEGRO E SEM ALTERACAO COMERCIAL INESPERADA.

## Marcos concluidos

- Leads e canais, Inbox colaborativa e captacao de Lead pelo Site.
- Funcionalidades por tenant.
- Conversao de Lead para Negocio e Kanban baseado em Negocio.
- Vinculo legado controlado; novo Kanban ativo somente para empresa 1.

## Estado do Kanban

- Flags globais do novo Kanban ativas e capability ativa somente para
  `empresaId=1`.
- Tenant 1 utiliza um card baseado em Negocio.
- Kanban legado permanece disponivel para rollback e nao deve ser removido nesta
  fase.

## Caixa de Entrada operacional

- H1 publicada no commit `048ab71025bb55e83bd37a9f587fdc39303d00b1`.
  O Railway publicou o deployment
  `e60681ec-89f3-4061-a298-11f24e778066` e a Vercel publicou o deployment
  `4gTzmSXLvVsCBRMaNyvuRjC2ua6L`, ambos a partir do commit exato.
- A producao possui 18 migrations. A migration aditiva
  `20260721123000_add_inbox_operational_history` foi aplicada uma vez e
  acrescentou somente `acaoAtendimento`, `estadoAnterior` e `estadoNovo`, todos
  opcionais, a `HistoricoAtribuicao`.
- O backup consistente pre-H1P
  `/app/data/crm-agro-pre-h1p-20260721T191606Z.db` possui 761.856 bytes e
  SHA-256 `8bce2f9ae7469ee768a8b570fc30ae7a302a8a3dc28d7840618762f6c3644434`.
  O backup consistente pos-H1P
  `/app/data/crm-agro-post-h1p-20260721T193239Z.db` possui 761.856 bytes e
  SHA-256 `8d8e44eea60ba2b076f7219ea9b4a34002ed0c80ee26ac01a5573e5c84498cdf`.
- O banco operacional pos-migration possui 770.048 bytes e SHA-256 fisico
  `8d354f3f0018fd06fd8640fc217c6eaf4ec9d3229fa34a2d829d2c63bb6aa317`.
  O schema fingerprint mudou de
  `215b5db1723bf5c19c46e670e0604ba5e82d302eeb26e8c7bc977f0bfe7c5894`
  para `500ec113babd15f92a0ee876359dd05fadb4739fa39618e6c43960b25738b79b`.
  O commercial data fingerprint permaneceu
  `6096855efb3bb376b99a39580d6ddbf23fcb38e01915700234e4fdb3a8a0ee5e`
  antes e depois da migration.
- As contagens permaneceram: Empresa 1, Usuario 1, Cliente 7, Lead 1,
  Negocio 1, CanalIntegracao 2, ContatoCanal 2, ConversaCanal 2,
  MensagemCanal 21, EventoWebhook 1, Nota 13, Acompanhamento 2 e
  HistoricoAtribuicao 2. `quick_check` permaneceu `ok` e
  `foreign_key_check` permaneceu sem violacoes.
- Estados suportados: `NOVA`, `AGUARDANDO_ATENDIMENTO`, `EM_ATENDIMENTO`,
  `AGUARDANDO_CLIENTE`, `PENDENTE` e `ENCERRADA`.
- A fila compartilhada permite filtrar todas, nao atribuidas, conversas do
  usuario, estados e SLAs em atencao ou critico, sempre no tenant autenticado.
- Assumir, transferir, devolver a fila, aguardar cliente, marcar como pendente,
  encerrar e reabrir usam acoes explicitas, historico e concorrencia atomica.
- O lease existente de resposta foi preservado com duracao de dois minutos e
  relogio do servidor; ele nao altera o responsavel permanente.
- A migration nao foi aplicada ao banco local protegido.
- O SLA e derivado da espera por atencao humana: ate 10 minutos dentro do prazo,
  acima de 10 em atencao, acima de 15 atrasado e acima de 30 critico.
- Mensagens inbound nao lidas sao contadas e marcadas como lidas apenas depois
  do carregamento bem-sucedido da conversa. Transferencia e retorno a fila nao
  apagam esse estado.
- ADMIN, GERENTE e VENDEDOR reutilizam as permissoes existentes de comunicacao;
  o backend impede acesso entre tenants e limita cada acao conforme autoria e
  responsabilidade.
- Testes focados de backend, migration, colaboracao, Site e frontend passaram,
  assim como lint, build, Prisma validate, verificacoes de sintaxe e QA visual
  em 1366x768, 1440x900, 1920x1080 e 900x768.
- O QA publico de producao confirmou health, protecao de autenticacao, acesso
  direto e refresh da Inbox, roteamento SPA e ausencia de overflow nos quatro
  viewports. Nao havia sessao ADMIN oferecida; por isso, QA autenticado, smoke
  operacional e concorrencia em producao nao foram executados. Nenhum dado foi
  alterado e a cobertura dessas operacoes permaneceu nos testes isolados.
- O warning conhecido do bundle acima de 500 kB permanece; o build terminou
  com sucesso.
- Limitacoes: leitura continua sendo global por mensagem, nao por usuario; SLA
  e calculado, nao persistido; nao ha lease estrutural novo nem integracao
  externa nesta release. Nenhum `Negocio` e criado pelas acoes da Inbox.

## Qualificacao comercial pela Caixa de Entrada

- H2 foi publicada no commit
  `2c0dbe3cc8cdebc78b7bdd230ef19899edfd787b`. O Railway publicou o deployment
  `8d28a743-9219-48cb-a8d5-7fe0890df8d9` e a Vercel publicou o deployment
  `FqAAUyaqukGTFCVopYQUsWQngrbq`, ambos a partir do commit exato; Railway ficou
  `Active`, Vercel ficou `Ready` e o health permaneceu HTTP 200.
- O drawer existente da Inbox recebeu um painel comercial compacto para
  qualificar o atendimento, revisar possiveis duplicidades, criar um Negocio
  por confirmacao explicita, vincular um Negocio elegivel e abrir o registro
  correto no Kanban.
- A qualificacao reutiliza `Cliente.interesse`, `Cliente.valor`,
  `Cliente.proximoFollowUp`, `Lead.interesse`, `Lead.status`, `Acompanhamento`
  e o servico oficial `convertLeadToBusiness`. Interesse e proxima acao sao
  obrigatorios; prioridade e obrigatoria, valor e data de retorno sao
  opcionais e validados.
- O vinculo estrutural reutiliza `ConversaCanal.leadId` e o `Negocio.leadId`
  unico. Nenhum Negocio e criado ao abrir, assumir, qualificar ou encerrar uma
  conversa; criacao duplicada concorrente retorna conflito controlado.
- A migration aditiva
  `20260721213000_add_inbox_commercial_qualification` cria somente
  `HistoricoQualificacaoConversa`, com vinculos de tenant, conversa, Cliente,
  Lead, Negocio e autor. Ela foi validada em sandbox e aplicada uma vez pelo
  startup automatico do Railway; a producao possui 19 migrations sem
  pendencias e o `dev.db` protegido permanece com 9 migrations.
- ADMIN e GERENTE podem qualificar, criar e vincular no tenant autenticado.
  VENDEDOR atua somente quando autorizado pela responsabilidade atual; outro
  tenant recebe `404` e ausencia de permissao recebe `403`. `empresaId` do
  frontend nunca e autoridade.
- Testes focais cobriram validacao, isolamento, permissao, duplicidade,
  concorrencia, criacao pelo conversor oficial, vinculo, historico e
  preservacao de conversa e mensagens. Regressoes de H1, G1, G2A, Site e
  frontend passaram, assim como Prisma validate, migration isolada, lint,
  build, `node --check` e `git diff --check`.
- O QA visual local em 1366x768, 1440x900, 1920x1080 e 900x768 validou os
  estados sem qualificacao, qualificado, duplicidade, Negocio vinculado, erro
  recuperavel e falta de permissao. A data de retorno opcional foi corrigida
  para permanecer como nao definida quando omitida. Evidencias ficaram somente
  em `%TEMP%\crm-inbox-h2-visual-qa`. Em producao, a sessao ADMIN oferecida
  confirmou o painel, o vinculo existente e a abertura do Negocio correto no
  Kanban. O smoke completo de qualificacao e criacao nao foi executado porque
  uma fixture ja possuia Negocio e a outra nao possuia Lead valido; nenhum
  Cliente, Lead ou Negocio foi criado ou alterado.
- O backup consistente pre-H2P
  `/app/data/crm-agro-pre-h2p-20260722T005707Z.db` possui 761.856 bytes e
  SHA-256 `f2c987d188608f7963c3c5bac3027d8878555068ee76635f0cd584ac5632455a`.
  O backup consistente pos-H2P
  `/app/data/crm-agro-post-h2p-20260722T010651Z.db` possui 790.528 bytes e
  SHA-256 `8fe3333e94589051c9da9dd64c26c96faa4c6fae3d7fac2d1fba7323cadce6b5`.
- O banco operacional possui 794.624 bytes, SHA-256 fisico
  `4d2c796e577ba5ad00cee37076b19cf541050526cfa5ef957d129f99e94b382b`,
  `quick_check` `ok` e zero violacao de foreign key. As contagens de Cliente 7,
  Lead 1, Negocio 1, ConversaCanal 2, MensagemCanal 21 e EventoWebhook 1 foram
  preservadas. O commercial fingerprint mudou de
  `4fd79f282c7fb18b93256ce15eec2e185a1bbcfc1af3c69b295f3ab810b0544d`
  para `a27794c633f407555def2c7894be6e7a2c7cd79b01b78f885c45fd65729eb676`
  somente pelo smoke autorizado: uma conversa simulada foi assumida e
  devolvida a fila, duas linhas append-only foram adicionadas ao historico e
  as mensagens abertas foram marcadas como lidas.
- Limitacoes: nao existe remocao de vinculo porque nao ha regra de dominio
  aprovada; a busca de Negocios e limitada aos ativos do mesmo Cliente; a data
  interna obrigatoria de `Acompanhamento` usa o momento da qualificacao quando
  nenhuma data de retorno e informada. O smoke comercial completo permanece
  coberto pelos testes isolados porque nao havia fixture produtiva elegivel.
- O WhatsApp continua pausado, sem Meta, chamada externa, flags, capabilities
  ou credenciais ativadas. A integracao de fixture permanece em `MODO_TESTE`,
  sem credencial e sem operacao real.

## Propostas comerciais

- H3 foi publicada no commit
  `7b9f5564272a8df740cfd65e7c10ad9aed234e79`. O Railway publicou o deployment
  `098d27f1-b2d7-486c-874c-4708c8cd223f` e a Vercel publicou o deployment
  `dpl_6ipwitCh318aBnHjdQaLLprwrxUK`; ambos partiram do commit exato, com
  Railway `Active`, Vercel `Ready` e health HTTP 200.
- A migration aditiva `20260722013000_add_commercial_proposals` cria
  `PropostaComercial`, `ItemPropostaComercial` e
  `HistoricoPropostaComercial`, sem alterar registros comerciais existentes.
  Ela foi validada em sandbox e aplicada uma vez pelo startup automatico do
  Railway. A producao possui 20 migrations sem pendencias.
- Propostas pertencem ao tenant, Cliente e Negocio, com Lead opcional,
  responsavel, autor, codigo unico por tenant, versao, revisao e concorrencia
  otimista. Itens e descontos sao validados e os totais sao calculados pelo
  backend.
- Os status suportados sao `RASCUNHO`, `PRONTA`, `ENVIADA`, `ACEITA`,
  `RECUSADA`, `VENCIDA` e `CANCELADA`. Propostas imutaveis exigem duplicacao
  como nova versao; `ENVIADA` e somente um estado manual e nao aciona canal
  externo.
- O fluxo reutiliza o drawer do Negocio para listar, criar e editar rascunhos,
  alterar status, duplicar versao, consultar historico e abrir o PDF gerado no
  backend sem servico externo.
- Testes focais de migration, backend e frontend passaram, junto das regressoes
  de H2 e G2A, Prisma validate, lint, build, `node --check` e
  `git diff --check`. O warning conhecido de chunk acima de 500 kB permanece.
- O QA local em 1366x768, 1440x900, 1920x1080 e 900x768 validou lista,
  formulario, itens, totais, status, versionamento, historico, PDF e erro
  recuperavel, sem overflow horizontal. Evidencias ficaram somente em
  `%TEMP%\crm-h3-proposals-visual-qa`.
- O backup consistente pre-H3P
  `/app/data/crm-agro-pre-h3p-20260722T022813Z.db` possui 790.528 bytes e
  SHA-256 `8fe3333e94589051c9da9dd64c26c96faa4c6fae3d7fac2d1fba7323cadce6b5`.
  O backup consistente pos-H3P
  `/app/data/crm-agro-post-h3p-20260722T023800Z.db` possui 847.872 bytes e
  SHA-256 `6560787a4bc0aa81765fd6267fc490938d1ff45aef9b6498d338bd466b1a6dd7`.
- O schema fingerprint mudou de
  `5e9a0b7f05d9ea323d1841997ed22d8173739b997ae6f7a04164c931d7e0a5b0`
  para `744018a91d1ed1409332a30e22066319674d670109c4c4bfb508c224776656ac`,
  enquanto o commercial data fingerprint comparavel permaneceu
  `71d0be6a879a9e3100cdacf574082b86c5c27084b9f41dbe316b27b2b1b42f02`.
  `quick_check` ficou `ok`, nao houve violacao de foreign key e Cliente 7,
  Lead 1, Negocio 1, ConversaCanal 2 e MensagemCanal 21 foram preservados.
- Nao havia sessao ADMIN oferecida durante a H3P; portanto, o smoke autenticado
  nao foi executado e nenhuma proposta de producao foi criada. A cobertura
  funcional permaneceu nos testes isolados e o acesso publico confirmou SPA,
  alias canonico, health e protecao de autenticacao.
- Limitacoes: nao existe envio externo, faturamento ou aceite automatico; o PDF
  e deliberadamente simples e a proposta permanece vinculada ao contexto do
  Negocio. O WhatsApp continua pausado e nenhuma chamada Meta foi realizada.

## Agenda e acompanhamentos

- H4 publicada no commit
  `0bf2fcf3580552ee5f6383b7ff05f6945d8c415a`. O Railway esta Active no
  deployment `27d5f9b0-95b7-483e-8f69-02b388b0c4df` e a Vercel esta Ready no
  deployment `BUXM5M2QtYDi9y33bRPQnw3ja7VW`, com o alias canonico preservado.
- A migration aditiva `20260722043000_add_agenda_and_followups` foi aplicada
  uma vez pelo startup automatico, elevando producao para 21 migrations. A API
  iniciou somente depois da migration e permanece com health `200`.
- A estrutura de `Acompanhamento` atende tarefas, retornos, reunioes, ligacoes,
  visitas e outros compromissos. Os status publicados sao `PENDENTE`,
  `EM_ANDAMENTO`, `CONCLUIDO` e `CANCELADO`, com atraso derivado pelo servidor.
- A agenda oferece Minha agenda, Hoje, Proximos, Atrasados, Concluidos, Equipe
  e Todos, com filtros por responsavel, tipo, status, prioridade e vinculos a
  Cliente, Lead, Negocio, ConversaCanal e PropostaComercial.
- Criacao, edicao, transferencia, reagendamento, inicio, conclusao idempotente,
  cancelamento e reabertura usam revisao otimista. Conflitos preservam a
  primeira confirmacao e retornam resposta controlada para a segunda.
- `HistoricoAcompanhamento` registra autor, acao, estados, responsaveis, datas e
  observacao sanitizada na mesma transacao. ADMIN e GERENTE possuem visao da
  equipe; VENDEDOR opera somente o escopo permitido do proprio tenant.
- O backup pre-H4P
  `/app/data/crm-agro-pre-h4p-20260722T042210Z.db` possui 847872 bytes e SHA-256
  `42099209ba86c6655b36769d72aa19c907f3b399d90608bcc2a9cae5843b686d`.
  O backup pos-H4P `/app/data/crm-agro-post-h4p-20260722T043522Z.db` possui
  876544 bytes e SHA-256
  `17d11d8a77d4c8fc49409adc228cbf9c7d8359d1f9a9f67e192cbbe8856badd3`.
- O banco pos-migration possui 880640 bytes, SHA-256 fisico
  `2886f176a37fab3e4643101172217e0c7cf4b4235efddb206a2b7f566592c546`,
  `quick_check` ok e zero violacoes de foreign key. O fingerprint comercial
  permaneceu `e2d6ea4c796f56d2871454ae323f3999548927609c20d5ab9e84f91e258766e3`
  e todas as contagens comerciais anteriores foram preservadas.
- Testes de migration, backend, concorrencia, tenant, permissoes e frontend,
  Prisma validate, lint, build, `node --check` e `git diff --check` passaram. O
  warning conhecido do bundle acima de 500 kB permanece.
- O QA de producao em 1366x768, 1440x900, 1920x1080 e 900x768 validou agenda,
  filtros, formulario, responsividade e ausencia de overflow. O smoke de escrita
  nao foi executado porque a automacao DOM/CDP nao conseguiu preencher com
  seguranca os controles nativos de data e hora; nenhuma escrita foi contornada
  por API e `Acompanhamento` permaneceu com 2 registros, sem historico novo.
- Nao houve chamada externa, conexao Meta ou envio. Atrasos nao geram
  notificacao externa e nao existe calendario mensal complexo. O WhatsApp
  continua formalmente pausado aguardando autenticacao manual da Meta.

## Cliente 360 graus

- H5P foi publicada em 26/07/2026 no commit
  `e308b1bd4d554a879dd6a112c4ed82a29598a376`. O Railway esta `Active` no
  deployment `f66f3476-3e04-4973-b5dd-0d75f6c8a656` e a Vercel esta `Ready`
  no deployment `DtRsP7PvEMKBtmthUp7My9hnLgC8`, com o alias canonico
  preservado.
- `Cliente` continua sendo a entidade canonica. A migration aditiva
  `20260722133000_add_customer_360_fields` acrescenta somente `cidade`,
  `estado`, `cpfCnpj` opcionais e `revisao` com valor inicial 1. Ela foi
  aplicada exatamente uma vez em producao pelo startup automatico, elevando o
  total de 21 para 22 migrations, sem pendencias.
- A API oferece `GET /clientes/:id/360`, `GET /clientes/:id/timeline` e
  `PATCH /clientes/:id/cadastro`. Tenant vem exclusivamente da sessao,
  atualizacoes cadastrais usam revisao otimista e conflitos retornam `409`.
  CPF/CNPJ e UF sao normalizados e validados; o fluxo Site preenche cidade e
  estado somente quando os campos existentes estao vazios.
- A visao consolidada reutiliza Leads, Negocios, Propostas, Acompanhamentos,
  Contatos e Conversas do Cliente. A timeline paginada e filtravel deriva
  mensagens, ligacoes, visitas, propostas, negocios, acompanhamentos, notas e
  qualificacoes das entidades reais, preservando proveniencia e navegacao de
  contexto, sem criar uma segunda tabela de historico.
- Compras anteriores sao exibidas somente para `Negocio.etapa = FECHADO`;
  propostas enviadas ou aceitas nao sao inferidas como compra. O resumo usa
  apenas pipeline, responsavel, ultima atividade e contagens obtidas das fontes
  comerciais existentes.
- ADMIN, GERENTE e VENDEDOR reutilizam o acesso comercial atual dentro do
  tenant. Outro tenant recebe `404`; nao existe capability granular de Cliente
  nem responsavel direto no modelo atual, limitacao preservada sem criar regra
  paralela nesta fase.
- Testes focais de migration, backend, CPF/CNPJ, tenant, paginacao, filtros,
  concorrencia, fontes reais e regressao Site passaram. Os 33 testes frontend,
  lint, build, Prisma validate, `node --check` e `git diff --check` tambem
  passaram. O warning conhecido do bundle acima de 500 kB permanece.
- O QA local em 1366x768, 1440x900, 1920x1080 e 900x768 validou cadastro,
  resumo, compras comprovadas, timeline com varios tipos, filtro de mensagens,
  navegacao contextual, edicao e erro recuperavel, sem overflow horizontal.
  Evidencias ficaram somente em `%TEMP%\crm-h5-customer-360-qa`.
- O backup consistente pre-H5P
  `/app/data/crm-agro-pre-h5p-20260726T182022Z.db` possui 876.544 bytes e
  SHA-256
  `b9a219af857b0e2d4678f20c39f4a2677fed40be7000d10092ae64b3aa46b874`.
  O backup consistente pos-H5P
  `/app/data/crm-agro-post-h5p-20260726T182638Z.db` possui 876.544 bytes e
  SHA-256
  `0a1e334a2106d1d9dfcf3bb330045830fdd0c9a03ecef154bc4a9254f62b967b`.
- O banco de producao pos-migration possui 880.640 bytes, SHA-256 fisico
  `04bc3aa2eff00b137ac792c1a989035145dd327d04d75b802e818ff5ac541ac8`,
  `quick_check` `ok`, zero violacoes de foreign key e sem WAL ou SHM. O
  fingerprint estrutural passou de
  `7439fdffae9da1f553c984f655e42b3270f1d9f1209d19efcfa6a28a12283462`
  para
  `602cf1f43bad70d180a421cdcef28703165c2625da98858be0f7762b5bc81172`;
  o fingerprint comercial compativel permaneceu
  `709142ef246109fc1ecfa5749786472253fbe0a31e7da9590e188d2d769f2181`.
- O QA de producao foi somente leitura. Sem sessao ADMIN autenticada
  disponivel, foram validados health HTTP 200, rotas SPA sem 404 de
  infraestrutura, protecao por login e respostas HTTP 401 das APIs H5; a
  cobertura autenticada de cadastro, timeline, filtros e navegacao permanece
  comprovada pelos testes e pelo QA local aprovado.
- O `dev.db` permaneceu intacto com 532.480 bytes, SHA-256
  `cb62b4b2584162c9f66ff8e722319b96cf2697ebe9ea0a745a388d7ca572c26a`,
  9 migrations, `quick_check` `ok`, zero violacoes de foreign key e sem WAL ou
  SHM. Nenhuma chamada externa ocorreu e o WhatsApp continua desligado.

## Auditoria final do escopo original

- Em 22/07/2026, o documento oficial `Escopo Completo de CRM para Atendimento
  e Gestao de Leads` foi reconciliado com Git, codigo, schema, migrations,
  testes, Railway, Vercel e este documento. Nao foram usados percentuais
  historicos.
- CONCLUIDOS: autenticacao basica; multiempresa e tenant; Clientes, Cliente 360
  graus e Leads
  basicos; captura pelo Site; conversao de Lead para Negocio; Kanban; Inbox
  colaborativa; qualificacao comercial; propostas, versoes, calculos e PDF;
  agenda e acompanhamentos; migrations automaticas; producao Railway e Vercel.
- PARCIAIS: proxima acao e tempo parado; resposta real da Inbox;
  permissoes granulares; relatorios; seguranca, LGPD e
  backups; cobranca; responsividade mobile-first; especializacao agro.
- NAO INICIADOS: automacoes; notificacoes reais e checklist; pos-venda;
  rankings; WhatsApp outbound, midia, templates e status; frete e envio de
  propostas; 2FA; campos e fluxos agro estruturados.
- DEPENDENTE EXTERNO: ativacao do inbound textual WhatsApp pela
  Meta. O WhatsApp continua desligado.
- FORA DO MVP, MAS EXIGIDOS: Instagram; Facebook;
  relatorios avancados; entregas formalmente previstas nas fases posteriores.
- IA permanece uma sugestao, nao uma pendencia obrigatoria. PostgreSQL, AWS,
  DigitalOcean, Google Maps e SMTP sao sugestoes tecnicas. Bling e itens fora
  do escopo original nao entram no calculo de aderencia.
- O `dev.db` permanece intacto com 532.480 bytes, SHA-256
  `cb62b4b2584162c9f66ff8e722319b96cf2697ebe9ea0a745a388d7ca572c26a`,
  9 migrations, `quick_check` `ok`, zero violacoes de foreign key e sem WAL ou
  SHM.

## Plano oficial pos-auditoria

- H5 - Cliente 360 graus (publicada)
- H6 - Tempo de etapa e proxima acao
- H7 - Automacoes
- H8 - Notificacoes e checklist
- H9 - Pos-venda
- H10 - Relatorios reais
- H11 - Equipe e permissoes
- H12 - Complementos de propostas
- H13 - Seguranca e LGPD
- H14 - WhatsApp outbound
- H15 - Ativacao Meta
- H16 - Vertical agro
- H17 - Instagram
- H18 - Facebook

Dependencias: H6 alimenta H7 e H10; H7 alimenta H8 e H9; H14 permanece
desligada ate H15; H15 depende de autorizacao externa; H17 e H18 dependem de
integracoes autorizadas.

## WhatsApp

- Nenhuma credencial Meta esta configurada e nenhuma chamada externa foi feita.
- Reutilizar `CanalIntegracao`, `ContatoCanal`, `ConversaCanal`,
  `MensagemCanal` e `EventoWebhook`; ampliar `CanalIntegracao`, sem estrutura
  paralela.
- Piloto manual com uma WABA e numero de teste para empresa 1; SaaS definitivo
  com Embedded Signup.
- Tenant mapping por WABA ID e Phone Number ID; nunca aceitar `empresaId` do
  payload.
- No piloto, segredos ficam na Railway e o banco guarda somente referencias.
- Capabilities planejadas: `WHATSAPP_INTEGRATION`, `WHATSAPP_INBOUND` e
  `WHATSAPP_OUTBOUND`.
- F1A-1P publicada no commit
  `f59c5f52784552936a20c7d99a6477ce38c67383`, com a migration
  `20260718184500_add_whatsapp_integration_foundation` aplicada em producao.
- Producao possui 16 migrations; a fundacao esta implantada, mas permanece
  operacionalmente desligada.
- Flags globais continuam `false` e nenhuma capability WhatsApp foi atribuida.
- O gate ADMIN `GET /integracoes/whatsapp/status` retorna `404` enquanto a
  fundacao permanece desligada.
- Nenhuma credencial Meta foi configurada, nenhuma chamada a Meta foi feita e o
  frontend nao foi alterado.
- F1A-2P publicada no commit
  `4fea3d532030a5de2914258eb7dd634813ec413a`; o callback GET e POST esta
  implantado em `/webhooks/whatsapp`.
- Producao continua com 16 migrations; flags e capabilities WhatsApp seguem
  desligadas, sem Verify Token ou App Secret configurados.
- O callback publico retorna `404`, nao processa nem persiste eventos e nenhuma
  chamada a Meta foi feita.
- O frontend nao recebeu deploy nesta release.
- F1B-0SP publicada no commit
  `8d68687e68a979f2d79e080c04b21fb16eb025e9`; producao possui 17
  migrations, incluindo
  `20260718205500_add_event_webhook_atomic_payload`.
- `EventoWebhook.payloadJson` esta disponivel como campo opcional; eventos
  legados permanecem com `payloadJson` nulo e o fluxo Site continua compativel.
- Na F1B-0SP, o callback WhatsApp ainda nao utilizava `payloadJson` nem aceitava
  eventos operacionalmente; GET e POST publicos retornavam `404`.
- Flags e capabilities permanecem desligadas, sem Verify Token, App Secret,
  credencial Meta ou chamada a Meta.
- O frontend nao recebeu deploy nesta release.
- F1B-1P publicada no commit
  `10fea4c80a065c63cb7b37acbc0369f37f73613a`; producao continua com 17
  migrations e a aceitacao duravel esta implantada.
- `EventoWebhook.payloadJson` e `payloadHash` armazenam o evento atomico, com
  idempotencia baseada no wamid e HTTP 200 somente apos persistencia confirmada
  ou retry materialmente equivalente.
- O callback GET e POST continua retornando `404` pelos gates desligados;
  nenhuma mensagem WhatsApp foi persistida em producao e nenhuma entidade
  comercial foi criada.
- Flags e capabilities continuam desligadas, sem Verify Token, App Secret,
  credencial Meta ou chamada a Meta; o frontend nao recebeu deploy.
- F1B-2P publicada no commit
  `517fdd7f51c4f310b9a601cae1431af6512fabaf`; producao continua com 17
  migrations e o processador interno esta implantado.
- O processador permanece sem acionamento automatico: o callback, as rotas, o
  startup e qualquer job nao o chamam.
- Nenhum `EventoWebhook` foi processado em producao e nenhum Cliente, Lead,
  `ContatoCanal`, `ConversaCanal` ou `MensagemCanal` foi criado.
- O callback GET e POST continua retornando `404`; flags e capabilities
  permanecem desligadas, sem Verify Token, App Secret, credencial Meta ou
  chamada a Meta, e o frontend nao recebeu deploy.
- Baseline oficial: `551dee5c785ddb1579214ce7bbb3bf459cfcf5c0`.
- F1B-3P publicada; a producao continua com 17 migrations.
- A orquestracao completa esta implantada: o callback conecta o intake duravel
  ao processador somente depois do commit do `EventoWebhook`.
- HTTP 200 depende do processamento completo ou de retry equivalente.
- O callback continua retornando HTTP 404 porque flags e capabilities estao
  desligadas e Verify Token e App Secret permanecem ausentes.
- Nenhum `EventoWebhook` WhatsApp ou entidade comercial foi criado em producao;
  nenhuma chamada Meta ou resposta outbound ocorreu.
- O frontend permaneceu sem deploy.
- Baseline oficial do repositorio e do frontend:
  `40c9465b9cbbd38865eb76d805d8cc3a4b21907c`.
- F1UI-1P publicada com o painel administrativo nas rotas `/integracoes` e
  `/integracoes/whatsapp`, reutilizando a area Integracoes e o acesso ADMIN.
- O painel suporta os estados `NOT_CONFIGURED`, `WAITING_META_AUTH`,
  `CONFIGURED_INACTIVE`, `CONNECTED`, `PAUSED`, `ERROR` e `UNAVAILABLE`.
- O estado real permanece `NOT_CONFIGURED`; o endpoint de status continua
  retornando `404` para ADMIN enquanto os gates estiverem desligados.
- `Conectar WhatsApp` abre somente o modal informativo e `Continuar na Meta`
  permanece desabilitado; nenhuma autenticacao Meta foi iniciada.
- A URL publica do webhook pode ser copiada. Nenhuma credencial e solicitada,
  exibida ou armazenada, e as acoes operacionais permanecem desabilitadas.
- O backend funcional ativo permanece no commit
  `551dee5c785ddb1579214ce7bbb3bf459cfcf5c0`; o Railway ignorou o push por nao
  haver diff em `backend`, e a producao permanece com 17 migrations.
- Flags, capabilities e segredos permanecem ausentes; nenhuma mensagem real ou
  chamada Meta ocorreu. Outbound nao esta implementado.
- WhatsApp formalmente pausado aguardando autenticacao manual da Meta.
- A publicacao H1 nao ativou flags, capabilities, segredos ou integracao
  operacional do WhatsApp. Os callbacks GET e POST continuam retornando `404`,
  nenhuma mensagem real foi recebida e nenhuma chamada externa foi realizada.
- Proxima release: F1C-1, ativacao controlada do piloto Meta quando houver
  autenticacao manual disponivel.
