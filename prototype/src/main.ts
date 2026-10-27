import Phaser from 'phaser';
import './style.css';
import { VillageScene } from './VillageScene';

function start() {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    pixelArt: true,
    backgroundColor: '#5a9e4b',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [VillageScene],
  });
  if (import.meta.env.DEV) Object.assign(window, { game });
}

// Wait for the pixel font so in-world speech bubbles don't render in a fallback font
document.fonts.load('8px "Pixelify Sans"').finally(start);
