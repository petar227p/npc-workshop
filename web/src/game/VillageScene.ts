import type { EngineEvent, StateView, TiledMap, Tile, Village } from '@blacksmith/shared';
// The zod-free modules, so the schemas stay out of the bundle.
import { PLAYER_SPRITE } from '@blacksmith/shared/src/npc-info';
import { findPath, placeNamed, readVillage, spotsIn } from '@blacksmith/shared/src/village';
import Phaser from 'phaser';

// The village, drawn from the server's view. Where each NPC is comes from the server (its schedule at this tick);
// the scene only walks it there. The player walks freely; E next to someone opens the chat with them.

const TILE = 16;
const NPC_SPEED = 40; // px per second
const PLAYER_SPEED = 70;
const TALK_RANGE = 26; // px
const ITEM_FALLBACK = 104; // a Tiny Dungeon weapon tile, until Muse Image has drawn the real item

export type SceneHooks = { onTalk: (npcId: string) => void };

const px = (t: number) => t * TILE + TILE / 2;
const tileOf = (x: number, y: number): Tile => ({ x: Math.floor(x / TILE), y: Math.floor(y / TILE) });

type Bubble = { text: Phaser.GameObjects.Text; until: number };
type Person = {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  goal: Tile | null; // the tile it is walking to
  path: Tile[]; // tiles still to walk, next first
  bubble?: Bubble;
};

// Something beside the canvas is being typed into: the keys belong to the page. A picker isn't: after choosing from
// one, the keys go straight back to walking (Space or Alt+↓ still open it).
const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};
const WALK_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

export class VillageScene extends Phaser.Scene {
  private village!: Village;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerBubble?: Bubble;
  private people = new Map<string, Person>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prompt!: Phaser.GameObjects.Text;
  private ready = false;
  private view: StateView | null = null;
  private seen = new Set<string>(); // event ids already shown
  private started = false; // the first view only places people; what was already in the log isn't replayed
  private nextClang = 0;

  constructor(private hooks: SceneHooks) {
    super('village');
  }

  preload() {
    this.load.spritesheet('town', '/assets/town/tilemap_packed.png', { frameWidth: TILE, frameHeight: TILE });
    this.load.spritesheet('dungeon', '/assets/dungeon/tilemap_packed.png', { frameWidth: TILE, frameHeight: TILE });
    this.load.tilemapTiledJSON('village', '/assets/village.tmj');
  }

  create() {
    const map = this.make.tilemap({ key: 'village' });
    this.village = readVillage(this.cache.tilemap.get('village').data as TiledMap);
    const sheets = [map.addTilesetImage('town', 'town')!, map.addTilesetImage('dungeon', 'dungeon')!];
    map.createLayer('ground', sheets);
    const solid = map.createLayer('solid', sheets)!.setDepth(1);
    const props = map.createLayer('props', sheets)!.setDepth(1);
    solid.setCollisionByExclusion([-1]);
    props.setCollisionByExclusion([-1]);

    const w = map.widthInPixels;
    const h = map.heightInPixels;
    const { spawn } = this.village;
    this.player = this.physics.add.sprite(px(spawn.x), px(spawn.y), 'dungeon', PLAYER_SPRITE);
    this.player.body!.setSize(10, 6).setOffset(3, 10);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, solid);
    this.physics.add.collider(this.player, props);
    this.physics.world.setBounds(0, 0, w, h);

    this.prompt = this.makeText('E  talk', '#2a1a05', '#e8a547').setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, w, h);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.scale.on('resize', () => this.fitZoom());
    this.fitZoom();

    // No key capture: the chat box beside the canvas must still get arrows, E and Esc.
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.E.on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
      if (typing()) return;
      const near = this.nearest();
      if (!near) return;
      event.preventDefault(); // or the E lands in the chat box this focuses
      this.hooks.onTalk(near.id);
    });
    // Walking keys only walk: they mustn't also scroll the page (once the ledger makes it taller than the window) or
    // change a focused picker. Esc gives the keys back from any field.
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') return (document.activeElement as HTMLElement | null)?.blur();
      if (typing() || event.ctrlKey || event.metaKey || event.altKey) return;
      if (WALK_KEYS.includes(event.key.toLowerCase())) event.preventDefault();
    });
    // Clicking the village hands the keys back to walking.
    this.input.on('pointerdown', () => (document.activeElement as HTMLElement | null)?.blur());

    this.ready = true;
    if (this.view) this.setView(this.view);
  }

  // Zoom so the village fills the canvas without showing past its edges.
  private fitZoom() {
    const { width, height } = this.scale.gameSize;
    const minZoom = Math.max(width / (this.village.width * TILE), height / (this.village.height * TILE));
    this.cameras.main.setZoom(Math.max(2, Math.ceil(minZoom)));
  }

  // Called with every view the server sends. The first one only places people; later ones play what's new.
  setView(view: StateView) {
    this.view = view;
    if (!this.ready) return;
    this.placePeople(view);
    // A new game starts the log again: forget the old ids so the new ones aren't mistaken for seen.
    if (view.events.length === 0) this.seen.clear();
    const fresh = view.events.filter((e) => !this.seen.has(e.id));
    for (const e of fresh) this.seen.add(e.id);
    if (this.started) for (const e of fresh) this.play(e, view);
    this.started = true;
  }

  // Each person goes to its place; people at the same place take its tiles in turn.
  private placePeople(view: StateView) {
    const taken = new Map<string, number>();
    for (const p of view.people) {
      const place = placeNamed(this.village, p.place);
      const spots = place ? spotsIn(this.village, place) : [];
      const i = taken.get(p.place) ?? 0;
      taken.set(p.place, i + 1);
      const goal = spots.length ? spots[i % spots.length] : this.village.spawn;

      let person = this.people.get(p.id);
      if (!person) {
        const sprite = this.add.sprite(px(goal.x), px(goal.y), 'dungeon', p.sprite);
        person = { id: p.id, sprite, x: px(goal.x), y: px(goal.y), goal, path: [] };
        this.people.set(p.id, person);
        continue;
      }
      if (person.goal && person.goal.x === goal.x && person.goal.y === goal.y) continue;
      person.goal = goal;
      const from = tileOf(person.x, person.y);
      const path = findPath(this.village, from, goal);
      if (path) {
        person.path = path.slice(1);
      } else {
        // Walled in somehow: just appear there rather than stand still forever.
        person.x = px(goal.x);
        person.y = px(goal.y);
        person.path = [];
      }
    }
    for (const id of [...this.people.keys()]) {
      if (view.people.some((p) => p.id === id)) continue;
      this.people.get(id)!.sprite.destroy();
      this.people.delete(id);
    }
  }

  private play(e: EngineEvent, view: StateView) {
    switch (e.type) {
      case 'SAID':
        this.bubble(e.actor, e.data.text, e.actor === 'player' ? 2500 : 4500);
        break;
      case 'EMOTED':
        this.bubble(e.actor, `*${e.data.text}*`, 3500);
        break;
      case 'SIGNALED':
        this.bubble(e.actor, `[${e.data.signal.replace(/_/g, ' ')}]`, 3500);
        break;
      case 'GOODS_DELIVERED':
        this.bubble(e.actor, `Here: ${e.data.qty} × ${e.data.good.replace(/_/g, ' ')}.`, 3500);
        break;
      case 'GIFT_REFUSED':
        this.bubble(e.actor, 'Not my trade. Keep it.', 3500);
        break;
      case 'HAPPENED':
        this.happened(e.location, e.data.text);
        break;
      case 'ITEM_DELIVERED': {
        const seller = view.contracts.find((c) => c.contract_id === e.data.contract_id)?.seller;
        if (seller) this.bubble(seller, `Your ${e.data.item.item_name} is ready!`, 5000);
        this.handOver(seller, e.data.contract_id, view);
        break;
      }
    }
  }

  // A reported world event: a ring spreads from where it happened, with what happened over it for a while.
  private happened(placeName: string, text: string) {
    const place = placeNamed(this.village, placeName);
    if (!place) return;
    const [x, y] = [(place.x + place.w / 2) * TILE, (place.y + place.h / 2) * TILE];
    const ring = this.add.circle(x, y, TILE, 0xb48ce0, 0.25).setStrokeStyle(1, 0xb48ce0).setDepth(2);
    this.tweens.add({ targets: ring, radius: TILE * 5, alpha: 0, duration: 2200, repeat: 1, onComplete: () => ring.destroy() });
    const label = this.makeText(text.length > 80 ? `${text.slice(0, 78)}…` : text, '#f6ecd8', '#4a2f6b').setPosition(Math.round(x), Math.round(y - 6));
    this.tweens.add({ targets: label, alpha: 0, delay: 6000, duration: 1000, onComplete: () => label.destroy() });
  }

  // The finished item rises above whoever made it, flies to the player and hangs over them for a moment.
  private handOver(seller: string | undefined, contractId: string, view: StateView) {
    const from = (seller && this.people.get(seller)) || null;
    const url = view.art[contractId]?.url;
    const show = (key: string, frame?: number) => {
      const at = from ?? this.player;
      // Clear of the maker's "ready!" bubble (its bottom is 10 px above them), or the item rises hidden behind it.
      const start = { x: at.x, y: at.y - (from?.bubble ? from.bubble.text.displayHeight + 20 : 14) };
      const img = this.add.image(start.x, start.y, key, frame).setDepth(9000);
      if (key !== 'dungeon') img.setDisplaySize(TILE, TILE);
      const ring = this.add.circle(at.x, at.y, TILE * 2, 0xe8a547, 0.18).setStrokeStyle(1, 0xe8a547).setDepth(2);
      this.tweens.add({ targets: ring, alpha: 0, delay: 1500, duration: 1200, onComplete: () => ring.destroy() });
      this.tweens.chain({
        targets: img,
        tweens: [
          { y: start.y - 8, duration: 700, ease: 'Sine.easeOut' },
          { x: { getEnd: () => this.player.x }, y: { getEnd: () => this.player.y - 14 }, duration: 900, ease: 'Sine.easeInOut', delay: 500 },
          { alpha: 0, duration: 600, delay: 1800 },
        ],
        onComplete: () => img.destroy(),
      });
    };
    if (!url) return show('dungeon', ITEM_FALLBACK);
    // By picture, not contract: a new game numbers its contracts from c_001 again, and the scene outlives it.
    const key = `art:${url}`;
    if (this.textures.exists(key)) return show(key);
    this.load.image(key, url);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => show(this.textures.exists(key) ? key : 'dungeon', this.textures.exists(key) ? undefined : ITEM_FALLBACK));
    this.load.start();
  }

  private makeText(text: string, color = '#2a1a05', bg = '#f6ecd8') {
    return this.add
      .text(0, 0, text, {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: '6px',
        color,
        backgroundColor: bg,
        padding: { x: 2, y: 1 },
        wordWrap: { width: 90 },
        align: 'center',
        resolution: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(10000);
  }

  // Bubbles stay short; the full line is in the chat panel.
  private bubble(who: string, text: string, ms: number) {
    const short = text.length > 60 ? `${text.slice(0, 58)}…` : text;
    const b = { text: this.makeText(short), until: this.time.now + ms };
    if (who === 'player') {
      this.playerBubble?.text.destroy();
      this.playerBubble = b;
      return;
    }
    const p = this.people.get(who);
    if (!p) return b.text.destroy();
    p.bubble?.text.destroy();
    p.bubble = b;
  }

  private nearest(): Person | null {
    let best: Person | null = null;
    let bestD = TALK_RANGE;
    for (const p of this.people.values()) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
      if (d < bestD) [best, bestD] = [p, d];
    }
    return best;
  }

  update(time: number, delta: number) {
    if (!this.ready) return;

    // Player
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (!typing()) {
      if (k.A.isDown || k.LEFT.isDown) vx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) vx += 1;
      if (k.W.isDown || k.UP.isDown) vy -= 1;
      if (k.S.isDown || k.DOWN.isDown) vy += 1;
    }
    const v = new Phaser.Math.Vector2(vx, vy).normalize().scale(PLAYER_SPEED);
    this.player.setVelocity(v.x, v.y);
    if (vx) this.player.setFlipX(vx < 0);
    this.player.setDepth(this.player.y);
    this.player.setOrigin(0.5, vx || vy ? 0.5 + Math.abs(Math.sin(time / 90)) * 0.08 : 0.5);

    // People walk their path one tile at a time; standing still, they turn to face the player when close.
    const step = (NPC_SPEED * delta) / 1000;
    for (const p of this.people.values()) {
      const next = p.path[0];
      let walking = false;
      if (next) {
        const dx = px(next.x) - p.x;
        const dy = px(next.y) - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= step) {
          p.x = px(next.x);
          p.y = px(next.y);
          p.path.shift();
        } else {
          p.x += (dx / dist) * step;
          p.y += (dy / dist) * step;
          if (Math.abs(dx) > 0.5) p.sprite.setFlipX(dx < 0);
        }
        walking = true;
      } else if (Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < TALK_RANGE * 1.5) {
        p.sprite.setFlipX(this.player.x < p.x);
      }
      const bob = walking ? -Math.abs(Math.sin(time / 110)) * 1.5 : 0;
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y + bob)).setDepth(p.y);
    }

    // Work on the anvil: the maker clangs now and then until it's done.
    const working = this.view?.contracts.find((c) => c.kind === 'made_to_order' && c.status === 'in_progress');
    if (working && time > this.nextClang) {
      this.nextClang = time + 2600;
      const maker = this.people.get(working.seller);
      if (maker && !maker.bubble && !maker.path.length) this.bubble(working.seller, 'CLANG!', 700);
    }

    // Bubbles follow their speakers.
    const place = (b: Bubble | undefined, x: number, y: number) => {
      if (!b) return b;
      if (time > b.until) {
        b.text.destroy();
        return undefined;
      }
      b.text.setPosition(Math.round(x), Math.round(y - 10));
      return b;
    };
    for (const p of this.people.values()) p.bubble = place(p.bubble, p.x, p.y);
    this.playerBubble = place(this.playerBubble, this.player.x, this.player.y);

    const near = this.nearest();
    this.prompt.setVisible(!!near && !typing() && !near.bubble);
    if (near) this.prompt.setPosition(Math.round(near.x), Math.round(near.y - 10));
  }
}
