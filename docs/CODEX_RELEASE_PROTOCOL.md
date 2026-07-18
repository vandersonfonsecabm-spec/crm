# Protocolo de releases do Codex

## Classificacao do lote

Antes de executar, classifique o lote como read-only, codigo local, migration,
configuracao ou producao. Aplique controles proporcionais ao risco.

## Preflight minimo

- Verifique branch, HEAD, origin, divergencia, worktree e `dev.db`.
- Verifique health somente quando producao estiver envolvida.
- Nao execute inventario completo sem necessidade.

## Inspecao

- Comece pelos arquivos indicados e examine qualquer diff existente antes de
  editar.
- Reutilize codigo antes de criar abstracao paralela.
- Nao analise o repositorio inteiro automaticamente nem faca limpeza ampla fora
  do escopo.

## Implementacao

- Mantenha uma responsabilidade principal por lote e nao amplie o escopo.
- Nao refatore modulos nao relacionados nem instale dependencias sem
  autorizacao.
- Codigo novo deve respeitar isolamento de tenant e feature flags.

## Testes progressivos

Execute nesta ordem:

1. Sintaxe ou teste minimo.
2. Teste focado.
3. Regressao diretamente relacionada.
4. Uma bateria final.

Apos falha, corrija somente a causa e repita somente o teste afetado. Nao repita
imediatamente toda a bateria. Interrompa apos duas falhas equivalentes.

## Banco e producao

- Crie backup somente quando houver escrita, migration, backfill ou ativacao;
  auditoria read-only nao exige backup.
- Ensaie migration ou operacao em copia e valide integridade antes e depois.
- Defina rollback antes de qualquer escrita.

## Frontend

- Qualquer alteracao visual exige a skill `interface-design`.
- Teste primeiro em 1366x768, 1440x900 e 1920x1080; use 900x768 somente como
  verificacao basica.
- Nao use automacao de desktop.

## Git

- Revise o diff, faca stage explicito e crie commit pequeno e focado.
- Push e deploy somente com autorizacao.
- Nao misture trabalho de outras branches.

## Checkpoint

Quando interrompido, entregue branch e HEAD, arquivos alterados, itens
concluidos, ponto exato da parada, teste pendente ou falho, acoes que nao devem
ser repetidas e o proximo passo minimo.

## Relatorio final

Entregue somente:

1. Estado inicial.
2. Implementacao.
3. Arquivos alterados.
4. Migration ou banco.
5. Testes.
6. Commit, push e deploy.
7. Estado final.
8. Limitacoes.
9. Proximo passo.

## Atualizacao do estado

Apos release concluida, atualize somente os itens realmente modificados em
`docs/CODEX_STATE.md`, sem reescrever todo o documento, e inclua a atualizacao
no commit da propria release.
