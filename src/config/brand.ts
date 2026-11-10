// The one place the public name lives. Change these values to rebrand the site;
// index.html picks them up at build time and every component reads them from here.
export const brand = {
  name: 'Varpas',
  shortName: 'Varpas',
  tagline: {
    lt: 'akcijų kainų sekimas ir vizualizavimas',
    en: 'stock price tracking and visualisation',
  },
  description: {
    lt: 'JAV, Europos ir Baltijos šalių akcijų kainos, grafikai ir palyginimai.',
    en: 'Prices, charts and comparisons for US, European and Baltic stocks.',
  },
  // Used in <title>: "Page — Name".
  titleSeparator: ' — ',
  // Absolute URL of the deployed site, for social sharing tags. Leave empty if unknown.
  siteUrl: '',
  // Path of the social sharing image inside /public, or empty for none.
  shareImage: '',
  // SVG paths of the logo mark, drawn on a 32 x 32 grid.
  logo: {
    outline: 'M16 4.5c-5 0-8 3.9-8 9.2v5.6L5.5 23h21L24 19.3v-5.6c0-5.3-3-9.2-8-9.2z',
    detail: 'M16 2v2.5M3.5 23h25',
    dot: { cx: 16, cy: 27, r: 2.2 },
  },
};

export type Lang = 'lt' | 'en';
