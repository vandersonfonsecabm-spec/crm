export function isLeadsCommunicationEnabled() {
  return import.meta.env.VITE_LEADS_COMMUNICATION_ENABLED === "true";
}

export function isSiteLeadCaptureEnabled() {
  return isLeadsCommunicationEnabled() && import.meta.env.VITE_SITE_LEAD_CAPTURE_ENABLED === "true";
}

export function resolveTenantFeatureAccess(capabilities?: {
  leadsCommunication?: boolean;
  siteLeadCapture?: boolean;
}) {
  return {
    leadsCommunication: isLeadsCommunicationEnabled() && capabilities?.leadsCommunication === true,
    siteLeadCapture: isSiteLeadCaptureEnabled() && capabilities?.siteLeadCapture === true,
  };
}
