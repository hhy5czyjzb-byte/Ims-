import type { Metadata } from "next";
import "./globals.css";
import { brand } from "@/theme/brand";

export const metadata: Metadata = {
  title: { default: brand.appName, template: `%s · ${brand.appName}` },
  description: "Integraal managementsysteem voor alle certificeringen van Rouwmaat Groep",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
