"use strict";

const { runLocalStagingSoakLauncher } = require("./run-store1-staging-soak-job.cjs");

runLocalStagingSoakLauncher()
  .then((result) => {
    console.log(JSON.stringify({
      event: "store1_staging_soak_launcher",
      status: result.status,
      sourceSha: result.sourceSha,
      targetHost: result.targetHost,
      qaIdentities: result.qaIdentities,
      metrics: result.metrics,
      blockers: result.blockers,
      ledgerPath: result.ledgerPath,
    }, null, 2));
    if (result.status !== "PASS") process.exitCode = 1;
  })
  .catch((error) => {
    console.error(JSON.stringify({ event: "store1_staging_soak_launcher", safe: false, error: { code: String(error?.code || "SOAK_LAUNCHER_FAILED").slice(0, 80) } }));
    process.exitCode = 1;
  });
