import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

// How far a pointer may drift between press and release and still count as a click.
const CLICK_SLOP = 6;

type PlotPointer = PointerEvent<HTMLElement>;

// Hover, click-to-anchor and two-finger range selection over the points of a chart.
// `indexAt` maps a horizontal share of the plot (0 at its left edge, 1 at its right) to a point.
export function useChartSelection(count: number, indexAt: (share: number) => number | null) {
  const [hover, setHover] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  // The point under each finger on the plot, by pointerId.
  const fingers = useRef(new Map<number, number>());
  const twoFingers = useRef(false);
  const pressedAt = useRef(0);

  function indexUnder(event: PlotPointer): number | null {
    const box = event.currentTarget.getBoundingClientRect();
    return indexAt((event.clientX - box.left) / box.width);
  }

  function clear() {
    setHover(null);
    setAnchor(null);
  }

  function toggleAnchor(index: number) {
    setAnchor(anchor === null ? index : null);
  }

  function follow(event: PlotPointer) {
    const index = indexUnder(event);
    if (event.pointerType === 'touch' && index !== null) fingers.current.set(event.pointerId, index);
    if (fingers.current.size === 2) {
      const [first, second] = [...fingers.current.values()];
      twoFingers.current = true;
      setAnchor(first);
      setHover(second);
    } else if (!twoFingers.current) {
      setHover(index);
    }
  }

  function onPointerDown(event: PlotPointer) {
    pressedAt.current = event.clientX;
    follow(event);
  }

  function liftFinger(event: PlotPointer) {
    fingers.current.delete(event.pointerId);
    if (twoFingers.current) setAnchor(null);
    if (fingers.current.size === 0) twoFingers.current = false;
    setHover(null);
  }

  function onPointerUp(event: PlotPointer) {
    const index = indexUnder(event);
    const clicked = event.button === 0 && Math.abs(event.clientX - pressedAt.current) < CLICK_SLOP;
    if (clicked && index !== null && !twoFingers.current) toggleAnchor(index);
    if (event.pointerType === 'touch') liftFinger(event);
  }

  function onPointerLeave(event: PlotPointer) {
    // A finger leaves by lifting, which onPointerUp already handles.
    if (event.pointerType !== 'touch') setHover(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') return clear();
    const current = hover ?? anchor ?? count - 1;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      return toggleAnchor(current);
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' ? -1 : 1;
    const started = hover !== null || anchor !== null;
    setHover(started ? Math.min(count - 1, Math.max(0, current + step)) : current);
  }

  // Fresh data can have fewer points than the selection was made on.
  const inRange = (index: number | null) => (index !== null && index < count ? index : null);

  return {
    hover: inRange(hover),
    anchor: inRange(anchor),
    handlers: {
      onPointerDown,
      onPointerMove: follow,
      onPointerUp,
      onPointerCancel: liftFinger,
      onPointerLeave,
      onKeyDown,
      onBlur: () => setHover(null),
    },
  };
}
