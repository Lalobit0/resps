import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs se usa en el servidor para leer el texto de los PDF: sin esto el
  // empaquetado lo rompe y las páginas salen "sin texto".
  serverExternalPackages: ["better-sqlite3", "pdfjs-dist"],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Las cargas pasan por Server Actions y el tope por defecto es 1 MB: un PDF
    // con muchas responsivas o un lote de escaneos lo supera de sobra.
    serverActions: { bodySizeLimit: "100mb" },
  },
  webpack: (config) => {
    // pdfjs-dist referencia "canvas" (solo para Node); en el navegador no se usa.
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
};

export default nextConfig;
