// CoordinateMapper - utilities to convert between logical and scaled pixel spaces
// Keep tiny and dependency-free.

export function toScaledRect(rect, scale = 1) {
  if (!rect || !scale || scale === 1) return rect;
  return {
    top: rect.top * scale,
    left: rect.left * scale,
    width: rect.width * scale,
    height: rect.height * scale,
    right: (rect.left + rect.width) * scale,
    bottom: (rect.top + rect.height) * scale
  };
}

export function fromClientToLogical(point, scale = 1) {
  if (!point || !scale || scale === 1) return point;
  return { x: point.x / scale, y: point.y / scale };
}

export function clampScale(value, min = 0.25, max = 2) {
  const v = Number(value) || 1;
  return Math.min(max, Math.max(min, v));
}

export function worldToScreen(x, y, scale = 1) { return { x: x * scale, y: y * scale }; }
export function screenToWorld(x, y, scale = 1) { return { x: x / scale, y: y / scale }; }
