/** Public identity shared by product chrome and legal documents. */
export const brand = {
  productName: process.env.NEXT_PUBLIC_APP_NAME ?? "Vozko Tickets",
  parentName: "Vozko",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME ?? "Vozko",
  cnpj: process.env.NEXT_PUBLIC_LEGAL_CNPJ?.trim() || undefined,
  legalAddress: process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim() || undefined,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://vozkoia.com",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "suporte@vozkoia.com",
  dpoEmail: process.env.NEXT_PUBLIC_DPO_EMAIL ?? "dpo@vozkoia.com",
} as const;
