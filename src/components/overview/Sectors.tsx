import { useT } from '../../i18n';
import { useFormat } from '../../lib/format';
import type { SectorMove } from '../../lib/market';
import { useSettings } from '../../settings';
import { PanelTitle } from '../ui';

// Column and row spans of the tiles, largest sector first: 5x2, then 4/3, 4/3, then four of 3.
const SPANS = [[5, 2], [4, 1], [3, 1], [4, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1]];

function tileColours(changePct: number, dark: boolean) {
  const tone = changePct >= 0 ? 'var(--up)' : 'var(--down)';
  const size = Math.abs(changePct);
  // Mixed in oklch so the tints keep their hue instead of turning muddy.
  if (size < 0.3) return { background: `color-mix(in oklch, ${tone} 14%, var(--card))`, color: 'var(--ink)' };
  if (size < 0.7) return { background: `color-mix(in oklch, ${tone} 28%, var(--card))`, color: 'var(--ink)' };
  // Solid colour would glare on the dark theme, so it gets a strong tint instead.
  if (dark) return { background: `color-mix(in oklch, ${tone} 58%, var(--card))`, color: 'var(--ink)' };
  return { background: tone, color: 'var(--paper)' };
}

export function Sectors({ sectors }: { sectors: SectorMove[] }) {
  const { t } = useT();
  const f = useFormat();
  const { theme } = useSettings();
  return (
    <div className="pnl" style={{ flex: '1 1 460px' }}>
      <PanelTitle>{t('overview.sectors')}</PanelTitle>
      <p className="pnl-note" style={{ marginBottom: 14 }}>{t('overview.sectorsNote')}</p>
      <div className="hm">
        {sectors.slice(0, SPANS.length).map((s, i) => (
          <div
            key={s.sector}
            className="tile"
            style={{ gridArea: `span ${SPANS[i][1]} / span ${SPANS[i][0]}`, ...tileColours(s.changePct, theme === 'dark') }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{t(`overview.sec.${s.sector}`)}</span>
            <span className="num" style={{ fontSize: i === 0 ? 28 : 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{f.pct(s.changePct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
