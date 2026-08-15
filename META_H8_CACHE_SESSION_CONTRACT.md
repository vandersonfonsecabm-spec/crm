# H8 — Sessao e cache

O componente usa AbortController no ciclo de vida, refresh por foco e polling de
30 segundos. Falha de refresh preserva o ultimo badge conhecido; 404/403 esconde
a superficie para usuarios sem acesso. Ao desmontar/logout, requests pendentes
sao abortados e nenhum estado e gravado em localStorage. A chave de identidade e
fornecida pelo token autenticado do cliente; o backend filtra sempre por tenant e
destinatario.
