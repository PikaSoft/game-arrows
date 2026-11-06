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
