// Mock of the code-owned world state. In the real build this is the engine + event log on the server.

export type NpcId = 'smith' | 'miller' | 'herbalist' | 'guard' | 'crier';

export type NpcDef = {
  id: NpcId;
  name: string;
  frame: number; // Tiny Dungeon frame
  route: [number, number, number?][]; // tile x, tile y, wait seconds
};

export const NPCS: NpcDef[] = [
  { id: 'smith', name: 'Brann the Smith', frame: 86, route: [[8, 7, 3], [7, 7, 3]] },
  {
    id: 'miller',
    name: 'Odo the Miller',
    frame: 98,
    route: [[23, 5, 4], [23, 9], [10, 9], [6, 9], [6, 8, 6], [6, 9], [23, 9]],
  },
  {
    id: 'herbalist',
    name: 'Mira the Herbalist',
    frame: 99,
    route: [[5, 15, 6], [5, 16], [12, 16], [12, 12], [13, 11, 5], [12, 12], [12, 16], [5, 16]],
  },
  {
    id: 'guard',
    name: 'Sergeant Hale',
    frame: 96,
    route: [[23, 15, 4], [23, 16], [17, 16], [17, 9], [10, 9], [10, 8, 4], [10, 9], [17, 9], [17, 16], [23, 16]],
  },
  { id: 'crier', name: 'Pell the Crier', frame: 88, route: [[16, 8, 8], [13, 8, 5]] },
];

export type Contract = {
  item_name: string;
  description: string;
  stats: { damage: number; weight: number; durability: number };
  price: number;
  delivery_hours: number;
  status: 'proposed' | 'accepted' | 'delivered';
  due_minute?: number;
};

export type Memory = {
  npc: NpcId;
  event_id: string;
  how_learned: 'witnessed' | 'told_by';
  told_by: NpcId | null;
  confidence: number;
  summary: string;
};

export type LogEntry = { minute: number; kind: 'event' | 'memory' | 'reject'; text: string };

export const state = {
  minute: 8 * 60,
  gold: 200,
  contract: null as Contract | null,
  inventory: [] as Contract[],
  memories: [] as Memory[],
  log: [] as LogEntry[],
};

export const npcName = (id: NpcId) => NPCS.find((n) => n.id === id)!.name;

export function clockText(minute = state.minute) {
  const day = Math.floor(minute / 1440) + 1;
  const m = Math.floor(minute % 1440);
  return `Day ${day} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// How a rumour drifts each time it's retold (the real build has Muse Spark Open retell it)
export const RUMOUR = [
  'Brann handed the stranger a blade shaped like a hammerhead shark.',
  'Brann forged the stranger some shark-shaped sword.',
  "They say the stranger's got a monster blade. Bit of a show-off.",
  'Something about a sea-monster sword? Who knows.',
];
