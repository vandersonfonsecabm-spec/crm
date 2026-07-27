CREATE TABLE "PlatformTenantAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "actorUserId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "adminUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformTenantAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlatformTenantAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlatformTenantAudit_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PlatformTenantAudit_tenantId_createdAt_idx" ON "PlatformTenantAudit"("tenantId", "createdAt");
CREATE INDEX "PlatformTenantAudit_actorUserId_createdAt_idx" ON "PlatformTenantAudit"("actorUserId", "createdAt");
CREATE INDEX "PlatformTenantAudit_action_createdAt_idx" ON "PlatformTenantAudit"("action", "createdAt");
