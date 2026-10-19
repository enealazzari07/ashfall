import * as THREE from 'three';
import { Input } from './Input';
import { GameTime } from './Time';
import { PlayerController } from '../player/PlayerController';
import { Inventory } from '../player/Inventory';
import { Level, NEED_KEYS, NeedKey, Needs } from '../player/Needs';
import { Health } from '../player/Health';
import { ChunkManager, Container } from '../world/ChunkManager';
import { Lighting } from '../world/Lighting';
import { Weather } from '../world/Weather';
import { HUD } from '../ui/HUD';
import { MapUI } from '../ui/MapUI';
import { MainMenu, Settings, loadSettings } from '../ui/MainMenu';
import { FACTIONS } from '../data/factions';
import { campCenter } from '../factions/FactionWorld';
import { InventoryUI } from '../ui/InventoryUI';
import { stashInto } from '../player/Stacks';
import { HOTBAR_SIZE, Where } from '../player/Inventory';
import { evalMoodles, levelById } from '../data/moodles';
import { BEDS, BedKind, suggestedSleepHours } from '../data/beds';
import { Thermo, gearFrom } from '../sim/Thermo';
import { Activity, Mood } from '../sim/Mood';
import { ZombieWorld, Zed, chunkRng } from '../world/ZombieWorld';
import { carKey } from '../world/ChunkBuilder';
import { rollLoot } from '../data/loot';
import { movementNoise, visionRange } from '../sim/ZombieAI';
import { Vision } from '../render/Vision';
import { swingAt, zombieStrike } from '../sim/Combat';
import { IMPACT_AT, WeaponDef, weaponOf } from '../data/weapons';
import { Shooter } from '../pz/pzShooter';
import { firearmOf } from '../pz/pzWeapons';
import { PZ_BOX_CONTENT } from '../pz/pzItems';
import type { Demolishable, DoorView, WindowView } from '../world/ChunkManager';
import { MAX_PLANKS } from '../world/Windows';
import { SleepDialog } from '../ui/SleepDialog';
import { PART_NAME, PARTS, PartId, WOUND_NAME, isBleeding, isDirty } from '../player/Body';
import { TREAT_NAME, TREAT_TIME, autoTarget, treat } from '../player/Treatment';
import { ActionQueue } from '../sim/Actions';
import { Skills } from '../sim/Skills';
import { PlayerLevel } from '../sim/Level';
import { Talents } from '../sim/Talents';
import { pointsForLevel, talent } from '../data/talents';
import { BATTERY_FLAT, BATTERY_FRESH, BATTERY_OK, CarParts, crashEngine, enginePower, fuelFraction, installBattery, lightDrain, newParts, refuel, removeBattery, repairEngine, runTick, tryStart } from '../sim/CarParts';
import { CarAct, CarPanel, CarView } from '../ui/CarPanel';
import { Build, DEFAULT_BUILD, Fx, applyBuild, effectsOf, startItems } from '../sim/Profile';
import { SKILL_FX, SKILL_IDS, SkillId, skillName } from '../data/skills';
import { CharacterCreator } from '../ui/CharacterCreator';
import { Stack, hasTag, item } from '../data/items';
import { BENCH_RANGE, PIECES, Recipe, isKnown, missingFor, needsBench } from '../data/recipes';
import { Piece, Rot, STORAGE_PIECES, Structures, footprintOf, snapToWalls } from '../world/Structures';
import { setNightGlow, setWetness } from '../render/Materials';
import { setXrayRadius, updateXray } from '../render/Xray';
import { PostFX } from '../render/PostFX';
import { smokeUniforms } from '../render/Smoke';
import { CHOP_PERIOD, SMASH_PERIOD, WorkPose, dressCharacter, paletteFor } from '../render/Character';
import { FactionWorld } from '../factions/FactionWorld';
import { Npc } from '../factions/Npc';
import { DialogUI, FactionsPanel } from '../ui/FactionUI';
import { COIN } from '../data/items';
import { CraftingUI } from '../ui/CraftingUI';
import { AdminUI } from '../ui/AdminUI';
import { ChatUI } from '../ui/ChatUI';
import { Multiplayer } from '../net/Multiplayer';
import type { MpInfo } from '../ui/MainMenu';
import { Vehicle, collideVehicles } from '../player/Vehicle';
import { Debris } from '../render/Debris';
import { CrashFx } from '../render/CrashFx';
import { CarRig, doorCenterX, makeCar, modelOf } from '../render/CarModel';
import { Speedometer } from '../ui/Speedometer';
import { pushOut } from '../world/collision';
import { CHUNK, Car, FLOOR_H, ROAD, SIDEWALK } from '../world/CityGenerator';
import { SAVE_VERSION, SaveFile, SaveMeta, Snapshot, newSaveId, readSave, writeSave } from './SaveSystem';
import { SaveMenu } from '../ui/SaveMenu';
import { Surface, audio } from '../audio/AudioEngine';
import { LoadingScreen } from '../ui/LoadingScreen';

const STEP = 1 / 60;
const VIEW_H = 13; // halbe sichtbare Höhe in Metern bei Zoom 1
const REACH = 2.2; // Interaktionsreichweite in Metern
const SPLINTER_CHANCE = 0.04;
const TALK_RANGE = 2.8;
const CAR_RANGE = 3.4; // Einstiegsreichweite zum Auto (Mitte)
const CRASH_PARTS: PartId[] = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];

interface Ride {
  v: Vehicle;
  rig: CarRig;
  /** Türöffnung 0..1, Ziel (offen?) und Restzeit bis zum automatischen Schließen */
  doorT: { L: number; R: number };
  doorOpen: { L: boolean; R: boolean };
  closeIn: { L: number; R: number };
  announcedWreck: boolean;
  /** Tank, Batterie und Motor */
  parts: CarParts;
  /** Motorhaube 0..1 */
  hood: number;
  key: string;
  /** Kofferraumdeckel 0..1 */
  lid: number;
  /** Das Auto, wie es in der Welt stand (Ort, Modell, Lack); für Spielstände */
  src: Car;
}
interface Boarding { ride: Ride; side: 'L' | 'R'; t: number; from: THREE.Vector3; to: THREE.Vector3 }

const WARNINGS: Record<NeedKey, [string, string]> = {
  hunger: ['Du bekommst Hunger.', 'Du verhungerst bald – iss etwas!'],
  thirst: ['Du bekommst Durst.', 'Du verdurstest bald – trink etwas!'],
  energy: ['Du wirst müde.', 'Du bist am Ende deiner Kräfte – Kaffee oder Riegel helfen.'],
  warmth: ['Dir wird kalt. Such ein Gebäude auf.', 'Unterkühlung droht – geh sofort nach drinnen!'],
};

const chipGeo = new THREE.BoxGeometry(1, 1, 1);

/** Etwas, das mit Axt oder Vorschlaghammer abgerissen werden kann */
interface DemoTarget {
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** 'breaker' = Axt, Brecheisen oder Vorschlaghammer; 'sledge' = nur Vorschlaghammer */
  need: 'breaker' | 'sledge';
  seconds: number;
  material: 'wood' | 'plaster' | 'brick' | 'metal';
  finish: () => void;
  /** Zimmerwand: wird nicht in einem Zug abgerissen, sondern mit mehreren Hammerschlägen eingeschlagen (Loch wächst) */
  wall?: Demolishable;
  /** Selbst gebautes Teil: Axt, Brecheisen und Hammer packen es wieder ein */
  piece?: boolean;
  /** Eindeutiger Schlüssel (zählt die Schläge) */
  key: string;
  /** Tür: Linksklick öffnet sie weiter, abreißen geht mit Rechtsklick */
  door?: boolean;
  /** Wohin der letzte Schlag ging (Welt), damit das Loch dort entsteht */
  hitAt?: { x: number; z: number };
}

export class Game {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  readonly time = new GameTime();
  /** Tragkraft des Körpers: 14 kg gesamt; der Rucksack fasst mehr, sein Inhalt wiegt weniger */
  readonly inventory = new Inventory(44);
  readonly needs = new Needs();
  readonly health = new Health();
  readonly player: PlayerController;
  private input: Input;
  private world = new ChunkManager();
  private lighting: Lighting;
  private fx: PostFX;
  private vision = new Vision();
  private saveMenu!: SaveMenu;
  private loadingScreen!: LoadingScreen;
  /** Echte Spielzeit in Sekunden und Zeit bis zur nächsten Autospeicherung */
  private playtime = 0;
  private autosaveT = 0;
  /** Schusswaffen: Munition je Waffe, laufendes Nachladen */
  private shooter = new Shooter();
  private reloading = false;
  /** Läuft gerade der Ladebildschirm (Welt wird um den Spieler aufgebaut)? */
  private loadingWorld = false;
  /** Zeitgeber für Schrittgeräusche und Zombie-Stimmen */
  private stepSoundT = 0;
  private groanT = new WeakMap<object, number>();
  private lastInvOpen = false;
  private weather = new Weather();
  private hud = new HUD({
    restart: () => location.reload(),
    inventory: () => this.toggleInventory(),
    map: () => this.map.toggle(),
    build: () => this.ui.openCraft(),
    speed: (n) => this.setSpeed(n),
    run: (on) => this.setRun(on),
    quick: (id) => this.useQuick(id),
  });
  private map!: MapUI;
  private menu!: MainMenu;
  private settings: Settings = loadSettings();
  private started = false;
  private baseScale = 60;
  private resizeFn: () => void = () => {};
  private speed = 1;
  private chipTimer = 0;
  private temp = { out: 17, here: 17 };
  private thermo = new Thermo();
  readonly mood = new Mood();
  readonly zombies = new ZombieWorld();
  /** Zeitaktionen (Looten, Essen, Verbinden, Bauen) */
  readonly actions = new ActionQueue();
  /** Fertigkeiten und gewählter Charakter */
  readonly skills = new Skills();
  /** Charakterstufe: schaltet Rezepte frei */
  readonly level = new PlayerLevel();
  /** Freigeschaltete Talente: Rezepte und Vorteile */
  readonly talents = new Talents();
  private charBuild: Build = { ...DEFAULT_BUILD };
  private traitFx: Fx = effectsOf(DEFAULT_BUILD);
  private skillClock = 0;
  private creator!: CharacterCreator;
  /** Autoteile je Auto (bleiben erhalten) und das geöffnete Motorraum-Fenster */
  private carParts = new Map<string, CarParts>();
  private carPanel!: CarPanel;
  private carRide: Ride | null = null;
  private carPanelT = 0;
  /** Schlag in Arbeit */
  /** Laufender Abriss mit Axt oder Vorschlaghammer: Ziel, Takt und Trefferzähler */
  private demo: { target: DemoTarget; sledge: boolean; n: number; light?: boolean; hit?: boolean } | null = null;
  /** Schläge auf Möbel und gebaute Teile, die noch nicht ganz kaputt sind */
  private objHits = new Map<string, number>();
  /** Ziel unter der Maus, gelb umrandet, solange Hammer oder Axt in der Hand sind */
  private hoverTarget: DemoTarget | null = null;
  private demoGlow = new THREE.Group();
  private demoTick = 0;
  private hitQueued = false;
  private swing: { t: number; w: WeaponDef; hit: boolean; yaw: number } | null = null;
  private stepNoiseT = 0;
  private engineNoiseT = 0;
  private sleepDlg!: SleepDialog;
  private sleepBed: BedKind = 'bad';
  /** Spielsekunden (absolut), zu denen der Schlaf endet */
  private sleepUntil = 0;
  private sleepStart = 0;
  private sleepSpot: { x: number; z: number } | null = null;
  private ui: InventoryUI;
  private crafting: CraftingUI;
  private admin: AdminUI;
  private chat!: ChatUI;
  /** Laufende Mehrspieler-Sitzung (null = Einzelspieler) */
  private mp: Multiplayer | null = null;
  private mpInfo: { addresses: string[]; port: number; hint?: string } = { addresses: [], port: 0 };
  private netLast = new THREE.Vector3();
  private netSpeed = 0;
  private structures = new Structures();
  readonly factions = new FactionWorld();
  private dialog: DialogUI;
  private factionsPanel: FactionsPanel;
  private lastDay = 1;
  private lastNews = '';
  /** Platzierungsmodus: Bauteil aus der Schnellleiste in der Hand, Rechtsklick setzt es */
  private building = false;
  private placing: string | null = null;
  /** Bauteil, dessen Platzierung gerade per Zahltaste beendet wurde (verhindert sofortiges Neustarten) */
  private placeStopped: string | null = null;
  private rot: Rot = 0;
  private ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }),
  );
  /** Auf den Boden gelegte Items */
  private piles: Container[] = [];
  private pileGroup = new THREE.Group();
  private ray = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private sleeping = false;
  private levels: Record<NeedKey, Level> = { hunger: 'ok', thirst: 'ok', energy: 'ok', warmth: 'ok' };
  private hpTier = 0;
  private dead = false;
  private rides: Ride[] = [];
  private driven: Ride | null = null;
  private carGroup = new THREE.Group();
  private debris = new Debris();
  private crashFx = new CrashFx();
  private boarding: Boarding | null = null;
  private shake = 0;
  private shakeOff = new THREE.Vector3();
  private speedo = new Speedometer();
  private acc = 0;
  private last = performance.now();
  /** Adaptive Qualität: gleitender Mittelwert der Bildzeit (ms), Stufe 0 = volle Qualität */
  private frameMs = 16;
  private qualityStage = 0;
  private frameNo = 0;
  private lastFrameT = performance.now();

  constructor() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Schatten nur jedes zweite Bild neu rendern (spart einen Durchlauf über alle Schattenwerfer)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    document.body.appendChild(this.renderer.domElement);
    this.fx = new PostFX(this.renderer, this.scene, this.camera);
    const resize = () => {
      const a = innerWidth / innerHeight;
      this.camera.left = -VIEW_H * a;
      this.camera.right = VIEW_H * a;
      this.camera.top = VIEW_H;
      this.camera.bottom = -VIEW_H;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.fx.setSize(innerWidth, innerHeight);
    };
    window.addEventListener('resize', resize);
    this.resizeFn = resize;
    resize();
    this.applySettings();

    this.input = new Input();
    this.player = new PlayerController(this.input, this.camera);
    this.player.mesh.position.set(4, 0, 4);
    this.player.surface = (x, z, y) => this.world.surfaceY(x, z, y);
    this.player.collide = (p, r) => {
      this.world.resolve(p, r, this.world.levelAt(p.x, p.z, p.y));
      this.structures.resolve(p, r, this.world.levelAt(p.x, p.z, p.y));
      this.resolveCars(p, r, null);
    };
    this.player.findClimb = (pos, dx, dz) => this.world.findClimb(pos, dx, dz, 0.4, this.world.levelAt(pos.x, pos.z, pos.y));
    this.lighting = new Lighting(this.scene, this.renderer);
    this.ghost.visible = false;
    // Gelbe Umrandung des Ziels, das man mit Hammer oder Axt treffen würde
    {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd24a, depthTest: false, transparent: true, opacity: 0.95 }));
      const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.1, depthTest: false, depthWrite: false }));
      edges.renderOrder = fill.renderOrder = 60;
      this.demoGlow.add(fill, edges);
      this.demoGlow.visible = false;
      this.scene.add(this.demoGlow);
    }
    this.scene.add(this.world.group, this.structures.group, this.factions.group, this.zombies.group, this.pileGroup, this.carGroup, this.debris.group, this.crashFx.group, this.player.mesh, this.weather.points, this.ghost);
    this.world.preload(4, 4);

    this.ui = new InventoryUI(this.inventory, {
      craft: (r) => this.craft(r),
      use: (where, index) => this.useItem(where, index),
      act: (label, seconds, run) => this.actions.add({ label, duration: seconds, run }),
      skills: () => this.skills,
      level: () => this.level,
      talents: () => this.talents,
      unlockTalent: (id) => this.unlockTalent(id),
      nearBench: () => this.nearBench(),
      build: () => this.charBuild,
      xp: (id, amount) => this.gainXp(id, amount),
      dropToGround: (stacks) => this.dropToGround(stacks),
      ground: () => this.nearestPile(this.player.mesh.position.x, this.player.mesh.position.z, REACH),
      moodles: () => this.moodles(),
      health: () => this.health,
      thermo: () => this.thermo,
      mood: () => this.mood,
      took: (c) => {
        if (c.kind === 0 && Math.random() < SPLINTER_CHANCE) {
          this.health.wound('handR', 'cut', 'Splitter in der Hand');
          this.hud.toast('Autsch! Ein Splitter – du blutest. Benutze einen Verband.', 'bad');
        }
      },
      toast: (m, k) => this.hud.toast(m, k),
      changed: () => {
        audio.ui('pickup');
        this.refreshUis(false);
      },
    });

    this.sleepDlg = new SleepDialog({ confirm: (hours, bed) => this.startSleep(hours, bed) });

    this.map = new MapUI(this.hud.minimapHost, {
      specOf: (cx, cz) => this.world.specOf(cx, cz),
      markers: () => this.mapMarkers(),
    });
    this.crafting = new CraftingUI(this.inventory, this.talents, () => this.nearBench(), (r) => this.craft(r));
    this.chat = new ChatUI((t) => this.mp?.chat(t));
    this.admin = new AdminUI({
      give: (id, qty) => {
        const left = this.inventory.add(id, qty);
        if (left > 0) this.dropToGround([{ id, qty: left }]);
        this.hud.toast(`${qty}× ${item(id).name}${left > 0 ? ` (${left} auf den Boden gelegt)` : ''}`, 'good');
        this.refreshUis();
        return qty - left;
      },
      heal: () => {
        this.health.heal(100);
        this.hud.toast('Gesundheit aufgefüllt', 'good');
      },
      fillNeeds: () => {
        for (const k of Object.keys(this.needs.values) as (keyof typeof this.needs.values)[]) this.needs.values[k] = 100;
        this.hud.toast('Bedürfnisse aufgefüllt', 'good');
      },
      toast: (m) => this.hud.toast(m, 'info'),
    });

    this.dialog = new DialogUI(this.factions, this.inventory, {
      toast: (m, k) => this.hud.toast(m, k),
      refresh: () => this.refreshUis(),
      day: () => this.time.day,
      onClose: (n) => n.endTalk(),
    });
    this.factionsPanel = new FactionsPanel(this.factions, () => this.time.day);

    // Kleidung hat keine Taschen: getragen wird im Rucksack; die Seitentaschen hat man immer (4 kg)
    this.inventory.pockets = 0;
    this.inventory.sideMin = 4;
    const inv = this.inventory;
    inv.wear('schoolbag');
    inv.wear('hoodie');
    inv.add('water', 1, 'bag');
    inv.add('bread', 1, 'bag');
    inv.add('bandage', 1, 'bag');
    inv.add(COIN, 20);
    inv.hotbar.splice(0, 3, 'water', 'bread', 'bandage');
    this.ui.refresh();
    this.menu = new MainMenu(
      {
        newGame: () => this.newGame(),
        resume: () => {
          this.menu.hide();
          this.input.update(0); // Tastendrücke, die das Menü bedient hat, nicht ins Spiel durchreichen
        },
        quit: () => window.close(),
        apply: (s) => {
          this.settings = s;
          this.applySettings();
        },
        canResume: () => this.started && !this.dead,
        save: () => void this.saveMenu.open('save'),
        load: () => void this.saveMenu.open('load'),
        loadSave: (id) => void this.loadGame(id),
        hostGame: (name, port) => this.hostGame(name, port),
        joinGame: (name, address) => this.joinGame(name, address),
        servers: async () => {
          const api = (window as unknown as { ashfallNet?: { servers(): Promise<{ name: string; ip: string; port: number; players: number }[]> } }).ashfallNet;
          return api ? api.servers().catch(() => []) : [];
        },
        leaveGame: () => this.detachMp('Du hast die Mehrspieler-Sitzung verlassen.'),
        mpInfo: () => this.mpState(),
      },
      this.settings,
    );
    this.saveMenu = new SaveMenu({
      load: (id) => this.loadGame(id),
      save: (name, id) => this.saveGame(name, id),
      suggest: () => `${this.charBuild.name} – Tag ${this.time.day}`,
      toast: (m, k) => this.hud.toast(m, k),
    });
    this.loadingScreen = new LoadingScreen();
    audio.init();
    audio.setVolumes(this.settings.audioMaster, this.settings.audioMusic, this.settings.audioSfx);
    let auto = false;
    try {
      auto = sessionStorage.getItem('ashfall.autostart') === '1';
      sessionStorage.removeItem('ashfall.autostart');
    } catch {
      /* egal */
    }
    this.creator = new CharacterCreator();
    this.carPanel = new CarPanel();
    this.carPanel.onAct = (a) => this.carAct(a);
    this.carPanel.onClose = () => this.closeCarPanel();
    this.player.onVault = () => this.gainXp('nimble', 4);
    this.applyCharacter(this.charBuild, false);
    let loadId: string | null = null;
    try {
      loadId = sessionStorage.getItem('ashfall.load');
      sessionStorage.removeItem('ashfall.load');
    } catch {
      /* egal */
    }
    if (loadId) void this.bootFromSave(loadId);
    else if (auto) this.openCreator();
    else this.menu.show(false);
    this.hud.toast('Willkommen. I Inventar · 1–5 Schnellleiste · F benutzen/sprechen/Auto fahren · C herstellen · B bauen · V Fraktionen.', 'info');
  }

  private refreshUis(inventory = true): void {
    if (inventory) this.ui.refresh();
    this.crafting.refresh();
    this.dialog.refresh();
    this.factionsPanel.refresh();
  }

  // --- Fraktionen ------------------------------------------------------------

  private openDialog(npc: Npc): void {
    this.ui.closeAll();
    this.crafting.toggle(false);
    this.factionsPanel.toggle(false);
    npc.startTalk(this.player.mesh.position);
    this.dialog.open(npc);
  }

  /** Plünderer haben den Spieler erreicht: ein Teil der Vorräte geht verloren. */
  private rob(npc: Npc): void {
    const inv = this.inventory;
    if (!inv.stacks.length) return void this.hud.toast(`${npc.name}: „Nichts zu holen bei dir…“`, 'info');
    const i = Math.floor(Math.random() * inv.stacks.length);
    const s = inv.stacks[i];
    const id = s.id;
    const take = Math.max(1, Math.ceil(s.qty / 2));
    inv.removeAt(i, take);
    this.factions.receiveLoot(id, take);
    this.hud.toast(`${npc.name} entreißt dir ${take}× ${item(id).name}!`, 'bad');
    this.refreshUis();
  }

  private onNewDay(): void {
    const out = this.factions.dailyTick(this.time.day);
    for (const g of out.gifts) {
      const def = this.factions.def(g.faction);
      for (const st of g.stacks) this.inventory.add(st.id, st.qty);
      this.hud.toast(`${def.name} schickt Vorräte (Bündnis).`, 'good');
    }
    const p = this.player.mesh.position;
    if (out.raid) {
      this.factions.spawnRaid(p, 2);
      this.hud.toast('Aschewölfe ziehen auf dich zu! Zahle Tribut oder lauf weg.', 'bad');
    }
    if (out.caravan) {
      this.factions.spawnCaravan(p);
      this.hud.toast('Eine Handelskarawane ist in der Nähe.', 'good');
    }
    const head = this.factions.log[0] ?? '';
    if (head && head !== this.lastNews) {
      this.lastNews = head;
      this.hud.toast(head, 'info');
    }
    this.refreshUis();
  }

  // --- Herstellen, Bauen, Schlafen ----------------------------------------

  /** Steht eine Werkbank in Reichweite? */
  private nearBench(): boolean {
    const p = this.player.mesh.position;
    return !!this.structures.nearest(p.x, p.z, BENCH_RANGE, ['workbench']);
  }

  private craft(r: Recipe): void {
    if (!isKnown(r, this.talents.knownRecipes())) return void this.hud.toast('Dieses Rezept kennst du noch nicht (Talentbaum).', 'warn');
    if (needsBench(r) && !this.nearBench()) return void this.hud.toast('Dafür brauchst du eine Werkbank in der Nähe.', 'warn');
    const miss = missingFor(r, this.inventory);
    if (miss.length) return void this.hud.toast(`Dir fehlt: ${miss.map((m) => (m.startsWith('Werkzeug') ? m : item(m).name)).join(', ')}`, 'warn');
    if (!this.inventory.canSwap(r.inputs, r.output)) return void this.hud.toast('Es fehlt Material oder Platz.', 'warn');
    this.inventory.consume(r.inputs);
    this.inventory.add(r.output.id, r.output.qty);
    if (r.xp) this.gainXp(r.xp.skill, r.xp.amount);
    this.gainCharXp(needsBench(r) ? 9 : 4);
    audio.craft();
    this.hud.toast(`${item(r.output.id).name} hergestellt`, 'good');
    // Bauteile landen auf einem freien Platz der Schnellleiste, damit man sie mit der Zahltaste in die Hand nimmt
    if (item(r.output.id).piece && !this.inventory.hotbar.includes(r.output.id)) {
      const free = this.inventory.hotbar.indexOf(null);
      if (free >= 0) this.inventory.hotbar[free] = r.output.id;
    }
    this.refreshUis();
  }

  private setBuilding(on: boolean): void {
    this.building = on;
    if (!on) this.placing = null;
    document.body.classList.toggle('building', on);
    if (on) {
      this.ui.closeAll();
      this.crafting.toggle(false);
    }
    this.ghost.visible = on;
  }

  /** Bauteil aus dem Inventar in die Hand nehmen: Geist folgt der Maus, Rechtsklick setzt es */
  private startPlacing(pieceId: string): void {
    if (this.placeStopped === pieceId) return;
    this.placing = pieceId;
    this.setBuilding(true);
    this.placing = pieceId; // setBuilding(true) lässt es stehen, nur zur Klarheit
  }

  private groundPoint(y = 0): THREE.Vector3 | null {
    this.ray.setFromCamera(new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.camera);
    const plane = y === 0 ? this.groundPlane : new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    return this.ray.ray.intersectPlane(plane, new THREE.Vector3());
  }

  private handleBuild(): void {
    const def = PIECES.find((q) => q.id === this.placing);
    const itemId = def ? `piece_${def.id}` : '';
    if (!def || this.inventory.count(itemId) < 1) return void this.setBuilding(false);
    if (def.id === 'windowbar') return this.placeWindowBar(itemId);
    this.ghost.rotation.y = 0;
    if (this.input.consume('KeyR')) this.rot = this.rot === 0 ? 1 : 0;
    const p = this.player.mesh.position;
    const lv = this.world.levelAt(p.x, p.z, p.y);
    const hit = this.groundPoint(lv * FLOOR_H);
    if (!hit) return;
    // Wände und Zäune rasten an Hauswänden und eigenen Teilen ein (auch in Gebäuden und auf Etagen); Türöffnungen bleiben frei
    const snapIds = ['wall', 'windowwall', 'fence'];
    const anchors = [...this.world.wallBoxesNear(hit.x, hit.z, 3, lv), ...this.structures.pieces.filter((q) => q.lv === lv && snapIds.includes(q.def.id)).map((q) => q.footprint)];
    const sn = snapToWalls(def, hit.x, hit.z, this.rot, anchors);
    let { x, z } = sn;
    // Umschalt gedrückt: Möbel und Kisten frei platzieren (Raster 10 cm), z. B. dicht an der Wand oder unter der Treppe
    if (this.input.down('ShiftLeft') && !['wall', 'door', 'windowwall', 'fence', 'bed'].includes(def.id)) {
      x = Math.round(hit.x * 10) / 10;
      z = Math.round(hit.z * 10) / 10;
    }
    const prot = sn.rot;
    const near = Math.hypot(x - p.x, z - p.z) <= 6.5;
    const free = near && this.structures.canPlace(def, x, z, prot, this.world, lv);

    const f = footprintOf(def, x, z, prot);
    this.ghost.scale.set(f.w, def.h, f.d);
    this.ghost.position.set(x, lv * FLOOR_H + def.h / 2, z);
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(free ? 0x5dd66f : 0xe5534b);
    this.hud.prompt(`<kbd>Rechtsklick</kbd> ${def.name} setzen · <kbd>R</kbd> drehen · <kbd>Umschalt</kbd> frei platzieren · <kbd>Esc</kbd> beenden`);

    for (let b = this.input.nextClick(); b !== null; b = this.input.nextClick()) {
      if (b !== 2) continue;
      if (!free) {
        this.hud.toast(near ? 'Hier ist kein Platz.' : 'Zu weit weg.', 'warn');
        continue;
      }
      if (!this.inventory.consume([{ id: itemId, qty: 1 }])) continue;
      this.structures.place(def, x, z, prot, lv);
      audio.craft();
      this.refreshUis();
      if (this.inventory.count(itemId) < 1) return void this.setBuilding(false);
    }
  }

  /** Fensterbarrikade: das Fenster unter der Maus bekommt Bretter, immer an der Außenseite der Scheibe */
  private placeWindowBar(itemId: string): void {
    const p = this.player.mesh.position;
    const hit = this.groundPoint(0);
    if (!hit) return;
    let w: WindowView | null = null;
    let bd = 3.2;
    for (const c of this.world.windowsNear(hit.x, hit.z, 3.2)) {
      const d = Math.hypot(c.x - hit.x, c.z - hit.z);
      if (d < bd) [w, bd] = [c, d];
    }
    const close = !!w && Math.hypot(w.x - p.x, w.z - p.z) <= 6.5;
    const ok = !!w && close && !w.state.glass && w.state.planks < MAX_PLANKS;
    this.ghost.visible = !!w;
    if (w) {
      // Die Bretter liegen in der Fensterhalterung auf +z, also nach außen; daraus die Blickrichtung der Außenseite
      const ry = w.pane.parent?.rotation.y ?? 0;
      this.ghost.rotation.y = ry;
      this.ghost.scale.set(w.w, w.h, 0.16);
      this.ghost.position.set(w.x + Math.sin(ry) * 0.3, w.y0 + w.h / 2, w.z + Math.cos(ry) * 0.3);
      (this.ghost.material as THREE.MeshBasicMaterial).color.set(ok ? 0x5dd66f : 0xe5534b);
    }
    this.hud.prompt(w ? (w.state.glass ? 'Erst die Scheibe einschlagen (<kbd>E</kbd> am Fenster)' : `<kbd>Rechtsklick</kbd> Fensterbarrikade außen anbringen · <kbd>Esc</kbd> beenden`) : 'Zeig mit der Maus auf ein Fenster · <kbd>Esc</kbd> beenden');
    for (let b = this.input.nextClick(); b !== null; b = this.input.nextClick()) {
      if (b !== 2 || !w) continue;
      if (w.state.glass) { this.hud.toast('Die Scheibe muss erst eingeschlagen sein.', 'warn'); continue; }
      if (w.state.planks >= MAX_PLANKS) { this.hud.toast('Das Fenster ist schon ganz verbarrikadiert.', 'info'); continue; }
      if (!close) { this.hud.toast('Zu weit weg.', 'warn'); continue; }
      if (!this.inventory.consume([{ id: itemId, qty: 1 }])) continue;
      while (this.world.barricade(w));
      audio.wood(w.x, w.z);
      this.zombies.noise(w.x, w.z, 12);
      this.gainXp('carpentry', 6);
      this.refreshUis();
      if (this.inventory.count(itemId) < 1) return void this.setBuilding(false);
    }
  }

  private interactPiece(p: Piece): void {
    const p0 = this.player.mesh.position;
    if (p.def.id === 'bed') {
      this.askSleep('bad', { x: p.x, z: p.z });
    } else if (p.def.id === 'fire') {
      if (!this.inventory.consume([{ id: 'wood', qty: 1 }])) return void this.hud.toast('Du brauchst Holz.', 'warn');
      this.structures.addWood(p);
      this.hud.toast(`Holz nachgelegt – brennt noch ~${Math.ceil(p.fuel)} Std.`, 'good');
      this.refreshUis();
    }
  }

  /** Schlafdialog öffnen (Bett oder Boden). */
  private askSleep(bed: BedKind, spot: { x: number; z: number } | null): void {
    const energy = this.needs.values.energy;
    if (energy > 85) return void this.hud.toast('Du bist nicht müde genug.', 'info');
    this.ui.closeAll();
    this.crafting.toggle(false);
    this.sleepSpot = spot;
    this.sleepDlg.open({ bed, hours: suggestedSleepHours(energy), energy, quality: this.mood.sleepQuality, clock: this.time.seconds });
  }

  private startSleep(hours: number, bed: BedKind): void {
    const p0 = this.player.mesh.position;
    this.sleepBed = bed;
    this.sleepStart = this.time.absolute;
    this.sleepUntil = this.time.absolute + hours * 3600;
    this.sleeping = true;
    this.time.timeScale = 600;
    this.player.mesh.visible = false;
    if (this.sleepSpot) p0.set(this.sleepSpot.x, 0, this.sleepSpot.z);
    this.hud.setSleeping(true);
  }

  private wake(reason: string, kind: 'info' | 'warn' = 'info'): void {
    this.sleeping = false;
    this.time.timeScale = this.baseScale;
    this.player.mesh.visible = true;
    this.hud.setSleeping(false);
    this.hud.toast(reason, kind);
  }

  // --- Interaktion ---------------------------------------------------------

  private handleKeys(): void {
    const p = this.player.mesh.position;
    this.demoGlow.visible = false; // updateDemoGlow zeigt sie wieder, wenn ein Ziel unter der Maus liegt
    if (this.sleeping) {
      this.hud.prompt(null);
      if (this.input.consume('Escape')) this.wake('Du bist aufgewacht.');
      return;
    }
    if (this.boarding) {
      this.hud.prompt(null);
      return;
    }
    if (this.input.consume('KeyI') || this.input.consume('Tab')) this.toggleInventory();
    if (this.input.consume('KeyM')) this.map.toggle();
    if (this.input.consume('KeyL')) this.hud.togglePanel('log');
    if (this.input.consume('KeyH')) {
      if (this.driven) this.toggleCarLights();
      else this.hud.togglePanel('tips');
    }
    if (this.input.consume('Space') && !this.driven) this.setSpeed(this.speed === 0 ? 1 : 0);
    if (this.input.consume('ControlLeft')) this.setRun(!this.player.runMode);
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (!this.input.consume(`Digit${i + 1}`)) continue;
      // Zahltaste wechselt: laufende Platzierung beenden; dasselbe Bauteil noch einmal gewählt = ablegen
      this.placeStopped = this.placing;
      if (this.building) this.setBuilding(false);
      this.ui.useHotbar(i);
      this.placeStopped = null;
    }
    if (this.input.consume('KeyC')) {
      this.setBuilding(false);
      this.ui.openCraft();
    }
    if (this.input.consume('KeyG')) {
      this.fx.enabled = !this.fx.enabled;
      this.hud.toast(`Grafik: ${this.fx.enabled ? 'Hoch (Umgebungsverdeckung, Bloom, Farbkorrektur)' : 'Schnell'}`, 'info');
    }
    if (this.input.consume('KeyZ') && !this.building) this.askSleep('floor', null);
    if (this.input.consume('KeyV')) {
      this.setBuilding(false);
      this.crafting.toggle(false);
      this.factionsPanel.toggle();
    }
    if (this.input.consume('Escape')) {
      const anything = this.map.isOpen || this.hud.panelOpen || this.ui.inventoryOpen || this.crafting.isOpen
        || this.factionsPanel.isOpen || this.dialog.isOpen || this.building || this.sleepDlg.isOpen;
      if (!anything) this.menu.show(true);
      this.map.toggle(false);
      this.sleepDlg.close();
      this.hud.closePanels();
      this.ui.closeAll();
      this.crafting.toggle(false);
      this.factionsPanel.toggle(false);
      this.dialog.close();
      this.setBuilding(false);
    }

    if (this.driven) {
      for (let b = this.input.nextClick(); b !== null; b = this.input.nextClick());
      if (this.input.consume('KeyE')) this.toggleEngine(this.driven);
      if (this.input.consume('KeyF')) this.exitCar();
      else this.hud.prompt('<kbd>E</kbd> Motor · <kbd>F</kbd> Aussteigen · <kbd>W</kbd> Gas · <kbd>S</kbd> Bremse/Rückwärts · <kbd>A</kbd><kbd>D</kbd> Lenken · <kbd>Space</kbd> Handbremse · <kbd>H</kbd> Licht');
      return;
    }

    if (this.building) {
      this.demoGlow.visible = false;
      this.handleBuild();
      return;
    }
    this.updateDemoGlow();
    this.handleClicks();

    // Gespräch läuft: bei zu großem Abstand beenden
    const talking = this.dialog.current;
    if (talking && talking.distanceTo(p) > TALK_RANGE + 2) this.dialog.close();

    const piece = this.structures.nearest(p.x, p.z, REACH, ['bed', 'fire']);
    const npc = this.dialog.isOpen ? null : this.factions.nearestNpc(p, TALK_RANGE);
    const c0 = this.nearestLootable(p.x, p.z);
    const couch = this.world.sleepSpotNear(p.x, p.z, REACH, this.world.levelAt(p.x, p.z, p.y));
    const carNear = this.nearCar(p);
    const hood = this.carRide ? null : this.nearbyHoods(p.x, p.z, 1.7)[0];
    const win = this.world.windowsNear(p.x, p.z, 1.7).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    // E benutzt, durchsucht und spricht (F geht weiterhin); Möbel und Leichen öffnen sich nicht mehr per Linksklick
    if (this.input.consume('KeyE') || this.input.consume('KeyF')) {
      if (this.carRide) this.closeCarPanel();
      else if (this.dialog.isOpen) this.dialog.close();
      else if (this.ui.openContainer?.loot.length) this.ui.takeAll();
      else if (npc && (!c0 || npc.distanceTo(p) <= Math.hypot(c0.x - p.x, c0.z - p.z))) this.openDialog(npc);
      else if (c0?.kind === -2) this.openTrunk(c0);
      else if (c0) this.ui.showContainer(c0);
      else if (piece) this.interactPiece(piece);
      else if (couch) this.askSleep(couch.good ? 'good' : 'bad', { x: couch.x, z: couch.z });
      else if (hood) this.openHood(hood);
      else if (win) this.interactWindow(win);
      else if (carNear) this.startBoarding(carNear);
    }
    const open = this.ui.openContainer;
    if (open && Math.hypot(open.x - p.x, open.z - p.z) > REACH + 1.2) this.ui.closeAll();
    this.cleanPiles();
    if (this.carRide && Math.hypot(this.carRide.v.x - p.x, this.carRide.v.z - p.z) > 5.5) this.closeCarPanel();

    if (this.ui.inventoryOpen || this.dialog.isOpen) return void this.hud.prompt(null);
    if (npc && (!c0 || npc.distanceTo(p) <= Math.hypot(c0.x - p.x, c0.z - p.z))) {
      return void this.hud.prompt(`<kbd>E</kbd> Mit ${npc.name} sprechen (${npc.def.name})`);
    }
    const near = c0;
    if (near) return void this.hud.prompt(`<kbd>E</kbd> ${near.name} durchsuchen`);
    if (piece?.def.id === 'bed') return void this.hud.prompt('<kbd>E</kbd> Schlafen');
    if (couch) return void this.hud.prompt(`<kbd>E</kbd> Auf ${couch.name === 'Sofa' ? 'dem Sofa' : 'dem Bett'} schlafen`);
    if (piece?.def.id === 'fire') {
      return void this.hud.prompt(
        piece.fuel > 0
          ? `<kbd>E</kbd> Holz nachlegen (noch ~${Math.ceil(piece.fuel)} Std.)`
          : '<kbd>E</kbd> Feuer anzünden (1 Holz)',
      );
    }
    if (this.carRide) return void this.hud.prompt('<kbd>E</kbd> Motorhaube schließen');
    if (hood) return void this.hud.prompt('<kbd>E</kbd> Motorhaube öffnen');
    if (win && !carNear) return void this.hud.prompt(this.windowPrompt(win));
    if (carNear) return void this.hud.prompt('<kbd>E</kbd> Einsteigen');
    const handNow = this.inventory.equipment.hand;
    if (handNow && (hasTag(handNow, 'breaker') || hasTag(handNow, 'hammer')) && !this.building) {
      const dt = this.findDemoTarget();
      if (dt) {
        const ok = this.demoToolOk(dt);
        if (dt.wall) return void this.hud.prompt(ok.ok ? `<kbd>Linksklick</kbd> ${dt.name} einschlagen (mehrmals schlagen)` : `${dt.name}: nur mit Hammer`);
        if (dt.door) return void this.hud.prompt(ok.ok ? `<kbd>Rechtsklick</kbd> ${dt.name} abreißen · <kbd>Linksklick</kbd> öffnen` : `${dt.name}: nur mit Axt, Hammer oder Brecheisen`);
        return void this.hud.prompt(ok.ok ? `<kbd>Linksklick</kbd> ${dt.name} zerschlagen (mehrmals) · <kbd>Rechtsklick</kbd> ganz abreißen` : `${dt.name}: nur mit Vorschlaghammer`);
      }
    }
    const doorNear = this.world.doorsNear(p.x, p.z, 3, this.world.levelAt(p.x, p.z, p.y)).sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z))[0];
    if (doorNear) return void this.hud.prompt(doorNear.locked && !doorNear.wanted ? `<kbd>Linksklick</kbd> Tür abgeschlossen – ${this.inventory.hasTag('lockpick') ? 'knacken (<kbd>Shift</kbd> aufbrechen)' : 'aufbrechen (Brecheisen, Axt, Vorschlaghammer)'}` : `<kbd>Linksklick</kbd> Tür ${doorNear.wanted ? 'schließen' : 'öffnen'}`);
    this.hud.prompt(null);
  }

  // --- Fahrzeuge -------------------------------------------------------------

  /** Auto in Einstiegsreichweite: eigenes (schon gefahrenes) oder parkendes aus der Welt */
  private nearCar(p: THREE.Vector3): Ride | Car | null {
    let best: Ride | Car | null = this.world.nearestCar(p.x, p.z, CAR_RANGE);
    let bestD = best ? Math.hypot(best.x - p.x, best.z - p.z) : CAR_RANGE;
    for (const r of this.rides) {
      const d = Math.hypot(r.v.x - p.x, r.v.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  /** Kofferräume (je Auto einer, Inhalt bleibt erhalten) */
  private trunks = new Map<string, Container>();

  private trunkFor(key: string, x: number, z: number): Container {
    let c = this.trunks.get(key);
    if (!c) {
      const r = chunkRng(Math.round(x * 10), Math.round(z * 10), 33);
      c = { key: `trunk:${key}`, name: 'Kofferraum', kind: -2, x, z, level: 0, marker: new THREE.Mesh(), loot: rollLoot(r, undefined, 'car') };
      this.trunks.set(key, c);
    }
    return c;
  }

  /** Kofferräume in Reichweite: Heckpunkt des Autos, parkend oder bereits genutzt */
  private nearbyTrunks(x: number, z: number, range: number): Container[] {
    const out: Container[] = [];
    for (const car of this.world.carsNear(x, z, range + 4)) {
      const sp = modelOf(car.model);
      const rx = car.x + Math.cos(car.rot) * (sp.tailX - 0.8), rz = car.z - Math.sin(car.rot) * (sp.tailX - 0.8);
      if (Math.hypot(rx - x, rz - z) <= range) out.push(this.trunkFor(carKey(car), rx, rz));
    }
    for (const r of this.rides) {
      if (r === this.driven) continue;
      const f = r.v.forward(), t = r.rig.spec.tailX - 0.8;
      const rx = r.v.x + f.x * t, rz = r.v.z + f.z * t;
      if (Math.hypot(rx - x, rz - z) <= range) {
        const c = this.trunkFor(r.key, rx, rz);
        c.x = rx;
        c.z = rz;
        out.push(c);
      }
    }
    return out;
  }

  /** Kofferraum öffnen: parkende Autos werden dafür zum Fahrzeugobjekt, damit der Deckel aufgehen kann */
  private openTrunk(c: Container): void {
    const key = c.key.slice(6);
    if (!this.rides.some((r) => r.key === key)) {
      const car = this.world.carsNear(c.x, c.z, 6).find((q) => carKey(q) === key);
      if (car) this.makeRide(car);
    }
    this.ui.showContainer(c);
  }

  /** Autoteile eines Autos: je Position einmal erzeugt, danach verändert */
  private partsOf(key: string, x: number, z: number): CarParts {
    let p = this.carParts.get(key);
    if (!p) {
      p = newParts(chunkRng(Math.round(x * 10), Math.round(z * 10), 71));
      this.carParts.set(key, p);
    }
    return p;
  }

  /** Motor anlassen oder abstellen */
  private toggleEngine(ride: Ride): void {
    const v = ride.v;
    if (v.engineOn) {
      v.engineOn = false;
      return void this.hud.toast('Motor aus', 'info');
    }
    if (v.totalled) return void this.hud.toast('Das Auto ist ein Wrack.', 'warn');
    const res = tryStart(ride.parts, Math.random);
    v.engineFactor = enginePower(ride.parts);
    this.zombies.noise(v.x, v.z, res.ok ? 16 : 9);
    audio.engineStart(res.ok);
    this.hud.toast(res.msg, res.ok ? 'good' : 'warn');
    if (res.ok) {
      v.engineOn = true;
      this.engineNoiseT = 0;
    }
  }

  /** Vordere Stoßfänger-Punkte parkender oder schon benutzter Autos in Reichweite (für die Motorhaube) */
  private nearbyHoods(x: number, z: number, range: number): { key: string; x: number; z: number }[] {
    const out: { key: string; x: number; z: number }[] = [];
    for (const car of this.world.carsNear(x, z, range + 4)) {
      const sp = modelOf(car.model);
      const hx = car.x + Math.cos(car.rot) * (sp.noseX + 0.7), hz = car.z - Math.sin(car.rot) * (sp.noseX + 0.7);
      if (Math.hypot(hx - x, hz - z) <= range) out.push({ key: carKey(car), x: hx, z: hz });
    }
    for (const r of this.rides) {
      if (r === this.driven) continue;
      const f = r.v.forward(), t = r.rig.spec.noseX + 0.7;
      const hx = r.v.x + f.x * t, hz = r.v.z + f.z * t;
      if (Math.hypot(hx - x, hz - z) <= range) out.push({ key: r.key, x: hx, z: hz });
    }
    return out;
  }

  private openHood(h: { key: string; x: number; z: number }): void {
    let ride = this.rides.find((r) => r.key === h.key);
    if (!ride) {
      const car = this.world.carsNear(h.x, h.z, 6).find((q) => carKey(q) === h.key);
      if (car) ride = this.makeRide(car);
    }
    if (!ride) return;
    this.carRide = ride;
    this.zombies.noise(ride.v.x, ride.v.z, 4);
    this.carPanel.open(this.carView(ride));
  }

  private closeCarPanel(): void {
    this.carRide = null;
    this.carPanel.close();
  }

  private carView(r: Ride): CarView {
    const inv = this.inventory;
    return {
      name: modelOf(r.v.model).name,
      fuel: r.parts.fuel,
      tank: r.parts.tank,
      battery: r.parts.battery,
      engine: r.parts.engine,
      body: r.v.health,
      hasTool: inv.hasTag('mechanic'),
      cans: inv.count('gascan'),
      engineParts: inv.count('enginepart'),
      batteries: inv.count('battery') + inv.count('flatbattery'),
      mechanics: this.skills.level('mechanics'),
    };
  }

  private refreshCarPanel(): void {
    if (this.carRide) this.carPanel.update(this.carView(this.carRide));
  }

  /** Arbeiten am Auto als Zeitaktionen */
  private carAct(a: CarAct): void {
    const r = this.carRide;
    if (!r) return;
    const mech = this.skills.level('mechanics');
    const t = (s: number) => s * SKILL_FX.mechTime(mech) * this.talents.perks().mechTime;
    const inv = this.inventory;
    const done = (): void => {
      this.zombies.noise(r.v.x, r.v.z, 10);
      this.refreshUis();
      this.refreshCarPanel();
    };
    const tool = a !== 'fuel';
    if (tool && !inv.hasTag('mechanic')) return void this.hud.toast('Dafür brauchst du einen Werkzeugkasten.', 'warn');
    if (a === 'bat-out') {
      if (r.parts.battery === null) return;
      this.actions.add({
        label: 'Mechanik: Batterie ausbauen',
        duration: t(6),
        run: () => {
          const charge = removeBattery(r.parts);
          if (charge === null) return;
          const id = charge >= BATTERY_OK ? 'battery' : 'flatbattery';
          if (inv.add(id, 1) > 0) this.dropToGround([{ id, qty: 1 }]);
          this.gainXp('mechanics', 8);
          this.hud.toast('Batterie ausgebaut', 'info');
          done();
        },
      });
    } else if (a === 'bat-in') {
      if (r.parts.battery !== null) return;
      const id = inv.count('battery') > 0 ? 'battery' : inv.count('flatbattery') > 0 ? 'flatbattery' : null;
      if (!id) return void this.hud.toast('Du hast keine Batterie dabei.', 'warn');
      this.actions.add({
        label: 'Mechanik: Batterie einbauen',
        duration: t(6),
        run: () => {
          if (!inv.consume([{ id, qty: 1 }])) return;
          installBattery(r.parts, id === 'battery' ? BATTERY_FRESH : BATTERY_FLAT);
          this.gainXp('mechanics', 6);
          this.hud.toast('Batterie eingebaut', 'good');
          done();
        },
      });
    } else if (a === 'fuel') {
      if (inv.count('gascan') < 1) return void this.hud.toast('Du brauchst einen vollen Benzinkanister.', 'warn');
      this.actions.add({
        label: 'Mechanik: Tanken',
        duration: t(4),
        run: () => {
          if (!inv.consume([{ id: 'gascan', qty: 1 }])) return;
          const added = refuel(r.parts, 10);
          if (inv.add('emptycan', 1) > 0) this.dropToGround([{ id: 'emptycan', qty: 1 }]);
          this.gainXp('mechanics', 4);
          this.hud.toast(`${added.toFixed(1)} Liter getankt`, 'good');
          done();
        },
      });
    } else if (a === 'repair') {
      if (inv.count('enginepart') < 1) return void this.hud.toast('Dir fehlen Motorteile.', 'warn');
      this.actions.add({
        label: 'Mechanik: Motor reparieren',
        duration: t(10),
        run: () => {
          if (!inv.consume([{ id: 'enginepart', qty: 1 }])) return;
          const added = repairEngine(r.parts, 25 * SKILL_FX.repair(mech) * this.talents.perks().repair);
          this.gainXp('mechanics', 18);
          this.hud.toast(`Motor um ${Math.round(added)} % verbessert`, 'good');
          done();
        },
      });
    }
  }

  private makeRide(car: Car): Ride {
    this.world.takeCar(car);
    const v = new Vehicle(car.x, car.z, car.rot, car.color, car.model);
    const rig = makeCar(car.color, car.model, car.livery, car.tier);
    this.carGroup.add(rig.group);
    const ride: Ride = {
      v, rig, doorT: { L: 0, R: 0 }, doorOpen: { L: false, R: false }, closeIn: { L: 0, R: 0 }, announcedWreck: false, key: carKey(car), lid: 0, src: car, hood: 0, parts: this.partsOf(carKey(car), car.x, car.z),
    };
    v.engineOn = false;
    v.engineFactor = enginePower(ride.parts);
    this.rides.push(ride);
    this.syncRide(ride, 0);
    return ride;
  }

  /** Tür geht auf, die Figur läuft hin, steigt ein, die Tür fällt zu */
  private startBoarding(target: Ride | Car): void {
    const ride = 'v' in target ? target : this.makeRide(target);
    const p = this.player.mesh.position;
    const f = ride.v.forward();
    const left = { x: f.z, z: -f.x };
    const side: 'L' | 'R' = (p.x - ride.v.x) * left.x + (p.z - ride.v.z) * left.z >= 0 ? 'L' : 'R';
    this.setBuilding(false);
    this.ui.closeAll();
    this.dialog.close();
    this.crafting.toggle(false);
    this.factionsPanel.toggle(false);
    ride.doorOpen[side] = true;
    ride.closeIn[side] = 0;
    this.player.driving = true;
    const sp = ride.rig.spec;
    const to = ride.rig.localToWorld(doorCenterX(sp), 0, (side === 'L' ? -1 : 1) * (sp.W / 2 + 0.3));
    this.boarding = { ride, side, t: 0, from: p.clone(), to: new THREE.Vector3(to.x, 0, to.z) };
  }

  private boardStep(dt: number): void {
    const b = this.boarding;
    if (!b) return;
    b.t += dt;
    const k = Math.min(1, b.t / 0.45);
    const e = k * k * (3 - 2 * k);
    this.player.mesh.position.lerpVectors(b.from, b.to, e);
    if (b.t < 0.5) return;
    this.boarding = null;
    this.enterCar(b.ride, b.side);
  }

  private enterCar(ride: Ride, side: 'L' | 'R'): void {
    ride.closeIn[side] = 0.15;
    ride.v.handbrake = false;
    this.driven = ride;
    this.player.driving = true;
    this.player.mesh.visible = false;
    this.speedo.show(true);
    document.body.classList.add('driving');
    this.closeCarPanel();
    this.hud.toast('Du sitzt im Auto. E Motor starten · W Gas · S Bremse · A/D Lenken · Space Handbremse · H Licht · F Aussteigen.', 'info');
  }

  private exitCar(): void {
    const ride = this.driven;
    if (!ride) return;
    const { v } = ride;
    const f = v.forward();
    const left = { x: f.z, z: -f.x };
    const sp = ride.rig.spec;
    const dc = doorCenterX(sp), side = sp.W / 2 + 1.1, end = sp.len / 2 + 1;
    const spots = [
      { x: v.x + left.x * side + f.x * dc, z: v.z + left.z * side + f.z * dc, side: 'L' as const },
      { x: v.x - left.x * side + f.x * dc, z: v.z - left.z * side + f.z * dc, side: 'R' as const },
      { x: v.x - f.x * end, z: v.z - f.z * end, side: 'L' as const },
      { x: v.x + f.x * end, z: v.z + f.z * end, side: 'L' as const },
    ];
    const free = spots.find((s) => !this.world.overlapsWorld({ x: s.x, z: s.z, w: 0.6, d: 0.6 }, 0)) ?? spots[0];
    v.engineOn = false;
    this.player.mesh.position.set(free.x, 0, free.z);
    this.player.mesh.visible = true;
    this.player.driving = false;
    this.driven = null;
    ride.doorOpen[free.side] = true;
    ride.closeIn[free.side] = 1.1;
    this.speedo.show(false);
    document.body.classList.remove('driving');
  }

  private toggleCarLights(): void {
    if (!this.driven) return;
    const v = this.driven.v;
    if (v.totalled) return void this.hud.toast('Die Batterie ist hin.', 'warn');
    if (!v.lights && (this.driven.parts.battery ?? 0) <= 0) return void this.hud.toast('Ohne Batterie gibt es kein Licht.', 'warn');
    v.lights = !v.lights;
    this.driven.rig.setLights(v.lights);
    this.hud.toast(v.lights ? 'Licht an' : 'Licht aus', 'info');
  }

  /** Schiebt einen Kreis aus allen geparkten (nicht gesteuerten) Autos heraus */
  private resolveCars(p: THREE.Vector3, r: number, except: Ride | null): void {
    for (const e of this.rides) {
      if (e === except || e === this.driven) continue;
      const c = Math.abs(Math.cos(e.v.rot)), s = Math.abs(Math.sin(e.v.rot)), dm = e.v.dims;
      pushOut(p, r, { x: e.v.x, z: e.v.z, w: c * dm.len + s * dm.W, d: s * dm.len + c * dm.W });
    }
  }

  private syncRide(e: Ride, dt: number): void {
    const { v, rig } = e;
    rig.group.position.set(v.x, 0, v.z);
    rig.group.rotation.y = v.rot;
    const roll = (v.speed * dt) / rig.spec.wheelR;
    for (const w of rig.wheels) w.rotation.z -= roll;
    for (const pv of rig.steerPivots) pv.rotation.y = v.steerAngle;
    rig.setBraking(v.braking);
    const lidWant = this.ui.openContainer?.key === `trunk:${e.key}`;
    e.lid += Math.sign((lidWant ? 1 : 0) - e.lid) * Math.min(Math.abs((lidWant ? 1 : 0) - e.lid), dt * 2.5);
    rig.setLid('trunk', e.lid);
    const hoodWant = this.carRide === e ? 1 : 0;
    e.hood += Math.sign(hoodWant - e.hood) * Math.min(Math.abs(hoodWant - e.hood), dt * 2.2);
    rig.setLid('hood', e.hood);
    for (const sd of ['L', 'R'] as const) {
      if (e.closeIn[sd] > 0) {
        e.closeIn[sd] -= dt;
        if (e.closeIn[sd] <= 0) e.doorOpen[sd] = false;
      }
      const goal = e.doorOpen[sd] ? 1 : 0;
      const d = goal - e.doorT[sd];
      if (d !== 0) {
        e.doorT[sd] += Math.sign(d) * Math.min(Math.abs(d), dt * 3.2);
        rig.setDoor(sd, e.doorT[sd]);
      }
    }
  }

  /** Aufprall verarbeiten: Verformung, Teile, Funken, Kamerawackeln, Verletzung */
  private handleCrash(e: Ride): void {
    const { v, rig } = e;
    const c = v.crash;
    if (!c) return;
    v.crash = null;
    v.impact = 0;
    const own = e === this.driven;
    if (c.zone === 'front') crashEngine(e.parts, c.damage);
    if (c.damage > 0) {
      rig.deform(v.zones);
      for (const obj of rig.shedParts(v.zones, c.strength)) {
        const vel = new THREE.Vector3(c.nx * (2 + c.strength * 0.18) + (Math.random() - 0.5) * 3, 3 + Math.random() * 4, c.nz * (2 + c.strength * 0.18) + (Math.random() - 0.5) * 3);
        const ang = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        this.debris.add(obj, vel, ang);
      }
    }
    if (c.strength > 2) {
      audio.crash(c.strength, c.x, c.z);
      const n = Math.min(70, Math.round(c.strength * 4));
      this.zombies.noise(c.x, c.z, Math.min(45, 12 + c.strength * 3));
      this.crashFx.sparkBurst(c.x, 0.6, c.z, c.nx, c.nz, n, 4 + c.strength * 0.3);
      this.crashFx.dust(c.x, c.z, Math.min(18, Math.round(c.strength)), 1.6);
      if (c.damage > 8) this.crashFx.shards(c.x, 1.0, c.z, Math.min(40, Math.round(c.damage)), 3 + c.strength * 0.2);
    }
    if (own) {
      this.shake = Math.max(this.shake, Math.min(1, c.strength * 0.045));
      if (c.strength > 9) {
        const dmg = Math.round((c.strength - 9) * 2);
        this.health.hurt(dmg, 'Autounfall');
        const hit = CRASH_PARTS[Math.floor(Math.random() * CRASH_PARTS.length)];
        const kind = c.strength > 14 ? (Math.random() < 0.35 ? 'fracture' : 'deep') : c.strength > 11 ? 'cut' : 'scratch';
        this.health.wound(hit, kind, 'Autounfall');
        this.hud.toast(`Aufprall! ${WOUND_NAME[kind]}: ${PART_NAME[hit]}.`, 'bad');
      }
    } else {
      const d = Math.hypot(e.v.x - this.player.mesh.position.x, e.v.z - this.player.mesh.position.z);
      if (d < 30) this.shake = Math.max(this.shake, Math.min(0.5, c.strength * 0.02));
    }
    if (v.totalled && !e.announcedWreck) {
      e.announcedWreck = true;
      if (own) this.hud.toast('Totalschaden! Der Motor ist hin – steig aus (F).', 'bad');
    }
  }

  /** Ein Simulationsschritt für alle Fahrzeuge */
  private driveStep(dt: number): void {
    const i = this.input;
    for (const e of this.rides) {
      const { v } = e;
      const own = e === this.driven;
      if (!own && !v.moving) continue;
      const inp = own
        ? {
            throttle: i.down('KeyW') || i.down('ArrowUp') ? 1 : 0,
            brake: i.down('KeyS') || i.down('ArrowDown') ? 1 : 0,
            steer: (i.down('KeyA') || i.down('ArrowLeft') ? 1 : 0) - (i.down('KeyD') || i.down('ArrowRight') ? 1 : 0),
            handbrake: i.down('Space'),
          }
        : { throttle: 0, brake: 0, steer: 0, handbrake: true };
      v.engineFactor = enginePower(e.parts);
      v.update(dt, inp, (p, r) => {
        this.world.resolve(p, r, 0);
        this.structures.resolve(p, r);
      });
      if (v.engineOn) {
        if (runTick(e.parts, dt, v.speed, inp.throttle).outOfFuel) {
          v.engineOn = false;
          if (own) this.hud.toast('Der Tank ist leer – der Motor geht aus.', 'warn');
        }
        if (e.parts.engine <= 0) v.engineOn = false;
      } else if (v.lights && !lightDrain(e.parts, dt)) {
        v.lights = false;
        e.rig.setLights(false);
        if (own) this.hud.toast('Die Batterie ist leer – das Licht erlischt.', 'warn');
      }
    }
    // Auto gegen Auto
    for (let a = 0; a < this.rides.length; a++) {
      for (let b = a + 1; b < this.rides.length; b++) {
        const A = this.rides[a].v, B = this.rides[b].v;
        if (!A.moving && !B.moving) continue;
        if (Math.hypot(A.x - B.x, A.z - B.z) > 6) continue;
        collideVehicles(A, B);
      }
    }
    for (const e of this.rides) {
      const { v } = e;
      const own = e === this.driven;
      this.handleCrash(e);
      this.syncRide(e, dt);
      if (v.health < 45) {
        const at = e.rig.localToWorld(e.rig.spec.noseX - 0.8, e.rig.spec.hoodFront, 0);
        this.crashFx.plume(at.x, at.y, at.z, 1 - v.health / 45, dt, v.totalled);
      }
      if (own) {
        this.player.mesh.position.set(v.x, 0, v.z);
        this.player.mesh.rotation.y = v.rot;
        this.scareNpcs(v, dt);
      }
    }
  }

  /** Passanten springen zur Seite, wenn ein Auto auf sie zukommt */
  private scareNpcs(v: Vehicle, dt: number): void {
    const f = v.forward();
    const sp = Math.abs(v.speed);
    for (const n of this.factions.npcs) {
      const q = n.mesh.position;
      const dx = q.x - v.x, dz = q.z - v.z;
      if (dx * dx + dz * dz > 100) continue;
      const along = dx * f.x + dz * f.z;
      const side = dx * f.z - dz * f.x; // >0 links vom Auto
      const reach = 2 + sp * 0.5;
      if (Math.abs(side) > 3 || along < -2.4 || along > reach) continue;
      const k = (3.2 - Math.abs(side)) * (0.8 + sp * 0.3) * dt;
      const s = side >= 0 ? 1 : -1;
      q.x += f.z * s * k;
      q.z += -f.x * s * k;
    }
  }

  // --- Inventar --------------------------------------------------------------

  /** Nächster Behälter oder Bodenhaufen mit Inhalt. */
  /** Behälter zu einem gebauten Teil (Kiste, Schrank): teilt sich die Liste mit dem Bauteil, damit der Inhalt im Spielstand bleibt */
  private pieceBoxes = new WeakMap<Piece, Container>();

  private boxOf(p: Piece): Container {
    let c = this.pieceBoxes.get(p);
    if (!c) {
      c = { key: `piece:${p.id}`, name: p.def.name, kind: 90, x: p.x, z: p.z, level: p.lv, marker: new THREE.Mesh(), loot: p.loot };
      this.pieceBoxes.set(p, c);
    }
    return c;
  }

  private nearestLootable(x: number, z: number): Container | null {
    const level = this.world.levelAt(x, z, this.player.mesh.position.y);
    const cands: (Container | null)[] = [this.world.nearestContainer(x, z, REACH, level), ...this.nearbyTrunks(x, z, REACH)];
    for (const q of this.structures.pieces) if (STORAGE_PIECES.has(q.def.id) && q.lv === level && Math.hypot(q.x - x, q.z - z) < REACH) cands.push(this.boxOf(q));
    const pile = this.nearestPile(x, z, REACH);
    if (pile?.loot.length) cands.push(pile);
    for (const k of this.zombies.corpses) if (k.loot.length && Math.hypot(k.x - x, k.z - z) < REACH) cands.push(k);
    let best: Container | null = null;
    let bd = Infinity;
    for (const c of cands) {
      if (!c) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) [best, bd] = [c, d];
    }
    return best;
  }

  private nearestPile(x: number, z: number, range: number): Container | null {
    let best: Container | null = null;
    let bd = range;
    const level = this.world.levelAt(x, z, this.player.mesh.position.y);
    for (const c of this.piles) {
      if (c.level !== level) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) [best, bd] = [c, d];
    }
    return best;
  }

  /** Legt Items vor die Füße des Spielers (bestehender Haufen in der Nähe wird weiterbenutzt). */
  private dropToGround(stacks: Stack[]): void {
    const p = this.player.mesh.position;
    let pile = this.nearestPile(p.x, p.z, 1.6);
    if (!pile) {
      const fx = p.x + Math.sin(this.player.mesh.rotation.y) * 0.7;
      const fz = p.z + Math.cos(this.player.mesh.rotation.y) * 0.7;
      const marker = makePileMesh();
      marker.position.set(fx, p.y + 0.13, fz);
      marker.rotation.y = Math.random() * Math.PI;
      this.pileGroup.add(marker);
      pile = { key: `pile:${Date.now()}:${Math.random()}`, name: 'Boden', kind: -1, x: fx, z: fz, loot: [], marker, level: this.world.levelAt(p.x, p.z, p.y) };
      this.piles.push(pile);
    }
    for (const s of stacks) stashInto(pile.loot, s.id, s.qty);
    if (this.ui.inventoryOpen && !this.ui.openContainer) this.ui.showContainer(pile);
  }

  /** Leere Bodenhaufen entfernen (außer dem gerade geöffneten). */
  private cleanPiles(): void {
    const open = this.ui.openContainer;
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const c = this.piles[i];
      if (c.loot.length || c === open) continue;
      this.pileGroup.remove(c.marker);
      this.piles.splice(i, 1);
    }
  }

  /** Item aus Körper oder Rucksack benutzen. */
  private useItem(where: Where, index: number): void {
    const s = this.inventory.list(where)[index];
    if (!s || this.dead) return;
    const d = item(s.id);
    if (d.piece) {
      this.ui.closeAll();
      return this.startPlacing(d.piece);
    }
    const u = d.use;
    if (!u) return void this.hud.toast(`${d.name} kann man nicht benutzen.`, 'warn');
    if (u.treat) {
      // Schnellanwendung: die dringendste passende Wunde (gezielt behandelt man im Gesundheits-Reiter)
      const action = u.treat;
      if (!autoTarget(this.health, action)) return void this.hud.toast('Gerade nicht nötig.', 'info');
      this.actions.add({
        label: TREAT_NAME[action],
        duration: TREAT_TIME[action] * SKILL_FX.treatTime(this.skills.level('firstaid')) * this.talents.perks().treat,
        run: () => {
          const target = autoTarget(this.health, action);
          if (!target) return void this.hud.toast('Gerade nicht nötig.', 'info');
          const res = treat(this.health, this.inventory, target.part, target.index, action, { doctor: this.skills.level('firstaid') });
          if (res.ok) this.gainXp('firstaid', action === 'stitch' ? 12 : action === 'splint' ? 9 : 6);
          this.hud.toast(res.ok ? res.msg : res.reason, res.ok ? 'good' : 'warn');
          this.refreshUis();
        },
      });
      return;
    }
    const v = this.needs.values;
    const feeds = (u.hunger && v.hunger < 98) || (u.thirst && v.thirst < 98) || (u.energy && v.energy < 98);
    const heals = u.heal && this.health.hp < 100;
    if (!feeds && !heals) return void this.hud.toast('Gerade nicht nötig.', 'info');
    const verb = d.category === 'drink' ? 'Trinken' : d.category === 'food' ? 'Essen' : 'Benutzen';
    this.actions.add({
      label: `${verb}: ${d.name}`,
      duration: d.category === 'drink' ? 1.6 : d.category === 'food' ? 2.6 : 2,
      run: () => this.consumeItem(s.id),
    });
  }

  /** Wirkung eines Items anwenden (nach der Zeitaktion): sucht es im Inventar, damit Verschiebungen nichts stören. */
  private consumeItem(id: string): void {
    const f = this.inventory.find(id);
    if (!f || this.dead) return void this.hud.toast('Das Item ist nicht mehr da.', 'warn');
    const d = item(id);
    const u = d.use;
    if (!u) return;
    if (u.hunger) this.needs.add('hunger', u.hunger * (d.category === 'food' ? SKILL_FX.nutrition(this.skills.level('cooking')) : 1));
    if (u.thirst) this.needs.add('thirst', u.thirst);
    if (u.energy) this.needs.add('energy', u.energy);
    if (u.heal) this.health.heal(u.heal);
    this.inventory.removeFrom(f.where, f.index);
    if (d.becomes && this.inventory.add(d.becomes, 1, f.where) > 0) this.dropToGround([{ id: d.becomes, qty: 1 }]);
    if (d.category === 'drink') audio.drink();
    else if (d.category === 'food') audio.eat();
    else audio.bandage();
    this.hud.toast(`${d.name} benutzt`, 'good');
    this.refreshUis();
  }

  /** Zeitaktionen laufen lassen und Fortschritt anzeigen */
  private actionStep(dt: number): void {
    if (this.sleeping || this.dead || this.driven) this.actions.clear();
    if (this.carRide) {
      this.carPanelT += dt;
      if (this.carPanelT > 0.4) {
        this.carPanelT = 0;
        this.refreshCarPanel();
      }
    }
    const r = this.actions.update(dt, this.player.mesh.position);
    if (r.cancelled) this.hud.toast('Abgebrochen – du hast dich bewegt.', 'info');
    const cur = this.actions.current;
    // Einzelne Schläge auf Wände und Möbel zeigen keinen Fortschrittsbalken
    const quiet = !!this.demo && (this.demo.hit || !!this.demo.target.wall);
    this.hud.setAction(cur && !quiet ? cur.label : null, this.actions.progress, this.actions.waiting);
    this.player.work = cur ? this.poseFor(cur.label) : null;
    this.demolishFx(cur?.label ?? null, cur ? this.actions.progress * cur.duration : 0);
  }

  // --- Abreißen: Axt und Vorschlaghammer ----------------------------------------

  /** Holz-, Putz-, Ziegel- und Metallbrocken fliegen ab */
  private spawnChips(x: number, y: number, z: number, kind: 'wood' | 'plaster' | 'brick' | 'metal', n: number, power = 1): void {
    const palette: Record<string, number[]> = {
      wood: [0x8a6a45, 0x6b4a2e, 0xa88a5a, 0x5a4026],
      plaster: [0xd8d2c4, 0xb9b2a4, 0xe8e4d8],
      brick: [0x9a4a38, 0x7a3a2c, 0xc8c2b4],
      metal: [0x6a6e76, 0x8a8f98, 0x3e4248],
    };
    const colors = palette[kind];
    for (let i = 0; i < n; i++) {
      const big = kind === 'wood' && Math.random() < 0.4;
      const m = new THREE.Mesh(chipGeo, new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 0.9 }));
      const sx = big ? 0.35 + Math.random() * 0.4 : 0.05 + Math.random() * 0.12;
      m.scale.set(sx, big ? 0.05 : 0.04 + Math.random() * 0.1, big ? 0.09 : 0.05 + Math.random() * 0.1);
      m.position.set(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.5);
      m.castShadow = true;
      const a = Math.random() * Math.PI * 2, sp = (1.5 + Math.random() * 3.2) * power;
      this.debris.add(m, new THREE.Vector3(Math.cos(a) * sp, 2.2 + Math.random() * 3.2 * power, Math.sin(a) * sp), new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14));
    }
  }

  /** Das Ziel unter dem Mauszeiger: Möbel, Zimmerwand oder selbst Gebautes in Reichweite */
  private findDemoTarget(): DemoTarget | null {
    const p = this.player.mesh.position;
    const level = this.world.levelAt(p.x, p.z, p.y);
    const hit = this.groundPoint(level * FLOOR_H);
    if (!hit) return null;
    const gap = (b: { x: number; z: number; w: number; d: number }, x: number, z: number): number =>
      Math.hypot(Math.max(0, Math.abs(x - b.x) - b.w / 2), Math.max(0, Math.abs(z - b.z) - b.d / 2));
    const list: DemoTarget[] = [];
    for (const d of this.world.demolishablesNear(p.x, p.z, 2.8, level)) {
      list.push({
        key: d.key, name: d.name, x: d.x, z: d.z, w: d.w, d: d.d, h: d.h, need: d.wooden ? 'breaker' : 'sledge', seconds: d.seconds, wall: d.kind === 'wall' ? d : undefined,
        material: d.kind === 'wall' ? 'plaster' : d.wooden ? 'wood' : 'metal',
        finish: () => {
          this.world.demolish(d);
          this.collect(d.give);
          if (d.loot.length) {
            this.dropToGround(d.loot.map((q) => ({ ...q })));
            d.loot.length = 0;
          }
        },
      });
    }
    for (const q of this.structures.pieces) {
      if (q.lv !== level || gap(q.footprint, p.x, p.z) > 2.8) continue;
      list.push({
        key: `piece:${q.id}`, name: q.def.name, x: q.x, z: q.z, w: q.footprint.w, d: q.footprint.d, h: q.def.h, need: 'breaker', seconds: Math.max(1.5, q.def.time * 0.35), material: 'wood', piece: true,
        finish: () => {
          if (!this.structures.pieces.includes(q)) return;
          // das Bauteil geht zurück ins Inventar, Inhalt fällt heraus
          this.collect([{ id: `piece_${q.def.id}`, qty: 1 }]);
          if (q.loot.length) this.dropToGround(q.loot.map((l) => ({ ...l })));
          this.structures.remove(q);
        },
      });
    }
    if (level === 0) {
      // Haustüren reißt man ab: das Türblatt verschwindet, der Durchgang bleibt offen
      for (const d of this.world.doorsNear(p.x, p.z, 3.4)) {
        if (d.torn) continue;
        list.push({
          key: `dd:${d.key}`, door: true, name: 'Tür', x: d.x, z: d.z, w: 1.5, d: 1.5, h: 2.2, need: 'breaker', seconds: 4, material: 'wood', piece: true,
          finish: () => {
            this.world.tearDoor(d);
            this.collect([{ id: 'wood', qty: 2 }, { id: 'nails', qty: 2 }]);
          },
        });
      }
      // Bretter vor Fenstern nimmt man mit Hammer, Axt oder Brecheisen wieder ab
      for (const w of this.world.windowsNear(p.x, p.z, 3.4)) {
        if (w.state.planks < 1) continue;
        list.push({
          key: `wb:${w.key}`, name: 'Fensterbarrikade', x: w.x, z: w.z, w: Math.max(1.2, w.w), d: 1.2, h: w.h, need: 'breaker', seconds: 1.5 + w.state.planks * 0.8, material: 'wood', piece: true,
          finish: () => {
            const n = w.state.planks;
            while (this.world.unbarricade(w));
            this.collect([{ id: 'wood', qty: n }, { id: 'nails', qty: n }]);
          },
        });
      }
    }
    let best: DemoTarget | null = null;
    let bd = 1.1;
    for (const t of list) {
      const d = gap(t, hit.x, hit.z);
      if (d < bd) [best, bd] = [t, d];
    }
    return best;
  }

  /** Material ins Inventar, was nicht passt auf den Boden */
  private collect(stacks: Stack[]): void {
    const rest: Stack[] = [];
    for (const s of stacks) {
      const left = this.inventory.add(s.id, s.qty);
      if (left > 0) rest.push({ id: s.id, qty: left });
    }
    if (rest.length) this.dropToGround(rest);
    this.refreshUis();
  }

  private demoToolOk(t: DemoTarget): { ok: boolean; sledge: boolean; why?: string } {
    const hand = this.inventory.equipment.hand;
    const sledge = !!hand && hasTag(hand, 'sledge');
    const breaker = !!hand && hasTag(hand, 'breaker');
    // Zimmerwände: Hammer oder Vorschlaghammer, mehrere Schläge
    if (t.wall) {
      if (sledge || (!!hand && hasTag(hand, 'hammer'))) return { ok: true, sledge: true };
      return { ok: false, sledge: false, why: 'Zimmerwand: nimm einen Hammer oder Vorschlaghammer in die Hand und schlag mehrmals zu.' };
    }
    if (t.piece && !!hand && hasTag(hand, 'hammer')) return { ok: true, sledge: false };
    if (!breaker) return { ok: false, sledge, why: 'Nimm Axt, Brecheisen oder Vorschlaghammer in die Hand.' };
    if (t.need === 'sledge' && !sledge) return { ok: false, sledge, why: `${t.name}: dafür brauchst du einen Vorschlaghammer in der Hand.` };
    return { ok: true, sledge };
  }

  /** Rechtsklick: abreißen, was man anvisiert hat */
  private tryDemolish(): void {
    const hand = this.inventory.equipment.hand;
    if (!hand || !(hasTag(hand, 'breaker') || hasTag(hand, 'hammer'))) return;
    const t = this.findDemoTarget();
    if (!t) return;
    const chk = this.demoToolOk(t);
    if (!chk.ok) return void this.hud.toast(chk.why!, 'warn');
    const p = this.player.mesh.position;
    this.player.mesh.rotation.y = Math.atan2(t.x - p.x, t.z - p.z);
    if (t.wall) {
      // ein Schlag pro Rechtsklick: Treffer im Takt der Animation (siehe demolishFx), das Loch wächst
      this.markHit(t);
      this.actions.clear();
      this.demo = { target: t, sledge: true, n: 0, light: !hasTag(hand, 'sledge') };
      this.actions.add({ label: `Abreißen: ${t.name}`, duration: SMASH_PERIOD, run: () => { this.demo = null; } });
      return;
    }
    const speed = chk.sledge ? (t.need === 'sledge' ? 1 : 0.55) : hasTag(hand, 'chopper') ? 1 : 1.4;
    this.actions.clear();
    this.demo = { target: t, sledge: chk.sledge, n: 0 };
    this.actions.add({
      label: `Abreißen: ${t.name}`,
      duration: t.seconds * speed,
      run: () => {
        const fx = this.demo;
        this.demo = null;
        if (!fx) return;
        t.finish();
        this.spawnChips(t.x, t.h * 0.5, t.z, t.material, 16 + Math.round(t.w * t.d * 6), 1.3);
        this.spawnChips(t.x, t.h * 0.8, t.z, 'plaster', 8, 0.8);
        this.shake = Math.max(this.shake, fx.sledge ? 0.7 : 0.4);
        audio.crash(fx.sledge ? 9 : 5, t.x, t.z);
        this.zombies.noise(t.x, t.z, fx.sledge ? 34 : 24);
        this.gainXp('carpentry', 5 + t.seconds);
        this.needs.add('energy', -(fx.sledge ? 3 : 1.5));
      },
    });
  }

  /** Ein Hammerschlag auf eine Zimmerwand: Loch wächst; nach 5 bis 10 Schlägen (mit leichtem Hammer doppelt so viele) fällt die Wand ganz */
  /** Wie viele Schläge nötig sind: Wandabschnitte 6, lange bis 8; Möbel und Teile je nach Größe 3 bis 8 */
  private hitsNeeded(t: DemoTarget): number {
    const len = Math.max(t.w, t.d);
    if (t.wall) return len < 2.2 ? 6 : len < 3 ? 7 : 8;
    return Math.min(8, Math.max(3, Math.round(len * 2) + 2));
  }

  /** Trefferstelle (Weltpunkt unter der Maus) am Ziel merken */
  private markHit(t: DemoTarget): void {
    const p = this.player.mesh.position;
    const level = this.world.levelAt(p.x, p.z, p.y);
    const g = this.groundPoint(level * FLOOR_H);
    if (g) t.hitAt = { x: g.x, z: g.z };
  }

  private hitWall(t: DemoTarget, light: boolean): void {
    const d = t.wall!;
    const need = this.hitsNeeded(t);
    const frac = Math.min(1, d.frac + 1 / need);
    const hits = Math.round(frac * need);
    const at = t.hitAt ? (d.w >= d.d ? (t.hitAt.x - d.x) / d.w : (t.hitAt.z - d.z) / d.d) + 0.5 : 0.5;
    const hx = t.hitAt?.x ?? t.x, hz = t.hitAt?.z ?? t.z;
    this.spawnChips(hx, 1.3, hz, 'plaster', 10 + hits, 1.2);
    this.spawnChips(hx, 1.2, hz, 'brick', 3 + Math.floor(hits / 2), 1.0);
    this.shake = Math.max(this.shake, 0.4);
    audio.crash(7, hx, hz);
    this.zombies.noise(t.x, t.z, 28);
    this.needs.add('energy', light ? -0.8 : -0.6);
    if (frac >= 0.999) {
      t.finish();
      this.spawnChips(t.x, t.h * 0.5, t.z, 'plaster', 24, 1.4);
      this.shake = Math.max(this.shake, 0.7);
      this.gainXp('carpentry', 5 + t.seconds);
    } else {
      this.world.setWallDamage(d, frac, at);
    }
  }

  /** Ein Schlag auf ein Möbelstück oder gebautes Teil; nach genug Schlägen fällt es auseinander */
  private hitObject(t: DemoTarget): void {
    const need = this.hitsNeeded(t);
    const n = (this.objHits.get(t.key) ?? 0) + 1;
    this.spawnChips(t.x, t.h * 0.55, t.z, t.material, 5 + n, 1.0);
    this.shake = Math.max(this.shake, 0.25);
    audio.wood(t.x, t.z, true);
    this.zombies.noise(t.x, t.z, 20);
    this.needs.add('energy', -0.5);
    if (n < need) return void this.objHits.set(t.key, n);
    this.objHits.delete(t.key);
    t.finish();
    this.spawnChips(t.x, t.h * 0.5, t.z, t.material, 14 + Math.round(t.w * t.d * 6), 1.3);
    this.shake = Math.max(this.shake, 0.5);
    audio.crash(6, t.x, t.z);
    this.gainXp('carpentry', 3 + t.seconds * 0.5);
  }

  /** Linksklick mit Hammer oder Axt auf das gelb umrandete Ziel: ein Schlag. Türen öffnen sich weiter mit Linksklick. */
  private tryHit(): boolean {
    const hand = this.inventory.equipment.hand;
    if (!hand || !(hasTag(hand, 'breaker') || hasTag(hand, 'hammer'))) return false;
    const t = this.hoverTarget ?? this.findDemoTarget();
    if (!t || t.door) return false;
    const chk = this.demoToolOk(t);
    if (!chk.ok) {
      this.hud.toast(chk.why!, 'warn');
      return true;
    }
    if (this.actions.current) {
      this.hitQueued = true; // der letzte Schlag läuft noch: der nächste folgt gleich danach
      return true;
    }
    const p = this.player.mesh.position;
    this.player.mesh.rotation.y = Math.atan2(t.x - p.x, t.z - p.z);
    this.markHit(t);
    const big = hasTag(hand, 'sledge') || hasTag(hand, 'hammer');
    this.demo = { target: t, sledge: big, n: 0, light: false, hit: true };
    this.actions.add({ label: `Abreißen: ${t.name}`, duration: big ? SMASH_PERIOD : CHOP_PERIOD, run: () => { this.demo = null; } });
    return true;
  }

  /** Gelbe Umrandung am Ziel unter der Maus, solange man Hammer, Axt oder Brecheisen in der Hand hat */
  private updateDemoGlow(): void {
    const hand = this.inventory.equipment.hand;
    const tool = !!hand && (hasTag(hand, 'breaker') || hasTag(hand, 'hammer'));
    if (!tool || this.building || this.sleeping || this.dead || this.driven || this.ui.inventoryOpen || this.crafting.isOpen) {
      this.demoGlow.visible = false;
      this.hoverTarget = null;
      return;
    }
    if (this.demoTick++ % 2 === 0) this.hoverTarget = this.findDemoTarget();
    const t = this.hoverTarget;
    this.demoGlow.visible = !!t;
    if (!t) return;
    const p = this.player.mesh.position;
    const level = this.world.levelAt(p.x, p.z, p.y);
    this.demoGlow.position.set(t.x, level * FLOOR_H + t.h / 2, t.z);
    this.demoGlow.scale.set(t.w + 0.12, t.h + 0.06, t.d + 0.12);
  }

  /** Treffer im Takt der Hiebanimation: Splitter, Wackeln, Lärm */
  private demolishFx(label: string | null, elapsed: number): void {
    const fx = this.demo;
    if (!fx) return;
    if (!label || !label.startsWith('Abreißen')) {
      this.demo = null; // abgebrochen
      return;
    }
    const period = fx.sledge ? SMASH_PERIOD : CHOP_PERIOD;
    const hits = Math.floor(elapsed / period + 0.28);
    if (hits <= fx.n) return;
    fx.n = hits;
    const t = fx.target;
    if (t.wall) return this.hitWall(t, !!fx.light);
    if (fx.hit) return this.hitObject(t);
    this.spawnChips(t.x, t.h * 0.55, t.z, t.material, fx.sledge ? 6 : 4, fx.sledge ? 1.1 : 0.8);
    this.shake = Math.max(this.shake, fx.sledge ? 0.32 : 0.16);
    audio.wood(t.x, t.z, true);
    this.zombies.noise(t.x, t.z, fx.sledge ? 22 : 14);
    this.needs.add('energy', fx.sledge ? -0.5 : -0.25);
  }

  // --- Linksklick: Türen, Möbel, Schlagen ----------------------------------------

  /** Abstand des Mausstrahls zu einem Punkt in der Welt (Meter) */
  private rayDist(x: number, y: number, z: number): number {
    this.ray.setFromCamera(new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.camera);
    return Math.sqrt(this.ray.ray.distanceSqToPoint(new THREE.Vector3(x, y, z)));
  }

  private handleClicks(): void {
    const p = this.player.mesh.position;
    if (this.hitQueued && !this.actions.current) {
      this.hitQueued = false;
      this.tryHit();
    }
    for (let b = this.input.nextClick(); b !== null; b = this.input.nextClick()) {
      if (b === 2 && !this.building && !this.sleepDlg.isOpen && !this.swing && !this.player.vaulting) {
        this.tryDemolish();
        continue;
      }
      if (b !== 0 || this.sleepDlg.isOpen || this.swing || this.player.vaulting) continue;
      // Hammer oder Axt in der Hand und ein gelb umrandetes Ziel unter der Maus: Linksklick schlägt zu (Türen öffnen sich weiter)
      if (this.tryHit()) continue;
      // 1. Tür unter dem Mauszeiger
      let door: DoorView | null = null;
      let best = 1.1;
      for (const d of this.world.doorsNear(p.x, p.z, 9, this.world.levelAt(p.x, p.z, p.y))) {
        const r = this.rayDist(d.x, 1.2, d.z);
        if (r < best) [door, best] = [d, r];
      }
      if (door) {
        if (Math.hypot(door.x - p.x, door.z - p.z) > 3.4) this.hud.toast('Geh näher an die Tür heran.', 'info');
        else this.useDoor(door);
        continue;
      }
      // 2. sonst: zuschlagen
      this.startSwing();
    }
  }

  private useDoor(d: DoorView): void {
    const p = this.player.mesh.position;
    const r = this.world.toggleDoor(d, p.x, p.z);
    if (r === 'locked') return this.useLockedDoor(d);
    if (r === 'blocked') this.hud.toast(d.broken ? 'Die Tür ist aufgebrochen.' : 'Du stehst im Weg.', 'info');
    else {
      if (r === 'opened') audio.doorOpen(d.x, d.z);
      else audio.doorClose(d.x, d.z);
      this.hud.toast(r === 'opened' ? 'Tür geöffnet' : 'Tür geschlossen', 'info');
      this.zombies.noise(d.x, d.z, r === 'opened' ? 6 : 4);
    }
  }

  /** Abgeschlossene Tür: mit Dietrich leise knacken, mit Brecheisen/Axt/Vorschlaghammer (Shift: bevorzugt) aufbrechen */
  private useLockedDoor(d: DoorView): void {
    const hand = this.inventory.equipment.hand;
    const breaker = hand && hasTag(hand, 'breaker') ? hand : null;
    const force = this.input.down('ShiftLeft') || this.input.down('ShiftRight') || !this.inventory.hasTag('lockpick');
    if (!force && this.inventory.hasTag('lockpick')) {
      return this.actions.add({
        label: 'Schloss knacken',
        duration: 7 * SKILL_FX.buildTime(this.skills.level('carpentry')) * this.talents.perks().build,
        run: () => {
          if (!d.locked) return;
          this.zombies.noise(d.x, d.z, 3);
          if (Math.random() < 0.6) {
            this.world.setLocked(d, false);
            audio.craft();
            this.gainXp('carpentry', 6);
            this.hud.toast('Das Schloss springt auf.', 'good');
          } else if (Math.random() < 0.35 && this.inventory.consume([{ id: 'lockpick', qty: 1 }])) {
            this.hud.toast('Der Dietrich ist abgebrochen.', 'warn');
          } else this.hud.toast('Nicht geschafft – noch einmal versuchen.', 'info');
          this.refreshUis();
        },
      });
    }
    if (!breaker) return void this.hud.toast('Abgeschlossen. Mit einem Dietrich knacken oder mit Brecheisen, Axt oder Vorschlaghammer in der Hand aufbrechen.', 'warn');
    const t = breaker === 'sledgehammer' ? 2 : breaker === 'axe' ? 3 : 3.5;
    this.actions.add({
      label: 'Tür aufbrechen',
      duration: t,
      run: () => {
        if (!d.locked) return;
        this.world.forceDoor(d);
        audio.doorOpen(d.x, d.z);
        this.zombies.noise(d.x, d.z, 28);
        this.spawnChips(d.x, 1.1, d.z, 'wood', 9);
        this.hud.toast('Die Tür bricht auf. Das war laut.', 'warn');
        this.refreshUis();
      },
    });
  }

  private windowPrompt(w: WindowView): string {
    const s = w.state;
    if (s.glass) return '<kbd>E</kbd> Fenster einschlagen';
    const wood = this.inventory.count('wood');
    const parts: string[] = [];
    if (s.planks < MAX_PLANKS) parts.push(wood > 0 && this.inventory.count('nails') > 0 ? `<kbd>E</kbd> Brett anbringen (${s.planks}/${MAX_PLANKS})${this.inventory.hasTag('hammer') ? '' : ' · mit Hammer schneller'}` : 'Brett und Nägel fehlen zum Verbarrikadieren');
    if (s.planks > 0) parts.push('<kbd>Shift+F</kbd> Brett abnehmen');
    else parts.push('Zum Klettern in das Fenster laufen');
    return parts.join(' · ');
  }

  /** Fenster einschlagen, verbarrikadieren oder Bretter abnehmen (Zeitaktionen) */
  private interactWindow(w: WindowView): void {
    const s = w.state;
    if (s.glass) {
      return this.actions.add({
        label: 'Fenster einschlagen',
        duration: 1,
        run: () => {
          if (!s.glass) return;
          this.world.strikeWindow(w, 999);
          audio.glassBreak(w.x, w.z);
          this.zombies.noise(w.x, w.z, 20);
          if (Math.random() < 0.35) {
            this.health.wound('handR', 'cut', 'Glassplitter');
            this.hud.toast('Das Glas splittert – du schneidest dich an der Hand.', 'bad');
          } else this.hud.toast('Scheibe zerschlagen. Das war laut.', 'warn');
          this.refreshUis();
        },
      });
    }
    const remove = this.input.down('ShiftLeft') || this.input.down('ShiftRight') || this.inventory.count('wood') < 1;
    if (remove && s.planks > 0) {
      return this.actions.add({
        label: 'Brett abnehmen',
        duration: 2.5,
        run: () => {
          if (!this.world.unbarricade(w)) return;
          if (this.inventory.add('wood', 1) > 0) this.dropToGround([{ id: 'wood', qty: 1 }]);
          this.inventory.add('nails', 1);
          this.zombies.noise(w.x, w.z, 6);
          this.refreshUis();
        },
      });
    }
    if (s.planks >= MAX_PLANKS) return void this.hud.toast('Das Fenster ist komplett verbarrikadiert.', 'info');
    if (this.inventory.count('wood') < 1) return void this.hud.toast('Du brauchst ein Holzbrett.', 'warn');
    if (this.inventory.count('nails') < 1) return void this.hud.toast('Du brauchst Nägel (aus Metallschrott herstellbar).', 'warn');
    this.actions.add({
      label: 'Brett anbringen',
      duration: 4 * SKILL_FX.buildTime(this.skills.level('carpentry')) * this.talents.perks().build * (this.inventory.hasTag('hammer') ? 0.55 : 1),
      run: () => {
        if (!this.inventory.consume([{ id: 'wood', qty: 1 }, { id: 'nails', qty: 1 }])) return void this.hud.toast('Material fehlt.', 'warn');
        audio.wood(w.x, w.z);
        if (!this.world.barricade(w)) {
          this.inventory.add('wood', 1);
          this.inventory.add('nails', 1);
        }
        else {
          this.gainXp('carpentry', 5);
          this.hud.toast(`Brett angenagelt (${w.state.planks}/${MAX_PLANKS})`, 'good');
        }
        this.zombies.noise(w.x, w.z, 14);
        this.refreshUis();
      },
    });
  }

  /** Haltung der Spielfigur je nach laufender Zeitaktion */
  private poseFor(label: string): WorkPose {
    if (/^Abreißen/.test(label)) return this.demo?.sledge ? 'smash' : 'chop';
    if (/^(Bauen|Abbauen|Brett|Fenster|Mechanik|Tür aufbrechen)/.test(label)) return 'hammer';
    if (/^(Nehmen|Ablegen|Umpacken)/.test(label)) return 'loot';
    if (/^(Essen|Trinken|Benutzen)/.test(label)) return 'eat';
    if (/^(Anlegen|Ausziehen)/.test(label)) return 'dress';
    return 'treat';
  }

  /** Schlag in Richtung Mauszeiger beginnen */
  private startSwing(): void {
    if (this.building || this.driven || this.sleeping || this.boarding) return;
    if (this.fireGun()) return;
    const p = this.player.mesh.position;
    const w = weaponOf(this.inventory.equipment.hand);
    this.ray.setFromCamera(new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(p.y + 0.9));
    const at = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    const yaw = at && Math.hypot(at.x - p.x, at.z - p.z) > 0.2 ? Math.atan2(at.x - p.x, at.z - p.z) : this.player.mesh.rotation.y;
    this.player.mesh.rotation.y = yaw;
    this.actions.clear();
    this.swing = { t: 0, w, hit: false, yaw };
    this.player.swingLook = w.look;
    audio.swing(w.id === 'axe' || w.id === 'pipe' || w.id === 'bat');
  }

  /** Zielrichtung zum Mauszeiger (wie beim Schlag) */
  private aimYaw(): number {
    const p = this.player.mesh.position;
    this.ray.setFromCamera(new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(p.y + 0.9));
    const at = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    return at && Math.hypot(at.x - p.x, at.z - p.z) > 0.2 ? Math.atan2(at.x - p.x, at.z - p.z) : this.player.mesh.rotation.y;
  }

  /** Linksklick mit Schusswaffe in der Hand: schießen. Gibt true zurück, wenn die Hand eine Schusswaffe hält. */
  private fireGun(): boolean {
    const def = firearmOf(this.inventory.equipment.hand);
    if (!def) return false;
    if (this.reloading) return true;
    const p = this.player.mesh.position;
    const yaw = this.aimYaw();
    this.player.mesh.rotation.y = yaw;
    const walls = this.world.wallBoxesNear(p.x, p.z, Math.min(40, def.range * 1.5), this.world.levelAt(p.x, p.z, p.y));
    const strength = SKILL_FX.damage(this.skills.level('aiming')) * this.traitFx.damage;
    const rep = this.shooter.shoot(def, performance.now() / 1000, p.x, p.z, yaw, this.zombies.alive, Math.random, strength, walls);
    if (!rep.fired) {
      if (rep.why === 'empty') {
        audio.dryFire();
        this.hud.toast(this.inventory.count(def.ammo) > 0 || this.hasAmmoBox(def.ammo) || (!!def.magItem && this.inventory.count(def.magItem) > 0) ? 'Magazin leer – R zum Nachladen.' : 'Keine Munition.', 'warn');
      }
      return true;
    }
    this.actions.clear();
    audio.shot(rep.heavy, p.x, p.z);
    this.zombies.noise(p.x, p.z, rep.noise);
    this.needs.add('energy', -0.2 * SKILL_FX.energy(this.skills.level('fitness')));
    this.shake = Math.max(this.shake, Math.min(0.6, rep.recoil * 0.07));
    let any = false;
    for (const h of rep.hits) {
      const tp = (h.target as Zed).mesh.position;
      audio.hit(false, h.killed, tp.x, tp.z);
      any = true;
      if (h.killed) {
        this.zombies.recordKill(h.target as Zed);
        this.gainXp('aiming', 8);
      }
    }
    if (any) this.gainXp('aiming', 2);
    return true;
  }

  private hasAmmoBox(ammo: string): boolean {
    return Object.entries(PZ_BOX_CONTENT).some(([box, [inner]]) => (inner === ammo || PZ_BOX_CONTENT[inner]?.[0] === ammo) && this.inventory.count(box) > 0);
  }

  /** Schachteln/Kartons mit dieser Munition auspacken, bis Patronen im Rucksack liegen */
  private unpackAmmo(ammo: string): void {
    for (const level of [0, 1, 0]) {
      if (this.inventory.count(ammo) > 0) return;
      for (const [box, [inner, qty]] of Object.entries(PZ_BOX_CONTENT)) {
        const target = level === 0 ? inner === ammo : PZ_BOX_CONTENT[inner]?.[0] === ammo;
        if (!target || this.inventory.count(box) < 1 || !this.inventory.consume([{ id: box, qty: 1 }])) continue;
        const left = this.inventory.add(inner, qty);
        if (left > 0) this.dropToGround([{ id: inner, qty: left }]);
        break;
      }
    }
  }

  /** R: Schusswaffe nachladen (packt bei Bedarf Munitionsschachteln aus) */
  private reloadGun(): void {
    const def = firearmOf(this.inventory.equipment.hand);
    if (!def || this.reloading || this.building || this.driven || this.sleeping) return;
    // Wechselmagazin im Rucksack: Magazin einsetzen (schnell), Restpatronen aus dem alten kommen lose zurück
    const spare = def.magItem && this.inventory.count(def.magItem) > 0 ? def.magItem : null;
    if (spare && this.shooter.loaded(def.id) < def.mag) {
      this.reloading = true;
      audio.reloadClick();
      this.actions.add({
        label: 'Magazin wechseln',
        duration: Math.max(0.6, def.reload * 0.6),
        run: () => {
          this.reloading = false;
          if (this.inventory.equipment.hand !== def.id) return;
          if (!this.inventory.consume([{ id: spare, qty: 1 }])) return;
          const left = this.shooter.loaded(def.id);
          if (left > 0 && this.inventory.add(def.ammo, left) > 0) this.dropToGround([{ id: def.ammo, qty: left }]);
          this.shooter.finishReload(def, def.mag);
          audio.reloadClick();
          this.refreshUis();
        },
      });
      return;
    }
    if (this.inventory.count(def.ammo) < 1) this.unpackAmmo(def.ammo);
    const plan = this.shooter.planReload(def, this.inventory.count(def.ammo));
    if (plan.used === 0) return void this.hud.toast(this.shooter.loaded(def.id) >= def.mag ? 'Die Waffe ist voll.' : 'Keine Munition zum Nachladen.', 'info');
    this.reloading = true;
    audio.reloadClick();
    this.actions.add({
      label: 'Nachladen',
      duration: plan.time,
      run: () => {
        this.reloading = false;
        if (this.inventory.equipment.hand !== def.id) return;
        const again = this.shooter.planReload(def, this.inventory.count(def.ammo));
        if (again.used > 0 && this.inventory.consume([{ id: def.ammo, qty: again.used }])) this.shooter.finishReload(def, again.loaded);
        audio.reloadClick();
        this.refreshUis();
      },
    });
  }

  /** Schlag, Geräusche und Zombies je Schritt */
  private combatStep(dt: number): void {
    const p = this.player.mesh.position;
    if (this.reloading && !this.actions.current && this.actions.progress === 0) this.reloading = false;
    if (!this.building && this.input.consume('KeyR')) this.reloadGun();
    const gun = firearmOf(this.inventory.equipment.hand);
    this.hud.setAmmo(gun ? `${this.shooter.loaded(gun.id)} / ${gun.mag}  ·  ${this.inventory.count(gun.ammo)}${gun.magItem ? `  ·  ${this.inventory.count(gun.magItem)} Mag.` : ''}${this.reloading ? '  · lädt …' : ''}` : '');
    // Schritte und Motor sind laut
    if (!this.sleeping) {
      if (this.driven) {
        this.engineNoiseT -= dt;
        if (this.engineNoiseT <= 0 && this.driven.v.engineOn) {
          this.zombies.noise(this.driven.v.x, this.driven.v.z, 18 + Math.min(14, Math.abs(this.driven.v.kmh) / 3));
          this.engineNoiseT = 0.6;
        }
      } else {
        this.stepNoiseT -= dt;
        if (this.stepNoiseT <= 0 && this.player.moving) {
          this.zombies.noise(p.x, p.z, movementNoise(true, this.player.sprinting) * this.traitFx.noise * SKILL_FX.noise(this.skills.level('sneak')));
          this.stepNoiseT = 0.5;
        }
      }
    }

    // Schlag
    const s = this.swing;
    if (s) {
      s.t += dt;
      const u = s.t / s.w.swing;
      this.player.swingU = Math.min(1, u);
      this.player.speedFactor *= 0.45;
      if (!s.hit && u >= IMPACT_AT) {
        s.hit = true;
        this.zombies.noise(p.x, p.z, s.w.noise);
        const wskill = this.weaponSkill(s.w);
        this.needs.add('energy', -s.w.energy * SKILL_FX.energy(this.skills.level('fitness')));
        const res = swingAt(p.x, p.z, s.yaw, s.w, this.zombies.alive, Math.random, SKILL_FX.damage(this.skills.level(wskill)) * this.traitFx.damage * this.talents.perks().melee);
        for (const h of res.hits) {
          const tp = (h.target as Zed).mesh.position;
          audio.hit(s.w.id === 'axe' || s.w.id === 'pipe' || s.w.id === 'bat', h.killed, tp.x, tp.z);
          this.gainXp(wskill, h.killed ? 8 : 3);
          if (h.killed) this.zombies.recordKill(h.target as Zed);
        }
      }
      if (u >= 1) {
        this.swing = null;
        this.player.swingU = null;
      }
    }

    const day = this.time.day;
    const night = 1 - Math.min(1, Math.max(0, Math.sin(this.time.dayFraction * Math.PI * 2 - Math.PI / 2)) * 3);
    if (this.mp && !this.mp.isHost) return; // Mehrspieler-Client: Zombies kommen vom Host (siehe netFrame)
    this.zombies.update(dt, this.world, {
      player: p,
      others: this.mp?.others(),
      night,
      rain: this.weather.rain,
      clouds: this.weather.clouds,
      day,
      playerLevel: this.world.levelAt(p.x, p.z, p.y),
      onStrike: (z) => this.onZombieStrike(z),
      onDoorBroken: (d) => {
        audio.wood(d.x, d.z, true);
        this.zombies.noise(d.x, d.z, 16);
        if (Math.hypot(d.x - p.x, d.z - p.z) < 18) this.hud.toast('Eine Tür kracht – Zombies haben sie eingeschlagen!', 'warn');
      },
      onClimb: (z) => {
        if (Math.hypot(z.x - p.x, z.z - p.z) < 14) this.hud.toast('Ein Zombie klettert über ein Hindernis!', 'warn');
      },
      onWindowBroken: (what, w) => {
        if (what === 'glass') audio.glassBreak(w.x, w.z);
        else audio.wood(w.x, w.z, true);
        this.zombies.noise(w.x, w.z, what === 'glass' ? 20 : 12);
        if (Math.hypot(w.x - p.x, w.z - p.z) < 25) this.hud.toast(what === 'glass' ? 'Eine Scheibe klirrt – Zombies schlagen ein Fenster ein!' : 'Ein Brett splittert!', 'warn');
      },
    });
  }

  /** Ein Zombie greift an */
  private onZombieStrike(z: Zed): void {
    // Mehrspieler-Host: Schlag gegen einen Mitspieler geht an dessen Spiel
    if (z.targetId !== 0 && this.mp?.isHost) return void this.mp.strikePlayer(z.targetId, z.id);
    if (this.dead) return;
    if (this.player.mesh.position.y > 1.2) return; // Zombies schlagen nicht durch die Decke
    z.revealT = 5; // 5 s lang sichtbar, auch wenn man sich wegdreht
    audio.zombieAttack(z.brain.type.id, z.mesh.position.x, z.mesh.position.z);
    const res = zombieStrike(this.health, this.inventory.equipment);
    if (res.kind === 'miss') return;
    if (res.kind === 'blocked') audio.wood(z.mesh.position.x, z.mesh.position.z);
    else {
      audio.hurt();
      if (res.virus) audio.bite();
    }
    this.mood.stats.add('stress', 12 * this.traitFx.panic);
    this.actions.clear();
    if (this.sleeping) this.wake('Ein Zombie greift dich an!', 'warn');
    if (res.kind === 'blocked') return void this.hud.toast(`Die Kleidung hält: ${PART_NAME[res.part]}.`, 'good');
    this.hud.toast(`${WOUND_NAME[res.wound]}: ${PART_NAME[res.part]}!${res.virus ? ' Du wurdest gebissen – du bist infiziert.' : ''}`, res.virus ? 'bad' : 'warn');
    this.shake = Math.max(this.shake, 0.5);
  }

  // --- Überleben -----------------------------------------------------------

  private survive(dt: number): void {
    const p = this.player.mesh.position;
    const hours = (dt * this.time.timeScale) / 3600;
    const elev = Math.sin(this.time.dayFraction * Math.PI * 2 - Math.PI / 2);
    const night = 1 - Math.min(1, Math.max(0, elev) * 3);
    const clim = this.climate(night);
    const bed = BEDS[this.sleepBed];
    this.thermo.update(
      hours,
      {
        air: clim.here,
        outdoors: !clim.inside,
        wind: clim.wind,
        rain: this.weather.rain,
        fire: clim.fire,
        activity: this.player.sprinting ? 1 : this.player.moving ? 0.35 : 0,
        sleeping: this.sleeping,
        floorChill: this.sleeping ? bed.chill : 0,
      },
      gearFrom(this.inventory.equipment),
    );
    const cold = this.thermo.cold * this.traitFx.cold;

    const out = this.structures.update(hours, night, p, performance.now() / 1000);
    if (out) this.hud.toast('Ein Lagerfeuer ist erloschen.', 'warn');

    if (this.time.day !== this.lastDay) {
      this.lastDay = this.time.day;
      this.onNewDay();
    }
    this.factions.update(dt, hours, this.time.day, {
      player: p,
      resolve: (pos, r) => {
        this.world.resolve(pos, r);
        this.structures.resolve(pos, r);
      },
      onRob: (n) => this.rob(n),
      onWarn: (n) => {
        this.hud.toast(`${n.name} (${n.def.name}): „Her mit deinen Vorräten!“ – Lauf weg (Shift) oder sprich mit ihm (F).`, 'bad');
        if (this.sleeping) this.wake('Schritte! Jemand schleicht heran.', 'warn');
      },
    });

    this.needs.update(hours, {
      sprinting: this.player.sprinting,
      sleeping: this.sleeping,
      cold,
      sleepQuality: this.sleeping ? this.mood.sleepQuality * bed.recovery * this.traitFx.sleep : 1,
    });
    this.health.update(hours, this.needs);
    const nv = this.needs.values;
    this.mood.update(hours, {
      sleeping: this.sleeping,
      bedDiscomfort: bed.discomfort,
      wetMax: this.thermo.maxWet,
      coldLevel: levelById('cold', nv.warmth),
      load: this.inventory.weight / this.inventory.maxWeight,
      pain: this.health.pain,
      bleeding: this.health.bleeding,
      activity: this.activity(),
      indoors: clim.inside,
      fed: nv.hunger > 40 && nv.thirst > 40,
      threat: this.zombies.threat * this.traitFx.panic,
    });

    if (this.sleeping) {
      if (this.time.absolute >= this.sleepUntil || this.needs.values.energy >= 95) {
        const slept = Math.round(((this.time.absolute - this.sleepStart) / 3600) * 10) / 10;
        this.wake(`Du hast ${slept} Stunden geschlafen und fühlst dich ${this.needs.values.energy >= 80 ? 'ausgeruht' : 'etwas erholt'}.`);
      }
      else if (this.health.bleeding) this.wake('Du wachst auf – du blutest!', 'warn');
      else if (this.needs.level('hunger') === 'critical' || this.needs.level('thirst') === 'critical') {
        this.wake('Hunger oder Durst wecken dich auf.', 'warn');
      } else if (this.needs.level('warmth') === 'critical') this.wake('Die Kälte weckt dich auf.', 'warn');
    }
    this.player.speedFactor =
      this.inventory.speedFactor * (this.player.sprinting ? SKILL_FX.sprint(this.skills.level('sprinting')) : 1) * (this.needs.values.energy <= 0 ? 0.6 : 1) * (this.health.hp < 30 ? 0.8 : 1) * this.health.moveFactor;

    if (this.health.dead) {
      this.dead = true;
      audio.death();
      audio.engine(false, 0, 0);
      this.ui.closeAll();
      this.dialog.close();
      this.factionsPanel.toggle(false);
      this.crafting.toggle(false);
      this.setBuilding(false);
      this.hud.setSleeping(false);
      this.hud.prompt(null);
      this.hud.showDeath(this.health.cause ?? 'Unbekannte Ursache');
    }
  }

  private announceChanges(): void {
    for (const k of NEED_KEYS) {
      const lvl = this.needs.level(k);
      const rank = (l: Level) => (l === 'ok' ? 0 : l === 'low' ? 1 : 2);
      if (rank(lvl) > rank(this.levels[k])) {
        this.hud.toast(WARNINGS[k][rank(lvl) - 1], lvl === 'critical' ? 'bad' : 'warn');
      }
      this.levels[k] = lvl;
    }
    const tier = this.health.hp <= 15 ? 2 : this.health.hp <= 40 ? 1 : 0;
    if (tier > this.hpTier) this.hud.toast(tier === 2 ? 'Du bist lebensgefährlich verletzt!' : 'Du bist schwer verletzt.', tier === 2 ? 'bad' : 'warn');
    this.hpTier = tier;
  }

  /**
   * Hält das Spiel flüssig: Bleibt die Bildzeit über etwa 28 ms (unter ~35 FPS), wird erst Umgebungsverdeckung/Bloom
   * abgeschaltet, dann die Auflösung etwas gesenkt. Nur nach unten, damit nichts hin- und herspringt.
   */
  private adaptQuality(now: number): void {
    const ms = Math.min(100, now - this.lastFrameT);
    this.lastFrameT = now;
    if (document.hidden || this.menu.open) return;
    this.frameMs += (ms - this.frameMs) * 0.03;
    if (this.frameNo % 150 !== 149 || this.frameMs < 28 || this.qualityStage >= 2) return;
    this.qualityStage++;
    if (this.qualityStage === 1) {
      this.fx.enabled = false;
      this.hud.toast('Grafik automatisch auf „Schnell“ gestellt (zu niedrige Bildrate).', 'info');
    } else {
      this.applySettings();
      this.hud.toast('Auflösung leicht gesenkt für mehr Bildrate.', 'info');
    }
    this.frameMs = 16;
  }

  /** Untergrund unter einem Punkt (für Schrittgeräusche) */
  private groundKind(x: number, z: number): Surface {
    if (this.world.isInside(x, z)) return 'wood';
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const spec = this.world.specOf(cx, cz);
    if (!spec) return 'grass';
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (spec.roadH && lz < ROAD) return 'asphalt';
    if (spec.roadV && lx < ROAD) return 'asphalt';
    if (spec.land !== 'town') return spec.pads.some((pd) => Math.abs(x - pd.x) < pd.w / 2 && Math.abs(z - pd.z) < pd.d / 2) ? 'asphalt' : 'grass';
    if ((spec.roadH && lz < ROAD + SIDEWALK) || (spec.roadV && lx < ROAD + SIDEWALK) || (spec.roadS && lz > CHUNK - SIDEWALK) || (spec.roadE && lx > CHUNK - SIDEWALK)) return 'concrete';
    return 'grass';
  }

  /** Klang pro Bild: Schritte, Zombie-Stimmen, Motor, Umgebung, Inventar-Auf/Zu */
  private audioFrame(dt: number, p: THREE.Vector3): void {
    if (!this.started) return;
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    audio.setListener(p.x, p.z, Math.atan2(dir.x, dir.z));
    audio.enabled = !this.loadingWorld;
    const invOpen = this.ui.inventoryOpen;
    if (invOpen !== this.lastInvOpen) {
      this.lastInvOpen = invOpen;
      audio.ui(invOpen ? 'open' : 'close');
    }
    // Schritte im Takt der Bewegung
    if (!this.driven && !this.sleeping && !this.dead && this.player.moving) {
      this.stepSoundT -= dt;
      if (this.stepSoundT <= 0) {
        this.stepSoundT = this.player.sprinting ? 0.27 : 0.42;
        audio.footstep(this.groundKind(p.x, p.z), this.player.sprinting);
      }
    } else this.stepSoundT = Math.min(this.stepSoundT, 0.1);
    // Zombies melden sich: jagende öfter, ruhige selten, nur in Hörweite
    let tension = 0, nearest = 99;
    for (const z of this.zombies.alive) {
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (d > 40) continue;
      const st = z.brain.state;
      const active = st === 'chase' || st === 'attack';
      if (active) {
        tension = Math.max(tension, 1 - d / 30);
        nearest = Math.min(nearest, d);
      }
      const left = (this.groanT.get(z) ?? Math.random() * 6) - dt;
      if (left <= 0) {
        audio.zombieGroan(z.brain.type.id, z.x, z.z, active);
        this.groanT.set(z, active ? 2.2 + Math.random() * 3 : 7 + Math.random() * 12);
      } else this.groanT.set(z, left);
    }
    // Motor des gefahrenen Autos
    const car = this.driven?.v;
    if (car && car.engineOn) audio.engine(true, car.rpm, Math.max(0, Math.min(1, (car.rpm - 900) / 5000)));
    else audio.engine(false, 0, 0);
    audio.update({
      night: this.lighting.night,
      rain: this.weather.rain,
      clouds: this.weather.clouds,
      indoors: this.world.isInside(p.x, p.z),
      tension: Math.max(0, Math.min(1, tension)),
      hp: this.health.hp,
      chased: nearest < 14,
      dt,
    });
  }

  /** Sichtfeld: Strahlen gegen Wände, Shader füttern, Zombies und NPCs außerhalb ausblenden */
  private updateVision(p: THREE.Vector3): void {
    const v = this.vision, s = this.settings;
    v.enabled = s.vision && this.started && !this.dead && !this.sleeping;
    v.params.dim = s.visionDim;
    if (v.enabled) {
      const car = this.driven?.v;
      if (car) {
        // im Auto: Kegel in Fahrtrichtung, bei Tempo noch weiter nach vorn
        const f = car.forward();
        v.x = car.x;
        v.z = car.z;
        v.facing = Math.atan2(f.x, f.z);
      } else {
        v.x = p.x;
        v.z = p.z;
        v.facing = this.player.mesh.rotation.y;
      }
      const torch = this.inventory.hasLight && this.lighting.night > 0.3 ? 4 : 0;
      const speedBonus = car ? Math.min(12, Math.abs(car.kmh) * 0.12) : 0;
      // weit nach vorn sehen: deutlich mehr als die Zombie-Sichtweite
      v.range = visionRange(this.lighting.night, this.weather.rain, this.weather.clouds) + 10 + torch + speedBonus;
      // Wandstrahlen genügen alle zwei Bilder; die Drehung des Kegels läuft jedes Bild
      if ((this.frameNo & 1) === 0) this.world.sightRays(v.x, v.z, v.range + 2, Math.max(0, Math.round(p.y / FLOOR_H)), v.rays);
    }
    this.zombies.applyVision(v, 1 / 60);
    this.fx.setVision(v, this.camera, p.y + 0.5);
    this.factions.applyVision(v);
  }

  /** Optionen anwenden: Qualität, Auflösung, Helligkeit, Tageslänge */
  private applySettings(): void {
    const s = this.settings;
    this.fx.enabled = s.quality === 'high' && this.qualityStage === 0;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * s.scale * (this.qualityStage >= 2 ? 0.8 : 1));
    this.renderer.toneMappingExposure = s.brightness;
    audio.setVolumes(s.audioMaster, s.audioMusic, s.audioSfx);
    this.baseScale = 86400 / (s.dayLength * 60);
    if (!this.sleeping) this.time.timeScale = this.baseScale;
    this.resizeFn();
  }

  /** Charaktererstellung vor dem Start */
  private openCreator(): void {
    this.menu.hide();
    this.creator.open((b) => {
      this.applyCharacter(b, true);
      this.startGame();
    });
  }

  /** Beruf und Eigenschaften anwenden; `fresh`: Startausrüstung des Berufs ins Inventar */
  private applyCharacter(b: Build, fresh: boolean): void {
    this.charBuild = b;
    this.traitFx = effectsOf(b);
    applyBuild(b, this.skills);
    if (fresh) {
      this.level.reset();
      this.talents.reset();
      if (b.look === 'dress') {
        this.inventory.wear('dress');
        this.inventory.add('hoodie', 1);
      } else {
        this.inventory.wear('hoodie');
      }
      for (const s of startItems(b)) {
        const left = this.inventory.add(s.id, s.qty);
        if (left > 0) this.dropToGround([{ id: s.id, qty: left }]);
      }
    }
    this.refreshStats();
    this.refreshUis();
  }

  /** Werte, die von Fertigkeiten und Eigenschaften abhängen */
  private refreshStats(): void {
    const lv = (id: SkillId) => this.skills.level(id);
    this.inventory.carryLimit = 44 + this.traitFx.carry + SKILL_FX.carry(lv('strength')) + this.talents.perks().carry;
    this.player.climbFactor = SKILL_FX.climb(lv('nimble'));
    this.needs.rates = { hunger: this.traitFx.hunger, thirst: this.traitFx.thirst, fatigue: this.traitFx.fatigue };
  }

  private gainXp(id: SkillId, amount: number): void {
    const r = this.skills.add(id, amount);
    this.gainCharXp(r.gained);
    if (!r.levelUp) return;
    audio.levelUp();
    this.hud.toast(`${skillName(id)}: Stufe ${r.levelUp}!`, 'good');
    this.refreshStats();
    this.refreshUis();
  }

  /** Erfahrung für die Charakterstufe; neue Stufen schalten Rezepte frei */
  private gainCharXp(amount: number): void {
    const up = this.level.add(amount);
    if (!up) return;
    audio.levelUp();
    const pts = pointsForLevel(up) - pointsForLevel(up - 1);
    this.hud.toast(`Charakterstufe ${up}! +${pts} Talentpunkt${pts === 1 ? '' : 'e'} (Person → Talente)`, 'good');
    this.refreshUis();
  }

  private unlockTalent(id: string): void {
    const res = this.talents.unlock(id, this.level.level);
    if (!res.ok) return void this.hud.toast(res.reason, 'warn');
    audio.levelUp();
    const t = talent(id)!;
    this.hud.toast(`Talent: ${t.name}${t.recipes?.length ? ' – neue Rezepte' : ''}`, 'good');
    this.refreshStats();
    this.refreshUis();
  }

  /** Welche Fertigkeit eine Waffe trainiert */
  private weaponSkill(w: WeaponDef): SkillId {
    return w.id === 'fists' ? 'strength' : w.look === 'knife' ? 'blade' : w.look === 'axe' ? 'axe' : 'blunt';
  }

  /** Passive Erfahrung: Sprinten, Laufen, schwer Tragen, an Zombies vorbeischleichen (nur bei echter Bewegung) */
  private skillStep(dt: number): void {
    if (this.sleeping || this.dead || this.driven || !this.player.moving) return;
    this.skillClock += dt;
    if (this.skillClock < 1) return;
    this.skillClock -= 1;
    const p = this.player.mesh.position;
    if (this.player.sprinting) {
      this.gainXp('sprinting', 1.2);
      this.gainXp('fitness', 0.8);
    } else this.gainXp('fitness', 0.15);
    if (this.inventory.weight / this.inventory.maxWeight > 0.5) this.gainXp('strength', 0.6);
    if (!this.player.sprinting && this.zombies.alive.some((z) => Math.hypot(z.x - p.x, z.z - p.z) < 18 && z.brain.state !== 'chase' && z.brain.state !== 'attack')) {
      this.gainXp('sneak', 0.8);
    }
  }

  // --- Spielstände ---------------------------------------------------------

  /** Gesamten Spielzustand als JSON-fähiges Objekt (Welt wird aus Seed und Änderungen rekonstruiert) */
  snapshot(): Snapshot {
    const p = this.player.mesh.position;
    // Beim Fahren steht die Figur neben dem Auto, damit sie nach dem Laden nicht im Fahrzeug steckt
    const car = this.driven?.v;
    const side = car ? car.forward() : null;
    const pos = car && side ? { x: car.x - side.z * 2.4, y: 0, z: car.z + side.x * 2.4 } : { x: p.x, y: p.y, z: p.z };
    return {
      v: SAVE_VERSION,
      time: { seconds: this.time.seconds, day: this.time.day },
      weather: { state: this.weather.state, clouds: this.weather.clouds, rain: this.weather.rain, wetness: this.weather.wetness },
      build: this.charBuild,
      needs: this.needs.stats.toJSON(),
      mood: this.mood.stats.toJSON(),
      health: this.health.toJSON(),
      thermo: { skin: { ...this.thermo.skin }, wet: { ...this.thermo.wet } },
      skills: this.skills.toJSON(),
      level: this.level.toJSON(),
      talents: this.talents.toJSON(),
      inventory: this.inventory.toJSON(),
      player: { ...pos, yaw: this.player.mesh.rotation.y },
      world: this.world.exportState(),
      rides: this.rides.map((r) => ({ src: r.src, x: r.v.x, z: r.v.z, rot: r.v.rot, key: r.key })),
      carParts: [...this.carParts],
      piles: this.piles.filter((c) => c.loot.length).map((c) => ({ x: c.x, z: c.z, level: c.level, loot: c.loot.map((q) => ({ ...q })) })),
      structures: this.structures.toJSON(),
      factions: { states: this.factions.states, log: this.factions.log, },
      explored: this.map.explored.toJSON(),
      playtime: this.playtime,
      pzGuns: this.shooter.save(),
    };
  }

  /** Spielstand einlesen; nur direkt nach dem Start aufrufen (die Welt ist noch leer) */
  private restore(d: Snapshot): void {
    const o = <T,>(k: string): T | undefined => d[k] as T | undefined;
    const t = o<{ seconds: number; day: number }>('time');
    if (t) {
      this.time.seconds = t.seconds;
      this.time.day = t.day;
      this.lastDay = t.day;
    }
    const w = o<{ state: Weather['state']; clouds: number; rain: number; wetness: number }>('weather');
    if (w) Object.assign(this.weather, w);
    const b = o<Build>('build');
    if (b) this.applyCharacter({ ...DEFAULT_BUILD, ...b, traits: [...(b.traits ?? [])] }, false);
    const sk = o<Parameters<Skills['fromJSON']>[0]>('skills');
    if (sk) this.skills.fromJSON(sk);
    this.talents.fromJSON(o<{ have: string[] }>('talents'));
    const lv = o<{ xp: number }>('level');
    if (lv) this.level.fromJSON(lv);
    else this.level.xp = SKILL_IDS.reduce((a, id) => a + this.skills.xpOf(id), 0); // alter Spielstand: bisherige Erfahrung zählt mit
    this.refreshStats();
    this.needs.stats.fromJSON(o('needs'));
    this.mood.stats.fromJSON(o('mood'));
    const h = o<Parameters<typeof this.health.fromJSON>[0]>('health');
    if (h) this.health.fromJSON(h);
    const th = o<{ skin: Record<string, number>; wet: Record<string, number> }>('thermo');
    if (th) {
      Object.assign(this.thermo.skin, th.skin);
      Object.assign(this.thermo.wet, th.wet);
    }
    const inv = o<Parameters<Inventory['fromJSON']>[0]>('inventory');
    if (inv) {
      this.inventory.fromJSON(inv);
      const spill = this.inventory.rehome();
      if (spill.length) this.dropToGround(spill);
    }
    this.world.importState(o('world') ?? {});
    const pl = o<{ x: number; y: number; z: number; yaw: number }>('player');
    if (pl) {
      this.player.mesh.position.set(pl.x, pl.y, pl.z);
      this.player.mesh.rotation.y = pl.yaw;
    }
    this.carParts = new Map(o<[string, CarParts][]>('carParts') ?? []);
    for (const r of o<{ src: Car; x: number; z: number; rot: number }[]>('rides') ?? []) {
      const ride = this.makeRide({ ...r.src });
      ride.v.x = r.x;
      ride.v.z = r.z;
      ride.v.rot = r.rot;
      this.syncRide(ride, 0);
    }
    for (const c of o<{ x: number; z: number; level: number; loot: Stack[] }[]>('piles') ?? []) {
      const marker = makePileMesh();
      marker.position.set(c.x, 0.13, c.z);
      marker.rotation.y = Math.random() * Math.PI;
      this.pileGroup.add(marker);
      this.piles.push({ key: `pile:${Date.now()}:${Math.random()}`, name: 'Boden', kind: -1, x: c.x, z: c.z, loot: c.loot, marker, level: c.level });
    }
    const st = o<Parameters<Structures['fromJSON']>[0]>('structures');
    if (st) this.structures.fromJSON(st, PIECES);
    const fa = o<{ states: FactionWorld['states']; log: string[] }>('factions');
    if (fa) {
      for (const id of Object.keys(fa.states) as (keyof FactionWorld['states'])[]) {
        if (this.factions.states[id]) Object.assign(this.factions.states[id], fa.states[id]);
      }
      this.factions.log = fa.log ?? [];
    }
    this.map.explored.fromJSON(o('explored'));
    this.playtime = o<number>('playtime') ?? 0;
    this.shooter.load(o<Record<string, number>>('pzGuns'));
    this.refreshUis();
  }

  /** Kleines Vorschaubild des aktuellen Bildes */
  private thumbnail(): string {
    try {
      this.fx.render(this.scene, this.camera);
      const src = this.renderer.domElement;
      const cv = document.createElement('canvas');
      cv.width = 320;
      cv.height = 180;
      const g = cv.getContext('2d')!;
      const ar = src.width / src.height, tar = cv.width / cv.height;
      // mittig auf 16:9 zuschneiden
      const sw = ar > tar ? src.height * tar : src.width, sh = ar > tar ? src.height : src.width / tar;
      g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.62);
    } catch {
      return '';
    }
  }

  /** Spielstand schreiben; `id` überschreibt einen bestehenden Slot */
  private async saveGame(name: string, id?: string, auto = false): Promise<boolean> {
    if (!this.started || this.dead) return false;
    const meta: SaveMeta = {
      id: id ?? newSaveId(),
      name,
      savedAt: Date.now(),
      day: this.time.day,
      seconds: this.time.seconds % 86400,
      playtime: Math.round(this.playtime),
      hp: Math.round(this.health.hp),
      who: this.charBuild.name,
      thumb: auto ? '' : this.thumbnail(),
      auto,
      version: SAVE_VERSION,
    };
    const file: SaveFile = { meta, data: this.snapshot() };
    const ok = await writeSave(file);
    if (auto && ok) this.hud.toast('Automatisch gespeichert', 'info');
    return ok;
  }

  /** Laden: Seite neu starten und beim Start den Slot einlesen (so ist die Welt garantiert leer) */
  private loadGame(id: string): void {
    try {
      sessionStorage.setItem('ashfall.load', id);
    } catch {
      this.hud.toast('Laden nicht möglich (Browser-Speicher gesperrt).', 'warn');
      return;
    }
    this.saveMenu.close();
    this.loadingScreen.show('Spielstand wird geladen …');
    location.reload();
  }

  private async bootFromSave(id: string): Promise<void> {
    this.loadingScreen.show('Spielstand wird geladen …');
    const f = await readSave(id);
    if (!f) {
      this.loadingScreen.finish(0);
      this.menu.show(false);
      this.hud.toast('Der Spielstand konnte nicht gelesen werden.', 'warn');
      return;
    }
    this.restore(f.data);
    this.started = true;
    this.menu.hide();
    this.input.update(0);
    this.loadingWorld = true;
    this.acc = 0;
    this.hud.toast(`Geladen: ${f.meta.name}`, 'good');
  }

  private startGame(): void {
    this.started = true;
    this.menu.hide();
    this.input.update(0);
    this.beginWorldLoad('Welt wird aufgebaut …');
  }

  /** Ladebildschirm, bis die Chunks rund um den Spieler stehen */
  private beginWorldLoad(text: string): void {
    this.loadingWorld = true;
    this.loadingScreen.show(text);
    this.acc = 0;
  }

  /** Pro Frame: Fortschritt aus den geladenen Chunks berechnen */
  private worldLoadStep(): void {
    const p = this.player.mesh.position;
    const pcx = Math.floor(p.x / CHUNK), pcz = Math.floor(p.z / CHUNK);
    // Die Welt lädt 3×3 Chunks um den Spieler; sind alle da, ist der Ladebildschirm überflüssig
    let near = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (this.world.hasChunk(pcx + dx, pcz + dz)) near++;
    this.loadingScreen.progress(near / 9, near < 9 ? 'Gebäude und Straßen entstehen …' : 'Letzte Handgriffe …');
    if (near >= 9) {
      this.loadingWorld = false;
      this.loadingScreen.finish();
    }
  }

  private newGame(): void {
    if (!this.started) return this.openCreator();
    // Neustart: Seite neu laden und das Menü überspringen
    try {
      sessionStorage.setItem('ashfall.autostart', '1');
    } catch {
      /* ohne Speicher: Menü erscheint erneut */
    }
    location.reload();
  }

  private toggleInventory(): void {
    const p = this.player.mesh.position;
    this.setBuilding(false);
    this.ui.toggleInventory(this.nearestPile(p.x, p.z, REACH));
  }

  private setSpeed(n: number): void {
    this.speed = n;
    this.hud.setSpeed(n);
  }

  private setRun(on: boolean): void {
    this.player.runMode = on;
    this.hud.setRun(on);
  }

  /** Beste Nahrung/Getränk im Rucksack für die Schnellaktionen */
  private bestFor(need: 'hunger' | 'thirst'): { where: Where; index: number; name: string } | null {
    let best: { where: Where; index: number; name: string; v: number } | null = null;
    for (const where of ['main', 'bag', 'side'] as Where[]) {
      this.inventory.list(where).forEach((s, index) => {
        const d = item(s.id);
        const v = d.use?.[need] ?? 0;
        if (v > 0 && (!best || v > best.v)) best = { where, index, name: d.name, v };
      });
    }
    return best;
  }

  private useQuick(id: string): void {
    const b = this.bestFor(id === 'eat' ? 'hunger' : 'thirst');
    if (b) this.useItem(b.where, b.index);
  }

  /** Werte, aus denen die Moodles berechnet werden (siehe data/moodles.ts) */
  private moodleInput(): Record<string, number> {
    const v = this.needs.values;
    return {
      hunger: v.hunger,
      thirst: v.thirst,
      tired: v.energy,
      cold: v.warmth,
      load: this.inventory.weight / this.inventory.maxWeight,
      bleeding: this.health.bleedingCount,
      pain: this.health.pain,
      infection: this.health.infection,
      wet: this.thermo.maxWet,
      uncomfortable: this.mood.discomfort,
      stress: this.mood.stress,
      bored: this.mood.boredom,
      unhappy: this.mood.unhappiness,
    };
  }

  private moodles() {
    return evalMoodles(this.moodleInput());
  }

  private updateChips(): void {
    const chips: { id: string; label: string }[] = [];
    if (this.needs.values.hunger < 80) {
      const b = this.bestFor('hunger');
      if (b) chips.push({ id: 'eat', label: `Essen: ${b.name}` });
    }
    if (this.needs.values.thirst < 80) {
      const b = this.bestFor('thirst');
      if (b) chips.push({ id: 'drink', label: `Trinken: ${b.name}` });
    }
    this.hud.setChips(chips);
  }

  private mapMarkers(): { x: number; z: number; color: string }[] {
    const m: { x: number; z: number; color: string }[] = [];
    for (const def of FACTIONS) {
      const c = campCenter(def);
      m.push({ x: c.x, z: c.z, color: def.css });
    }
    const p = this.player.mesh.position;
    for (const n of this.factions.npcs) {
      if (Math.hypot(n.position.x - p.x, n.position.z - p.z) < 70) m.push({ x: n.position.x, z: n.position.z, color: n.def.css });
    }
    return m;
  }

  /** Lufttemperatur draußen und am Standort (Haus, Feuer, Kleidung) in °C */
  private updateTemperature(): void {
    const c = this.climate(this.lighting.night);
    this.temp = { out: c.out, here: c.here };
  }

  /** Luft am Standort: draußen, im Haus (+9 °C), am Feuer (+5 °C); Wind nur im Freien */
  private climate(night: number): { out: number; here: number; inside: boolean; fire: boolean; wind: number } {
    const p = this.player.mesh.position;
    const out = 17 - 9 * night - 4 * this.weather.rain - 1.5 * this.weather.clouds;
    const inside = this.world.isInside(p.x, p.z);
    const fire = this.structures.isWarm(p.x, p.z);
    return { out, here: out + (inside ? 9 : 0) + (fire ? 5 : 0), inside, fire, wind: inside ? 0 : this.weather.windSpeed };
  }

  /** Beschäftigung des Spielers für die Langeweile */
  private activity(): Activity {
    if (this.dialog.isOpen) return 'social';
    if (this.driven || this.player.moving || this.ui.inventoryOpen || this.crafting.isOpen || this.building) return 'active';
    return 'idle';
  }

  // --- Mehrspieler ---------------------------------------------------------

  private mpState(): MpInfo | null {
    const mp = this.mp;
    if (!mp || !mp.connected) return null;
    return { host: mp.isHost, players: [mp.name, ...[...mp.remotes.values()].map((r) => r.info.name)], addresses: this.mpInfo.addresses, port: this.mpInfo.port, hint: this.mpInfo.hint };
  }

  /** Als Host starten: in der App öffnet das Spiel den Server selbst, im Browser muss einer laufen (node electron/server.cjs) */
  private async hostGame(name: string, port: number): Promise<string | null> {
    if (this.mp) return 'Du bist schon in einer Mehrspieler-Sitzung.';
    try {
      let addresses: string[] = [];
      let hint: string | undefined;
      const api = (window as unknown as { ashfallNet?: { host(p: number, name: string): Promise<{ ok: boolean; msg?: string; addresses?: string[]; upnp?: boolean; publicIp?: string | null }> } }).ashfallNet;
      if (api) {
        const r = await api.host(port, name);
        if (!r.ok) return r.msg ?? 'Server konnte nicht starten.';
        addresses = r.addresses ?? [];
        if (r.upnp) {
          if (r.publicIp) addresses = [...addresses, r.publicIp];
          hint = 'Im selben WLAN erscheint dein Spiel automatisch in der Serverliste. Der Router hat den Port automatisch freigegeben, die letzte Adresse gilt für das Internet.';
        } else {
          hint = 'Im selben WLAN erscheint dein Spiel automatisch in der Serverliste. Für das Internet erlaubt dein Router keine automatische Freigabe: Port in der Router-Oberfläche weiterleiten oder ein VPN (z. B. Radmin, Tailscale) nutzen.';
        }
      }
      const mp = new Multiplayer();
      this.wireMp(mp, false);
      await mp.connect(`ws://127.0.0.1:${port}`, name, 'host', null);
      this.attachMp(mp, { addresses, port, hint });
      return null;
    } catch (e) {
      return (e as Error).message + (!(window as unknown as { ashfallNet?: unknown }).ashfallNet ? ' (Im Browser zuerst den Server starten: node electron/server.cjs)' : '');
    }
  }

  private async joinGame(name: string, address: string): Promise<string | null> {
    if (this.mp) return 'Du bist schon in einer Mehrspieler-Sitzung.';
    const a = address.trim().replace(/^wss?:\/\//, '');
    if (!a) return 'Bitte die Adresse des Hosts eingeben (z. B. 192.168.0.12:7777).';
    const url = `ws://${a.includes(':') ? a : `${a}:7777`}`;
    try {
      const mp = new Multiplayer();
      this.wireMp(mp, true);
      await mp.connect(url, name, 'client', null);
      this.attachMp(mp, { addresses: [], port: 0 });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  /** Verbindung der Sitzung mit dem Spiel */
  private wireMp(mp: Multiplayer, client: boolean): void {
    mp.hooks = {
      pose: () => {
        const p = this.player.mesh.position;
        return {
          pose: { x: p.x, y: p.y, z: p.z, yaw: this.player.mesh.rotation.y, spd: this.netSpeed, sr: this.player.sprinting, sw: this.swing ? Math.min(1, this.swing.t / this.swing.w.swing) : -1, sl: this.player.swingLook, dead: this.dead },
          outfit: { ...this.inventory.equipment, tint: paletteFor(mp.id) },
        };
      },
      makeInit: () => ({
        day: this.time.day,
        seconds: this.time.seconds,
        weather: this.weather.state,
        dyn: this.world.dynEntries(),
        pieces: this.structures.toJSON(),
        piles: this.pilesOut(),
      }),
      onInit: (m) => {
        this.time.day = m.day;
        this.time.seconds = m.seconds;
        this.weather.setState(m.weather as typeof this.weather.state);
        this.world.applyDyn(m.dyn);
        this.structures.fromJSON(m.pieces as Parameters<Structures['fromJSON']>[0], PIECES);
        this.applyPiles(m.piles);
        this.hud.toast('Mit der Welt des Hosts verbunden.', 'good');
      },
      timeNow: () => ({ day: this.time.day, seconds: this.time.seconds, weather: this.weather.state }),
      onTime: (m) => {
        const drift = Math.abs((m.day - this.time.day) * 86400 + (m.seconds - this.time.seconds));
        if (drift > 20) {
          this.time.day = m.day;
          this.time.seconds = m.seconds;
        }
        if (m.weather !== this.weather.state) this.weather.setState(m.weather as typeof this.weather.state);
      },
      dynOut: () => this.world.dynEntries(),
      onDyn: (e) => this.world.applyDyn(e),
      piecesOut: () => this.structures.toJSON(),
      onPieces: (l) => this.structures.fromJSON(l as Parameters<Structures['fromJSON']>[0], PIECES),
      pilesOut: () => this.pilesOut(),
      onPiles: (l) => this.applyPiles(l),
      zombiesOut: (centers) => this.zombies.snapshot(centers),
      onZombies: (list) =>
        this.zombies.applyNet(list, performance.now() / 1000, (z, d, px, pz, from) => this.mp?.hitZombie(z.netId, d, px, pz, from)),
      onZombieHit: (m) => void this.zombies.hitById(m.id, m.d, m.px, m.pz, m.from),
      onStrike: (zid) => {
        const z = this.zombies.zombies.find((q) => q.netId === zid);
        if (z) this.onZombieStrike(z);
      },
      onNoise: (x, zz, r) => this.zombies.noise(x, zz, r),
      onChat: (name, text, own) => this.chat.add(name, text, own),
      onSystem: (t) => this.chat.system(t),
      onEnd: (reason) => this.detachMp(reason),
    };
    void client;
  }

  private attachMp(mp: Multiplayer, info: { addresses: string[]; port: number; hint?: string }): void {
    this.mp = mp;
    this.mpInfo = info;
    this.scene.add(mp.group);
    this.chat.setActive(true);
    if (!mp.isHost) {
      // Der Host steuert die Zombies: eigene verwerfen, Geräusche an den Host schicken
      for (const z of [...this.zombies.zombies]) if (!z.netId) this.zombies.remove(z);
      this.zombies.noiseHook = (x, z, r) => this.mp?.noise(x, z, r);
    }
    if (this.started) this.menu.hide();
    else this.openCreator();
    this.hud.toast(mp.isHost ? 'Mehrspieler: Du bist Host.' : 'Mehrspieler: Verbunden. Erstelle deinen Charakter.', 'good');
  }

  private detachMp(reason: string): void {
    const mp = this.mp;
    if (!mp) return;
    this.mp = null;
    mp.close();
    this.scene.remove(mp.group);
    this.zombies.noiseHook = null;
    for (const z of [...this.zombies.zombies]) if (z.netId) this.zombies.remove(z);
    this.chat.setActive(false);
    this.hud.toast(reason, 'warn');
  }

  private pilesOut(): { x: number; z: number; level: number; loot: Stack[] }[] {
    return this.piles.filter((c) => c.loot.length).map((c) => ({ x: c.x, z: c.z, level: c.level, loot: c.loot.map((q) => ({ ...q })) }));
  }

  private applyPiles(list: unknown[]): void {
    if (this.ui.inventoryOpen) return; // gerade im Inventar: später
    for (const c of this.piles) this.pileGroup.remove(c.marker);
    this.piles.length = 0;
    for (const c of list as { x: number; z: number; level: number; loot: Stack[] }[]) {
      const marker = makePileMesh();
      marker.position.set(c.x, 0.13, c.z);
      marker.rotation.y = Math.random() * Math.PI;
      this.pileGroup.add(marker);
      this.piles.push({ key: `pile:${Date.now()}:${Math.random()}`, name: 'Boden', kind: -1, x: c.x, z: c.z, loot: c.loot.map((q) => ({ ...q })), marker, level: c.level });
    }
  }

  /** Zustand je Körperteil für die Körperfigur im HUD */
  private bodyStates(): Record<PartId, 'ok' | 'hurt' | 'warn' | 'bad'> {
    const out = {} as Record<PartId, 'ok' | 'hurt' | 'warn' | 'bad'>;
    for (const id of PARTS) {
      const ws = this.health.parts[id].wounds;
      out[id] = ws.some(isBleeding) ? 'bad' : ws.some((w) => w.infection > 0 || isDirty(w)) ? 'warn' : ws.length ? 'hurt' : 'ok';
    }
    return out;
  }

  /** Jeden Frame: Lage und Zustand abgleichen, Zombies des Hosts bewegen */
  private netFrame(dt: number, now: number): void {
    const mp = this.mp;
    if (!mp) return;
    const p = this.player.mesh.position;
    const v = dt > 0 ? Math.hypot(p.x - this.netLast.x, p.z - this.netLast.z) / dt : 0;
    this.netSpeed += (Math.min(8, v) - this.netSpeed) * Math.min(1, dt * 8);
    this.netLast.copy(p);
    if (!mp.ready && this.started && !this.loadingWorld) mp.markReady();
    mp.tick(dt, p);
    if (mp.ready && !mp.isHost) this.zombies.updateRemote(dt, now);
  }

  // --- Loop ----------------------------------------------------------------

  start(): void {
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      const dtReal = Math.min((now - this.last) / 1000, 0.1);
      this.acc += dtReal;
      this.last = now;
      // Menü offen: Spiel steht still, Tastendrücke gehören dem Menü
      if (this.menu.open) {
        this.acc = 0;
        this.input.update(0);
        return;
      }

      if (this.started && !this.dead && !this.loadingWorld) {
        this.playtime += dtReal;
        if ((this.autosaveT += dtReal) >= 240 && !this.sleeping) {
          this.autosaveT = 0;
          void this.saveGame('Autospeicherung', 'auto', true);
        }
      }
      if (!this.dead) this.handleKeys();
      // Zeitsteuerung: 0 = Pause, 2/4 = schneller (Schlafen läuft immer mit eigener Rate)
      const k = this.sleeping ? 1 : this.loadingWorld ? 0 : this.speed;
      this.camera.position.sub(this.shakeOff);
      while (this.acc >= STEP) {
        this.input.update(STEP);
        if (!this.dead && k > 0) {
          if (!this.sleeping) {
            this.boardStep(STEP);
            this.driveStep(STEP * Math.min(k, 1));
            this.debris.update(STEP);
            this.crashFx.update(STEP);
            this.player.update(STEP);
          }
          this.time.advance(STEP * k);
          this.survive(STEP * k);
          this.combatStep(STEP * k);
          this.skillStep(STEP * k);
          this.actionStep(STEP * k);
          this.weather.update(STEP * k, this.player.mesh.position, this.world.isInside(this.player.mesh.position.x, this.player.mesh.position.z));
        }
        this.acc -= STEP;
      }

      this.shake *= 0.9;
      this.shakeOff.set((Math.random() - 0.5) * this.shake * 1.2, (Math.random() - 0.5) * this.shake * 0.8, (Math.random() - 0.5) * this.shake * 1.2);
      this.camera.position.add(this.shakeOff);
      const p = this.player.mesh.position;
      this.camera.zoom += (this.input.zoom - this.camera.zoom) * 0.15;
      this.camera.updateProjectionMatrix();
      this.world.update(p.x, p.z, 1 / 60, this.input.yaw, p.y);
      if (this.loadingWorld) this.worldLoadStep();
      this.lighting.update(this.scene, this.time, this.weather, p, this.world.isInside(p.x, p.z), {
        on: this.inventory.hasLight && !this.sleeping && this.lighting.night > 0.3,
        yaw: this.player.mesh.rotation.y,
      });
      setNightGlow(this.lighting.night);
      setWetness(this.weather.wetness);
      smokeUniforms.uTime.value = now / 1000;
      smokeUniforms.uPx.value = this.renderer.domElement.height / ((this.camera.top - this.camera.bottom) / this.camera.zoom);
      smokeUniforms.uNight.value = this.lighting.night;
      // im Mehrspieler trägt jeder eigene Farben (Mitspieler sehen dieselben)
      dressCharacter(this.player.body, this.mp?.connected ? { ...this.inventory.equipment, tint: paletteFor(this.mp.id) } : this.inventory.equipment);
      this.fx.update(this.lighting.night, this.weather.clouds, now / 1000);
      setXrayRadius(this.driven ? 8 : 3.8);
      updateXray(this.camera, p);
      this.updateVision(p);
      this.audioFrame(dtReal, p);
      this.announceChanges();
      this.hud.setBars(this.health.hp, this.needs.values, this.levels, this.health.bleeding);
      if (this.frameNo % 6 === 0) this.hud.setBody(this.bodyStates());
      this.updateTemperature();
      this.hud.setClock(this.time.day, this.time.seconds, this.weather.state);
      const info = this.world.buildingInfo(p.x, p.z, p.y);
      this.hud.setFloors(info ? { ...info, temp: this.temp.here } : null, this.temp.out);
      this.hud.setBadges([]);
      this.hud.setLoad(this.inventory.weight, this.inventory.maxWeight);
      this.hud.setCompass(this.input.yaw);
      if ((this.chipTimer += 1) % 30 === 0) this.updateChips();
      if (this.driven) {
        const v = this.driven.v;
        this.speedo.update(1 / 60, v.kmh, v.rpm, v.gear, v.odo, v.lights, v.handbrake, this.lighting.night, v.health, fuelFraction(this.driven.parts), v.engineOn);
      }
      this.map.update(p.x, p.z, this.input.yaw, this.player.mesh.rotation.y);
      this.netFrame(dtReal, now / 1000);
      this.adaptQuality(now);
      if ((this.frameNo++ & 1) === 0) this.renderer.shadowMap.needsUpdate = true;
      this.fx.render(this.scene, this.camera);
    };
    loop();
  }
}

const pileMats = [
  new THREE.MeshStandardMaterial({ color: 0x8b6b45, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x4f5a3a, roughness: 1 }),
];
const pileGeo = [new THREE.BoxGeometry(0.42, 0.26, 0.32), new THREE.SphereGeometry(0.2, 10, 8)];

/** Kleiner Haufen aus Karton und Stoffsack. */
function makePileMesh(): THREE.Mesh {
  const box = new THREE.Mesh(pileGeo[0], pileMats[0]);
  box.position.y = 0.13;
  const sack = new THREE.Mesh(pileGeo[1], pileMats[1]);
  sack.scale.set(1, 0.7, 1);
  sack.position.set(0.28, 0, 0.1);
  box.add(sack);
  box.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  return box;
}
