import type { StateView } from '@npc-workshop/shared';
import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { withRole } from '../roles';
import { VillageScene } from './VillageScene';

// The Phaser village beside the React panels. React hands it every new view and who the conversation is with (marked
// at their feet); it calls back when the player presses E next to someone or clicks them.
export function Village({ view, onTalk, selected }: { view: StateView; onTalk: (npcId: string) => void; selected: string }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<VillageScene | null>(null);
  const talk = useRef(onTalk);
  talk.current = onTalk;
  const latest = useRef(view);
  latest.current = view;
  const chosen = useRef(selected);
  chosen.current = selected;

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let observer: ResizeObserver | null = null;
    let gone = false;
    // A canvas pixel for every screen pixel, shown at CSS size: on a Retina screen a CSS-sized canvas is stretched 2x,
    // so movement could only land on every other screen pixel. (More than 2x buys nothing you can see.)
    const dpr = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    // Wait for the pixel font, so speech bubbles don't render in a fallback font.
    document.fonts.load('8px "Pixelify Sans"').finally(() => {
      const el = host.current;
      if (gone || !el) return;
      const s = new VillageScene({
        onTalk: (id) => talk.current(id),
        label: (id) => withRole(id, latest.current.people.find((p) => p.id === id)?.name ?? id),
      });
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        pixelArt: true,
        backgroundColor: '#5a9e4b',
        scale: { mode: Phaser.Scale.NONE, width: el.clientWidth * dpr, height: el.clientHeight * dpr, zoom: 1 / dpr },
        // Each frame moves by its own length: a fixed 60 Hz step judders on a 120 Hz screen.
        physics: { default: 'arcade', arcade: { debug: false, fixedStep: false } },
        scene: [s],
      });
      const g = game;
      observer = new ResizeObserver(() => {
        if (el.clientWidth && el.clientHeight) g.scale.resize(el.clientWidth * dpr, el.clientHeight * dpr);
      });
      observer.observe(el);
      s.setView(latest.current);
      s.setSelected(chosen.current);
      scene.current = s;
      if (import.meta.env.DEV) Object.assign(window, { game });
    });
    return () => {
      gone = true;
      observer?.disconnect();
      scene.current = null;
      game?.destroy(true);
    };
  }, []);

  useEffect(() => {
    scene.current?.setView(view);
  }, [view]);
  useEffect(() => {
    scene.current?.setSelected(selected);
  }, [selected]);

  return (
    <div
      className="game"
      ref={host}
      role="img"
      aria-label="The village. Click a villager to talk to them, or walk with WASD or the arrow keys and press E next to someone. You can also choose who to talk to by name at the top of the chat."
    />
  );
}
