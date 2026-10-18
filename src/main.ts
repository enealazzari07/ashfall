import { Game } from './core/Game';
import { preloadUrban } from './render/UrbanAssets';
import { preloadHumanBody } from './render/HumanBody';
import { preloadBigZombie, preloadZombieModel } from './render/ZombieModel';
import * as Char from './render/Character';
import * as ZM from './render/ZombieModel';
import * as WM from './render/WorldModels';
import { preloadGlbTrees } from './render/GlbTrees';
import { preloadGarments } from './render/Garments';
import { preloadKit } from './render/KitBody';
import { preloadWorldModels } from './render/WorldModels';
import { ITEMS } from './data/items';
import { WEAPONS } from './data/weapons';
import { LOOT_LISTS } from './data/loot';
import { registerPz } from './pz';
import './ui/theme.css';

// PZ-Items, Waffen und Loot in die Tabellen mischen, bevor das Spiel startet
registerPz({ items: ITEMS, weapons: WEAPONS, loot: LOOT_LISTS });

const timed = (name: string, p: Promise<void>): Promise<void> => {
  const t = performance.now();
  return p.then(() => {
    if (import.meta.env.DEV) console.info(`[load] ${name}: ${Math.round(performance.now() - t)} ms`);
  });
};

Promise.all([
  timed('urban', preloadUrban()), timed('humanbody', preloadHumanBody()), timed('zombie', preloadZombieModel()), timed('trees', preloadGlbTrees()),
  timed('garments', preloadGarments()), timed('kit', preloadKit()), timed('world', preloadWorldModels()),
]).then(() => {
  const game = new Game();
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
  if (import.meta.env.DEV) (window as unknown as { __dev: unknown }).__dev = { Char, ZM, WM };
  game.start();
  void preloadBigZombie(); // 42 MB: im Hintergrund nachladen
});
