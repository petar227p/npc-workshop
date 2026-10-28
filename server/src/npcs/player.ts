import { verbs, type Actor } from '../engine';

// Not an NPC, but an actor like one: the player can talk, press Accept and give things away, nothing else.
export const player: Actor = { id: 'player', verbs: [verbs.SAY, verbs.ACCEPT, verbs.GIVE], start: { gold: 200, stock: {} } };
