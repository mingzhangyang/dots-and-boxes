export const DOT_RADIUS = 6;
export const HIT_RADIUS = 40;
export const LINE_WIDTH = 6;

export const getColors = (isDark: boolean) => ({
  p1: '#f43f5e',
  p2: '#0ea5e9',
  p1Bg: isDark ? 'rgba(244, 63, 94, 0.25)' : 'rgba(244, 63, 94, 0.15)',
  p2Bg: isDark ? 'rgba(14, 165, 233, 0.25)' : 'rgba(14, 165, 233, 0.15)',
  dot: isDark ? '#334155' : '#cbd5e1',
  dotHover: isDark ? '#64748b' : '#94a3b8',
  boardBg: isDark ? '#0f172a' : '#ffffff',
});
