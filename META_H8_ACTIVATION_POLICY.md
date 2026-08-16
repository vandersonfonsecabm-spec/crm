# H8 — Ativacao segura

1. Executar DB_PRECHECK, backup identificável e restore drill isolado do
   PostgreSQL oficial; ensaiar a migration no restore.
2. Aplicar codigo e migrations compativeis com flags OFF.
3. Rodar gate tenant e smoke antigo.
4. Criar configuracao H8 para tenant QA/demo, ainda sem worker global.
5. Habilitar uma replica do worker H8, processar evento sintetico controlado,
   provar dedupe, badge, deep link, leitura, adiamento e resolucao.
6. So entao habilitar o tenant alvo.

No estado atual, o recovery e o rehearsal foram concluídos, mas a revisão Sol
do delta transacional, a migration oficial e o canário ainda não foram
autorizados; a ativação permanece OFF.
