"use strict";

const { execFileSync } = require("node:child_process");

const raw = execFileSync("cmd.exe", ["/c", "railway status --project ddfbf66c-e274-47b1-9493-286232d2f426 --environment production --json"], { encoding: "utf8" });
const data = JSON.parse(raw);
const services = [];
for (const envEdge of data.environments?.edges || []) {
  for (const instanceEdge of envEdge.node?.serviceInstances?.edges || []) {
    const node = instanceEdge.node;
    const deployment = node.latestDeployment || node.activeDeployments?.[0] || null;
    services.push({
      serviceName: node.serviceName,
      serviceId: node.serviceId,
      deploymentId: deployment?.id || null,
      deploymentStatus: deployment?.status || null,
      instanceStatuses: (deployment?.instances || []).map((item) => item.status),
      commitHash: deployment?.meta?.commitHash || null,
      branch: deployment?.meta?.branch || null,
      createdAt: deployment?.createdAt || null,
    });
  }
}
console.log(JSON.stringify({ project: data.name, environment: data.environments?.edges?.[0]?.node?.name || null, services }, null, 2));
