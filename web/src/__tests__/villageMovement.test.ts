import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// The scene's movement can run without a renderer; use the real Arcade Body lifecycle below.
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
import { VillageScene } from '../game/VillageScene';

const require = createRequire(import.meta.url);
const Body = require('phaser/src/physics/arcade/Body.js');

describe.each([2, 4])('village movement at zoom %s', (zoom) => {
  it.each([30, 60, 120, 144, 240])('preserves walking speed at %s Hz', (fps) => {
    for (const diagonal of [false, true]) {
      const player = {
        x: 200, y: 200, angle: 0, rotation: 0, scaleX: 1, scaleY: 1,
        displayOriginX: 8, displayOriginY: 8, displayWidth: 16, displayHeight: 16,
        width: 16, height: 16, parentContainer: null,
        setPosition(x: number, y: number) { this.x = x; this.y = y; },
      };
      const body = new Body({ defaults: {}, bounds: {}, updateMotion() {} }, player);
      const speed = diagonal ? 70 / Math.SQRT2 : 70;
      body.setVelocity(speed, diagonal ? speed : 0);
      const scene = new VillageScene({ onTalk() {}, label: (id) => id });
      Object.assign(scene, {
        ready: true,
        player,
        cameras: { main: {
          zoom, width: 800, height: 600, scrollX: 0, scrollY: 0,
          clampX: (x: number) => x, clampY: (y: number) => y,
          setScroll(x: number, y: number) { this.scrollX = x; this.scrollY = y; },
        } },
      });
      for (let frame = 0; frame < fps; frame++) {
        body.preUpdate(true, 1 / fps);
        body.postUpdate();
        scene['settle'](frame * 1000 / fps, 1000 / fps);
      }
      expect(Math.hypot(player.x - 200, player.y - 200)).toBeCloseTo(70, 6);
    }
  });
});
