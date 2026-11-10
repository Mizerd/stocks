import type { History } from '../../shared/types';

export interface AlignedCloses {
  times: number[];
  // One list of closes per history, each as long as `times`; empty for a missing history.
  closes: number[][];
}

// Exchanges trade on different days and some histories are shorter, so every series is put on
// the union of dates from the latest first date onwards, carrying the last close over gaps.
export function alignCloses(histories: (History | undefined)[]): AlignedCloses {
  const visible = histories.map((history) => history?.candles.slice(history.warmup) ?? []);
  const loaded = visible.filter((candles) => candles.length > 0);
  if (loaded.length === 0) return { times: [], closes: histories.map(() => []) };

  const start = Math.max(...loaded.map((candles) => candles[0].t));
  const allTimes = loaded.flat().map((candle) => candle.t).filter((t) => t >= start);
  const times = [...new Set(allTimes)].sort((a, b) => a - b);

  const closes = visible.map((candles) => {
    if (candles.length === 0) return [];
    let i = 0;
    return times.map((t) => {
      while (i + 1 < candles.length && candles[i + 1].t <= t) i++;
      return candles[i].c;
    });
  });
  return { times, closes };
}
