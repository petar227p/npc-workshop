import { findPath, isWalkable, placeNamed, spotsIn } from '@blacksmith/shared';
import { describe, expect, it } from 'vitest';
import { NPC_FILES } from '../npcs';
import { VILLAGE } from '../village';

// The map is hand-editable in Tiled, so these catch an edit that walls a place in or drops one an NPC needs.
describe('the village map', () => {
  it('has the places the plan needs, each with somewhere to stand, all reachable from where the player starts', () => {
    expect(VILLAGE.places.map((p) => p.name)).toEqual(expect.arrayContaining(['forge', 'market', 'tavern', 'notice_board', 'gate', 'square']));
    expect(isWalkable(VILLAGE, VILLAGE.spawn)).toBe(true);
    for (const place of VILLAGE.places) {
      const spots = spotsIn(VILLAGE, place);
      expect(spots.length, `${place.name} has no walkable tile`).toBeGreaterThan(0);
      for (const spot of spots) expect(findPath(VILLAGE, VILLAGE.spawn, spot), `${place.name} (${spot.x},${spot.y}) can't be reached`).not.toBeNull();
    }
  });

  it('every place an NPC file names is on the map', () => {
    for (const npc of NPC_FILES.list()) {
      for (const p of [npc.location, ...npc.schedule.map((e) => e.place)]) expect(placeNamed(VILLAGE, p), `${npc.id}: ${p}`).toBeDefined();
    }
  });

  it('paths go round what is solid, one tile at a time', () => {
    const forge = spotsIn(VILLAGE, placeNamed(VILLAGE, 'forge')!)[0];
    const tavern = spotsIn(VILLAGE, placeNamed(VILLAGE, 'tavern')!)[0];
    const path = findPath(VILLAGE, forge, tavern)!;
    expect(path[0]).toEqual(forge);
    expect(path.at(-1)).toEqual(tavern);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)).toBe(1);
      expect(isWalkable(VILLAGE, path[i])).toBe(true);
    }
    expect(findPath(VILLAGE, forge, { x: 0, y: 0 })).toBeNull(); // a tree in the border
  });
});
