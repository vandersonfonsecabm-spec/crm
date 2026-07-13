# NestJS legado congelado

Os diretórios `src/` e `prisma/` da raiz contêm uma arquitetura NestJS com Prisma/PostgreSQL que nao e utilizada pelo frontend atual.

Status oficial:

- legado congelado;
- fora do runtime, build e deploy operacional;
- nao suportado;
- testes, lint e migrations nao sao considerados confiaveis;
- nao deve receber novas funcionalidades;
- nao deve ser usado em producao ou como fonte de verdade.

O código foi preservado apenas para uma auditoria futura independente. Sua eventual correcao, migracao ou remocao exige outro lote controlado.

Os comandos remanescentes usam exclusivamente o prefixo `legacy:nest:*`. Eles preservam acesso tecnico ao codigo, mas nao afirmam que o backend esteja seguro ou funcional.
