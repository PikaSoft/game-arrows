const svg = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  back: svg('<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>'),
  palette: svg(
    '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="14.5" cy="7" r="1.2" fill="currentColor"/>',
  ),
  gear: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  ),
  bulb: svg('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>'),
  fit: svg('<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>'),
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  grid: svg('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>'),
};

export function heartIcon(full: boolean): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3 15 3 8.8A4.8 4.8 0 0 1 12 6.3a4.8 4.8 0 0 1 9 2.5C21 15 12 20.5 12 20.5z" fill="${full ? 'var(--heart)' : 'none'}" stroke="var(--heart)" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

export function starIcon(full: boolean): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="${full ? 'var(--accent)' : 'none'}" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

/** Small logo: a bent arrow leaving a frame. */
export const logo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="var(--line)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 50V30h18V16h14"/><path d="M42 9l9 7-9 7" fill="var(--line)"/><path d="M14 58h40" stroke="var(--accent)"/></svg>`;

/** Collection logo: a little box of puzzle tiles. */
export const hubLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="var(--line)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><rect x="8" y="8" width="21" height="21" rx="5"/><rect x="35" y="8" width="21" height="21" rx="5" fill="var(--accent)" stroke="var(--line)"/><rect x="8" y="35" width="21" height="21" rx="5" fill="var(--accent)" stroke="var(--line)"/><rect x="35" y="35" width="21" height="21" rx="5"/></svg>`;

/** Sandglass logo: a bottle with layers of sand. */
export const sandLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="var(--line)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><path d="M26 6h12M27 6v10c0 2-7 5-7 10v28a4 4 0 0 0 4 4h16a4 4 0 0 0 4-4V26c0-5-7-8-7-10V6"/><path d="M22 47h20v7a2 2 0 0 1-2 2H24a2 2 0 0 1-2-2z" fill="#d9a441" stroke="none"/><path d="M22 38h20v9H22z" fill="#4f9ed8" stroke="none"/><path d="M22 31c4-2 7 1 10 0s6-2 10 0v7H22z" fill="#d9584a" stroke="none"/></svg>`;

export const extraIcons = {
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
  addBottle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h6M9 3v4L7 10v9a2 2 0 0 0 2 2h4"/><path d="M13 3v4l2 3v2"/><path d="M18 15v6M15 18h6"/></svg>`,
};

export const pauseIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>`;

/** Snake logo: a curvy snake heading for an apple. */
export const snakeLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 50h24a8 8 0 0 0 0-16h-6a8 8 0 0 1 0-16h12" stroke="var(--line)" stroke-width="11"/><path d="M10 50h24a8 8 0 0 0 0-16h-6a8 8 0 0 1 0-16h12" stroke="#5aa457" stroke-width="6"/><circle cx="41" cy="16" r="1.8" fill="var(--line)"/><circle cx="50" cy="45" r="6.5" fill="var(--accent)" stroke="var(--line)" stroke-width="3"/><path d="M50 38.5c1-3 3-4 5-4" stroke="var(--line)" stroke-width="3"/></svg>`;

/** Snake Trails logo: a snake winding between walls in a box. */
export const trailsLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="52" height="52" rx="9" stroke="var(--line)" stroke-width="4"/><path d="M22 16v16M42 32v16" stroke="var(--line)" stroke-width="6"/><path d="M15 48h17V22h12" stroke="var(--line)" stroke-width="9"/><path d="M15 48h17V22h12" stroke="#5aa457" stroke-width="4.5"/><circle cx="49" cy="18" r="4.5" fill="var(--accent)" stroke="var(--line)" stroke-width="2.5"/></svg>`;

/** Squeeze logo: a framed board with a gap and an L block sliding out of it. */
export const squeezeLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M34 8H8v48h48V8h-8" stroke="var(--line)" stroke-width="4.5"/><rect x="14" y="36" width="14" height="14" rx="3" fill="#4f9ed8"/><path d="M36 2h8v14h8v8H36z" fill="#d9584a"/><rect x="32" y="36" width="18" height="7" rx="3" fill="#e8b93a"/></svg>`;

/** Pipe Link logo: a tap feeding a bent pipe that ends in a full basin. */
export const pipeLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="butt" stroke-linejoin="round"><path d="M18 14v22h28v16" stroke="var(--line)" stroke-width="13"/><path d="M18 14v22h28v16" stroke="#3f95dc" stroke-width="6"/><circle cx="18" cy="14" r="9" fill="var(--accent)" stroke="var(--line)" stroke-width="3.5"/><circle cx="18" cy="14" r="3.5" fill="#3f95dc"/><circle cx="46" cy="52" r="8" fill="#3f95dc" stroke="var(--line)" stroke-width="3.5"/></svg>`;

/** Colour Lines logo: two pairs of dots joined by lines that wrap round each other. */
export const linesLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="52" height="52" rx="9" stroke="var(--line)" stroke-width="4"/><path d="M18 18v28h28" stroke="#e5413b" stroke-width="6"/><path d="M30 18h16v16" stroke="#2f6fe0" stroke-width="6"/><circle cx="18" cy="18" r="5.5" fill="#e5413b"/><circle cx="46" cy="46" r="5.5" fill="#e5413b"/><circle cx="30" cy="18" r="5.5" fill="#2f6fe0"/><circle cx="46" cy="34" r="5.5" fill="#2f6fe0"/></svg>`;

/** Crate Push logo: a crate being pushed toward a target ring. */
export const cratesLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="48" cy="44" r="9" stroke="var(--accent)" stroke-width="4"/><circle cx="48" cy="44" r="2.5" fill="var(--accent)"/><rect x="18" y="20" width="24" height="24" rx="3" fill="#c98a48" stroke="var(--line)" stroke-width="3.5"/><path d="M23 39l14-14M23 25h14v14H23z" stroke="var(--line)" stroke-width="2" opacity="0.55"/><circle cx="10" cy="32" r="6" fill="#4f9ed8" stroke="var(--line)" stroke-width="3"/></svg>`;

/** Light Switch logo: a 3x3 grid with a plus of lit tiles. */
export const lightsLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="var(--line)" stroke-width="3" stroke-linejoin="round"><rect x="6" y="6" width="15" height="15" rx="4"/><rect x="24.5" y="6" width="15" height="15" rx="4" fill="#f6c344"/><rect x="43" y="6" width="15" height="15" rx="4"/><rect x="6" y="24.5" width="15" height="15" rx="4" fill="#f6c344"/><rect x="24.5" y="24.5" width="15" height="15" rx="4" fill="#f6c344"/><rect x="43" y="24.5" width="15" height="15" rx="4" fill="#f6c344"/><rect x="6" y="43" width="15" height="15" rx="4"/><rect x="24.5" y="43" width="15" height="15" rx="4" fill="#f6c344"/><rect x="43" y="43" width="15" height="15" rx="4"/></svg>`;

/** Ice Slide logo: a puck skidding across ice toward a flag, past a rock. */
export const iceLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="10" width="52" height="44" rx="9" fill="#cfe8f7" stroke="var(--line)" stroke-width="4"/><path d="M14 40h10M14 34h6" stroke="#ffffff" stroke-width="3"/><circle cx="31" cy="37" r="7" fill="#3f95dc"/><circle cx="31" cy="37" r="3.5" stroke="#ffffff" stroke-width="2"/><path d="M46 44V22" stroke="#3b4652" stroke-width="2.5"/><path d="M46 22l9 4-9 4z" fill="#3f95dc"/><rect x="38" y="15" width="9" height="7" rx="3" fill="#8b9097"/></svg>`;

/** Picture Grid logo: a small grid with clues and a few filled squares. */
export const pictureLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="var(--line)" stroke-width="3" stroke-linejoin="round"><rect x="20" y="20" width="38" height="38" rx="4"/><path d="M32.7 20v38M45.3 20v38M20 32.7h38M20 45.3h38" stroke-width="1.6" opacity="0.6"/><rect x="20" y="20" width="12.7" height="12.7" fill="var(--line)"/><rect x="32.7" y="32.7" width="25.3" height="12.6" fill="var(--accent)"/><rect x="20" y="45.3" width="12.7" height="12.7" fill="var(--line)"/><text x="12" y="30" font-size="10" font-weight="700" fill="var(--line)" stroke="none" text-anchor="middle" font-family="sans-serif">1</text><text x="12" y="43" font-size="10" font-weight="700" fill="var(--line)" stroke="none" text-anchor="middle" font-family="sans-serif">2</text><text x="27" y="14" font-size="10" font-weight="700" fill="var(--line)" stroke="none" text-anchor="middle" font-family="sans-serif">2</text></svg>`;

/** Number Place logo: a 3x3 box of digits. */
export const numbersLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="var(--line)" stroke-width="3.5" stroke-linejoin="round"><rect x="8" y="8" width="48" height="48" rx="6"/><path d="M24 8v48M40 8v48M8 24h48M8 40h48" stroke-width="1.6" opacity="0.6"/><rect x="24" y="24" width="16" height="16" fill="var(--accent)" stroke="none" opacity="0.8"/><g fill="var(--line)" stroke="none" font-family="sans-serif" font-weight="700" font-size="12" text-anchor="middle"><text x="16" y="20.5">5</text><text x="48" y="20.5">3</text><text x="32" y="36.5">9</text><text x="16" y="52.5">1</text><text x="48" y="52.5">7</text></g></svg>`;

/** Tents and Trees logo: a tent beside a tree, with a row count. */
export const tentsLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linejoin="round"><rect x="6" y="10" width="52" height="44" rx="8" fill="#9fcf7c" fill-opacity="0.45" stroke="var(--line)" stroke-width="4"/><rect x="18.5" y="34" width="5" height="12" fill="#7a5232"/><circle cx="21" cy="27" r="9" fill="#3f8f4a"/><circle cx="15" cy="33" r="6" fill="#3f8f4a"/><circle cx="27" cy="33" r="6" fill="#3f8f4a"/><path d="M44 22l11 24H33z" fill="#e8893a"/><path d="M44 36l4 10h-8z" fill="rgba(0,0,0,0.3)"/></svg>`;

/** Hidden Mines logo: a few uncovered numbers beside a flagged square. */
export const minesLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linejoin="round"><rect x="8" y="8" width="48" height="48" rx="7" stroke="var(--line)" stroke-width="4"/><rect x="34" y="34" width="18" height="18" rx="4" fill="var(--line)" fill-opacity="0.25"/><path d="M40 49V37" stroke="var(--line)" stroke-width="2.5" stroke-linecap="round"/><path d="M40 37l9 3.5-9 3.5z" fill="#e04a3c"/><g font-family="sans-serif" font-weight="800" font-size="15" text-anchor="middle"><text x="19" y="27" fill="#2f6fe0">1</text><text x="43" y="27" fill="#2e9e44">2</text><text x="19" y="49" fill="#d9443a">3</text></g></svg>`;

/** Brick Breaker logo: a wall of bricks, a ball and a paddle. */
export const bricksLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linejoin="round"><rect x="6" y="8" width="16" height="8" rx="2" fill="#d9584a"/><rect x="24" y="8" width="16" height="8" rx="2" fill="#d9584a"/><rect x="42" y="8" width="16" height="8" rx="2" fill="#d9584a"/><rect x="6" y="18" width="16" height="8" rx="2" fill="#e8b93a"/><rect x="42" y="18" width="16" height="8" rx="2" fill="#e8b93a"/><circle cx="34" cy="38" r="4" fill="var(--line)"/><rect x="18" y="50" width="28" height="6" rx="3" fill="var(--accent)" stroke="var(--line)" stroke-width="2"/></svg>`;

/** Stack Tower logo: a stack of shrinking slabs with one sliding in. */
export const stackLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none"><rect x="12" y="46" width="40" height="10" rx="2" fill="hsl(200,55%,58%)"/><rect x="15" y="35" width="34" height="10" rx="2" fill="hsl(207,55%,58%)"/><rect x="18" y="24" width="28" height="10" rx="2" fill="hsl(214,55%,58%)"/><rect x="30" y="10" width="28" height="10" rx="2" fill="var(--accent)"/><path d="M8 15h16" stroke="var(--line)" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 4"/></svg>`;

/** Lane Dodger logo: three lanes, a runner, a wall and a hurdle. */
export const lanesLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round"><path d="M10 6v52M54 6v52" stroke="var(--line)" stroke-width="3.5"/><path d="M24.7 6v52M39.3 6v52" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 5" opacity="0.5"/><rect x="12.5" y="12" width="10" height="9" rx="2" fill="var(--line)"/><rect x="41" y="22" width="11" height="4" rx="1.5" fill="#ee8a3a"/><circle cx="32" cy="46" r="6" fill="#4f9ed8" stroke="var(--line)" stroke-width="2"/></svg>`;

/** Merge Tiles logo: three 3s lining up, and the 9 they make. */
export const mergeLogo = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none"><rect x="4" y="8" width="16" height="16" rx="4" fill="#f2c77a"/><rect x="24" y="8" width="16" height="16" rx="4" fill="#f2c77a"/><rect x="44" y="8" width="16" height="16" rx="4" fill="#f2c77a"/><path d="M32 30v8m-5-4l5 5 5-5" stroke="var(--line)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="20" y="42" width="24" height="18" rx="5" fill="#ee9d4a"/><g font-family="sans-serif" font-weight="800" text-anchor="middle"><text x="12" y="21" font-size="11" fill="#5b3c22">3</text><text x="32" y="21" font-size="11" fill="#5b3c22">3</text><text x="52" y="21" font-size="11" fill="#5b3c22">3</text><text x="32" y="56" font-size="13" fill="#ffffff">9</text></g></svg>`;
