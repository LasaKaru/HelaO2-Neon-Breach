// =====================================================================
//  HELA 02 • NEON BREACH  —  data.js
//  Static config: studio identity, weapons, enemies, levels, codes.
//  Exposed on the global HELA namespace (file:// safe, no modules).
// =====================================================================
window.HELA = window.HELA || {};

HELA.VERSION = "0.7.0";

// ---- Studio / company identity (single-word HelaO2) ----
HELA.STUDIO  = "HelaO2 Studio";
HELA.COMPANY = "HelaO2 (Pvt) Limited";

// ---- Weapons --------------------------------------------------------
HELA.WEAPONS = {
    spike:  { id: 'spike',  name: 'SCAR RIFLE',  jp: 'ライフル',  dmg: 34, cooldown: 130, mag: 30, reserve: 150,
              spread: 0.010, pellets: 1, auto: true, recoil: 0.12, tracer: '#fff0b0', slot: 1 },
    smg:    { id: 'smg',    name: 'WASP-SMG',    jp: 'ワスプ',    dmg: 17, cooldown: 70,  mag: 40, reserve: 240,
              spread: 0.035, pellets: 1, auto: true, recoil: 0.08, tracer: '#fff0b0', slot: 2 },
    breach: { id: 'breach', name: 'BREACHER',    jp: 'ショットガン', dmg: 13, cooldown: 620, mag: 6,  reserve: 54,
              spread: 0.13,  pellets: 8, auto: false, recoil: 0.35, tracer: '#ffcf80', slot: 3 },
    sidearm:{ id: 'sidearm',name: 'SIDEARM',     jp: 'サイドアーム', dmg: 26, cooldown: 200, mag: 12, reserve: 9999,
              spread: 0.012, pellets: 1, auto: false, recoil: 0.10, tracer: '#ffe0a0', slot: 4, infinite: true },
};
HELA.WEAPON_ORDER = ['spike', 'smg', 'breach', 'sidearm'];

// ---- Enemy archetypes ----------------------------------------------
// kind: drone | human | zombie | boss
HELA.ENEMY_TYPES = {
    // forest infected (human-like, melee)
    zombie:  { kind: 'zombie', hp: 70,  speed: 3.6, dmg: 15, fire: 1100, points: 2, size: 1.0,  skin: '#7a8a5a', shirt: '#3c4a2c', pants: '#2a2c1c', eye: '#ffcc33', eyeEm: '#ffaa00' },
    runner:  { kind: 'zombie', hp: 44,  speed: 7.2, dmg: 11, fire: 900,  points: 3, size: 0.95, skin: '#8a7a52', shirt: '#5a3a2a', pants: '#2a2218', eye: '#ff8800', eyeEm: '#ff5500' },
    lurker:  { kind: 'zombie', hp: 260, speed: 2.6, dmg: 28, fire: 1500, points: 5, size: 1.55, skin: '#5e6e3e', shirt: '#28371a', pants: '#1a2010', eye: '#ff3333', eyeEm: '#ff0000' },
    // neon drones
    scout:    { kind: 'drone', hp: 45,  speed: 8.4, dmg: 6,  fire: 1100, points: 1, size: 0.78, body: "#3a2424", eye: "#ff8800", eyeEm: "#ff5500" },
    drone:    { kind: 'drone', hp: 95,  speed: 5.4, dmg: 11, fire: 1400, points: 2, size: 1.0,  body: "#3a2424", eye: "#ff2a2a", eyeEm: "#ff0000" },
    brute:    { kind: 'drone', hp: 230, speed: 3.0, dmg: 22, fire: 1900, points: 4, size: 1.5,  body: "#2a1a30", eye: "#cc33ff", eyeEm: "#aa00ff" },
    // neon humanoid soldiers (ranged)
    soldier:  { kind: 'human', hp: 130, speed: 4.8, dmg: 14, fire: 1250, points: 3, size: 1.0,  body: "#2c3340", suit: "#1d2430", visor: "#ff3344", visorEm: "#ff0022" },
    elite:    { kind: 'human', hp: 200, speed: 5.6, dmg: 18, fire: 1000, points: 5, size: 1.05, body: "#3a2c1a", suit: "#241a0e", visor: "#ffaa00", visorEm: "#ff7700" },
    // boss
    boss:     { kind: 'boss',  hp: 2600, speed: 2.4, dmg: 30, fire: 800, points: 50, size: 2.6, body: "#241024", eye: "#ff2266", eyeEm: "#ff0033" },
};

// ---- Levels / Missions ---------------------------------------------
// All missions share the OVERGROWN NEON RUINS theme — misty daylight,
// mossy concrete reclaimed by trees & grass, neon signs still glowing.
// objective: 'survive' | 'collect' | 'hack' | 'eliminate' | 'boss'
HELA.LEVELS = [
    {
        id: 1, name: "OVERGROWN PLAZA", jp: "廃墟の広場", codename: "OP-VERDANT", theme: 'ruins',
        objective: 'survive', waves: 5, bigMap: true,
        sky: '#cdd6cf', fog: '#b7c4ba', fogDensity: 0.011, ground: '#36422f', accent: '#00f3ff',
        enemyPool: ['drone', 'soldier'],
        brief: "The HELA-02 plaza has been reclaimed by the wild. Hold the cracked platform and clear 5 waves amid the overgrown ruins. Grab caches you find along the way.",
        signs: [['ヘラ02', '#ffcc00'], ['HelaO2', '#00f3ff'], ['ゲームセンター', '#ff00aa']],
    },
    {
        id: 2, name: "SALVAGE RUN", jp: "回収任務", codename: "OP-CACHE", theme: 'ruins',
        objective: 'collect', collectTarget: 6, waves: 99, bigMap: true,
        sky: '#ccd5cd', fog: '#aebfb0', fogDensity: 0.012, ground: '#313d2b', accent: '#00ff88',
        enemyPool: ['drone', 'soldier'],
        brief: "Recover 6 data-caches scattered through the ruins while the garrison hunts you. Cache pings show on your minimap — collect them all to extract.",
        signs: [['データ', '#00ff88'], ['回収', '#00ffcc'], ['機密', '#ff3355']],
    },
    {
        id: 3, name: "DATA HEIST", jp: "データ強奪", codename: "OP-SPIKE", theme: 'ruins',
        objective: 'hack', waves: 99,
        sky: '#cdd6cf', fog: '#aebfb0', fogDensity: 0.013, ground: '#2f3a2c', accent: '#00ff88',
        enemyPool: ['drone', 'soldier'],
        brief: "Infiltrate the overgrown vault. Data-Spike every security terminal while surviving the garrison.",
        signs: [['データ', '#00ff88'], ['アクセス', '#00ffcc'], ['機密', '#ff3355']],
    },
    {
        id: 4, name: "CRIMSON GARRISON", jp: "紅の駐屯地", codename: "OP-IRON", theme: 'ruins',
        objective: 'eliminate', quota: 22, waves: 99,
        sky: '#d2cdc4', fog: '#bdb6a6', fogDensity: 0.014, ground: '#3a3528', accent: '#ff9500',
        enemyPool: ['drone', 'soldier', 'elite'],
        brief: "The garrison is mobilizing armoured infantry through the ruins. Eliminate 22 hostiles to break their line.",
        signs: [['駐屯地', '#ff9500'], ['危険', '#ff3355'], ['兵器', '#ffcc00']],
    },
    {
        id: 5, name: "CRIMSON SPIRE", jp: "紅の尖塔", codename: "OP-OMEGA", theme: 'ruins',
        objective: 'boss', waves: 1, bigMap: true,
        sky: '#ccc6d2', fog: '#b3acc0', fogDensity: 0.015, ground: '#33304a', accent: '#ff00aa',
        enemyPool: ['soldier', 'elite'],
        brief: "Reach the spire at the heart of the ruins and destroy the OMEGA war-mech. End the breach.",
        signs: [['オメガ', '#ff00aa'], ['警告', '#ff2266'], ['核', '#ff5500']],
    },
];

// ---- Collectibles ---------------------------------------------------
// stored = goes into the inventory; usable = can be triggered by a key.
HELA.COLLECTIBLES = {
    datacache: { name: 'DATA-CACHE', glow: '#00f3ff', icon: '◈', mission: true },
    medkit:    { name: 'MEDKIT',    glow: '#ff4455', icon: '✚', stored: true, use: 'heal', key: 'h' },
    grenade:   { name: 'GRENADE',   glow: '#ff9500', icon: '✸', stored: true, use: 'throw', key: 'g' },
    cell:      { name: 'NEON CELL', glow: '#cc66ff', icon: '⬢', score: 250 },
    ammo:      { name: 'AMMO',      glow: '#00ff66', icon: '▮', ammo: 30 },
};

// ---- Secret codes ---------------------------------------------------
HELA.CODES = {
    'GODMODE':   { effect: 'god',      label: 'INVULNERABILITY ENGAGED' },
    'FULLMETAL': { effect: 'infammo',  label: 'INFINITE AMMUNITION' },
    'BIGHEAD':   { effect: 'bighead',  label: 'BIG-HEAD MODE' },
    'LOWGRAV':   { effect: 'lowgrav',  label: 'LOW GRAVITY' },
    'HASTE':     { effect: 'haste',    label: 'OVERCLOCK — SPEED x1.6' },
    'UNLOCKALL': { effect: 'unlockall',label: 'ALL MISSIONS UNLOCKED' },
    'GIVEALL':   { effect: 'giveall',  label: 'FULL ARSENAL GRANTED' },
    'HELA02':    { effect: 'credits',  label: 'STAFF CREDITS' },
};
HELA.KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
