import { clockText, Contract, NPCS, NpcDef, npcName, state } from './state';

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

export type UiHandlers = {
  onSend: (text: string) => void;
  onAccept: () => void;
  onHaggle: () => void;
  onSkip: () => void;
};

let handlers: UiHandlers;

export function initUi(h: UiHandlers) {
  handlers = h;
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handlers.onSend(text);
  });
  $('skip').addEventListener('click', () => handlers.onSkip());
  renderHud();
  renderKnowledge();
  renderLog();
}

const portraitPos = (frame: number, size: number) =>
  `-${(frame % 12) * size}px -${Math.floor(frame / 12) * size}px`;

export function renderHud() {
  $('clock').textContent = clockText();
  $('gold').textContent = `🪙 ${state.gold}`;
}

export function openChat(npc: NpcDef) {
  $('chat-empty').hidden = true;
  $('chat').hidden = false;
  $('chat-name').textContent = npc.name;
  $('portrait').style.backgroundPosition = portraitPos(npc.frame, 48);
  $('messages').innerHTML = '';
  // Delay focus so the E keypress that opened the chat doesn't land in the input
  setTimeout(() => $('chat-input').focus(), 30);
}

export function closeChat() {
  $('chat').hidden = true;
  $('chat-empty').hidden = false;
  $<HTMLInputElement>('chat-input').blur();
}

export function say(who: 'you' | 'npc', text: string) {
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  el.textContent = text;
  appendMessage(el);
}

function appendMessage(el: HTMLElement) {
  const box = $('messages');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

export function showContract(c: Contract) {
  const el = document.createElement('div');
  el.className = 'contract';
  el.innerHTML = `
    <div class="title"></div>
    <div class="muted desc"></div>
    <div class="stats">
      <div><b>${c.stats.damage}</b>damage</div>
      <div><b>${c.stats.weight}</b>weight</div>
      <div><b>${c.stats.durability}</b>durability</div>
    </div>
    <div>🪙 <b>${c.price}</b> · ready in <b>${c.delivery_hours}h</b></div>
    <div class="actions">
      <button class="accept">Accept contract</button>
      <button class="secondary haggle">Too pricey</button>
    </div>`;
  el.querySelector('.title')!.textContent = c.item_name;
  el.querySelector('.desc')!.textContent = c.description;
  el.querySelector('.accept')!.addEventListener('click', () => {
    el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    handlers.onAccept();
  });
  el.querySelector('.haggle')!.addEventListener('click', () => {
    el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    handlers.onHaggle();
  });
  appendMessage(el);
}

export function renderKnowledge() {
  const ul = $('knowledge');
  ul.innerHTML = '';
  for (const npc of NPCS) {
    const m = state.memories.find((x) => x.npc === npc.id);
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.textContent = npc.name;
    if (m) {
      const r = document.createElement('div');
      r.className = 'rumour';
      r.textContent = `“${m.summary}”`;
      left.appendChild(r);
    }
    const chip = document.createElement('span');
    if (!m) {
      chip.className = 'chip none';
      chip.textContent = 'knows nothing';
    } else if (m.how_learned === 'witnessed') {
      chip.className = 'chip witnessed';
      chip.textContent = `witnessed · ${m.confidence.toFixed(2)}`;
    } else {
      chip.className = 'chip told';
      chip.textContent = `told by ${npcName(m.told_by!).split(' ')[0]} · ${m.confidence.toFixed(2)}`;
    }
    li.append(left, chip);
    ul.appendChild(li);
  }
}

export function renderLog() {
  const ol = $('log');
  ol.innerHTML = '';
  for (const e of state.log) {
    const li = document.createElement('li');
    li.className = e.kind;
    const t = document.createElement('time');
    t.textContent = clockText(e.minute).split(' · ')[1];
    li.append(t, document.createTextNode(e.text));
    ol.appendChild(li);
  }
}

export function renderInventory() {
  $('inv-panel').hidden = state.inventory.length === 0;
  const box = $('inventory');
  box.innerHTML = '';
  for (const c of state.inventory) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<div class="portrait" title="Muse Image picture goes here"></div><div><div class="title"></div><div class="muted"></div></div>`;
    (el.querySelector('.portrait') as HTMLElement).style.backgroundPosition = portraitPos(104, 64);
    el.querySelector('.title')!.textContent = c.item_name;
    el.querySelector('.muted')!.textContent = `dmg ${c.stats.damage} · wt ${c.stats.weight} · dur ${c.stats.durability}`;
    box.appendChild(el);
  }
}
