// Game time, shared by the browser and the NPC facts so both tell the same time. Zod-free, so the browser can import it.

export const START_HOUR = 8; // tick 0 is 08:00 on day 1; one tick is one hour

// The hour of the day (0–23) at a tick.
export const hourOf = (tick: number) => (START_HOUR + tick) % 24;

export function clockText(tick: number): string {
  const h = START_HOUR + tick;
  return `Day ${Math.floor(h / 24) + 1} · ${String(h % 24).padStart(2, '0')}:00`;
}
