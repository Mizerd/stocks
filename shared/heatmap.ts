// The heatmap's slow-changing data, gathered by scripts/heatmap-data.mjs into public/data/heatmap.json.
export interface HeatmapStockMeta {
  // ICB key, see shared/icb.ts.
  industry: string;
  // Shares of this line (Nordic, Euronext, Baltic); US sizes come from the quote's market cap instead.
  shares?: number;
  // File id in /logos/<id>.svg, the logo's width over its height, and "badge" for a logo shown in its own colours
  // on a light badge (light lettering on a filled shape, which a one-colour mask would fill in).
  logo?: string;
  logoRatio?: number;
  logoMode?: 'badge';
  // The same company is already shown through another line.
  secondary?: true;
}

export interface HeatmapMeta {
  // The day the script ran.
  built: string;
  // The day each source's share counts are from.
  sharesAsOf: Record<'nordic' | 'euronext' | 'baltic', string>;
  // By site symbol ("AAPL", "NOKIA.HE", "ASML.AS", "AKO1L.VS").
  stocks: Record<string, HeatmapStockMeta>;
}
