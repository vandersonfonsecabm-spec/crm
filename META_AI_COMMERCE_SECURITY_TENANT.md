# Segurança, tenant e privacidade

- Todas as novas entidades carregam `empresaId`; referências comerciais usam
  FKs compostas e rechecagem server-side.
- Tenant, actor, conversa, recipient e preço nunca são escolhidos pelo mock ou
  por eventual provider; o backend resolve e valida.
- `requestedTools`, argumentos, offerIds, links, catálogo e mensagens são
  untrusted hints. O registry é allowlist estática e a resposta é montada de
  evidência validada.
- Prompt injection bloqueia a decisão e gera handoff seguro; não executa tool.
- URLs customer-facing exigem HTTPS, domínio allowlisted, sem credencial,
  redirect ou rede privada; nenhum servidor busca imagens/URLs fornecidas.
- Contexto é limitado a 20 mensagens/bytes, redigido e sem segredo, custo,
  margem, token, cookie, prompt bruto ou chain-of-thought.
- Retenção padrão de evidência AI é finita (30 dias), com idempotency e audit
  mínimo preservados.
- SHADOW é dry-run; SUGGESTION_ONLY só mostra; HUMAN_APPROVAL exige ação
  granular. Nenhum caminho chama `MensagemCanal` de saída.
- O gate global/env + `EmpresaFuncionalidade.AI_COMMERCE` + settings/allowlist
  é deny-by-default. Ausência de qualquer gate mantém OFF.
