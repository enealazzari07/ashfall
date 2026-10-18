/**
 * Selbst gezeichnete Symbole (Strichgrafik im 24er-Raster) statt Emojis. Sie erben die Textfarbe (currentColor)
 * und passen so in jedes Design.
 */
const PATHS: Record<string, string> = {
  // Zustände
  hunger: '<path d="M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 3v18"/><path d="M17 3c-2.3 1.2-3.5 4-3.5 7 0 2 1 3.2 3.5 3.2V21"/>',
  thirst: '<path d="M12 3c3.2 4 6 6.8 6 11a6 6 0 0 1-12 0c0-4.2 2.8-7 6-11z"/><path d="M9 14.5a3 3 0 0 0 2.5 2.8"/>',
  temp: '<path d="M10 14.2V5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z"/><path d="M12 8v8"/>',
  energy: '<path d="M13.5 2.5L5.5 13.5h6l-1.2 8 8.2-11.2h-6.2z"/>',
  warmth: '<path d="M12 3c.6 3 5 5 5 10a5 5 0 0 1-10 0c0-2 .9-3.2 2.2-4.2.1 1.7.9 2.8 2 3.1C10.8 8.6 10.6 5.6 12 3z"/>',
  health: '<path d="M12 3l7 3v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6z"/><path d="M12 8v7M8.5 11.5h7"/>',
  bleed: '<path d="M12 3c3.2 4 6 6.8 6 11a6 6 0 0 1-12 0c0-4.2 2.8-7 6-11z"/><path d="M9.5 12.5l5 5M14.5 12.5l-5 5"/>',
  // Geld, Gewicht, Sonstiges
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9v6"/>',
  weight: '<path d="M8.5 8.5a3.5 3.5 0 0 1 7 0"/><path d="M5.5 20.5l1.6-10h9.8l1.6 10z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18v3H3M12 9v11M12 9c-2-4-6-3-5 0 .5 1.3 3 1.2 5 0zM12 9c2-4 6-3 5 0-.5 1.3-3 1.2-5 0z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9 6.7 19.7l1.1-5.9L3.5 9.7l5.9-.8z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  // Ausrüstung
  head: '<path d="M4.5 15a7.5 7.5 0 0 1 15 0v2h-15z"/><path d="M4.5 17h15M10 7.5V4.5h4v3"/>',
  body: '<path d="M8.5 4L3 7l2.2 4 2.8-1v11h8V10l2.8 1L21 7l-5.5-3a3.5 3.5 0 0 1-7 0z"/>',
  legs: '<path d="M7 3h10l1 18h-5l-1-9-1 9H6z"/><path d="M7 7h10"/>',
  feet: '<path d="M8 3h6v8l6 3v5H4v-4l4-2z"/><path d="M4 16h16"/>',
  back: '<rect x="6" y="8" width="12" height="13" rx="3"/><path d="M9 8V6a3 3 0 0 1 6 0v2M9 15h6M12 15v2"/>',
  hand: '<path d="M9 3h6l1 5H8z"/><rect x="9" y="8" width="6" height="13" rx="1.2"/><path d="M12 11v3"/>',
  // Bauteile
  wall: '<rect x="3" y="5" width="18" height="14"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 9.7v4.6M9 14.3V19"/>',
  door: '<rect x="6" y="3" width="12" height="18"/><circle cx="15" cy="12.5" r="1"/><path d="M6 21h12"/>',
  bed: '<path d="M3 19V7M3 14.5h18V19M21 14.5V12a3 3 0 0 0-3-3H9.5v5.5"/><circle cx="6.5" cy="11" r="1.7"/>',
  fire: '<path d="M12 3c.6 3 5 5 5 10a5 5 0 0 1-10 0c0-2 .9-3.2 2.2-4.2.1 1.7.9 2.8 2 3.1C10.8 8.6 10.6 5.6 12 3z"/><path d="M4 21h16"/>',
  // Inventar
  craft: '<path d="M14 4l6 6-3 3-6-6zM12.5 8.5L4 17l3 3 8.5-8.5"/><path d="M5 19.5l-1.5 1.5"/>',
  windowwall: '<rect x="3" y="4" width="18" height="16"/><rect x="8" y="8" width="8" height="6"/><path d="M12 8v6M8 11h8"/>',
  barricade: '<path d="M3 18L21 6M3 6l18 12M3 12h18"/><path d="M3 20h18"/>',
  table: '<rect x="3" y="8" width="18" height="3"/><path d="M5 11v9M19 11v9M9 11v6M15 11v6"/>',
  shelf: '<rect x="4" y="3" width="16" height="18"/><path d="M4 9h16M4 15h16"/><path d="M7 9V6h3v3M13 15v-3h4v3"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  person: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3z"/>',
  ground: '<path d="M3 18h18M5 18l4-6 3 3 3-7 4 10"/>',
  box: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  down: '<path d="M12 4v13M6 12l6 6 6-6M5 21h14"/>',
  up: '<path d="M12 20V7M6 12l6-6 6 6M5 3h14"/>',
  // Karte & Navigation
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
};

/** Inline-SVG-Symbol; Größe und Farbe kommen aus dem umgebenden CSS (.gl). */
export function glyph(name: string, cls = 'gl'): string {
  const body = PATHS[name] ?? '<circle cx="12" cy="12" r="7"/>';
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
