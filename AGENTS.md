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

============================================================
REGRA PERMANENTE — ANÁLISE CRÍTICA, REUSO DE EVIDÊNCIAS
E EXECUÇÃO NÃO REPETITIVA
============================================================

Esta regra deve ser aplicada antes de qualquer tarefa como criterio de decisao.
Tarefas simples ou estritamente documentais nao exigem auditoria adicional alem
das verificacoes proporcionais ao risco e ao escopo.

Seu objetivo é impedir:

- repetição de trabalho já concluído;
- reexecução desnecessária de testes;
- auditorias duplicadas;
- migrations duplicadas;
- commits duplicados;
- backups duplicados;
- deploys duplicados;
- loops de tentativa e erro;
- desperdício de tokens;
- execução mecânica de instruções incoerentes;
- expansão não autorizada do escopo.

Esta regra não autoriza:

- ignorar requisitos funcionais;
- ignorar regras de segurança;
- eliminar validações essenciais;
- alterar o objetivo da tarefa;
- decidir questões de produto sem autorização;
- modificar arquitetura sem necessidade;
- executar ações destrutivas;
- substituir uma instrução ambígua por uma interpretação arriscada.

O princípio central é:

Executar somente o trabalho necessário para alcançar o objetivo solicitado,
preservando integralmente a segurança, a rastreabilidade e o escopo.

============================================================
1. HIERARQUIA DE DECISÃO
============================================================

Antes de executar qualquer instrução, respeitar esta ordem:

1. regras de segurança e proibições permanentes;
2. instruções do AGENTS.md;
3. restrições específicas do projeto;
4. estado real verificado do Git, código, banco e produção;
5. objetivo funcional da tarefa atual;
6. último checkpoint confiável;
7. documentação operacional;
8. sequência sugerida pelo comando recebido.

Uma instrução inferior nunca pode anular uma regra superior.

Exemplos:

- uma instrução para economizar tempo não pode eliminar um backup obrigatório;
- uma instrução para continuar não pode autorizar push sem validação;
- uma instrução antiga não pode prevalecer sobre o estado real do Git;
- uma instrução redundante não deve ser executada apenas porque aparece no texto.

============================================================
2. LEITURA INTEGRAL ANTES DA EXECUÇÃO
============================================================

Antes de executar qualquer comando:

1. ler o comando inteiro;
2. identificar o objetivo final;
3. identificar as restrições;
4. identificar o estado inicial esperado;
5. identificar operações de risco;
6. identificar dependências;
7. identificar critérios de conclusão;
8. identificar regras de parada;
9. comparar o comando com o estado real;
10. montar internamente a menor sequência segura de execução.

Não começar a executar linha por linha antes de compreender o comando inteiro.

Não interpretar a ordem textual como obrigatória quando ela contiver redundância,
desde que a ordem corrigida preserve o objetivo, a segurança e as dependências.

============================================================
3. FONTES DE EVIDÊNCIA
============================================================

Para decidir se algo já foi concluído, usar evidências verificáveis.

Ordem recomendada:

1. Git e arquivos atuais;
2. código efetivamente conectado;
3. schema e migrations;
4. testes do commit atual;
5. banco validado;
6. produção validada;
7. documentação operacional atualizada;
8. checkpoint recente;
9. relatório anterior;
10. memória ou afirmação não verificada.

Não considerar uma etapa concluída somente porque:

- foi mencionada em uma mensagem;
- aparece em documentação antiga;
- existe um arquivo com nome parecido;
- existe uma interface sem backend;
- existe backend sem frontend conectado;
- existe migration não aplicada;
- existe commit não publicado;
- existe deploy em commit diferente;
- um teste antigo passou antes de mudanças relevantes.

============================================================
4. VALIDADE DAS EVIDÊNCIAS ANTERIORES
============================================================

Um resultado anterior pode ser reutilizado somente quando:

- pertence ao mesmo commit ou a um estado equivalente comprovado;
- os arquivos relacionados não mudaram;
- as dependências relevantes não mudaram;
- o schema relacionado não mudou;
- as migrations relacionadas não mudaram;
- o ambiente relevante não mudou;
- o resultado anterior foi concluído com sucesso;
- não existe evidência posterior contraditória.

Se qualquer condição acima não puder ser confirmada, fazer a menor validação
necessária para atualizar a evidência.

Não repetir uma suíte completa quando uma validação focada for suficiente.

============================================================
5. CLASSIFICAÇÃO INTERNA DAS INSTRUÇÕES
============================================================

Antes de executar, classificar internamente cada instrução como:

- EXECUTAR;
- JÁ CONCLUÍDA COM EVIDÊNCIA;
- VALIDAR MINIMAMENTE;
- IGNORAR POR REDUNDÂNCIA COMPROVADA;
- CORRIGIR SINTAXE;
- CORRIGIR CAMINHO;
- SUBSTITUIR POR EQUIVALENTE OPERACIONAL SEGURO;
- BLOQUEADA POR DIVERGÊNCIA;
- BLOQUEADA POR RISCO;
- FORA DO ESCOPO;
- DEPENDENTE DE AUTORIZAÇÃO;
- DEPENDENTE DE SERVIÇO EXTERNO.

Essa classificação não precisa ser exibida integralmente.

Ela deve orientar uma execução curta, segura e rastreável.

============================================================
6. TRABALHO JÁ CONCLUÍDO
============================================================

Quando uma etapa estiver comprovadamente concluída:

- não refazer a implementação;
- não recriar arquivo;
- não recriar migration;
- não duplicar endpoint;
- não duplicar componente;
- não duplicar modelo;
- não duplicar teste;
- não duplicar documentação;
- não recriar commit;
- não recriar backup equivalente;
- não iniciar deploy duplicado;
- não repetir auditoria completa.

Quando necessário, confirmar apenas que o resultado continua válido.

Exemplos:

- branch correta já existente:
  não tentar criá-la novamente;

- migration existente e inalterada:
  não gerar outra migration equivalente;

- deploy já iniciado para o commit correto:
  apenas acompanhar o deploy existente;

- backup válido já criado para a mesma operação atômica:
  não criar outro backup pré-operação;

- auditoria concluída e sem mudança estrutural:
  fazer apenas auditoria focada;

- teste aprovado no commit atual e sem alteração relacionada:
  reutilizar a evidência;

- documentação já contém exatamente a informação:
  não adicionar um segundo registro equivalente.

============================================================
7. DIFERENÇA ENTRE REDUNDÂNCIA E SEGURANÇA
============================================================

Nunca classificar como redundante uma verificação necessária para proteger
uma nova operação de risco.

Mesmo que uma verificação tenha sido executada anteriormente, ela deve ser
repetida quando for pré-condição imediata de:

- push;
- merge autorizado;
- migration;
- deploy;
- alteração em produção;
- alteração de banco;
- restauração;
- exclusão;
- rotação de credencial;
- publicação;
- operação irreversível.

Exemplos:

- confirmar HEAD antes de push;
- confirmar backup antes de migration em produção;
- confirmar integridade depois da migration;
- confirmar commit ativo depois do deploy;
- revisar staged antes do commit;
- confirmar worktree antes de publicação.

Essas verificações não são desperdício.

São barreiras de segurança ligadas a uma nova operação.

Preflight explicitamente exigido pela tarefa ou por uma operação de risco nunca
deve ser tratado como redundante.

============================================================
8. CORREÇÃO DE ERROS NO COMANDO
============================================================

Quando o comando tiver erro inequívoco, é permitido corrigir somente:

- sintaxe;
- aspas;
- separador;
- caminho;
- nome de arquivo confirmado;
- comando equivalente para o ambiente correto;
- referência desatualizada cuja substituição seja comprovada;
- ordem operacional necessária para respeitar dependências.

A correção não pode:

- alterar o escopo;
- adicionar funcionalidade;
- remover requisito;
- mudar regra de negócio;
- trocar arquitetura;
- alterar banco sem necessidade;
- autorizar operação proibida;
- escolher entre interpretações funcionais diferentes.

Quando houver mais de uma interpretação plausível, interromper e relatar.

Não adivinhar.

============================================================
9. BASELINE DESATUALIZADO
============================================================

Quando o comando contiver baseline antigo:

1. verificar o estado real;
2. identificar se existe checkpoint posterior;
3. comparar branch, HEAD, origin, migrations e worktree;
4. determinar se a diferença é uma evolução esperada ou uma divergência;
5. continuar somente quando a atualização for inequívoca e segura.

Exemplos de evolução esperada:

- HEAD avançou por commit mencionado no checkpoint;
- migration aumentou após publicação confirmada;
- branch mudou conforme a fase anterior determinava.

Exemplos de divergência:

- commit desconhecido;
- worktree sujo inesperado;
- origin avançou por alteração não relatada;
- migration ausente;
- banco com contagens inesperadas;
- arquivo sensível alterado.

Em divergência real, interromper.

============================================================
10. PROTEÇÃO CONTRA LOOPS
============================================================

Não repetir uma ação sem nova evidência ou hipótese verificável.

Quando uma etapa falhar:

1. capturar a falha;
2. identificar a causa provável;
3. verificar logs e estado relacionado;
4. propor uma correção objetiva;
5. aplicar apenas a correção necessária;
6. repetir somente a etapa afetada;
7. comparar o novo resultado.

Se a falha continuar pelo mesmo motivo e não houver nova evidência:

- interromper;
- não tentar variações aleatórias;
- não reinstalar tudo;
- não apagar cache indiscriminadamente;
- não recriar ambiente sem necessidade;
- não repetir indefinidamente.

Cada nova tentativa precisa ter:

- hipótese diferente;
- evidência;
- alteração controlada;
- critério claro de sucesso.

============================================================
11. TESTES E VALIDAÇÕES
============================================================

Selecionar testes proporcionalmente ao que mudou.

Quando nada relacionado mudou:

- reutilizar resultado válido;
- fazer apenas confirmação mínima quando necessária.

Quando um arquivo relacionado mudou:

- executar teste focado;
- executar regressão diretamente relacionada;
- ampliar somente se houver falha ou impacto transversal.

Executar suíte completa quando:

- a alteração for transversal;
- houver mudança de infraestrutura;
- houver mudança de autenticação;
- houver mudança ampla de schema;
- houver mudança de contrato compartilhado;
- a documentação do projeto exigir;
- for validação final antes de publicação e a suíte for obrigatória.

Não usar economia de tokens como justificativa para omitir teste necessário.

============================================================
12. AUDITORIAS
============================================================

Não repetir auditoria completa já concluída sem mudança relevante.

Usar:

- auditoria focada para fase específica;
- inspeção de arquivos afetados;
- consulta ao checkpoint;
- comparação do diff;
- verificação de schema e rotas relacionadas.

Uma nova auditoria completa só é permitida quando:

- o escopo oficial mudou;
- a arquitetura mudou;
- o checkpoint perdeu confiabilidade;
- existem divergências extensas;
- houve alteração externa significativa;
- o usuário solicitou explicitamente nova auditoria completa.

============================================================
13. MIGRATIONS
============================================================

Antes de criar uma migration:

1. verificar migrations existentes;
2. verificar o schema atual;
3. confirmar que a alteração ainda não existe;
4. confirmar que não há migration equivalente;
5. confirmar que a mudança de banco é necessária.

Não criar migration:

- vazia;
- duplicada;
- apenas para renomear sem necessidade;
- para corrigir algo já corrigido;
- por causa de documentação desatualizada;
- apenas porque o comando mencionou migration.

Se a migration já existir:

- validar a migration existente;
- não criar outra com o mesmo objetivo.

============================================================
14. BACKUPS
============================================================

Não criar backups duplicados sem necessidade.

Diferenciar:

- backup pré-operação;
- backup pós-operação;
- backup de checkpoint;
- backup de restauração;
- backup de rotina.

Um backup pré-operação válido pode ser reutilizado somente enquanto:

- a operação ainda não começou;
- o banco não mudou;
- a mesma janela operacional continua ativa;
- a integridade foi confirmada;
- o arquivo está acessível;
- o backup pertence ao banco correto.

Depois que o banco mudar, criar o backup pós-operação quando exigido.

============================================================
15. DEPLOYS
============================================================

Antes de iniciar um deploy:

1. verificar se já existe deploy para o mesmo commit;
2. verificar se ele está em andamento;
3. verificar se foi concluído;
4. verificar se falhou;
5. verificar se o ambiente está correto.

Se já existir deploy correto em andamento:

- não iniciar outro;
- apenas acompanhar.

Se o deploy correto já estiver saudável:

- não publicar novamente;
- executar apenas validação pós-deploy.

Se o deploy estiver em commit diferente:

- interromper ou seguir o protocolo específico da tarefa;
- nunca assumir que está correto.

============================================================
16. CONTINUAÇÃO DE TAREFA
============================================================

Quando receber instruções como:

- continue;
- prossiga;
- finalize;
- retome;
- siga do ponto anterior;

antes de agir:

1. localizar o último checkpoint;
2. confirmar Git;
3. identificar a última operação concluída;
4. identificar a operação atômica em aberto;
5. continuar da primeira etapa ainda não concluída.

Não recomeçar a tarefa desde o início.

Não repetir preflight completo se o estado não mudou, exceto pelas verificações
mínimas exigidas antes da próxima operação de risco.

============================================================
17. NÃO EXPANDIR O ESCOPO
============================================================

Não aproveitar uma tarefa para:

- refatorar código não relacionado;
- corrigir todos os avisos;
- redesenhar interface;
- trocar arquitetura;
- atualizar dependências;
- instalar pacotes;
- alterar regras de negócio;
- criar novas permissões;
- criar novas integrações;
- adicionar recursos sugeridos;
- iniciar a próxima fase.

Problemas encontrados fora do escopo devem ser registrados.

Só corrigir problema fora do escopo quando ele bloquear diretamente a tarefa
e a correção for mínima, segura e necessária.

============================================================
18. AÇÕES EXTERNAS E IRREVERSÍVEIS
============================================================

A regra de otimização nunca autoriza automaticamente:

- push;
- deploy;
- envio de mensagem;
- alteração de produção;
- criação de credencial;
- ativação de integração;
- chamada de API externa;
- exclusão;
- restauração;
- alteração de dados reais.

Essas ações exigem autorização e protocolo próprios.

Não interpretar “concluir” como autorização automática para publicar.

============================================================
19. SEGREDOS E DADOS SENSÍVEIS
============================================================

Nunca solicitar, imprimir ou registrar:

- senha;
- token;
- cookie;
- Authorization;
- segredo;
- chave privada;
- MFA;
- credencial da Meta;
- dado pessoal completo desnecessário.

Se uma etapa depender desses dados:

- usar mecanismo seguro já existente;
- registrar a dependência;
- interromper quando não houver meio autorizado.

Se o usuário fornecer explicitamente uma credencial para um fluxo autorizado,
usar somente no formulário, endpoint ou mecanismo oficial indicado, sem
persistir, ecoar, documentar, colocar em URL, fixture, log, variável ou comando
Git.

============================================================
20. RELATÓRIO FINAL
============================================================

Quando houver otimizações relevantes, incluir uma seção curta:

OTIMIZAÇÕES DE EXECUÇÃO

Registrar somente:

- etapas repetidas evitadas;
- evidências anteriores reutilizadas;
- comandos corrigidos;
- instruções desatualizadas substituídas;
- ações não executadas por já estarem concluídas;
- loops evitados;
- divergências que causaram interrupção.

Não listar como otimização uma verificação de segurança obrigatória.

Não produzir justificativas longas.

============================================================
21. REGRA DE PARADA
============================================================

Interromper quando:

- o Git divergir de forma não explicada;
- o banco divergir;
- o dev.db mudar;
- surgir arquivo inesperado;
- houver risco de perda de dados;
- o comando exigir ação destrutiva não autorizada;
- a correção necessária alterar o escopo;
- houver interpretações funcionais diferentes;
- a mesma falha continuar sem nova evidência;
- houver dependência externa não autorizada;
- o deploy estiver em commit inesperado;
- a migration for destrutiva;
- uma instrução contrariar regra superior.

Ao interromper, entregar:

1. objetivo identificado;
2. divergência encontrada;
3. evidência observada;
4. ações já concluídas;
5. ações redundantes que não foram repetidas;
6. risco;
7. menor próxima ação segura.

============================================================
22. PRINCÍPIO FINAL
============================================================

Não obedecer mecanicamente cada frase.

Não ignorar requisitos por conveniência.

Não repetir trabalho comprovadamente concluído.

Não confiar cegamente em resultados antigos.

Não confundir segurança com redundância.

Não corrigir ambiguidades por adivinhação.

Não expandir o escopo.

Não entrar em loops.

Não desperdiçar tokens.

Executar a menor sequência segura capaz de atingir integralmente o objetivo
autorizado pelo usuário.
