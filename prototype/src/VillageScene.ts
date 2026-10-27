import Phaser from 'phaser';
import { buildMap, H, TILE, W } from './map';
import { Contract, LogEntry, Memory, NPCS, NpcDef, NpcId, npcName, RUMOUR, state } from './state';
import * as ui from './ui';

const MINUTES_PER_SECOND = 5;
const WITNESS_RADIUS = 5 * TILE;
const GOSSIP_RADIUS = 1.6 * TILE;
const CONFIDENCE_DECAY = 0.7;
const NPC_SPEED = 28;
const PLAYER_SPEED = 70;
const DELIVERY_EVENT = 'e_delivery';

const px = (t: number) => t * TILE + TILE / 2;

type Bubble = { text: Phaser.GameObjects.Text; until: number };
type Actor = {
  def: NpcDef;
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  wp: number;
  waitUntil: number;
  walking: boolean;
  bubble?: Bubble;
  gossipCooldown: number;
};

export class VillageScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerBubble?: Bubble;
  private actors: Actor[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prompt!: Phaser.GameObjects.Text;
  private talkingTo: Actor | null = null;
  private furnace!: Phaser.GameObjects.Image;
  private nextClang = 0;
  private nextGossipCheck = 0;
  private crierAnnounced = false;

  constructor() {
    super('village');
  }

  preload() {
    this.load.spritesheet('town', '/assets/town/tilemap_packed.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('dungeon', '/assets/dungeon/tilemap_packed.png', { frameWidth: 16, frameHeight: 16 });
  }

  create() {
    const { ground, solid, props } = buildMap();
    const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: W, height: H });
    const tiles = map.addTilesetImage('town', 'town', TILE, TILE, 0, 0)!;
    const groundLayer = map.createBlankLayer('ground', tiles)!;
    const solidLayer = map.createBlankLayer('solid', tiles)!;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        groundLayer.putTileAt(ground[y][x], x, y);
        if (solid[y][x] >= 0) solidLayer.putTileAt(solid[y][x], x, y);
      }
    solidLayer.setCollisionByExclusion([-1]);
    solidLayer.setDepth(1);

    const propBodies = this.physics.add.staticGroup();
    for (const p of props) {
      const img = this.add.image(px(p.x), px(p.y), p.sheet, p.frame).setDepth(px(p.y));
      if (p.name === 'furnace') this.furnace = img;
      if (p.solid) {
        const body = propBodies.create(px(p.x), px(p.y) + 3, undefined, undefined, false) as Phaser.Physics.Arcade.Sprite;
        body.body!.setSize(12, 8);
      }
    }

    this.player = this.physics.add.sprite(px(13), px(11), 'dungeon', 85);
    this.player.body!.setSize(10, 6).setOffset(3, 10);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, solidLayer);
    this.physics.add.collider(this.player, propBodies);
    this.physics.world.setBounds(0, 0, W * TILE, H * TILE);

    for (const def of NPCS) {
      const [tx, ty] = def.route[0];
      const sprite = this.add.sprite(px(tx), px(ty), 'dungeon', def.frame);
      this.actors.push({ def, sprite, x: px(tx), y: px(ty), wp: 0, waitUntil: 0, walking: false, gossipCooldown: 0 });
    }

    this.prompt = this.makeText('E  talk', '#2a1a05', '#e8a547').setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W * TILE, H * TILE);
    cam.setZoom(3);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.scale.on('resize', () => this.fitZoom());
    this.fitZoom();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,ESC', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.E.on('down', () => {
      if (this.typing()) return;
      const near = this.nearestNpc();
      if (near) this.startTalk(near);
    });
    this.keys.ESC.on('down', () => this.endTalk());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.endTalk();
    });

    ui.initUi({
      onSend: (t) => this.onPlayerSay(t),
      onAccept: () => this.acceptContract(),
      onHaggle: () => this.haggle(),
      onSkip: () => this.advance(60),
    });
  }

  // Zoom so the village fills the canvas without showing past its edges
  private fitZoom() {
    const { width, height } = this.scale.gameSize;
    const minZoom = Math.max(width / (W * TILE), height / (H * TILE));
    this.cameras.main.setZoom(Math.max(3, Math.ceil(minZoom)));
  }

  private makeText(text: string, color = '#2a1a05', bg = '#f6ecd8') {
    return this.add
      .text(0, 0, text, {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: '6px',
        color,
        backgroundColor: bg,
        padding: { x: 2, y: 1 },
        wordWrap: { width: 80 },
        align: 'center',
        resolution: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(10000);
  }

  private bubble(target: Actor | 'player', text: string, ms = 3500) {
    // Bubbles stay short; the full line is in the chat panel
    const short = text.length > 48 ? `${text.slice(0, 46)}…` : text;
    const b = { text: this.makeText(short), until: this.time.now + ms };
    if (target === 'player') {
      this.playerBubble?.text.destroy();
      this.playerBubble = b;
    } else {
      target.bubble?.text.destroy();
      target.bubble = b;
    }
  }

  private typing() {
    return document.activeElement?.tagName === 'INPUT';
  }

  private actor(id: NpcId) {
    return this.actors.find((a) => a.def.id === id)!;
  }

  private nearestNpc() {
    let best: Actor | null = null;
    let bestD = 26;
    for (const a of this.actors) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y);
      if (d < bestD) [best, bestD] = [a, d];
    }
    return best;
  }

  private log(kind: LogEntry['kind'], text: string) {
    state.log.push({ minute: state.minute, kind, text });
    ui.renderLog();
  }

  // ---------- Dialogue (mocked; the real build sends this to the model and validates its JSON) ----------

  private startTalk(a: Actor) {
    this.talkingTo = a;
    ui.openChat(a.def);
    const line = this.greeting(a);
    ui.say('npc', line);
    this.bubble(a, line);
  }

  private endTalk() {
    if (!this.talkingTo) return;
    this.talkingTo = null;
    ui.closeChat();
  }

  private greeting(a: Actor): string {
    if (a.def.id === 'smith') {
      const c = state.contract;
      if (c?.status === 'accepted') return `Still at it. Your ${c.item_name} will be ready at ${this.dueText(c)}.`;
      if (c?.status === 'delivered') return 'Treat that blade well. Need anything else forged?';
      return "Name's Brann. Tell me what you want forged and I'll tell you if iron can do it.";
    }
    const m = state.memories.find((x) => x.npc === a.def.id);
    if (!m) return a.def.id === 'crier' ? 'Nothing worth crying about today.' : 'Morning, stranger.';
    if (m.how_learned === 'witnessed') return `I saw it myself! ${m.summary}`;
    return `${npcName(m.told_by!).split(' ')[0]} told me: "${m.summary}" Is it true?`;
  }

  private onPlayerSay(text: string) {
    ui.say('you', text);
    this.bubble('player', text, 2500);
    const a = this.talkingTo;
    if (!a) return;
    let reply: string;
    if (a.def.id !== 'smith') {
      reply = 'I only know what I have seen or been told.';
    } else if (/free|for nothing|no charge/i.test(text)) {
      reply = 'Free? The forge eats coal, friend. Iron costs money.';
      this.log('reject', 'Validator: REJECT contract, price 0 < material cost 40');
    } else if (state.contract && state.contract.status !== 'delivered') {
      reply = 'One commission at a time.';
    } else {
      const c: Contract = {
        item_name: 'Hammerhead Blade',
        description: text,
        stats: { damage: 14, weight: 6, durability: 70 },
        price: 120,
        delivery_hours: 3,
        status: 'proposed',
      };
      state.contract = c;
      reply = "Hm. Heavy at the head, you'll feel it on the backswing. Here's what I can do.";
      ui.say('npc', reply);
      this.bubble(a, reply);
      ui.showContract(c);
      this.log('event', 'CONTRACT_PROPOSED Hammerhead Blade, 120g, 3h');
      return;
    }
    ui.say('npc', reply);
    this.bubble(a, reply);
  }

  private haggle() {
    const c = state.contract;
    if (!c) return;
    c.price = 100;
    c.delivery_hours = 4;
    const reply = 'Fine. 100, but it takes an extra hour. I use the cheaper iron slower.';
    ui.say('npc', reply);
    this.bubble(this.actor('smith'), reply);
    ui.showContract(c);
    this.log('event', 'COUNTER_OFFER 100g, 4h');
  }

  private acceptContract() {
    const c = state.contract;
    if (!c) return;
    if (state.gold < c.price) {
      ui.say('npc', "You can't pay for that.");
      this.log('reject', `Validator: REJECT accept, gold ${state.gold} < ${c.price}`);
      return;
    }
    state.gold -= c.price;
    c.status = 'accepted';
    c.due_minute = Math.ceil(state.minute) + c.delivery_hours * 60;
    ui.renderHud();
    this.log('event', `CONTRACT_ACCEPTED ${c.price}g paid (moved by code)`);
    this.log('event', `START_WORK due ${this.dueText(c)}`);
    const reply = `Done. Come back at ${this.dueText(c)}.`;
    ui.say('npc', reply);
    this.bubble(this.actor('smith'), reply);
  }

  private dueText(c: Contract) {
    const m = c.due_minute! % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  // ---------- World simulation (mocked engine) ----------

  private advance(minutes: number) {
    state.minute += minutes;
    ui.renderHud();
    this.checkDelivery();
  }

  private checkDelivery() {
    const c = state.contract;
    if (c?.status !== 'accepted' || state.minute < c.due_minute!) return;
    c.status = 'delivered';
    state.inventory.push(c);
    ui.renderInventory();

    const smith = this.actor('smith');
    this.bubble(smith, `Your ${c.item_name} is ready!`, 5000);

    // Perception filter: only NPCs within range of the forge witness the delivery
    const ring = this.add.circle(smith.x, smith.y, WITNESS_RADIUS, 0xe8a547, 0.18).setStrokeStyle(1, 0xe8a547).setDepth(2);
    this.tweens.add({ targets: ring, alpha: 0, delay: 2500, duration: 1500, onComplete: () => ring.destroy() });

    const witnesses = this.actors.filter(
      (a) => Phaser.Math.Distance.Between(smith.x, smith.y, a.x, a.y) <= WITNESS_RADIUS,
    );
    const names = witnesses.filter((a) => a.def.id !== 'smith').map((a) => a.def.name.split(' ')[0]);
    this.log('event', `ITEM_DELIVERED ${c.item_name} · witnesses: ${names.join(', ') || 'none'}`);
    for (const a of witnesses) {
      this.remember({ npc: a.def.id, event_id: DELIVERY_EVENT, how_learned: 'witnessed', told_by: null, confidence: 1, summary: RUMOUR[0] });
      if (a.def.id !== 'smith') this.bubble(a, 'Look at that blade!', 3000);
    }
  }

  private remember(m: Memory) {
    state.memories.push(m);
    ui.renderKnowledge();
    if (m.how_learned === 'told_by')
      this.log('memory', `${npcName(m.npc).split(' ')[0]} heard it from ${npcName(m.told_by!).split(' ')[0]} (conf ${m.confidence.toFixed(2)})`);
  }

  private spreadGossip() {
    for (const a of this.actors) {
      const ma = state.memories.find((m) => m.npc === a.def.id);
      if (!ma || ma.confidence < 0.3 || this.time.now < a.gossipCooldown) continue;
      for (const b of this.actors) {
        if (a === b || state.memories.some((m) => m.npc === b.def.id)) continue;
        if (Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) > GOSSIP_RADIUS) continue;
        const hop = Math.min(RUMOUR.indexOf(ma.summary) + 1, RUMOUR.length - 1);
        this.bubble(a, 'Did you hear about the stranger?', 3000);
        this.time.delayedCall(900, () => this.bubble(b, 'No! Tell me.', 2500));
        this.remember({ npc: b.def.id, event_id: DELIVERY_EVENT, how_learned: 'told_by', told_by: a.def.id, confidence: ma.confidence * CONFIDENCE_DECAY, summary: RUMOUR[hop] });
        a.gossipCooldown = this.time.now + 4000;
      }
    }
    const crierMem = state.memories.find((m) => m.npc === 'crier');
    if (crierMem && !this.crierAnnounced) {
      this.crierAnnounced = true;
      this.time.delayedCall(2500, () => {
        const crier = this.actor('crier');
        this.bubble(crier, `Hear ye! ${crierMem.summary}`, 6000);
        this.log('event', `ANNOUNCE by Pell (source conf ${crierMem.confidence.toFixed(2)})`);
      });
    }
  }

  update(time: number, delta: number) {
    // Clock
    if (!this.typing()) {
      const before = Math.floor(state.minute);
      state.minute += (delta / 1000) * MINUTES_PER_SECOND;
      if (Math.floor(state.minute) !== before) {
        ui.renderHud();
        this.checkDelivery();
      }
    }

    // Player movement
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (!this.typing() && !this.talkingTo) {
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

    // NPC movement along their schedules
    for (const a of this.actors) {
      if (this.talkingTo === a) {
        a.sprite.setFlipX(this.player.x < a.x);
      } else if (time >= a.waitUntil) {
        const [tx, ty, wait] = a.def.route[a.wp];
        const dx = px(tx) - a.x;
        const dy = px(ty) - a.y;
        const dist = Math.hypot(dx, dy);
        const step = (NPC_SPEED * delta) / 1000;
        if (dist <= step) {
          a.x = px(tx);
          a.y = px(ty);
          a.wp = (a.wp + 1) % a.def.route.length;
          a.waitUntil = time + (wait ?? 0) * 1000;
          a.walking = false;
        } else {
          a.x += (dx / dist) * step;
          a.y += (dy / dist) * step;
          a.walking = true;
          if (Math.abs(dx) > 0.5) a.sprite.setFlipX(dx < 0);
        }
      } else {
        a.walking = false;
      }
      const bob = a.walking ? -Math.abs(Math.sin(time / 110)) * 1.5 : 0;
      a.sprite.setPosition(Math.round(a.x), Math.round(a.y + bob)).setDepth(a.y);
    }

    // Forge working: furnace flicker and hammer clangs
    const working = state.contract?.status === 'accepted';
    this.furnace.setTint(working && Math.sin(time / 80) > 0 ? 0xffd27a : 0xffffff);
    if (working && time > this.nextClang) {
      this.nextClang = time + 2200;
      this.bubble(this.actor('smith'), 'CLANG!', 700);
    }

    if (time > this.nextGossipCheck) {
      this.nextGossipCheck = time + 400;
      this.spreadGossip();
    }

    // Bubbles follow their speakers
    const place = (b: Bubble | undefined, x: number, y: number) => {
      if (!b) return b;
      if (time > b.until) {
        b.text.destroy();
        return undefined;
      }
      b.text.setPosition(Math.round(x), Math.round(y - 10));
      return b;
    };
    for (const a of this.actors) a.bubble = place(a.bubble, a.x, a.y);
    this.playerBubble = place(this.playerBubble, this.player.x, this.player.y);

    const near = this.talkingTo ? null : this.nearestNpc();
    this.prompt.setVisible(!!near && !this.typing());
    if (near) this.prompt.setPosition(Math.round(near.x), Math.round(near.y - 10));
  }
}
