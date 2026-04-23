/**
 * Canvas helper functions for drawing, smoothing, and export.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Apply quadratic bezier smoothing to a set of points.
 * Uses midpoints between consecutive points as control points.
 */
export function drawSmoothLine(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  lineWidth: number
): void {
  if (points.length === 0) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (points.length === 1) {
    // Single tap produces a dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }

  // Draw the last segment
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/**
 * Export canvas to PNG base64 data URI.
 */
export function exportCanvasToPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * Get canvas coordinates from a mouse/touch event,
 * accounting for retina scaling and element size.
 */
export function getCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/**
 * Check if a touch event originated at the very edge of the canvas
 * (potential palm contact). Returns true if the touch should be rejected.
 */
export function isPalmTouch(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  edgeThreshold: number = 10
): boolean {
  const rect = canvas.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  return (
    relX < edgeThreshold ||
    relX > rect.width - edgeThreshold ||
    relY < edgeThreshold ||
    relY > rect.height - edgeThreshold
  );
}
