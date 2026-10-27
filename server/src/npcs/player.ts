import { verbs, type Actor } from '../engine';

// Not an NPC, but an actor like one: the player can talk and press Accept, nothing else.
export const player: Actor = { id: 'player', verbs: [verbs.SAY, verbs.ACCEPT] };
