# H8 — Acessibilidade

- Sino e botao nativo com nome `Notificações` e quantidade somente quando
  confirmada; sem badge 0 durante carregamento inicial.
- Painel usa dialog rotulado, Escape, retorno de foco, lista semantica e alvos
  de teclado.
- Itens distinguem nao lida por texto, peso e marcador, nao somente cor.
- “Marcar todas como lidas” e separado de resolver; “Lembrar depois” e acao
  secundaria explicita.
- Drawer mobile preserva rolagem interna e targets touch.

Automacao axe nao estava exposta; a validacao de DOM/foco foi feita por contrato
focal e build TypeScript. QA autenticado final depende do canario habilitado.
