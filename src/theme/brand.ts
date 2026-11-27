/**
 * Centrale huisstijl Rouwmaat Groep (bron: huisstijlblad, /docs/huisstijl.pdf).
 *
 * Eén bron voor kleuren, lettertype en logo. Gebruikt door de webapp
 * (via CSS-variabelen in globals.css), en later door de PowerPoint-
 * directiebeoordeling en e-mail/Teams-meldingen. Wijzig kleuren hier én in
 * globals.css (@theme) — de test in brand.test.ts controleert dat ze gelijk zijn.
 */
export const brand = {
  companyName: "Rouwmaat Groep",
  appName: "IMS Rouwmaat Groep",
  colors: {
    red: "#e30613", // Rood — hoofdkleur
    redDark: "#c00d0d", // Donker rood
    greyLight: "#d1d3d4", // Licht grijs
    greyDark: "#bcbcbb", // Donker grijs
    white: "#ffffff",
    black: "#000000",
  },
  font: {
    family: "Fira Sans",
    weights: { thin: 100, light: 300, regular: 400, medium: 500, bold: 700 },
  },
  logo: {
    // Logo kleur: op witte achtergrond. Logo wit: op rode/gekleurde achtergrond.
    color: "/brand/logo-kleur.png",
    white: "/brand/logo-wit.png",
  },
  /** Kleuren voor de risicomatrix (laag → zeer hoog). */
  riskColors: {
    low: "#3fa34d",
    medium: "#f2c12e",
    high: "#f08a24",
    veryHigh: "#e30613",
  },
} as const;

export type Brand = typeof brand;
