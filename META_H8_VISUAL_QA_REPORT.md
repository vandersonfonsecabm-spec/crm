# H8 — QA visual

`DESKTOP_1440_QA=NOT_RUN`
`DESKTOP_1366_QA=NOT_RUN`
`TABLET_1024_QA=NOT_RUN`
`MOBILE_390_QA=NOT_RUN`

Motivo: a configuracao por tenant e a flag global permanecem OFF e nao existe
sessao autenticada de canario segura neste ambiente. O CSS usa painel desktop
ancorado e drawer em telas estreitas; a prova visual publicada deve ser feita
apos habilitar um tenant de teste, sem dados reais.
