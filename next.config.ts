import type { NextConfig } from "next";

const securityHeaders = [
  // Fuerza HTTPS en visitas posteriores (2 años). Sin `preload` para no
  // comprometerse con la lista de precarga de navegadores.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // El navegador no "adivina" el tipo de contenido.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Anti-clickjacking: nadie puede embeber la app en un <iframe>.
  { key: "X-Frame-Options", value: "DENY" },
  // No filtrar la URL completa como Referer hacia otros orígenes.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Apagar APIs del navegador que la app no usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
