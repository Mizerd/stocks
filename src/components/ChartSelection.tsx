import { useT } from '../i18n';
import { pointDiff } from '../lib/chart';
import type { Point } from '../lib/chart';
import { direction, useFormat } from '../lib/format';

// A point of the chart with its place in the plot, in percent of the plot's width and height.
export interface Mark extends Point {
  left: number;
  top: number;
}

interface Props {
  hover: Mark | null;
  anchor: Mark | null;
  price: (value: number) => string;
  date: (time: number) => string;
}

function Marker({ mark, pinned, price, date }: { mark: Mark; pinned: boolean; price: string; date: string }) {
  const kind = pinned ? ' pinned' : '';
  const left = `${mark.left}%`;
  // Shifting a tag by the same share of its own width keeps it inside the plot at both edges.
  const shift = `-${mark.left}%`;
  return (
    <>
      <span className={`sel-line${kind}`} style={{ left }} />
      <span className={`sel-dot${kind}`} style={{ left, top: `${mark.top}%` }} />
      <span className={`num sel-tag${kind}`} style={{ left, top: 0, transform: `translateX(${shift})` }}>{price}</span>
      <span className={`num sel-tag${kind}`} style={{ left, bottom: -1, transform: `translate(${shift}, 100%)` }}>{date}</span>
    </>
  );
}

// Lines, dots and tags for the hovered and the anchored point. Fills the plot it is placed in.
export function ChartSelection({ hover, anchor, price, date }: Props) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {hover && anchor && (
        <span className="sel-span" style={{ left: `${Math.min(hover.left, anchor.left)}%`, width: `${Math.abs(hover.left - anchor.left)}%` }} />
      )}
      {anchor && <Marker mark={anchor} pinned price={price(anchor.c)} date={date(anchor.t)} />}
      {hover && <Marker mark={hover} pinned={false} price={price(hover.c)} date={date(hover.t)} />}
    </div>
  );
}

// One line above the plot: the change between the anchored and the hovered point.
export function SelectionReadout({ hover, anchor, price, date }: Props) {
  const { t } = useT();
  const f = useFormat();
  const diff = anchor && hover ? pointDiff(anchor, hover) : null;

  return (
    <div className="num sel-readout" aria-live="polite">
      {!anchor && <span className="sel-hint">{t('common.selHint')}</span>}
      {anchor && !diff && <span>{date(anchor.t)} · {price(anchor.c)}</span>}
      {diff && (
        <>
          <span>{date(diff.from.t)} → {date(diff.to.t)}</span>
          <span className={direction(diff.pct)} style={{ fontWeight: 600 }}>
            {f.signed(diff.change, 2, Math.abs(diff.from.c) < 10 ? 3 : 2)} ({f.pct(diff.pct)})
          </span>
        </>
      )}
    </div>
  );
}
