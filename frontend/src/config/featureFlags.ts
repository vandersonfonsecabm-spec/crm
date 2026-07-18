export function isLeadsCommunicationEnabled() {
  return import.meta.env.VITE_LEADS_COMMUNICATION_ENABLED === "true";
}

export function isSiteLeadCaptureEnabled() {
  return isLeadsCommunicationEnabled() && import.meta.env.VITE_SITE_LEAD_CAPTURE_ENABLED === "true";
}

export function isNegociosKanbanEnabled() {
  return import.meta.env.VITE_NEGOCIOS_KANBAN_ENABLED === "true";
}

export function resolveTenantFeatureAccess(capabilities?: {
  leadsCommunication?: boolean;
  siteLeadCapture?: boolean;
  negociosKanban?: boolean;
}) {
  return {
    leadsCommunication: isLeadsCommunicationEnabled() && capabilities?.leadsCommunication === true,
    siteLeadCapture: isSiteLeadCaptureEnabled() && capabilities?.siteLeadCapture === true,
    negociosKanban: isNegociosKanbanEnabled() && capabilities?.negociosKanban === true,
  };
}
