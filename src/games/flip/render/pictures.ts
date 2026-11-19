import { STYLES } from '../core/types';

/** One colour per shape, the same on every theme (as Layer Pairs). Shape and style alone tell pictures apart. */
export const SHAPE_COLORS = ['#e5413b', '#2f6fe0', '#2e9e44', '#ee7d2a', '#8e4fd6', '#1f9fae', '#d23bb0', '#b8860b'];

/** Shape outlines in a 24-unit box centred on 12, 12. */
const PATHS = [
  'M12 4.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z',
  'M12 3.5L20.5 19H3.5z',
  'M5 5h14v14H5z',
  'M12 2.5L20 12L12 21.5L4 12z',
  'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  'M7.7 4.6h8.6L20.6 12l-4.3 7.4H7.7L3.4 12z',
  'M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z',
  'M6 4l6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6z',
];

/** A picture as inline SVG: shape (kind / STYLES) in its style (kind % STYLES): solid, ring, or two small ones. */
export function pictureSvg(kind: number): string {
  const shape = Math.floor(kind / STYLES);
  const style = kind % STYLES;
  const c = SHAPE_COLORS[shape];
  const d = PATHS[shape];
  let body: string;
  if (style === 0) body = `<path d="${d}" fill="${c}"/>`;
  else if (style === 1) body = `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round" transform="translate(12 12) scale(.88) translate(-12 -12)"/>`;
  else body = `<g fill="${c}"><path d="${d}" transform="translate(12 6.5) scale(.48) translate(-12 -12)"/><path d="${d}" transform="translate(12 17.5) scale(.48) translate(-12 -12)"/></g>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export const SHAPE_NAMES = ['circle', 'triangle', 'square', 'diamond', 'star', 'hexagon', 'plus', 'cross'];
export const STYLE_NAMES = ['solid', 'ring', 'twin'];
export const pictureName = (kind: number): string => `${STYLE_NAMES[kind % STYLES]} ${SHAPE_NAMES[Math.floor(kind / STYLES)]}`;
