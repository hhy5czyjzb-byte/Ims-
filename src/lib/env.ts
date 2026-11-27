/** Centrale, getypeerde toegang tot configuratie. */
export const env = {
  isProduction: process.env.NODE_ENV === "production",
  azure: {
    tenantId: process.env.AZURE_AD_TENANT_ID ?? "",
    clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
  },
  groups: {
    kam: process.env.ENTRA_GROUP_KAM || undefined,
    directie: process.env.ENTRA_GROUP_DIRECTIE || undefined,
    middenkader: process.env.ENTRA_GROUP_MIDDENKADER || undefined,
  },
  sharePoint: {
    siteId: process.env.SHAREPOINT_SITE_ID ?? "",
    driveId: process.env.SHAREPOINT_DRIVE_ID ?? "",
  },
};

export const azureConfigured = !!(env.azure.tenantId && env.azure.clientId && env.azure.clientSecret);

/** Ontwikkel-login: alleen lokaal, nooit in productie. */
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true" && !env.isProduction;

export const sharePointConfigured = !!env.sharePoint.driveId;
