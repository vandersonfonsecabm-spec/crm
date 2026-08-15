# H8 — Ativacao segura

1. Aplicar codigo e migrations compativeis com flags OFF.
2. Executar backup e restore drill do PostgreSQL oficial.
3. Rodar gate tenant e smoke antigo.
4. Criar configuracao H8 para tenant QA/demo, ainda sem worker global.
5. Habilitar uma replica do worker H8, processar evento sintetico controlado,
   provar dedupe, badge, deep link, leitura, adiamento e resolucao.
6. So entao habilitar o tenant alvo.

No estado atual, a etapa 2 nao pode ser comprovada e a ativacao permanece OFF.
