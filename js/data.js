// =====================================================================
//  HELA 02 • NEON BREACH  —  data.js
//  All static config: weapons, enemy archetypes, levels, secret codes.
//  Exposed on the global HELA namespace (file:// safe, no modules).
// =====================================================================
window.HELA = window.HELA || {};

HELA.VERSION = "0.3.0";

// ---- Weapons --------------------------------------------------------
// dmg per pellet, cooldown ms, mag size, reserve, spread (radians-ish),
// pellets per shot, auto = hold to fire, recoil shake.
HELA.WEAPONS = {
    spike: { id: 'spike', name: 'SPIKE-RIFLE', jp: 'スパイク', dmg: 34, cooldown: 130, mag: 24, reserve: 120,
             spread: 0.010, pellets: 1, auto: true, recoil: 0.12, tracer: '#00f3ff', slot: 1 },
    smg:   { id: 'smg',   name: 'WASP-SMG',    jp: 'ワスプ',   dmg: 17, cooldown: 70,  mag: 40, reserve: 240,
             spread: 0.035, pellets: 1, auto: true, recoil: 0.08, tracer: '#00ffcc', slot: 2 },
    breach:{ id: 'breach',name: 'BREACHER',    jp: 'ブリーチ', dmg: 13, cooldown: 620, mag: 6,  reserve: 54,
             spread: 0.13,  pellets: 8, auto: false, recoil: 0.35, tracer: '#ff9500', slot: 3 },
    sidearm:{id: 'sidearm',name:'SIDEARM',     jp: 'サイドアーム', dmg: 26, cooldown: 200, mag: 12, reserve: 9999,
             spread: 0.012, pellets: 1, auto: false, recoil: 0.10, tracer: '#ff00aa', slot: 4, infinite: true },
};
HELA.WEAPON_ORDER = ['spike', 'smg', 'breach', 'sidearm'];

// ---- Enemy archetypes ----------------------------------------------
HELA.ENEMY_TYPES = {
    scout:    { kind: 'drone', hp: 45,  speed: 8.4, dmg: 6,  fire: 1100, points: 1, size: 0.78, body: "#3a2424", eye: "#ff8800", eyeEm: "#ff5500" },
    drone:    { kind: 'drone', hp: 95,  speed: 5.4, dmg: 11, fire: 1400, points: 2, size: 1.0,  body: "#3a2424", eye: "#ff2a2a", eyeEm: "#ff0000" },
    brute:    { kind: 'drone', hp: 230, speed: 3.0, dmg: 22, fire: 1900, points: 4, size: 1.5,  body: "#2a1a30", eye: "#cc33ff", eyeEm: "#aa00ff" },
    // Human-like enemy: armoured soldier with a rifle
    soldier:  { kind: 'human', hp: 130, speed: 4.8, dmg: 14, fire: 1250, points: 3, size: 1.0,  body: "#2c3340", suit: "#1d2430", visor: "#ff3344", visorEm: "#ff0022" },
    elite:    { kind: 'human', hp: 200, speed: 5.6, dmg: 18, fire: 1000, points: 5, size: 1.05, body: "#3a2c1a", suit: "#241a0e", visor: "#ffaa00", visorEm: "#ff7700" },
    // Boss: heavy mech
    boss:     { kind: 'boss',  hp: 2600, speed: 2.4, dmg: 30, fire: 800, points: 50, size: 2.6,  body: "#241024", eye: "#ff2266", eyeEm: "#ff0033" },
};

// ---- Levels / Missions ---------------------------------------------
// objective: 'survive' (clear N waves) | 'hack' (tamper all terminals + survive)
//            'eliminate' (kill quota) | 'boss' (defeat boss)
HELA.LEVELS = [
    {
        id: 1, name: "NEON BREACH", jp: "ネオン侵入", codename: "OP-HELA",
        objective: 'survive', waves: 3,
        fog: '#050708', fogDensity: 0.022, ground: '#161b28', accent: '#00f3ff',
        enemyPool: ['scout', 'drone'],
        brief: "Hostile drones have breached the HELA-02 sector. Hold the plaza and clear all attack waves.",
        signs: [['ヘラ02', '#ffcc00'], ['テクノロジーズ', '#00f3ff'], ['ゲームセンター', '#ff00aa']],
    },
    {
        id: 2, name: "DATA HEIST", jp: "データ強奪", codename: "OP-SPIKE",
        objective: 'hack', waves: 99,
        fog: '#06120a', fogDensity: 0.026, ground: '#121d16', accent: '#00ff88',
        enemyPool: ['scout', 'drone', 'soldier'],
        brief: "Infiltrate the data vault. Data-Spike every security terminal while surviving the garrison.",
        signs: [['データ', '#00ff88'], ['アクセス', '#00ffcc'], ['機密', '#ff3355']],
    },
    {
        id: 3, name: "CRIMSON GARRISON", jp: "紅の駐屯地", codename: "OP-IRON",
        objective: 'eliminate', quota: 22, waves: 99,
        fog: '#140a06', fogDensity: 0.028, ground: '#241712', accent: '#ff9500',
        enemyPool: ['drone', 'soldier', 'elite'],
        brief: "The garrison is mobilizing armoured infantry. Eliminate 22 hostiles to break their line.",
        signs: [['駐屯地', '#ff9500'], ['危険', '#ff3355'], ['兵器', '#ffcc00']],
    },
    {
        id: 4, name: "CRIMSON SPIRE", jp: "紅の尖塔", codename: "OP-OMEGA",
        objective: 'boss', waves: 1,
        fog: '#0c0410', fogDensity: 0.03, ground: '#1a1020', accent: '#ff00aa',
        enemyPool: ['soldier', 'elite'],
        brief: "Reach the spire core and destroy the OMEGA war-mech. End the breach.",
        signs: [['オメガ', '#ff00aa'], ['警告', '#ff2266'], ['核', '#ff5500']],
    },
];

// ---- Secret codes ---------------------------------------------------
// typed in the CODES console (menu) or via the in-game prompt.
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
// Konami easter egg (arrow keys + B A)
HELA.KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
