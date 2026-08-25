# Política de retry dos canais Meta

WhatsApp, Instagram e Messenger permanecem desligados no ambiente atual. A
implementação agora deixa o caminho pronto para ativação futura sem introduzir
outbound, worker novo ou migration.

## Invariantes

- Intake e capability gates continuam antes de qualquer mutação.
- Cada evento aceito é reivindicado por CAS tenant/canal/provider/status/
  `updatedAt`.
- `tentativas` tem orçamento máximo 3 por padrão; o limite é bounded (1–5).
- A lease usa `updatedAt` como token durável e expira após 30 s por padrão,
  acima do timeout de processamento atual.
- P2028/timeout e falhas não classificadas são retryable; payload inválido,
  integridade e conflitos de domínio são permanentes (409).
- Backoff exponencial com jitter é limitado a 250 ms por tentativa no caminho
  síncrono atual; não existe loop infinito.
- Perda de lease ou CAS retorna 503 e nunca sobrescreve um processamento
  concluído.
- Ao esgotar tentativas o evento passa a `FALHOU` com `EXHAUSTED`; o canal não
  é reenviado automaticamente.
- Idempotência continua baseada em `empresaId`, canal, provider e
  `externalEventId`; cadeia de Cliente/Conversa/Mensagem não é duplicada.
- Códigos de falha são normalizados; payload, token, segredo e mensagem bruta
  não são persistidos nos campos de erro.

## Ativação futura

Antes de ligar qualquer capability Meta real, executar as suítes de ciclo dos
três provedores em sandbox e um canário tenant-scoped. Confirmar duplicidade,
falha P2028, payload permanente, lease vencida, exaustão e desligamento global.
Enquanto as flags estiverem OFF, nenhum evento Meta é criado pelo intake e
nenhuma mensagem externa é enviada.
