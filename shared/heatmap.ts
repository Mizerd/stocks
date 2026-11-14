// The heatmap's slow-changing data, gathered by scripts/heatmap-data.mjs into public/data/heatmap.json.
export interface HeatmapStockMeta {
  // ICB key, see shared/icb.ts.
  industry: string;
  // Shares of this line (Nordic, Euronext, Baltic); US sizes come from the quote's market cap instead.
  shares?: number;
  // File id in /logos/<id>.svg.
  logo?: string;
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
