# H8 — Seguranca

- Rotas exigem `authenticate` e derivam tenant/usuario da sessao.
- Queries de listagem, leitura, adiamento e resolucao sao recipient-scoped.
- Alowlist de tipo/origem/destino e IDs positivos; source e target precisam
  corresponder exatamente.
- Titulo/corpo sao bounded (120/280) e renderizados como texto React.
- Nenhuma URL livre, payload de provider, token, CPF, telefone ou mensagem
  completa e persistida pela H8.
- Nenhum canal externo foi acionado.

Pendencia de release: executar testes negativos HTTP contra PostgreSQL oficial
apos o ambiente de canario estar autorizado.
