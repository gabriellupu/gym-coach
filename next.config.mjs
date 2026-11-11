/** Static export: the whole app is client-side, so it can live on any HTTPS static host (WebXR needs HTTPS). */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export default {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  devIndicators: false,
  agentRules: false,
};
