/**
 * Map pointer coordinates for CSS `object-fit: contain` media inside a box.
 * Backend homography uses percentages of **intrinsic** video / floor image pixels.
 */

export interface ContainedRect {
  offsetX: number;
  offsetY: number;
  drawW: number;
  drawH: number;
}

/**
 * Pixel rectangle (relative to container top-left) where `object-contain` draws the media.
 */
export function containedRect(
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
): ContainedRect {
  if (containerW <= 0 || containerH <= 0 || mediaW <= 0 || mediaH <= 0) {
    return { offsetX: 0, offsetY: 0, drawW: Math.max(containerW, 1), drawH: Math.max(containerH, 1) };
  }
  const scale = Math.min(containerW / mediaW, containerH / mediaH);
  const drawW = mediaW * scale;
  const drawH = mediaH * scale;
  return {
    offsetX: (containerW - drawW) / 2,
    offsetY: (containerH - drawH) / 2,
    drawW,
    drawH,
  };
}

/**
 * Map a viewport click to intrinsic media coordinates as 0–100% (clamped to the visible frame).
 */
export function clientPointToIntrinsicPercent(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  mediaW: number,
  mediaH: number,
): [number, number] | null {
  const cw = containerRect.width;
  const ch = containerRect.height;
  if (cw <= 0 || ch <= 0 || mediaW <= 0 || mediaH <= 0) return null;

  const relX = clientX - containerRect.left;
  const relY = clientY - containerRect.top;
  const { offsetX, offsetY, drawW, drawH } = containedRect(cw, ch, mediaW, mediaH);
  const x = Math.min(Math.max(relX, offsetX), offsetX + drawW);
  const y = Math.min(Math.max(relY, offsetY), offsetY + drawH);
  const u = (x - offsetX) / drawW;
  const v = (y - offsetY) / drawH;
  return [Math.round(u * 1000) / 10, Math.round(v * 1000) / 10];
}

/**
 * Position intrinsic % points as % of the container (for overlays aligned with the card).
 */
export function intrinsicPercentToDisplayPercent(
  intrinsicX: number,
  intrinsicY: number,
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
): [number, number] {
  if (containerW <= 0 || containerH <= 0 || mediaW <= 0 || mediaH <= 0) {
    return [intrinsicX, intrinsicY];
  }
  const { offsetX, offsetY, drawW, drawH } = containedRect(containerW, containerH, mediaW, mediaH);
  const x = offsetX + (intrinsicX / 100) * drawW;
  const y = offsetY + (intrinsicY / 100) * drawH;
  return [(x / containerW) * 100, (y / containerH) * 100];
}
