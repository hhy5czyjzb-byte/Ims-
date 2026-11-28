import type { NextConfig } from "next";

// Security headers (OWASP). CSP staat bewust strikt; pas aan als er externe bronnen bijkomen.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // Import van registers (Excel → gekoppelde regels) kan groter zijn dan de standaard 1 MB. Op Vercel geldt
  // daarnaast max. 4,5 MB per verzoek; Word-documenten worden daarom in de browser omgezet en in delen verstuurd.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // pptxgenjs (PowerPoint maken in de browser) importeert node:fs/node:https alleen in Node; in de browser negeren.
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:(fs|https)$/, (r: { request: string }) => (r.request = r.request.replace(/^node:/, ""))),
      );
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, https: false };
    }
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
