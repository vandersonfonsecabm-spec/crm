const requestedCommand = process.argv[2] || "runtime";

console.error(
  [
    `Comando raiz bloqueado: ${requestedCommand}.`,
    "O unico backend operacional esta em backend/ e usa Express.",
    "Use npm run backend:start ou npm run backend:dev na raiz.",
  ].join("\n"),
);

process.exitCode = 1;
