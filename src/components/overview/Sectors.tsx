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
  if (size < 0.3) return { background: `color-mix(in oklab, ${tone} 14%, var(--card))`, color: 'var(--ink)' };
  if (size < 0.7) return { background: `color-mix(in oklab, ${tone} 28%, var(--card))`, color: 'var(--ink)' };
  // Solid colour would glare on the dark theme, so it gets a strong tint instead.
  if (dark) return { background: `color-mix(in oklab, ${tone} 45%, var(--card))`, color: 'var(--ink)' };
  return { background: tone, color: 'var(--paper)' };
}

export function Sectors({ sectors }: { sectors: SectorMove[] }) {
  const { t } = useT();
  const f = useFormat();
  const { theme } = useSettings();
  return (
    <div className="pnl" style={{ flex: '1 1 460px', minWidth: 0 }}>
      <PanelTitle>{t('overview.sectors')}</PanelTitle>
      <p style={{ margin: '2px 0 14px', fontSize: 12.5, color: 'var(--ink3)' }}>{t('overview.sectorsNote')}</p>
      <div className="hm" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridAutoRows: 124, gridAutoFlow: 'dense', gap: 3 }}>
        {sectors.slice(0, SPANS.length).map((s, i) => (
          <div
            key={s.sector}
            className="tile"
            style={{
              gridArea: `span ${SPANS[i][1]} / span ${SPANS[i][0]}`, display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between', minWidth: 0, padding: '10px 12px', ...tileColours(s.changePct, theme === 'dark'),
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{t(`overview.sec.${s.sector}`)}</span>
            <span className="num" style={{ fontSize: i === 0 ? 26 : 14 }}>{f.pct(s.changePct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
