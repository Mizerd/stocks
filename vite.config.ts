import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { INDICES } from './shared/catalog';
import { MARKETS } from './shared/exchanges';
import { brand } from './src/config/brand';
import { CHART_RANGES, DEFAULT_RANGE, historyPath } from './src/lib/api';
import { earlyModules, earlyPaths, startEarly, type EarlyConfig } from './src/lib/early';

// Fills the %BRAND_*% placeholders in index.html from src/config/brand.ts.
function brandHtml(): Plugin {
  const shareTags = [
    brand.siteUrl && `<meta property="og:url" content="${brand.siteUrl}">`,
    brand.siteUrl && brand.shareImage && `<meta property="og:image" content="${brand.siteUrl}${brand.shareImage}">`,
  ].filter(Boolean).join('\n');
  return {
    name: 'brand-html',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%BRAND_NAME%', brand.name)
        .replaceAll('%BRAND_DESCRIPTION%', brand.description.en)
        .replace('%BRAND_SHARE_TAGS%', shareTags),
  };
}

// The installable-app manifest, built from the brand and the light theme's page colour.
function webManifest(): Plugin {
  let manifest = '';
  const build = (paper: string) => JSON.stringify({
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description.en,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: paper,
    theme_color: paper,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2);
  return {
    name: 'web-manifest',
    async buildStart() {
      const tokens = await this.fs.readFile('src/styles/tokens.css', { encoding: 'utf8' });
      manifest = build(/--paper:\s*(#[0-9a-f]{6})/i.exec(tokens)![1]);
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(manifest);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest });
    },
  };
}

// Starts the opened page's data requests and code downloads while the main bundle loads.
function earlyLoads(): Plugin {
  return {
    name: 'early-loads',
    transformIndexHtml: (_html, { bundle = {} }) => {
      // A chunk and the chunks it imports, short of the main bundle.
      const withImports = (file: string): string[] => {
        const chunk = bundle[file];
        return chunk.type === 'chunk' && !chunk.isEntry ? [file, ...chunk.imports.flatMap(withImports)] : [];
      };
      const pages = Object.fromEntries(Object.values(bundle).flatMap((chunk) => {
        const page = chunk.type === 'chunk' && chunk.isDynamicEntry && /\/src\/pages\/(\w+)\.tsx$/.exec(chunk.facadeModuleId ?? '');
        return page ? [[page[1].toLowerCase(), [...new Set(withImports(chunk.fileName))].map((file) => `/${file}`)]] : [];
      }));
      const config: EarlyConfig = { markets: MARKETS, indexHistory: historyPath(INDICES[0].symbol, '1D'), chartRanges: CHART_RANGES, defaultRange: DEFAULT_RANGE, pages };
      const start = `(${startEarly})((${earlyPaths})(location.pathname, location.search, config), (${earlyModules})(location.pathname, config))`;
      return [{ tag: 'script', children: `{ const config = ${JSON.stringify(config)}; ${start} }`, injectTo: 'head' }];
    },
  };
}

export default defineConfig({
  plugins: [react(), brandHtml(), webManifest(), earlyLoads()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
