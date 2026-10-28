import type { StateView } from '@blacksmith/shared';
import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { VillageScene } from './VillageScene';

// The Phaser village beside the React panels. React hands it every new view; it calls back when the player
// presses E next to someone.
export function Village({ view, onTalk }: { view: StateView; onTalk: (npcId: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<VillageScene | null>(null);
  const talk = useRef(onTalk);
  talk.current = onTalk;
  const latest = useRef(view);
  latest.current = view;

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let gone = false;
    // Wait for the pixel font, so speech bubbles don't render in a fallback font.
    document.fonts.load('8px "Pixelify Sans"').finally(() => {
      if (gone || !host.current) return;
      const s = new VillageScene({ onTalk: (id) => talk.current(id) });
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
        pixelArt: true,
        backgroundColor: '#5a9e4b',
        scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
        physics: { default: 'arcade', arcade: { debug: false } },
        scene: [s],
      });
      s.setView(latest.current);
      scene.current = s;
      if (import.meta.env.DEV) Object.assign(window, { game });
    });
    return () => {
      gone = true;
      scene.current = null;
      game?.destroy(true);
    };
  }, []);

  useEffect(() => {
    scene.current?.setView(view);
  }, [view]);

  return <div className="game" ref={host} aria-label="The village. Walk with WASD or the arrow keys, press E next to someone to talk." />;
}
