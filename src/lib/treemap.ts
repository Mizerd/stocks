export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

// How far the least square tile of a strip along `side` is from a square (1 is square).
function worst(strip: number[], side: number): number {
  const total = sum(strip);
  return Math.max((side * side * Math.max(...strip)) / (total * total), (total * total) / (side * side * Math.min(...strip)));
}

// Squarified treemap: rectangles with areas in proportion to `weights` (largest first, all above zero)
// filling a `width` x `height` box, laid out in strips that keep each one as close to square as it can.
export function treemap(weights: number[], width: number, height: number): Rect[] {
  const scale = (width * height) / sum(weights);
  const rects: Rect[] = [];
  let free: Rect = { x: 0, y: 0, w: width, h: height };

  // A strip along the shorter side of the free space, which then shrinks by its thickness.
  const place = (strip: number[]) => {
    const thickness = sum(strip) / Math.min(free.w, free.h);
    let offset = 0;
    for (const area of strip) {
      const length = area / thickness;
      rects.push(free.w >= free.h
        ? { x: free.x, y: free.y + offset, w: thickness, h: length }
        : { x: free.x + offset, y: free.y, w: length, h: thickness });
      offset += length;
    }
    free = free.w >= free.h
      ? { ...free, x: free.x + thickness, w: free.w - thickness }
      : { ...free, y: free.y + thickness, h: free.h - thickness };
  };

  let strip: number[] = [];
  for (const area of weights.map((w) => w * scale)) {
    const side = Math.min(free.w, free.h);
    if (strip.length === 0 || worst([...strip, area], side) <= worst(strip, side)) {
      strip.push(area);
    } else {
      place(strip);
      strip = [area];
    }
  }
  if (strip.length > 0) place(strip);
  return rects;
}
