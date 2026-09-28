import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // POR QUÉ: al subir una versión nueva, Vercel renombra los archivos JS del
  // sistema. La pestaña que quedó abierta con la versión vieja los sigue
  // pidiendo con el nombre anterior → 404 → "Error crítico".
  // Con `deploymentId`, cada pedido de archivo viaja firmado con la versión que
  // tiene esa pestaña (`?dpl=`) y Vercel le sigue sirviendo SU versión.
  // OJO: además hay que activar "Skew Protection" en el panel de Vercel; sin
  // eso Vercel ignora el `?dpl=` (esta línea no rompe nada, pero no alcanza).
  // En local la variable no existe y queda `undefined`, que es válido.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
};

export default nextConfig;
