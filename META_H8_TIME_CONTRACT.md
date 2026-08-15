# H8 — Tempo

Instantes sao persistidos em DateTime/ISO e comparados por instante absoluto.
Antecedencia usa `venceEm - minutos`; adiamento 30/60 usa duracao absoluta.
“Amanha” usa o proximo dia civil em `America/Sao_Paulo` as 09:00. A mesma
occurrence evolui de proxima para atrasada; o worker nao cria duplicatas por tick.
