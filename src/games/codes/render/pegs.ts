/** Peg colours, spread apart so all eight stay tellable on light and dark themes. */
export const PEG_COLORS = ['#e5413b', '#2f6fe0', '#2e9e44', '#f2c12e', '#f07f1e', '#2cc4d6', '#d23bb0', '#7d4bd1'];
export const PEG_NAMES = ['red', 'blue', 'green', 'yellow', 'orange', 'cyan', 'magenta', 'purple'];

/** A shape for each colour, so the game can be played without telling colours apart. */
const SHAPES = [
  '<circle cx="12" cy="12" r="4"/>',
  '<path d="M12 7l5 9H7z"/>',
  '<rect x="8" y="8" width="8" height="8"/>',
  '<path d="M12 6l6 6-6 6-6-6z"/>',
  '<path d="M10.5 6h3v4.5H18v3h-4.5V18h-3v-4.5H6v-3h4.5z"/>',
  '<circle cx="12" cy="12" r="4.5" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="2.4"/>',
  '<rect x="6" y="10.5" width="12" height="3"/>',
  '<path d="M7.5 9.6l2.1-2.1 2.4 2.4 2.4-2.4 2.1 2.1-2.4 2.4 2.4 2.4-2.1 2.1-2.4-2.4-2.4 2.4-2.1-2.1 2.4-2.4z"/>',
];

/** One peg as inline SVG. */
export function pegSvg(colour: number): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${PEG_COLORS[colour]}"/><g fill="rgba(255,255,255,.92)">${SHAPES[colour]}</g></svg>`;
}

/** The answer dots for a guess: filled first, then hollow, then empty, in a small grid. */
export function feedbackSvg(exact: number, near: number, slots: number): string {
  const cols = Math.ceil(slots / 2);
  const dots: string[] = [];
  for (let i = 0; i < slots; i++) {
    const x = 6 + (i % cols) * 12;
    const y = 6 + Math.floor(i / cols) * 12;
    const kind = i < exact ? 'exact' : i < exact + near ? 'near' : 'none';
    dots.push(`<circle class="cb-dot ${kind}" cx="${x}" cy="${y}" r="${kind === 'none' ? 2 : 4.2}"/>`);
  }
  return `<svg viewBox="0 0 ${cols * 12} 24" aria-hidden="true">${dots.join('')}</svg>`;
}
