// What each village NPC does, in a few words, from the first line of its prompt (prompts/<id>.md). For the label
// over a villager and the chat's picker. An NPC not listed (a new one from the workshop) shows by name only.
export const ROLES: Record<string, string> = {
  smith: 'blacksmith',
  merchant: 'market trader',
  cottager: 'washerwoman',
  crier: 'town crier',
  farmer: 'farmer',
  guard: 'gate guard',
  keeper: 'chapel keeper',
  bard: 'travelling bard',
};

export const withRole = (id: string, name: string) => (ROLES[id] ? `${name} · ${ROLES[id]}` : name);
