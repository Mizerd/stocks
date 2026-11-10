import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { brand } from './src/config/brand';

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

export default defineConfig({
  plugins: [react(), brandHtml()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
