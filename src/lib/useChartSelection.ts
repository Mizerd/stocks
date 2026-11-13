import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { nearestIndex } from './chart';

// How far a pointer may drift between press and release and still count as a click or tap.
const CLICK_SLOP = 6;
// How close to the bubble a tap must land to pin or unpin it, in pixels.
const BUBBLE_REACH = 22;

type PlotPointer = PointerEvent<HTMLElement>;

const noSelecting = (event: Event) => event.preventDefault();
export type Axis = 'x' | 'y' | null;

// Which way a finger is heading once it has left the slop: along the chart or scrolling the page.
export function dragAxis(dx: number, dy: number, slop = CLICK_SLOP): Axis {
  if (Math.hypot(dx, dy) < slop) return null;
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
}

// Whether a mouse that went down `dx` pixels away has dragged out a range rather than clicked.
export function isDrag(dx: number, slop = CLICK_SLOP): boolean {
  return Math.abs(dx) >= slop;
}

// Whether a touch at `x` pixels lands on the bubble resting at `share` of a plot `width` pixels wide.
export function onBubble(x: number, share: number | undefined, width: number, reach = BUBBLE_REACH): boolean {
  return share !== undefined && Math.abs(x - share * width) <= reach;
}

// Hover, click-to-anchor, drag-to-measure and touch selection over the points of a chart.
// `shares` is where each point sits across the plot (0 at its left edge, 1 at its right);
// a mouse further than `slack` past the first or last point selects nothing.
export function useChartSelection(shares: number[], slack: number) {
  const count = shares.length;
  const [hover, setHover] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  // Where the mouse went down, and the point under it; null when the button is up.
  const press = useRef<{ x: number; index: number } | null>(null);
  const dragging = useRef(false);
  // A range dragged out with the mouse stays put until the next click or Escape.
  const measured = useRef(false);
  // The point under each finger on the plot, by pointerId.
  const fingers = useRef(new Map<number, number>());
  const twoFingers = useRef(false);
  // A range made with two fingers lasts until the next touch; a pinned anchor stays.
  const ranged = useRef(false);
  const drag = useRef({ x: 0, y: 0, axis: null as Axis, onBubble: false, before: { hover, anchor } });

  function shareUnder(event: PlotPointer): number {
    const box = event.currentTarget.getBoundingClientRect();
    return (event.clientX - box.left) / box.width;
  }

  function clear() {
    measured.current = false;
    setHover(null);
    setAnchor(null);
  }

  function toggleAnchor(index: number) {
    ranged.current = false;
    measured.current = false;
    setAnchor(anchor === null ? index : null);
  }

  // ----- Mouse and pen -----

  function mouseDown(event: PlotPointer) {
    if (event.button !== 0) return;
    dragging.current = false;
    const index = nearestIndex(shares, shareUnder(event), slack);
    if (index === null) return;
    press.current = { x: event.clientX, index };
    // Captured, the drag goes on when the mouse slips past the plot's edge.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener('selectstart', noSelecting);
  }

  function mouseMove(event: PlotPointer) {
    const start = press.current;
    if (start && (dragging.current || isDrag(event.clientX - start.x))) {
      dragging.current = true;
      measured.current = true;
      setAnchor(start.index);
      setHover(nearestIndex(shares, shareUnder(event)));
      return;
    }
    if (!measured.current) setHover(nearestIndex(shares, shareUnder(event), slack));
  }

  function mouseUp(event: PlotPointer) {
    const start = press.current;
    release();
    if (dragging.current || event.button !== 0) return;
    if (measured.current) return clear();
    const index = nearestIndex(shares, shareUnder(event), slack);
    if (start && index !== null) toggleAnchor(index);
  }

  function release() {
    press.current = null;
    document.removeEventListener('selectstart', noSelecting);
  }

  // ----- Touch -----

  function showRange() {
    const [first, second] = [...fingers.current.values()];
    twoFingers.current = true;
    ranged.current = true;
    setAnchor(first);
    setHover(second);
  }

  function restore() {
    setHover(drag.current.before.hover);
    setAnchor(drag.current.before.anchor);
  }

  function touchDown(event: PlotPointer) {
    const index = nearestIndex(shares, shareUnder(event));
    if (index === null || fingers.current.size >= 2) return;
    fingers.current.set(event.pointerId, index);
    if (fingers.current.size === 2) return showRange();

    const box = event.currentTarget.getBoundingClientRect();
    const resting = hover === null ? undefined : shares[hover];
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      axis: null,
      onBubble: onBubble(event.clientX - box.left, resting, box.width),
      before: { hover, anchor },
    };
    if (ranged.current) setAnchor(null);
    if (!drag.current.onBubble) setHover(index);
  }

  function touchMove(event: PlotPointer) {
    if (!fingers.current.has(event.pointerId)) return;
    const index = nearestIndex(shares, shareUnder(event));
    if (index === null) return;
    fingers.current.set(event.pointerId, index);
    if (twoFingers.current) {
      if (fingers.current.size === 2) showRange();
      return;
    }
    const gesture = drag.current;
    gesture.axis ??= dragAxis(event.clientX - gesture.x, event.clientY - gesture.y);
    if (gesture.axis === 'x') setHover(index);
    if (gesture.axis === 'y') restore();
  }

  function touchUp(event: PlotPointer) {
    if (!fingers.current.delete(event.pointerId) || fingers.current.size > 0) return;
    if (twoFingers.current) {
      twoFingers.current = false;
      return;
    }
    const tapped = drag.current.axis === null;
    if (tapped && drag.current.onBubble && hover !== null) toggleAnchor(hover);
  }

  function touchCancel(event: PlotPointer) {
    if (!fingers.current.delete(event.pointerId)) return;
    if (fingers.current.size === 0 && twoFingers.current) twoFingers.current = false;
    // iOS cancels the touch the moment it decides the gesture scrolls the page.
    else if (!twoFingers.current && drag.current.axis !== 'x') restore();
  }

  useEffect(() => {
    const plot = layer.current;
    if (!plot) return;
    // touch-action alone does not stop iOS scrolling or zooming once a drag is under way.
    const holdPage = (event: TouchEvent) => {
      const ours = event.touches.length > 1 || drag.current.axis === 'x';
      if (ours && event.cancelable) event.preventDefault();
    };
    // A scroll ends in pointercancel, so only a real tap outside the plot gets here.
    const tapOutside = (event: globalThis.PointerEvent) => {
      if (event.pointerType === 'touch' && !plot.contains(event.target as Node)) clear();
    };
    plot.addEventListener('touchmove', holdPage, { passive: false });
    document.addEventListener('pointerup', tapOutside);
    return () => {
      plot.removeEventListener('touchmove', holdPage);
      document.removeEventListener('pointerup', tapOutside);
      document.removeEventListener('selectstart', noSelecting);
    };
  }, []);

  // ----- Handlers -----

  const isTouch = (event: PlotPointer) => event.pointerType === 'touch';

  function onPointerDown(event: PlotPointer) {
    if (isTouch(event)) return touchDown(event);
    mouseDown(event);
  }

  function onPointerMove(event: PlotPointer) {
    if (isTouch(event)) return touchMove(event);
    mouseMove(event);
  }

  function onPointerUp(event: PlotPointer) {
    if (isTouch(event)) return touchUp(event);
    mouseUp(event);
  }

  function onPointerCancel(event: PlotPointer) {
    if (isTouch(event)) touchCancel(event);
    else release();
  }

  function onPointerLeave(event: PlotPointer) {
    // A finger "leaves" the moment it lifts, and its bubble stays to be read.
    if (!isTouch(event) && !measured.current) setHover(null);
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
      ref: layer,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onKeyDown,
      onBlur: () => (measured.current ? clear() : setHover(null)),
    },
  };
}
