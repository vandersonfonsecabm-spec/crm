const { Prisma } = require("@prisma/client");

function dashboardScoreQuery(empresaId) {
  return Prisma.sql`
    SELECT AVG(
      CASE
        WHEN score > 100 THEN 100
        WHEN score < 0 THEN 0
        ELSE score
      END
    ) AS "averageScore"
    FROM (
      SELECT
        45
        + CASE WHEN "quente" THEN 20 ELSE 0 END
        + CASE WHEN "favorito" THEN 10 ELSE 0 END
        + CASE WHEN "valorInformado" AND "valor" >= 12000 THEN 15 ELSE 0 END
        + CASE WHEN "status" = 'Proposta' THEN 10 ELSE 0 END
        + CASE WHEN "status" = 'Fechado' THEN 20 ELSE 0 END
        - CASE WHEN "status" = 'Perdido' THEN 25 ELSE 0 END
        - CASE WHEN "ultimoContato" >= 7 THEN 10 ELSE 0 END
        AS score
      FROM "Cliente"
      WHERE "empresaId" = ${empresaId}
        AND "arquivadoEm" IS NULL
    ) AS scored
  `;
}

module.exports = { dashboardScoreQuery };
