// The 27 colours of Kenney's Tiny Dungeon sheet (web/public/assets/dungeon), most used first. Item sprites are
// snapped to these so they sit in the village like the rest of the art.
export type Rgb = readonly [number, number, number];

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const OUTLINE: Rgb = hex('#3f2631');

export const KENNEY_PALETTE: Rgb[] = [
  '#3f2631', '#8b9bb4', '#eaa56c', '#c0cbdc', '#262b44', '#763b36', '#52607c', '#bd6c4a', '#cf8254',
  '#f7c282', '#ffffff', '#43e1b3', '#e84537', '#e19a65', '#ff706d', '#25956a', '#9b4ca3', '#5a6988',
  '#d176d0', '#0099db', '#69ffd4', '#75e3ff', '#e4edf9', '#feae34', '#fec99c', '#fee761', '#aab7cc',
].map(hex);
