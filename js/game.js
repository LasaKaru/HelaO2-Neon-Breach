// =====================================================================
//  HELA 02 • NEON BREACH  —  game.js
//  Babylon engine, per-level worlds, weapons, drone/human/boss enemies,
//  objective director, map, secret-code effects, live settings.
// =====================================================================
window.HELA = window.HELA || {};

(function () {
    const C = BABYLON.Color3;
    const V3 = BABYLON.Vector3;

    // ---- procedural audio ----
    const Audio = {
        ctx: null, master: null,
        init() {
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.master = this.ctx.createGain();
                this.master.connect(this.ctx.destination);
                this.applyVolume();
            } catch (e) {}
        },
        applyVolume() { if (this.master) this.master.gain.value = HELA.Settings.get('master'); },
        resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
        g() { return (HELA.Settings.get('sfx') || 0.8); },
        tone(freq, dur, type, gain, pan, sweepTo) {
            if (!this.ctx || S.muted) return;
            const t = this.ctx.currentTime, osc = this.ctx.createOscillator(), g = this.ctx.createGain();
            osc.type = type || 'square'; osc.frequency.setValueAtTime(freq, t);
            if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
            const amp = (gain || 0.2) * this.g();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp), t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            let node = g;
            if (pan !== undefined && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
            osc.connect(g); node.connect(this.master); osc.start(t); osc.stop(t + dur + 0.02);
        },
        noise(dur, gain, pan, hp) {
            if (!this.ctx || S.muted) return;
            const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
            const src = this.ctx.createBufferSource(); src.buffer = buf;
            const g = this.ctx.createGain(); g.gain.value = (gain || 0.2) * this.g();
            const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 600;
            src.connect(f); f.connect(g);
            let node = g;
            if (pan !== undefined && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
            node.connect(this.master); src.start(t);
        },
        shoot(w) { const base = w === 'breach' ? 120 : w === 'smg' ? 260 : 220; this.tone(base, 0.08, 'square', 0.16, 0, base * 0.4); this.noise(0.05, 0.1, 0, 1200); },
        hit(p) { this.tone(440, 0.06, 'sawtooth', 0.14, p, 700); },
        kill(p) { this.tone(160, 0.3, 'sawtooth', 0.2, p, 40); this.noise(0.25, 0.16, p, 300); },
        enemyShoot(p) { this.tone(330, 0.12, 'triangle', 0.09, p, 120); },
        reload() { this.tone(140, 0.08, 'square', 0.12, 0); setTimeout(() => this.tone(200, 0.08, 'square', 0.12, 0), 280); },
        hack() { for (let i = 0; i < 4; i++) setTimeout(() => this.tone(500 + i * 200, 0.07, 'square', 0.12, 0), i * 70); },
        damage() { this.tone(90, 0.18, 'sawtooth', 0.18, 0, 50); },
        pickup() { this.tone(660, 0.08, 'sine', 0.15, 0); setTimeout(() => this.tone(990, 0.1, 'sine', 0.15, 0), 70); },
        dash() { this.tone(300, 0.15, 'sine', 0.11, 0, 600); },
        wave() { this.tone(110, 0.4, 'sawtooth', 0.18, 0, 220); },
        swap() { this.tone(420, 0.05, 'square', 0.1, 0); },
        boss() { this.tone(60, 0.6, 'sawtooth', 0.25, 0, 40); this.noise(0.5, 0.2, 0, 200); },
    };
    HELA.Audio = Audio;

    // ---- runtime state ----
    const CFG = { moveSpeed: 11, sprintMult: 1.7, baseSens: 0.0024, worldBounds: 70, dashCooldown: 1400, dashImpulse: 26, comboWindow: 3000 };
    const S = {
        booted: false, scene: null, level: null, mode: null,
        running: false, over: false, paused: false,
        health: 100, shield: 100, score: 0, combo: 0, lastKill: 0,
        kills: 0, wave: 0, betweenWaves: false, terminalsTotal: 0, terminalsHacked: 0, quota: 0, objectiveDone: false,
        yaw: 0, pitch: 0.18, keys: {}, pointerLocked: false, mouseDown: false,
        lastShot: 0, lastDash: 0, dashVel: null, reloading: false, shake: 0, muted: false,
        curWeapon: 'spike', weaponState: {}, unlockedWeapons: { spike: true, sidearm: true },
        codes: {}, bossRef: null, mapOpen: false, frame: 0, fpsTime: 0,
        bounds: 70, groundY: 3.55, theme: 'neon',
        fpv: true, vmKick: 0, vmBob: 0,
    };
    HELA.Game = { currentLevelId: 1 };

    let engine, camera, glow, shadowGen, pipeline, ssaoPipe;
    let player, muzzle, playerHead, vmRoot, vmMuzzle;
    let enemies = [], colliders = [], interactables = [], particles = [], bolts = [], pickups = [];
    let windNodes = [], motes = [], grenadesArr = [], mistArr = [];
    let domeMesh, domeShieldUp = true, minimapCtx, bigmapCtx;
    let canvas;
    let SPAWN = [];
    // Spawn ring scaled to the level's play area.
    function buildSpawnRing(bounds) {
        const r = bounds * 0.78, pts = [];
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push(new V3(Math.cos(a) * r, 3.5, Math.sin(a) * r)); }
        return pts;
    }

    // ---- helpers ----
    const $ = (id) => document.getElementById(id);
    const matCache = {};
    function flatMat(name, hex, emHex, emAmt) {
        const key = name + hex + (emHex || '') + (emAmt || 0);
        if (matCache[key]) return matCache[key];
        const m = new BABYLON.StandardMaterial(name, S.scene);
        m.diffuseColor = C.FromHexString(hex); m.specularColor = new C(0.05, 0.05, 0.08);
        if (emHex) m.emissiveColor = C.FromHexString(emHex).scale(emAmt || 1);
        m.maxSimultaneousLights = 8; matCache[key] = m; return m;
    }
    function forwardVec() { return new V3(Math.sin(S.yaw), 0, Math.cos(S.yaw)).normalize(); }
    function rightVec() { return new V3(Math.cos(S.yaw), 0, -Math.sin(S.yaw)).normalize(); }
    function aimVec(spread) {
        const cp = Math.cos(S.pitch);
        let d = new V3(Math.sin(S.yaw) * cp, Math.sin(S.pitch), Math.cos(S.yaw) * cp);
        if (spread) d.addInPlace(new V3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
        return d.normalize();
    }
    function panFor(pos) { if (!player) return 0; const r = rightVec(), to = pos.subtract(player.position); to.y = 0; if (to.lengthSquared() < 0.001) return 0; to.normalize(); return Math.max(-1, Math.min(1, V3.Dot(to, r))); }

    // =================================================================
    //  BOOT
    // =================================================================
    HELA.Game.boot = function (cv) {
        if (S.booted) return;
        canvas = cv;
        engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true, powerPreference: 'high-performance' });
        engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 1.5));
        Audio.init();
        minimapCtx = $('minimap').getContext('2d');
        const bm = $('bigmap-canvas'); if (bm) bigmapCtx = bm.getContext('2d');
        bindInput();
        window.addEventListener('resize', () => engine.resize());
        engine.runRenderLoop(loop);
        S.booted = true;
    };

    // =================================================================
    //  LEVEL LIFECYCLE
    // =================================================================
    HELA.Game.startLevel = function (level) {
        const lv = (typeof level === 'object') ? level : HELA.LEVELS.find(l => l.id === level);
        S.isRandom = (typeof level === 'object');
        HELA.Game.currentLevelId = lv.id;
        S.level = lv;
        S.mode = lv.objective;
        if (S.scene) { S.scene.dispose(); }
        for (const k in matCache) delete matCache[k];
        enemies = []; colliders = []; interactables = []; particles = []; bolts = []; pickups = []; grenadesArr = [];
        domeShieldUp = true; S.bossRef = null;

        // reset run state
        Object.assign(S, {
            running: true, over: false, paused: false, health: 100, shield: 100,
            score: 0, combo: 0, lastKill: 0, kills: 0, wave: 0, betweenWaves: false,
            terminalsHacked: 0, quota: lv.quota || 0, objectiveDone: false,
            collected: 0, collectTarget: lv.collectTarget || 0,
            inventory: { datacache: 0, medkit: 0, grenade: 0, cell: 0, ammo: 0 },
            yaw: 0, pitch: 0.18, dashVel: V3.Zero(), reloading: false, shake: 0,
        });
        if (S.codes.god) S.health = 100;

        // weapons: ensure starting loadout
        if (!S.weaponState.spike) for (const id of HELA.WEAPON_ORDER) { const w = HELA.WEAPONS[id]; S.weaponState[id] = { mag: w.mag, reserve: w.infinite ? Infinity : w.reserve }; }
        S.curWeapon = S.unlockedWeapons.spike ? 'spike' : 'sidearm';

        buildScene();
        $('boss-bar').classList.add('hidden');   // hide before director (boss level re-shows it)
        initDirector();
        scatterCollectibles();
        Audio.resume();
        updateHUD(); renderWeaponSlots(); updateInventoryHUD();
        status((S.isRandom ? 'RANDOM OP — ' : 'MISSION — ') + S.level.name, 3200);
        announce(S.level.name, S.level.jp);
    };
    HELA.Game.startRandom = function () { S.unlockedWeapons.spike = true; HELA.Game.startLevel(randomConfig()); };
    function randomConfig() {
        const base = HELA.LEVELS[Math.floor(Math.random() * HELA.LEVELS.length)];
        const objs = ['survive', 'collect', 'eliminate'];
        const obj = objs[Math.floor(Math.random() * objs.length)];
        const tints = [['#cdd6cf', '#b7c4ba', '#36422f'], ['#d2cdc4', '#bdb6a6', '#3a3528'], ['#ccc6d2', '#b3acc0', '#33304a'], ['#c8d6d0', '#acc0b6', '#2f3a2c']];
        const t = tints[Math.floor(Math.random() * tints.length)];
        const accents = ['#00f3ff', '#00ff88', '#ff9500', '#ff00aa'];
        return Object.assign({}, base, {
            id: 'R', name: 'RANDOM OP', jp: '無作為任務', codename: 'OP-' + (1000 + Math.floor(Math.random() * 9000)),
            objective: obj, waves: 3 + Math.floor(Math.random() * 5),
            collectTarget: obj === 'collect' ? 4 + Math.floor(Math.random() * 4) : 0,
            quota: obj === 'eliminate' ? 14 + Math.floor(Math.random() * 16) : 0,
            sky: t[0], fog: t[1], ground: t[2], accent: accents[Math.floor(Math.random() * accents.length)],
            fogDensity: 0.009 + Math.random() * 0.006, bigMap: Math.random() > 0.4, treeDensity: 0.7 + Math.random() * 0.9,
            enemyPool: [['drone', 'soldier'], ['soldier', 'elite'], ['drone', 'soldier', 'elite']][Math.floor(Math.random() * 3)],
        });
    }
    HELA.Game.stop = function () {
        S.running = false; S.over = false; S.paused = false;
        document.exitPointerLock();
        if (S.scene) { S.scene.dispose(); S.scene = null; }
        enemies = []; bolts = []; particles = []; pickups = [];
    };
    HELA.Game.togglePause = function () {
        if (!S.running || S.over) return;
        S.paused = !S.paused;
        if (S.paused) document.exitPointerLock(); else canvas.requestPointerLock();
        HELA.UI.onPause(S.paused);
    };
    HELA.Game.applyCodes = function (codes) {
        S.codes = Object.assign({}, codes);
        if (S.codes.giveall) { for (const id of HELA.WEAPON_ORDER) S.unlockedWeapons[id] = true; }
        if (S.codes.bighead && playerHead) playerHead.scaling.setAll(2.0);
        if (player) applyBigHead();
    };
    HELA.Game.onSettingsChanged = function () {
        Audio.applyVolume();
        if (pipeline) {
            pipeline.bloomEnabled = HELA.Settings.get('bloom');
            pipeline.grainEnabled = HELA.Settings.get('grain');
        }
        if (ssaoPipe && camera) {
            try {
                if (HELA.Settings.get('ssao')) S.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', camera);
                else S.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao', camera);
            } catch (e) {}
        }
    };

    // =================================================================
    //  SCENE BUILD (themed per level)
    // =================================================================
    function buildScene() {
        const lv = S.level; S.theme = lv.theme || 'neon';
        S.bounds = lv.bigMap ? 112 : 70;
        S.groundY = (S.theme === 'forest') ? 1.85 : 3.55;
        SPAWN = buildSpawnRing(S.bounds);
        windNodes = []; motes = []; mistArr = [];

        const scene = new BABYLON.Scene(engine); S.scene = scene;
        scene.clearColor = new BABYLON.Color4(...hexToRgb01(lv.sky || lv.fog), 1);
        scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        scene.fogColor = C.FromHexString(lv.fog);
        scene.fogDensity = lv.fogDensity;

        camera = new BABYLON.TargetCamera('cam', new V3(0, 6, -12), scene);
        camera.fov = 1.1; camera.minZ = 0.3; camera.maxZ = 600;

        buildLights(lv);
        buildEnvironment(lv);
        buildPlayer();
        buildViewmodel();
        const termCount = (lv.theme === 'forest' || lv.objective === 'boss') ? 0 : (lv.objective === 'hack' ? 3 : 2);
        buildTerminals(termCount);
        S.terminalsTotal = interactables.length;
        buildPostFX(S.theme);

        minimapCtx = $('minimap').getContext('2d');
    }
    function buildLights(lv) {
        const scene = S.scene;
        // Misty daylight reclaimed-ruins lighting for every mission.
        const hemi = new BABYLON.HemisphericLight('hemi', new V3(0.15, 1, 0.08), scene);
        hemi.intensity = 0.8; hemi.diffuse = C.FromHexString('#d6ddd4'); hemi.groundColor = C.FromHexString('#33402d'); hemi.specular = new C(0.12, 0.12, 0.14);
        const sun = new BABYLON.DirectionalLight('sun', new V3(-0.5, -0.85, 0.35), scene);
        sun.position = new V3(70, 105, -60); sun.intensity = 1.05; sun.diffuse = C.FromHexString('#fff1d8');
        shadowGen = new BABYLON.ShadowGenerator(1536, sun); shadowGen.useBlurExponentialShadowMap = true; shadowGen.blurKernel = 26; shadowGen.darkness = 0.5;
        // neon sign accents (keep the signage glowing through the mist)
        addNeon(lv.accent, new V3(-18, 9, 4), 1.0, 38);
        addNeon('#ff00aa', new V3(12, 11, -22), 1.1, 36);
        addNeon('#00ff88', new V3(28, 7, 15), 0.8, 28);
    }
    function hexToRgb01(h) { const c = C.FromHexString(h); return [c.r, c.g, c.b]; }
    function addNeon(hex, pos, intensity, range) {
        const l = new BABYLON.PointLight('neon', pos, S.scene);
        l.diffuse = C.FromHexString(hex); l.intensity = intensity; l.range = range; l.specular = new C(0, 0, 0); return l;
    }

    function buildEnvironment(lv) {
        if (lv.theme === 'forest') return buildForest(lv);
        return buildNeonEnv(lv);
    }
    function buildNeonEnv(lv) {
        const scene = S.scene, B = S.bounds;
        const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: B * 4, height: B * 4, subdivisions: 1 }, scene);
        const gmat = new BABYLON.StandardMaterial('groundM', scene); gmat.diffuseColor = C.FromHexString(lv.ground); gmat.specularColor = new C(0, 0, 0);
        ground.material = gmat; ground.receiveShadows = true;
        const grid = BABYLON.MeshBuilder.CreateGround('grid', { width: 160, height: 160, subdivisions: 32 }, scene);
        const gm = new BABYLON.StandardMaterial('gridMat', scene); gm.wireframe = true; gm.emissiveColor = C.FromHexString(lv.accent).scale(0.22); gm.diffuseColor = new C(0, 0, 0); gm.alpha = 0.1;
        grid.material = gm; grid.position.y = 0.04; grid.isPickable = false;

        rail(-2, 6, 70, 0.5, '#ff1f8a'); rail(-3.4, 6, 70, 0.18, '#ff1f8a');
        rail(8, 14, 40, 0.35, lv.accent); rail(-22, -2, 30, 0.3, '#00ffcc');

        // flat cracked-concrete slab at the start — decorative & walkable, NOT a wall
        const slab = BABYLON.MeshBuilder.CreateGround('slab', { width: 28, height: 24 }, scene);
        const sm = new BABYLON.StandardMaterial('slabM', scene); sm.diffuseColor = C.FromHexString('#3b424a'); sm.specularColor = new C(0, 0, 0);
        slab.material = sm; slab.position.set(-4, 0.06, 6); slab.receiveShadows = true; slab.isPickable = false;
        addBox('cover1', { w: 5, h: 4, d: 6 }, new V3(14, 2, -8), '#252a38', true);
        addBox('cover2', { w: 4, h: 5.5, d: 7.8 }, new V3(-16, 2.75, -14), '#222735', true);
        addBox('cover3', { w: 6, h: 3, d: 3.2 }, new V3(2, 1.5, -2), '#262b3a', true);
        // extra cover for variety on later levels
        if (lv.id >= 2) { addBox('cv4', { w: 3.5, h: 4.5, d: 3.5 }, new V3(24, 2.25, -2), '#23283a', true); addBox('cv5', { w: 7, h: 2, d: 3 }, new V3(-24, 1, 4), '#23283a', true); }

        const pipe = BABYLON.MeshBuilder.CreateCylinder('pipe', { height: 14, diameter: 1.2, tessellation: 6 }, scene);
        pipe.material = flatMat('pipe', '#3a3f4e'); pipe.rotation.z = Math.PI / 2; pipe.position.set(-9, 5.5, 14);
        const pipe2 = pipe.clone('pipe2'); pipe2.position.set(19, 3.8, 2); pipe2.rotation.z = 0.6;

        // energy dome
        domeMesh = BABYLON.MeshBuilder.CreateIcoSphere('dome', { radius: 11, subdivisions: 2, flat: true }, scene);
        const dm = new BABYLON.StandardMaterial('domeMat', scene); dm.diffuseColor = C.FromHexString(lv.accent); dm.emissiveColor = C.FromHexString(lv.accent).scale(0.5); dm.alpha = 0.22; dm.backFaceCulling = false;
        domeMesh.material = dm; domeMesh.position.set(3, 9, -34); domeMesh.isPickable = false;
        const core = BABYLON.MeshBuilder.CreateIcoSphere('domeCore', { radius: 4.5, subdivisions: 1, flat: true }, scene);
        const cm = new BABYLON.StandardMaterial('coreMat', scene); cm.emissiveColor = C.FromHexString(lv.accent); cm.alpha = 0.5; core.material = cm; core.position.copyFrom(domeMesh.position); core.isPickable = false;
        domeMesh.metadata = { core };

        // weathered mossy-concrete ruins; layout jittered for run-to-run variety
        const cityColors = ['#5a6356', '#525b50', '#474f44', '#5e6358'];
        const layout = [[-32,-18,11,28,9],[-38,8,8,22,7],[-25,24,9,19,8],[26,-25,10,31,8],[34,4,7,26,6],[18,20,12,17,9],[-8,-40,14,36,11],[16,-44,9,26,7],[44,-10,9,30,8],[-46,-6,8,24,7]];
        layout.forEach((b, i) => addBuilding(b[0] + (Math.random() - 0.5) * 6, b[1] + (Math.random() - 0.5) * 6, b[2], b[3] * (0.8 + Math.random() * 0.5), b[4], cityColors[i % 4]));

        // tall ruined towers inside the arena (windowed + mossed later)
        [[-30,-30,9,48,9],[31,-34,10,60,10],[-42,16,8,42,8],[42,18,9,52,9],[6,-52,12,66,12],[-16,32,10,46,10],[50,-2,9,40,9]]
            .forEach((t, i) => addBuilding(t[0], t[1], t[2], t[3], t[4], ['#5a6358', '#525b50'][i % 2]));
        // huge moss-covered concrete monolith chunks (cover)
        for (let i = 0; i < 12; i++) {
            const x = (Math.random() - 0.5) * S.bounds * 1.3, z = (Math.random() - 0.5) * S.bounds * 1.3;
            if (Math.hypot(x + 4, z - 6) < 16) continue;
            const w = 5 + Math.random() * 7, h = 5 + Math.random() * 9, d = 5 + Math.random() * 7;
            const mk = addBox('monolith', { w, h, d }, new V3(x, h / 2, z), '#54604f', true); mk.rotation.y = (Math.random() - 0.5) * 0.7;
        }
        // dense skyscraper skyline fading into the mist
        buildSkyline(S.bounds);

        // themed neon signs
        const signs = lv.signs || [];
        if (signs[0]) neonSign(-29, 14, -17, signs[0][0], signs[0][1], 6);
        if (signs[1]) neonSign(-29, 9.5, -17, signs[1][0], signs[1][1], 5);
        if (signs[2]) neonSign(24, 13, -25, signs[2][0], signs[2][1], 6);
        floatingPanel(8, 6, 18, lv.accent); floatingPanel(-14, 7.5, -9, '#ff00aa');

        overgrow(lv);   // trees, grass, moss, vines, rubble reclaiming the ruins
        addCables();    // drooping power lines between the tall ruins
        addMist(S.bounds); // low-lying volumetric haze
    }
    // dense background skyscrapers (non-colliding, lost in fog)
    function buildSkyline(B) {
        const scene = S.scene, greys = ['#7e857b', '#737a70', '#868d82', '#6b7268'];
        for (let i = 0; i < 50; i++) {
            const a = Math.random() * Math.PI * 2, r = B * 1.45 + Math.random() * B * 1.2;
            const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 40 + Math.random() * 85, w = 8 + Math.random() * 16, d = 8 + Math.random() * 16;
            const b = BABYLON.MeshBuilder.CreateBox('skytower', { width: w, height: h, depth: d }, scene);
            const m = new BABYLON.StandardMaterial('skyM', scene); m.diffuseColor = C.FromHexString(greys[i % 4]); m.specularColor = new C(0, 0, 0);
            b.material = m; b.position.set(x, h / 2, z); b.isPickable = false;
            if (Math.random() > 0.6) { const an = BABYLON.MeshBuilder.CreateCylinder('ant', { height: 8 + Math.random() * 10, diameter: 0.6, tessellation: 4 }, scene); an.material = m; an.position.set(x, h + 5, z); an.isPickable = false; }
        }
    }
    function addCable(a, b) {
        const pts = [], seg = 12, sag = 2.5 + Math.random() * 2.5;
        for (let i = 0; i <= seg; i++) { const t = i / seg, p = V3.Lerp(a, b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
        const l = BABYLON.MeshBuilder.CreateLines('cable', { points: pts }, S.scene); l.color = new C(0.06, 0.06, 0.07); l.isPickable = false;
    }
    function addCables() {
        const tall = colliders.filter(c => { const bb = c.getBoundingInfo().boundingBox; return (bb.maximumWorld.y - bb.minimumWorld.y) > 22; });
        let made = 0;
        for (let i = 0; i < tall.length && made < 9; i++) {
            const a = tall[i], b = tall[(i + 1) % tall.length]; if (a === b) continue;
            const ay = a.getBoundingInfo().boundingBox.maximumWorld.y, by = b.getBoundingInfo().boundingBox.maximumWorld.y;
            const at = new V3(a.position.x, ay - 2, a.position.z), bt = new V3(b.position.x, by - 2, b.position.z);
            if (V3.Distance(at, bt) > 75) continue;
            addCable(at, bt); made++;
        }
    }
    function addMist(B) {
        const dt = new BABYLON.DynamicTexture('mistTex', { width: 128, height: 128 }, S.scene, false);
        const ctx = dt.getContext(), g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
        g.addColorStop(0, 'rgba(222,229,223,0.85)'); g.addColorStop(1, 'rgba(222,229,223,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); dt.update(); dt.hasAlpha = true;
        for (let i = 0; i < 12; i++) {
            const p = BABYLON.MeshBuilder.CreatePlane('mist', { size: 16 + Math.random() * 22 }, S.scene);
            const m = new BABYLON.StandardMaterial('mistM', S.scene); m.diffuseTexture = dt; m.opacityTexture = dt; m.emissiveColor = C.FromHexString('#ccd5cf'); m.disableLighting = true; m.alpha = 0.5; m.backFaceCulling = false;
            p.material = m; p.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; p.isPickable = false;
            p.position.set((Math.random() - 0.5) * B * 1.6, 2 + Math.random() * 5, (Math.random() - 0.5) * B * 1.6);
            mistArr.push({ mesh: p, sp: 0.2 + Math.random() * 0.5, phase: Math.random() * 6.28, drift: (Math.random() - 0.5) * 0.012 });
        }
    }

    // ------- nature reclaiming the ruins -------
    function overgrow(lv) {
        const B = S.bounds;
        // moss caps + hanging vines on every concrete structure
        const structures = colliders.slice();
        for (const c of structures) {
            const bb = c.getBoundingInfo().boundingBox, sz = bb.maximumWorld.subtract(bb.minimumWorld);
            const cap = BABYLON.MeshBuilder.CreateBox('moss', { width: Math.max(0.5, sz.x * 0.98), height: 0.4, depth: Math.max(0.5, sz.z * 0.98) }, S.scene);
            const mm = new BABYLON.StandardMaterial('mossM', S.scene); mm.diffuseColor = C.FromHexString(Math.random() > 0.5 ? '#4f7236' : '#456530'); mm.specularColor = new C(0, 0, 0);
            cap.material = mm; cap.position.set(c.position.x, bb.maximumWorld.y + 0.16, c.position.z); cap.receiveShadows = true; cap.isPickable = false;
            if (Math.random() > 0.4) {
                const vh = 2 + Math.random() * 4;
                const v = BABYLON.MeshBuilder.CreateBox('vine', { width: 0.22, height: vh, depth: 0.22 }, S.scene);
                const vm = new BABYLON.StandardMaterial('vineM', S.scene); vm.diffuseColor = C.FromHexString('#3f5e2c'); vm.specularColor = new C(0, 0, 0);
                v.material = vm; v.position.set(bb.maximumWorld.x - 0.25, bb.maximumWorld.y - vh / 2, c.position.z + (Math.random() - 0.5) * sz.z * 0.6); v.isPickable = false;
                windNodes.push({ node: v, phase: Math.random() * 6.28, amp: 0.05, speed: 0.7 });
            }
        }
        // trees growing through the city — dense
        const density = lv.treeDensity || 1, treeCount = Math.floor(58 * density);
        let placed = 0, guard = 0;
        while (placed < treeCount && guard < 900) {
            guard++; const x = (Math.random() - 0.5) * B * 1.9, z = (Math.random() - 0.5) * B * 1.9;
            if (Math.hypot(x + 4, z - 6) < 13) continue;   // keep the start platform clear
            makeTree(x, z, 0.8 + Math.random() * 1.0, false); placed++;
        }
        // big canopy "hero" trees framing the arena
        [[22, 20], [-24, 18], [26, -12], [-20, -16], [14, 26]].forEach(([x, z]) => makeTree(x, z, 2.5 + Math.random() * 1.1, false));
        // thick hazy distant treeline
        for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, r = B * 1.55 + Math.random() * 40; makeTree(Math.cos(a) * r, Math.sin(a) * r, 1.3 + Math.random() * 0.8, true); }
        // rubble boulders
        for (let i = 0; i < 18; i++) { const x = (Math.random() - 0.5) * B * 1.5, z = (Math.random() - 0.5) * B * 1.5; if (Math.hypot(x + 4, z - 6) < 10) continue; makeRock(x, z, 0.7 + Math.random() * 1.6); }
        // grass everywhere + drifting leaves
        makeGrassField(B);
        for (let i = 0; i < 40; i++) makeMote(B);
        // neon supply icons like the reference (green ammo, pink items)
        neonIcon(31, 9, 12, '#00ff66', '▮▮'); neonIcon(-30, 8.5, -4, '#ff44aa', '✚');
    }
    function neonIcon(x, y, z, hex, txt) {
        const { plane } = dynTexPlane('icon', 3, 2, (ctx, w, h) => {
            ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(10,14,18,0.45)'; ctx.fillRect(0, 0, w, h);
            ctx.shadowColor = hex; ctx.shadowBlur = 26; ctx.fillStyle = hex; ctx.font = 'bold 92px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, w / 2, h / 2);
        }, 256, 170);
        plane.position.set(x, y, z); addNeon(hex, new V3(x, y, z + 1), 0.7, 14);
    }

    // ---------------- FOREST (bright, clear, big open map) ----------------
    function buildForest(lv) {
        const scene = S.scene, B = S.bounds;
        domeMesh = null;  // forest has no energy dome
        // large rolling ground
        const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: B * 4, height: B * 4, subdivisions: 1 }, scene);
        const gm = new BABYLON.StandardMaterial('groundM', scene); gm.diffuseColor = C.FromHexString(lv.ground); gm.specularColor = new C(0, 0, 0);
        ground.material = gm; ground.receiveShadows = true; ground.position.y = 0;

        // distant tree-line ring (gives the "deep forest" horizon, cheap)
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 2, r = B * 1.9 + Math.random() * 30;
            makeTree(Math.cos(a) * r, Math.sin(a) * r, 1.4 + Math.random() * 0.8, true);
        }
        // playable-area trees (colliders), avoid the centre spawn pad
        let placed = 0, guard = 0;
        while (placed < 46 && guard < 400) {
            guard++;
            const x = (Math.random() - 0.5) * B * 1.8, z = (Math.random() - 0.5) * B * 1.8;
            if (Math.hypot(x + 4, z - 6) < 16) continue;     // clearing around player start
            if (Math.abs(x) < 5) continue;                    // keep the road clear
            makeTree(x, z, 0.85 + Math.random() * 0.9, false); placed++;
        }
        // rocks (cover + colliders)
        for (let i = 0; i < 22; i++) {
            const x = (Math.random() - 0.5) * B * 1.6, z = (Math.random() - 0.5) * B * 1.6;
            if (Math.hypot(x + 4, z - 6) < 12) continue;
            makeRock(x, z, 0.8 + Math.random() * 1.8);
        }
        // dirt road down the middle + a crossing
        road(0, 0, 9, B * 3.4, 0);
        road(0, -10, 9, B * 2.0, Math.PI / 2);
        // grass field (thin instances — one draw call)
        makeGrassField(B);
        // wind motes / drifting pollen
        for (let i = 0; i < 46; i++) makeMote(B);
        // soft sun disc on the horizon
        const sunDisc = BABYLON.MeshBuilder.CreatePlane('sun', { size: 60 }, scene);
        const sm = new BABYLON.StandardMaterial('sunM', scene); sm.emissiveColor = C.FromHexString('#fff4cf'); sm.disableLighting = true; sm.backFaceCulling = false;
        sunDisc.material = sm; sunDisc.position.set(70, 48, -150); sunDisc.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; sunDisc.isPickable = false;
    }
    function makeTree(x, z, scale, distant) {
        const scene = S.scene;
        const h = (6 + Math.random() * 5) * scale;
        const trunk = BABYLON.MeshBuilder.CreateCylinder('trunk', { height: h, diameterTop: 0.5 * scale, diameterBottom: 0.95 * scale, tessellation: 6 }, scene);
        const tm = new BABYLON.StandardMaterial('trunkM', scene); tm.diffuseColor = C.FromHexString(Math.random() > 0.5 ? '#6e4a2b' : '#5c3d24'); tm.specularColor = new C(0, 0, 0);
        trunk.material = tm; trunk.position.set(x, h / 2, z);
        // foliage: stacked low-poly cones on a swayable pivot
        const pivot = new BABYLON.TransformNode('foliage', scene); pivot.position.set(x, h, z);
        const greens = ['#3f6b2e', '#4f7e34', '#5d8f3a', '#375f28'];
        const tiers = 3 + (Math.random() > 0.5 ? 1 : 0);
        for (let t = 0; t < tiers; t++) {
            const cone = BABYLON.MeshBuilder.CreateCylinder('leaf', { height: 3.2 * scale, diameterTop: 0, diameterBottom: (5.2 - t * 1.0) * scale, tessellation: 7 }, scene);
            const lm = new BABYLON.StandardMaterial('leafM', scene); lm.diffuseColor = C.FromHexString(greens[t % greens.length]); lm.specularColor = new C(0, 0, 0);
            cone.material = lm; cone.parent = pivot; cone.position.y = t * 2.2 * scale - 1;
            if (!distant && shadowGen) shadowGen.addShadowCaster(cone);
        }
        if (!distant && shadowGen) shadowGen.addShadowCaster(trunk);
        if (!distant) { trunk.computeWorldMatrix(true); colliders.push(trunk); }
        windNodes.push({ node: pivot, phase: Math.random() * 6.28, amp: 0.02 + Math.random() * 0.04, speed: 0.7 + Math.random() * 0.6 });
    }
    function makeRock(x, z, s) {
        const rock = BABYLON.MeshBuilder.CreateIcoSphere('rock', { radius: s, subdivisions: 1, flat: true }, S.scene);
        const m = new BABYLON.StandardMaterial('rockM', S.scene); m.diffuseColor = C.FromHexString(Math.random() > 0.5 ? '#8a8f96' : '#71767e'); m.specularColor = new C(0.05, 0.05, 0.05);
        rock.material = m; rock.position.set(x, s * 0.55, z); rock.scaling.y = 0.7; rock.rotation.y = Math.random() * 3;
        rock.receiveShadows = true; if (shadowGen) shadowGen.addShadowCaster(rock);
        rock.computeWorldMatrix(true); colliders.push(rock);
    }
    function road(x, z, w, len, rotY) {
        const r = BABYLON.MeshBuilder.CreateGround('road', { width: w, height: len }, S.scene);
        const m = new BABYLON.StandardMaterial('roadM', S.scene); m.diffuseColor = C.FromHexString('#6b5a3c'); m.specularColor = new C(0, 0, 0);
        r.material = m; r.position.set(x, 0.02, z); if (rotY) r.rotation.y = rotY; r.isPickable = false; r.receiveShadows = true;
    }
    function makeGrassField(B) {
        const scene = S.scene;
        // one tufted blade mesh, scattered as thin instances (single draw call)
        const blade = BABYLON.MeshBuilder.CreateCylinder('grass', { height: 1.1, diameterTop: 0, diameterBottom: 0.5, tessellation: 3 }, scene);
        const gm = new BABYLON.StandardMaterial('grassM', scene); gm.diffuseColor = C.FromHexString('#6f9a3e'); gm.specularColor = new C(0, 0, 0); gm.backFaceCulling = false;
        blade.material = gm; blade.isPickable = false; blade.alwaysSelectAsActiveMesh = true;
        const count = 4200, m = BABYLON.Matrix;
        const mats = new Float32Array(count * 16);
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * B * 2.0, z = (Math.random() - 0.5) * B * 2.0;
            const s = 0.6 + Math.random() * 1.1, ry = Math.random() * 3.14;
            const mat = m.Scaling(s, s, s).multiply(m.RotationY(ry)).multiply(m.Translation(x, 0.55 * s, z));
            mat.copyToArray(mats, i * 16);
        }
        blade.thinInstanceSetBuffer('matrix', mats, 16);
    }
    function makeMote(B) {
        const p = BABYLON.MeshBuilder.CreatePlane('mote', { size: 0.16 }, S.scene);
        const m = new BABYLON.StandardMaterial('moteM', S.scene); m.emissiveColor = C.FromHexString('#fff6d8'); m.disableLighting = true; m.alpha = 0.5; m.backFaceCulling = false;
        p.material = m; p.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; p.isPickable = false;
        p.position.set((Math.random() - 0.5) * B * 1.6, 1 + Math.random() * 6, (Math.random() - 0.5) * B * 1.6);
        motes.push({ mesh: p, phase: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.8 });
    }
    function updateWind(t) {
        for (const w of windNodes) w.node.rotation.z = Math.sin(t * w.speed + w.phase) * w.amp;
        const drift = Math.sin(t * 0.3) * 0.01 + 0.012;
        for (const mo of motes) {
            mo.mesh.position.x += drift; mo.mesh.position.y += Math.sin(t * mo.sp + mo.phase) * 0.004;
            if (mo.mesh.position.x > S.bounds * 0.9) mo.mesh.position.x = -S.bounds * 0.9;
        }
        for (const mi of mistArr) {
            mi.mesh.position.x += mi.drift; mi.mesh.position.y += Math.sin(t * mi.sp + mi.phase) * 0.003;
            if (mi.mesh.position.x > S.bounds) mi.mesh.position.x = -S.bounds;
            else if (mi.mesh.position.x < -S.bounds) mi.mesh.position.x = S.bounds;
        }
    }

    function rail(x, z, len, w, hex) {
        const r = BABYLON.MeshBuilder.CreateBox('rail', { width: w, height: 0.08, depth: len }, S.scene);
        const m = new BABYLON.StandardMaterial('railm', S.scene); m.emissiveColor = C.FromHexString(hex); m.diffuseColor = new C(0, 0, 0); m.disableLighting = true;
        r.material = m; r.position.set(x, 0.08, z); r.isPickable = false;
    }

    // =================================================================
    //  COLLECTIBLES + INVENTORY
    // =================================================================
    function freeSpot() {
        const B = S.bounds;
        for (let i = 0; i < 30; i++) {
            const x = (Math.random() - 0.5) * B * 1.6, z = (Math.random() - 0.5) * B * 1.6;
            let ok = true;
            for (const c of colliders) { if (V3.Distance(new V3(x, 2, z), c.position) < 4) { ok = false; break; } }
            if (ok) return { x, z };
        }
        return { x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30 };
    }
    function scatterCollectibles() {
        // mission caches for the collect objective
        if (S.mode === 'collect') for (let i = 0; i < S.collectTarget; i++) { const s = freeSpot(); spawnCollectible('datacache', s.x, s.z); }
        // general loot to find across every map
        const loot = ['medkit', 'medkit', 'grenade', 'grenade', 'cell', 'cell', 'cell', 'ammo', 'ammo'];
        const n = 6 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) { const s = freeSpot(); spawnCollectible(loot[Math.floor(Math.random() * loot.length)], s.x, s.z); }
    }
    function spawnCollectible(ctype, x, z) {
        const def = HELA.COLLECTIBLES[ctype];
        const box = BABYLON.MeshBuilder.CreateBox('col', { size: ctype === 'datacache' ? 1.0 : 0.85 }, S.scene);
        box.material = flatMat('col' + ctype, '#10161c', def.glow, 0.85); box.position.set(x, 1.5, z); box.isPickable = false;
        box.metadata = { phase: Math.random() * 6.28, collectible: true, ctype };
        // a little glow light so caches are findable in the mist
        if (def.mission) { const l = addNeon(def.glow, new V3(x, 2.4, z), 0.5, 7); box.metadata.light = l; }
        pickups.push(box);
    }
    function applyCollectible(ctype) {
        const def = HELA.COLLECTIBLES[ctype]; Audio.pickup();
        if (def.mission) { S.collected++; S.inventory.datacache++; status(def.name + ' RECOVERED — ' + S.collected + '/' + S.collectTarget, 1600); checkObjective(); }
        else if (def.stored) { S.inventory[ctype]++; status('PICKED UP ' + def.name + '  (' + S.inventory[ctype] + ')', 1300); }
        else if (def.score) { S.score += def.score; S.inventory.cell++; status('+' + def.score + ' NEON CELL', 1100); }
        else if (def.ammo) { const a = curAmmo(); if (a.reserve !== Infinity) a.reserve = Math.min(a.reserve + def.ammo, 320); status('+' + def.ammo + ' AMMO', 1000); }
        updateInventoryHUD(); updateHUD();
    }
    function useItem(ctype) {
        const def = HELA.COLLECTIBLES[ctype];
        if (!def || !S.inventory[ctype]) { status('NO ' + (def ? def.name : 'ITEM'), 1000); return; }
        if (def.use === 'heal') {
            if (S.health >= 100) { status('INTEGRITY FULL', 1000); return; }
            S.inventory.medkit--; S.health = Math.min(100, S.health + 50); Audio.pickup(); status('MEDKIT USED — +50 INTEGRITY', 1400);
        } else if (def.use === 'throw') {
            S.inventory.grenade--; throwGrenade(); Audio.swap();
        }
        updateInventoryHUD(); updateHUD();
    }
    function throwGrenade() {
        const origin = (S.fpv ? camera.position : muzzle.getAbsolutePosition()).clone();
        const g = BABYLON.MeshBuilder.CreateSphere('nade', { diameter: 0.5, segments: 6 }, S.scene);
        g.material = flatMat('nadeM', '#1a2410', '#ff9500', 0.8); g.position.copyFrom(origin); g.isPickable = false;
        grenadesArr.push({ mesh: g, vel: aimVec(0).scale(34).add(new V3(0, 7, 0)), born: performance.now() });
    }
    function updateGrenades(dt) {
        const now = performance.now();
        for (let i = grenadesArr.length - 1; i >= 0; i--) {
            const g = grenadesArr[i];
            g.mesh.position.addInPlace(g.vel.scale(dt)); g.vel.y -= 26 * dt;
            const ground = (S.theme === 'forest') ? 0.3 : 0.3;
            if (now - g.born > 1300 || g.mesh.position.y < ground) { explodeGrenade(g.mesh.position.clone()); g.mesh.dispose(); grenadesArr.splice(i, 1); }
        }
    }
    function explodeGrenade(pos) {
        flash(pos, '#ffaa44', 6, 240); if (HELA.Settings.get('shake')) addShake(0.5);
        Audio.kill(panFor(pos));
        for (let i = 0; i < 24; i++) { const s = BABYLON.MeshBuilder.CreateBox('frag', { size: 0.2 }, S.scene); s.material = flatMat('frag', '#0a0a0a', '#ffcc66', 1.2); s.position.copyFrom(pos); s.isPickable = false; particles.push({ mesh: s, vel: new V3((Math.random() - 0.5) * 24, Math.random() * 16 + 4, (Math.random() - 0.5) * 24), life: 700, born: performance.now() }); }
        for (const e of enemies.slice()) { if (!e.metadata.alive) continue; const d = V3.Distance(e.position, pos); if (d < 9) damageEnemy(e, Math.round(160 * (1 - d / 9)), e.position.add(new V3(0, 1, 0))); }
    }
    function addBox(name, s, pos, hex, collide) {
        const m = BABYLON.MeshBuilder.CreateBox(name, { width: s.w, height: s.h, depth: s.d }, S.scene);
        m.material = flatMat(name, hex); m.position.copyFrom(pos); m.receiveShadows = true;
        if (shadowGen) shadowGen.addShadowCaster(m); if (collide) registerCollider(m); return m;
    }
    function addBuilding(x, z, w, h, d, hex) {
        addBox('bld', { w, h, d }, new V3(x, h / 2, z), hex, true);
        if (Math.random() > 0.35) {
            const win = BABYLON.MeshBuilder.CreateBox('win', { width: w * 0.7, height: 1.8, depth: 0.3 }, S.scene);
            const wm = new BABYLON.StandardMaterial('wm', S.scene); const c = Math.random() > 0.5 ? '#1a3a55' : '#3a1a40';
            wm.emissiveColor = C.FromHexString(c); wm.diffuseColor = new C(0.02, 0.02, 0.04); win.material = wm; win.position.set(x, h * 0.62, z + d / 2 + 0.16); win.isPickable = false;
        }
    }
    function registerCollider(m) { m.computeWorldMatrix(true); colliders.push(m); }
    function dynTexPlane(name, w, h, draw, texW, texH, rotY) {
        const dt = new BABYLON.DynamicTexture(name, { width: texW, height: texH }, S.scene, false);
        draw(dt.getContext(), texW, texH); dt.update(); dt.hasAlpha = true;
        const plane = BABYLON.MeshBuilder.CreatePlane(name, { width: w, height: h }, S.scene);
        const pm = new BABYLON.StandardMaterial(name + 'm', S.scene); pm.diffuseTexture = dt; pm.emissiveTexture = dt; pm.opacityTexture = dt; pm.emissiveColor = new C(1, 1, 1); pm.disableLighting = true; pm.backFaceCulling = false;
        plane.material = pm; plane.isPickable = false; if (rotY !== undefined) plane.rotation.y = rotY;
        return { plane, dt };
    }
    function neonSign(x, y, z, text, hex, scale, rotY) {
        const { plane } = dynTexPlane('sign', scale * 2.4, scale * 0.6, (ctx, w, h) => {
            ctx.clearRect(0, 0, w, h); ctx.shadowColor = hex; ctx.shadowBlur = 22; ctx.fillStyle = hex;
            ctx.font = 'bold 70px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2);
            ctx.shadowBlur = 4; ctx.fillStyle = '#fff'; ctx.fillText(text, w / 2, h / 2);
        }, 640, 160, rotY);
        plane.position.set(x, y, z); addNeon(hex, new V3(x, y, z + 1), 0.6, 16);
    }
    function floatingPanel(x, y, z, hex) {
        const p = BABYLON.MeshBuilder.CreatePlane('panel', { width: 3.5, height: 2.2 }, S.scene);
        const pm = new BABYLON.StandardMaterial('pm', S.scene); pm.emissiveColor = C.FromHexString(hex).scale(0.7); pm.diffuseColor = new C(0.03, 0.05, 0.08); pm.alpha = 0.85;
        p.material = pm; p.position.set(x, y, z); p.rotation.y = (x > 0) ? -0.6 : 0.6; p.isPickable = false; addNeon(hex, new V3(x, y, z), 0.45, 12);
    }

    // ---- player ----
    function buildPlayer() {
        player = new BABYLON.TransformNode('player', S.scene);
        player.position.set(-4, 2.0, 6); player.metadata = { bob: 0 };
        const part = (name, s, pos, hex, em, emAmt) => {
            const m = BABYLON.MeshBuilder.CreateBox(name, { width: s[0], height: s[1], depth: s[2] }, S.scene);
            m.material = flatMat(name, hex, em, emAmt); m.position.copyFrom(pos); m.parent = player;
            if (shadowGen) shadowGen.addShadowCaster(m); m.isPickable = false; return m;
        };
        part('torso', [1.1, 1.6, 0.9], new V3(0, 0, 0), '#2f3a4a');
        playerHead = part('head', [0.85, 0.85, 0.85], new V3(0, 1.35, 0), '#252f3a');
        part('visor', [0.72, 0.26, 0.12], new V3(0, 1.42, 0.5), '#ffcc33', '#ffaa00', 1.4);
        const la = part('larm', [0.36, 1.05, 0.36], new V3(-0.84, 0.3, 0.1), '#2f3a4a'); la.rotation.z = 0.3;
        const ra = part('rarm', [0.36, 1.05, 0.36], new V3(0.84, 0.3, 0.25), '#2f3a4a'); ra.rotation.x = -0.7;
        part('gun', [0.32, 0.3, 1.7], new V3(0.84, 0.55, 0.95), '#161d27');
        part('gunGlow', [0.1, 0.1, 1.2], new V3(0.84, 0.7, 1.0), '#0a0f15', '#00f3ff', 1.0);
        part('lleg', [0.4, 1.0, 0.45], new V3(-0.32, -1.1, 0), '#252f3a');
        part('rleg', [0.4, 1.0, 0.45], new V3(0.32, -1.1, 0), '#252f3a');
        part('pack', [0.7, 0.9, 0.5], new V3(0, 0.6, -0.65), '#1b212b');
        muzzle = new BABYLON.TransformNode('muzzle', S.scene); muzzle.parent = player; muzzle.position.set(0.84, 0.7, 2.0);
        if (S.codes.bighead) playerHead.scaling.setAll(2.0);
        if (S.fpv) setBodyVisible(false);
    }
    function setBodyVisible(vis) { if (player) player.getChildMeshes().forEach(m => m.setEnabled(vis)); }

    // First-person viewmodel weapon (parented to the camera, drawn on top).
    function buildViewmodel() {
        if (!camera) return;
        vmRoot = new BABYLON.TransformNode('vm', S.scene); vmRoot.parent = camera;
        vmRoot.position = new V3(0.44, -0.34, 0.60); vmRoot.rotation.y = -0.06;
        const part = (dim, pos, hex, em, emAmt) => {
            const m = BABYLON.MeshBuilder.CreateBox('vmp', { width: dim[0], height: dim[1], depth: dim[2] }, S.scene);
            m.material = flatMat('vm' + hex, hex, em, emAmt); m.position.copyFrom(pos); m.parent = vmRoot;
            m.isPickable = false; m.renderingGroupId = 1; return m;
        };
        part([0.13, 0.17, 0.95], new V3(0, 0, 0), '#26292f');          // receiver
        part([0.10, 0.28, 0.20], new V3(0, -0.22, -0.18), '#1b1e22');  // magazine
        part([0.085, 0.10, 0.55], new V3(0, 0.03, 0.62), '#15171b');   // barrel
        part([0.06, 0.13, 0.07], new V3(0, 0.15, 0.18), '#0f1114');    // front sight
        part([0.06, 0.07, 0.30], new V3(0, 0.13, -0.05), '#0f1114');   // top rail
        part([0.18, 0.16, 0.20], new V3(-0.02, -0.13, 0.10), '#caa472');// front hand
        part([0.18, 0.16, 0.18], new V3(-0.02, -0.14, -0.30), '#caa472');// rear hand
        vmMuzzle = new BABYLON.TransformNode('vmMuzzle', S.scene); vmMuzzle.parent = vmRoot; vmMuzzle.position = new V3(0, 0.05, 0.95);
        vmRoot.setEnabled(S.fpv);
    }
    function updateViewmodel(dt) {
        if (!vmRoot || !S.fpv) return;
        const moving = S.keys['w'] || S.keys['a'] || S.keys['s'] || S.keys['d'];
        S.vmBob += dt * (moving ? 9 : 2.4);
        const bx = Math.sin(S.vmBob) * 0.012 * (moving ? 1 : 0.4);
        const by = Math.abs(Math.cos(S.vmBob)) * 0.012 * (moving ? 1 : 0.3);
        S.vmKick *= Math.pow(0.0015, dt); if (S.vmKick < 0.001) S.vmKick = 0;
        vmRoot.position.x = 0.44 + bx;
        vmRoot.position.y = -0.34 + by;
        vmRoot.position.z = 0.60 - S.vmKick * 0.45;
        vmRoot.rotation.x = -S.vmKick * 0.9;
    }
    function toggleView() {
        S.fpv = !S.fpv;
        if (vmRoot) vmRoot.setEnabled(S.fpv);
        setBodyVisible(!S.fpv);
        status(S.fpv ? 'FIRST-PERSON VIEW' : 'THIRD-PERSON VIEW', 1100);
    }
    function applyBigHead() {
        if (playerHead) playerHead.scaling.setAll(S.codes.bighead ? 2.0 : 1.0);
        enemies.forEach(e => { if (e.metadata.headMesh) e.metadata.headMesh.scaling.setAll(S.codes.bighead ? 1.9 : 1.0); });
    }

    // ---- terminals ----
    function buildTerminals(count) {
        const spots = [[-13, 1.4, 3, 'CORE TERMINAL'], [20, 1.3, 10, 'SHIELD RELAY'], [-22, 1.3, -10, 'VAULT NODE']];
        for (let i = 0; i < count; i++) {
            const [x, y, z, label] = spots[i];
            const term = addBox('terminal' + i, { w: 2.1, h: 2.7, d: 1.35 }, new V3(x, y, z), '#1f252f', true);
            const r = dynTexPlane('termScreen' + i, 1.65, 1.1, drawTermIdle, 256, 192);
            r.plane.position.set(x, y + 0.95, z + 0.72);
            addNeon('#00ff88', new V3(x, y + 1.8, z + 0.6), 0.6, 9);
            interactables.push({ mesh: term, screen: r.dt, hacked: false, label: 'TAMPER WITH ' + label });
        }
    }
    function drawTermIdle(ctx, w, h) {
        ctx.fillStyle = '#001508'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#00ff88'; ctx.font = '20px monospace';
        ctx.fillText('> HELA-02 CORE', 12, 34); ctx.fillText('> STATUS: ARMED', 12, 64); ctx.fillText('> [E] DATA-SPIKE', 12, 110);
        ctx.fillStyle = '#00ff8855'; ctx.fillRect(12, 140, (w - 24) * (0.4 + Math.random() * 0.5), 8);
    }
    function drawTermHacked(ctx, w, h) {
        ctx.fillStyle = '#001508'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 20px monospace';
        ctx.fillText('> SPIKE SUCCESS', 12, 44); ctx.fillText('> COMPROMISED', 12, 78); ctx.fillStyle = '#00ffcc'; ctx.fillRect(12, 110, w - 24, 8);
    }
    function tamper(item) {
        if (item.hacked) return;
        item.hacked = true; S.terminalsHacked++; Audio.hack();
        item.screen.getContext().clearRect(0, 0, 256, 192); drawTermHacked(item.screen.getContext(), 256, 192); item.screen.update();
        item.mesh.material.emissiveColor = C.FromHexString('#00ffcc').scale(0.4);
        if (domeShieldUp) { domeShieldUp = false; domeMesh.material.alpha = 0.06; if (domeMesh.metadata.core) domeMesh.metadata.core.material.alpha = 0.04; status('DATA-SPIKE DEPLOYED — SHIELD BYPASSED', 3200); }
        else status('TERMINAL TAMPERED — DEFENSES WEAKENED', 2800);
        for (const e of enemies) {
            if (!e.metadata.alive) continue;
            if (V3.Distance(e.position, item.mesh.position) < 26) {
                e.metadata.health = Math.max(15, e.metadata.health - 70); e.metadata.compromised = true; e.metadata.speed *= 0.55; e.metadata.fire *= 1.8;
                if (e.metadata.eyes) e.metadata.eyes.forEach(eye => { eye.material.diffuseColor = C.FromHexString('#00ffff'); eye.material.emissiveColor = C.FromHexString('#00aaff'); });
                e.metadata.barFg.material.emissiveColor = C.FromHexString('#00ffff'); flashEnemy(e);
            }
        }
        spawnPickup('ammo', item.mesh.position.x + 2, 1.4, item.mesh.position.z + 2);
        checkObjective();
    }

    // ---- pickups ----
    function spawnPickup(type, x, y, z) {
        const colors = { ammo: ['#0f2418', '#00ff66'], health: ['#241010', '#ff3355'], shield: ['#241a08', '#ff9500'] };
        const [body, gl] = colors[type];
        const box = BABYLON.MeshBuilder.CreateBox('pk', { size: 1.1 }, S.scene);
        box.material = flatMat('pk' + type, body, gl, 0.7); box.position.set(x, y, z); box.isPickable = false;
        box.metadata = { phase: Math.random() * 6.28, type }; pickups.push(box);
    }

    // ---- post fx ----
    function buildPostFX(theme) {
        const forest = (theme === 'forest' || theme === 'ruins');   // bright/clear path
        glow = new BABYLON.GlowLayer('glow', S.scene, { mainTextureSamples: 2 }); glow.intensity = forest ? 0.5 : 0.85;
        pipeline = new BABYLON.DefaultRenderingPipeline('default', true, S.scene, [camera]);
        // Bloom: subtle on the bright forest, punchier on neon
        pipeline.bloomEnabled = HELA.Settings.get('bloom'); pipeline.bloomThreshold = forest ? 0.82 : 0.6; pipeline.bloomWeight = forest ? 0.35 : 0.55; pipeline.bloomKernel = 48; pipeline.bloomScale = 0.5;
        // Clarity: kill the heavy blur/dust. CA & grain are tiny now (forest = none).
        pipeline.chromaticAberrationEnabled = !forest; pipeline.chromaticAberration.aberrationAmount = 2.5; pipeline.chromaticAberration.radialIntensity = 0.4;
        pipeline.grainEnabled = HELA.Settings.get('grain') && !forest; pipeline.grain.intensity = 2.5; pipeline.grain.animated = true;
        pipeline.imageProcessingEnabled = true;
        pipeline.imageProcessing.vignetteEnabled = !forest; pipeline.imageProcessing.vignetteWeight = 1.2;
        pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0.02, 0.05, 1);
        pipeline.imageProcessing.contrast = forest ? 1.12 : 1.18; pipeline.imageProcessing.exposure = forest ? 1.08 : 1.12;
        pipeline.imageProcessing.toneMappingEnabled = true;
        pipeline.fxaaEnabled = true;
        pipeline.samples = 4;
        try {
            if (BABYLON.SSAO2RenderingPipeline.IsSupported && HELA.Settings.get('ssao')) {
                ssaoPipe = new BABYLON.SSAO2RenderingPipeline('ssao', S.scene, 0.8); ssaoPipe.totalStrength = forest ? 0.7 : 1.0; ssaoPipe.radius = 1.4; ssaoPipe.base = 0.35;
                S.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', camera);
            }
        } catch (e) {}
    }

    // =================================================================
    //  ENEMIES — drone / human / boss
    // =================================================================
    function makeEnemy(typeKey, pos) {
        const T = HELA.ENEMY_TYPES[typeKey];
        if (T.kind === 'human') return makeHuman(typeKey, pos, T);
        if (T.kind === 'zombie') return makeZombie(typeKey, pos, T);
        if (T.kind === 'boss') return makeBoss(typeKey, pos, T);
        return makeDrone(typeKey, pos, T);
    }
    // Human-like infected: arms reaching forward, glowing eyes, melee, walk cycle.
    function makeZombie(typeKey, pos, T) {
        const e = new BABYLON.TransformNode('enemy', S.scene); e.position.copyFrom(pos); const s = T.size, eyes = [];
        const part = (dim, p, hex, em, emAmt, parent, isEye) => {
            const m = BABYLON.MeshBuilder.CreateBox('e', { width: dim[0] * s, height: dim[1] * s, depth: dim[2] * s }, S.scene);
            m.material = (em ? flatMat('zhot' + typeKey + Math.random(), hex, em, emAmt) : flatMat('z' + typeKey + hex, hex));
            m.position.copyFrom(p.scale(s)); m.parent = parent || e; m.metadata = { enemy: e }; if (shadowGen) shadowGen.addShadowCaster(m); if (isEye) eyes.push(m); return m;
        };
        part([0.9, 1.25, 0.5], new V3(0, 0.35, 0), T.shirt);             // torso
        part([0.55, 0.45, 0.45], new V3(0, 1.05, 0), T.skin);           // neck/upper
        const head = part([0.6, 0.62, 0.6], new V3(0, 1.55, 0), T.skin);
        part([0.14, 0.12, 0.08], new V3(-0.16, 1.58, 0.3), T.eye, T.eyeEm, 1.6, null, true);
        part([0.14, 0.12, 0.08], new V3(0.16, 1.58, 0.3), T.eye, T.eyeEm, 1.6, null, true);
        // arms reaching forward
        const larm = new BABYLON.TransformNode('larm', S.scene); larm.parent = e; larm.position.set(-0.56 * s, 0.85 * s, 0); larm.rotation.x = -1.2;
        const rarm = new BABYLON.TransformNode('rarm', S.scene); rarm.parent = e; rarm.position.set(0.56 * s, 0.85 * s, 0); rarm.rotation.x = -1.2;
        part([0.26, 0.95, 0.26], new V3(0, -0.4, 0), T.skin, null, null, larm);
        part([0.26, 0.95, 0.26], new V3(0, -0.4, 0), T.skin, null, null, rarm);
        // legs (animated)
        const lleg = new BABYLON.TransformNode('lleg', S.scene); lleg.parent = e; lleg.position.set(-0.24 * s, -0.3 * s, 0);
        const rleg = new BABYLON.TransformNode('rleg', S.scene); rleg.parent = e; rleg.position.set(0.24 * s, -0.3 * s, 0);
        part([0.3, 1.0, 0.32], new V3(0, -0.5, 0), T.pants, null, null, lleg);
        part([0.3, 1.0, 0.32], new V3(0, -0.5, 0), T.pants, null, null, rleg);
        e.metadata = { kind: 'zombie', type: typeKey, health: T.hp, maxHealth: T.hp, speed: T.speed, dmg: T.dmg, fire: T.fire, points: T.points, lastShot: performance.now(), eyes, headMesh: head, compromised: false, alive: true, legs: [lleg, rleg], arms: [larm, rarm], walk: Math.random() * 6, groundY: 2.0 };
        attachHealthBar(e, 1.4, 2.7 * s);
        if (S.codes.bighead) head.scaling.setAll(1.9);
        enemies.push(e); return e;
    }
    function attachHealthBar(e, width, headY) {
        const bg = BABYLON.MeshBuilder.CreatePlane('hbBg', { width: width, height: 0.16 }, S.scene);
        const bgm = new BABYLON.StandardMaterial('hbBgm', S.scene); bgm.emissiveColor = C.FromHexString('#220000'); bgm.disableLighting = true; bg.material = bgm; bg.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; bg.isPickable = false; bg.setEnabled(false);
        const fg = BABYLON.MeshBuilder.CreatePlane('hbFg', { width: width * 0.97, height: 0.12 }, S.scene);
        const fgm = new BABYLON.StandardMaterial('hbFgm', S.scene); fgm.emissiveColor = C.FromHexString('#ff2a2a'); fgm.disableLighting = true; fg.material = fgm; fg.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; fg.isPickable = false; fg.setEnabled(false);
        e.metadata.barBg = bg; e.metadata.barFg = fg; e.metadata.headY = headY;
    }
    function makeDrone(typeKey, pos, T) {
        const e = new BABYLON.TransformNode('enemy', S.scene); e.position.copyFrom(pos); const s = T.size, eyes = [];
        const part = (dim, p, hex, em, emAmt, isEye) => {
            const m = BABYLON.MeshBuilder.CreateBox('e', { width: dim[0] * s, height: dim[1] * s, depth: dim[2] * s }, S.scene);
            m.material = (em ? flatMat('ehot' + typeKey + Math.random(), hex, em, emAmt) : flatMat('e' + typeKey, hex));
            m.position.copyFrom(p.scale(s)); m.parent = e; m.metadata = { enemy: e }; if (shadowGen) shadowGen.addShadowCaster(m); if (isEye) eyes.push(m); return m;
        };
        part([1.0, 1.5, 0.85], new V3(0, 0, 0), T.body);
        const head = part([0.7, 0.65, 0.7], new V3(0, 1.25, 0), '#2a1c1c');
        part([0.18, 0.18, 0.08], new V3(-0.22, 1.32, 0.4), T.eye, T.eyeEm, 1.6, true);
        part([0.18, 0.18, 0.08], new V3(0.22, 1.32, 0.4), T.eye, T.eyeEm, 1.6, true);
        part([0.1, 0.8, 0.1], new V3(0, 1.95, 0), '#1a1a1a');
        part([0.18, 0.18, 0.18], new V3(0, 2.4, 0), T.eye, T.eyeEm, 1.4);
        const arm = part([0.25, 0.9, 0.25], new V3(0.62, 0.4, 0.1), '#2a1c1c'); arm.rotation.z = -0.6;
        part([0.28, 0.9, 0.35], new V3(-0.32, -1.0, 0), '#2a1c1c'); part([0.28, 0.9, 0.35], new V3(0.32, -1.0, 0), '#2a1c1c');
        e.metadata = { kind: 'drone', type: typeKey, health: T.hp, maxHealth: T.hp, speed: T.speed, dmg: T.dmg, fire: T.fire, points: T.points, lastShot: performance.now(), eyes, headMesh: head, compromised: false, alive: true, groundY: 3.0 };
        attachHealthBar(e, 1.4, 2.7 * s);
        if (S.codes.bighead) head.scaling.setAll(1.9);
        enemies.push(e); return e;
    }
    function makeHuman(typeKey, pos, T) {
        const e = new BABYLON.TransformNode('enemy', S.scene); e.position.copyFrom(pos); const s = T.size;
        const part = (dim, p, hex, em, emAmt, parent) => {
            const m = BABYLON.MeshBuilder.CreateBox('e', { width: dim[0] * s, height: dim[1] * s, depth: dim[2] * s }, S.scene);
            m.material = (em ? flatMat('hhot' + typeKey + Math.random(), hex, em, emAmt) : flatMat('h' + typeKey + hex, hex));
            m.position.copyFrom(p.scale(s)); m.parent = parent || e; m.metadata = { enemy: e }; if (shadowGen) shadowGen.addShadowCaster(m); return m;
        };
        part([0.95, 1.25, 0.55], new V3(0, 0.35, 0), T.body);            // torso
        part([0.75, 0.45, 0.55], new V3(0, 1.15, 0), T.suit);            // chest plate
        const head = part([0.62, 0.62, 0.62], new V3(0, 1.65, 0), T.suit);
        part([0.5, 0.16, 0.1], new V3(0, 1.68, 0.32), T.visor, T.visorEm, 1.6); // visor
        // shoulders / arms
        part([0.3, 0.85, 0.3], new V3(-0.62, 0.55, 0), T.body);          // left arm
        const rarm = new BABYLON.TransformNode('rarm', S.scene); rarm.parent = e; rarm.position.set(0.6 * s, 0.95 * s, 0.1 * s);
        part([0.28, 0.8, 0.28], new V3(0, -0.35, 0.25), T.body, null, null, rarm);
        // rifle in right hand
        part([0.16, 0.18, 1.1], new V3(0, -0.4, 0.7), '#12181f', null, null, rarm);
        part([0.07, 0.07, 0.5], new V3(0, -0.36, 1.25), '#0a0f15', T.visorEm, 0.4, rarm);
        // legs (animated)
        const lleg = new BABYLON.TransformNode('lleg', S.scene); lleg.parent = e; lleg.position.set(-0.26 * s, -0.3 * s, 0);
        const rleg = new BABYLON.TransformNode('rleg', S.scene); rleg.parent = e; rleg.position.set(0.26 * s, -0.3 * s, 0);
        part([0.32, 1.0, 0.34], new V3(0, -0.5, 0), T.suit, null, null, lleg);
        part([0.32, 1.0, 0.34], new V3(0, -0.5, 0), T.suit, null, null, rleg);
        e.metadata = { kind: 'human', type: typeKey, health: T.hp, maxHealth: T.hp, speed: T.speed, dmg: T.dmg, fire: T.fire, points: T.points, lastShot: performance.now(), eyes: [], headMesh: head, compromised: false, alive: true, legs: [lleg, rleg], rarm, walk: 0, groundY: 2.0 };
        attachHealthBar(e, 1.5, 2.9 * s);
        if (S.codes.bighead) head.scaling.setAll(1.9);
        enemies.push(e); return e;
    }
    function makeBoss(typeKey, pos, T) {
        const e = new BABYLON.TransformNode('enemy', S.scene); e.position.copyFrom(pos); const s = T.size, eyes = [];
        const part = (dim, p, hex, em, emAmt, isEye) => {
            const m = BABYLON.MeshBuilder.CreateBox('boss', { width: dim[0] * s, height: dim[1] * s, depth: dim[2] * s }, S.scene);
            m.material = (em ? flatMat('boss' + Math.random(), hex, em, emAmt) : flatMat('bossbody' + hex, hex));
            m.position.copyFrom(p.scale(s)); m.parent = e; m.metadata = { enemy: e }; if (shadowGen) shadowGen.addShadowCaster(m); if (isEye) eyes.push(m); return m;
        };
        part([2.2, 2.4, 1.6], new V3(0, 0.4, 0), T.body);
        const head = part([1.3, 0.9, 1.2], new V3(0, 2.0, 0), '#1a0e1a');
        part([0.4, 0.3, 0.1], new V3(-0.4, 2.05, 0.62), T.eye, T.eyeEm, 1.8, true);
        part([0.4, 0.3, 0.1], new V3(0.4, 2.05, 0.62), T.eye, T.eyeEm, 1.8, true);
        part([0.5, 1.8, 0.5], new V3(-1.5, 0.6, 0), '#150815'); part([0.5, 1.8, 0.5], new V3(1.5, 0.6, 0), '#150815'); // shoulders
        part([0.7, 0.7, 1.4], new V3(-1.6, 0.7, 0.5), '#0a0510', T.eyeEm, 0.5); // left cannon
        part([0.7, 0.7, 1.4], new V3(1.6, 0.7, 0.5), '#0a0510', T.eyeEm, 0.5);  // right cannon
        part([0.8, 1.6, 0.8], new V3(-0.7, -1.6, 0), '#150815'); part([0.8, 1.6, 0.8], new V3(0.7, -1.6, 0), '#150815'); // legs
        e.metadata = { kind: 'boss', type: typeKey, health: T.hp, maxHealth: T.hp, speed: T.speed, dmg: T.dmg, fire: T.fire, points: T.points, lastShot: performance.now(), eyes, headMesh: head, compromised: false, alive: true, groundY: 6.5 };
        S.bossRef = e; enemies.push(e);
        $('boss-bar').classList.remove('hidden'); $('boss-name').textContent = 'OMEGA WAR-MECH';
        Audio.boss();
        return e;
    }

    // =================================================================
    //  OBJECTIVE DIRECTOR
    // =================================================================
    function initDirector() {
        S._spawnTimer = 0;
        if (S.mode === 'survive') startWave(1);
        else if (S.mode === 'boss') { maintainPop(3); makeEnemy('boss', new V3(3, 5, -34)); }
        else { maintainPop(targetPop()); }
        updateObjectiveHUD();
    }
    function targetPop() { return Math.min(4 + S.level.id, 8); }
    function randType() { const pool = S.level.enemyPool; return pool[Math.floor(Math.random() * pool.length)]; }
    function spawnAt(typeKey, i) {
        const sp = SPAWN[(i !== undefined ? i : Math.floor(Math.random() * SPAWN.length)) % SPAWN.length];
        makeEnemy(typeKey, sp.add(new V3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)));
    }
    function maintainPop(target) {
        let alive = enemies.filter(e => e.metadata.alive && e.metadata.kind !== 'boss').length;
        while (alive < target) { spawnAt(randType()); alive++; }
    }
    function startWave(n) {
        S.wave = n; S.betweenWaves = false;
        const pool = S.level.enemyPool;
        const count = Math.min(3 + Math.floor(n * 1.3), 10);
        for (let i = 0; i < count; i++) spawnAt(pool[i % pool.length], i);
        Audio.wave(); announce('WAVE ' + n, count + ' HOSTILES INBOUND'); status('WAVE ' + n + ' — NEUTRALIZE ALL', 3000);
        updateObjectiveHUD();
    }
    function updateDirector(dt) {
        if (!S.running || S.objectiveDone) return;
        if (S.mode === 'survive') {
            if (!S.betweenWaves && !enemies.some(e => e.metadata.alive)) {
                if (S.wave >= S.level.waves) { completeObjective(); return; }
                S.betweenWaves = true;
                const reward = 20 + S.wave * 4; S.weaponState[S.curWeapon] && (S.weaponState[S.curWeapon].reserve = (S.weaponState[S.curWeapon].reserve === Infinity ? Infinity : Math.min(S.weaponState[S.curWeapon].reserve + reward, 300)));
                status('WAVE ' + S.wave + ' CLEARED  •  +' + reward + ' AMMO', 3000); spawnPickup('health', -5, 1.4, 2);
                setTimeout(() => { if (S.running && !S.over) startWave(S.wave + 1); }, 3800);
            }
        } else {
            S._spawnTimer -= dt;
            if (S._spawnTimer <= 0) { maintainPop(targetPop()); S._spawnTimer = 2.5; }
        }
    }
    function checkObjective() {
        if (S.objectiveDone) return;
        if (S.mode === 'hack' && S.terminalsHacked >= S.terminalsTotal) completeObjective();
        if (S.mode === 'eliminate' && S.kills >= S.quota) completeObjective();
        if (S.mode === 'collect' && S.collected >= S.collectTarget) completeObjective();
        if (S.mode === 'boss' && S.bossRef && !S.bossRef.metadata.alive) completeObjective();
        updateObjectiveHUD();
    }
    function completeObjective() {
        if (S.objectiveDone) return; S.objectiveDone = true; S.running = false;
        document.exitPointerLock();
        status('OBJECTIVE COMPLETE', 4000);
        setTimeout(() => { if (HELA.UI && HELA.UI.onLevelComplete) HELA.UI.onLevelComplete({ score: S.score, kills: S.kills, wave: S.wave }); }, 1400);
    }
    function updateObjectiveHUD() {
        const el = $('objective-text'); if (!el) return;
        let t = '';
        if (S.mode === 'survive') t = 'SURVIVE — WAVE ' + Math.max(1, S.wave) + ' / ' + S.level.waves;
        else if (S.mode === 'hack') t = 'DATA-SPIKE TERMINALS — ' + S.terminalsHacked + ' / ' + S.terminalsTotal;
        else if (S.mode === 'eliminate') t = 'ELIMINATE HOSTILES — ' + S.kills + ' / ' + S.quota;
        else if (S.mode === 'collect') t = 'RECOVER DATA-CACHES — ' + S.collected + ' / ' + S.collectTarget;
        else if (S.mode === 'boss') t = 'DESTROY THE OMEGA WAR-MECH';
        el.textContent = t;
    }
    function updateInventoryHUD() {
        const el = $('inventory'); if (!el) return;
        const inv = S.inventory || {};
        const items = [['medkit', 'H'], ['grenade', 'G'], ['cell', ''], ['datacache', '']];
        let html = '';
        for (const [k, key] of items) {
            const def = HELA.COLLECTIBLES[k]; const n = inv[k] || 0;
            if (n <= 0 && k !== 'medkit' && k !== 'grenade') continue;
            html += '<div class="inv-item"><span class="inv-ic" style="color:' + def.glow + '">' + def.icon + '</span>' + n + (key ? '<span class="inv-key">' + key + '</span>' : '') + '</div>';
        }
        el.innerHTML = html;
    }

    // =================================================================
    //  WEAPONS & COMBAT
    // =================================================================
    function curW() { return HELA.WEAPONS[S.curWeapon]; }
    function curAmmo() { return S.weaponState[S.curWeapon]; }
    function switchWeapon(id) {
        if (!S.unlockedWeapons[id] || id === S.curWeapon) return;
        S.curWeapon = id; Audio.swap(); updateHUD(); renderWeaponSlots();
        status(curW().name + ' EQUIPPED', 900);
    }
    function reload() {
        const w = curW(), a = curAmmo();
        if (a.mag === w.mag || a.reserve <= 0 || S.reloading || S.codes.infammo) return;
        S.reloading = true; Audio.reload(); status('RELOADING…', 600);
        setTimeout(() => {
            const need = w.mag - a.mag, take = Math.min(need, a.reserve);
            a.mag += take; if (a.reserve !== Infinity) a.reserve -= take; S.reloading = false; updateHUD();
        }, 600);
    }
    function dash() {
        const now = performance.now();
        if (now - S.lastDash < CFG.dashCooldown || !S.running || S.paused) return;
        S.lastDash = now; S.dashVel = forwardVec().scale(CFG.dashImpulse * (S.codes.lowgrav ? 1.3 : 1)); Audio.dash();
    }
    function shoot() {
        const now = performance.now(), w = curW(), a = curAmmo();
        if (now - S.lastShot < w.cooldown || S.reloading) return;
        if (a.mag <= 0 && !S.codes.infammo) { reload(); return; }
        S.lastShot = now; if (!S.codes.infammo) a.mag--; updateHUD(); Audio.shoot(w.id);
        if (HELA.Settings.get('shake')) addShake(w.recoil);
        S.vmKick = Math.max(S.vmKick, w.recoil);
        // Cast from the camera through screen-centre so the shot always lands on
        // the crosshair; the visible tracer starts at the gun muzzle.
        const origin = camera.position.clone();
        const visualStart = S.fpv ? (vmMuzzle ? vmMuzzle.getAbsolutePosition() : origin) : muzzle.getAbsolutePosition();
        flash(visualStart, w.tracer, 3.0, 70);
        for (let p = 0; p < w.pellets; p++) {
            const dir = aimVec(w.spread);
            const ray = new BABYLON.Ray(origin, dir, 140);
            const hit = S.scene.pickWithRay(ray, (m) => m.isPickable && m.metadata && m.metadata.enemy && m.metadata.enemy.metadata.alive);
            let end;
            if (hit && hit.hit) { end = hit.pickedPoint; damageEnemy(hit.pickedMesh.metadata.enemy, w.dmg, end); }
            else { const wh = S.scene.pickWithRay(ray, (m) => m.isPickable); end = (wh && wh.hit) ? wh.pickedPoint : origin.add(dir.scale(100)); if (p === 0) impact(end); }
            if (p % 2 === 0) tracer(visualStart, end, w.tracer);
        }
    }
    function damageEnemy(e, dmg, point) {
        if (!e.metadata.alive) return;
        e.metadata.health -= dmg; flashEnemy(e); impact(point);
        showHitMarker(e.metadata.health <= 0); Audio.hit(panFor(e.position));
        damageNumber(dmg, point, e.metadata.compromised ? '#00ffff' : '#ffdd55');
        e.metadata.barBg.setEnabled(true); e.metadata.barFg.setEnabled(true);
        if (e.metadata.kind === 'boss') updateBossBar();
        if (e.metadata.health <= 0) destroyEnemy(e);
    }
    function flashEnemy(e) {
        if (!e.metadata.eyes || !e.metadata.eyes.length) return;
        e.metadata.eyes.forEach(eye => { const o = eye.material.emissiveColor.clone(); eye.material.emissiveColor = new C(1, 1, 1); setTimeout(() => { eye.material.emissiveColor = o; }, 100); });
    }
    function destroyEnemy(e) {
        e.metadata.alive = false; const pos = e.position.clone(), pan = panFor(pos), points = e.metadata.points, isBoss = e.metadata.kind === 'boss';
        Audio.kill(pan); if (HELA.Settings.get('shake')) addShake(isBoss ? 0.7 : 0.3);
        const n = isBoss ? 60 : 16;
        for (let i = 0; i < n; i++) {
            const d = BABYLON.MeshBuilder.CreateBox('debris', { size: 0.22 + Math.random() * 0.2 }, S.scene);
            d.material = flatMat('debris', Math.random() > 0.5 ? '#442222' : '#333333'); d.position.copyFrom(pos); d.position.y += 1; d.isPickable = false;
            particles.push({ mesh: d, vel: new V3((Math.random() - 0.5) * 20, Math.random() * 16 + 4, (Math.random() - 0.5) * 20), life: 1000, born: performance.now() });
        }
        flash(pos, '#ff5522', 4, 220);
        if (e.metadata.barBg) e.metadata.barBg.dispose(); if (e.metadata.barFg) e.metadata.barFg.dispose();
        e.dispose();
        const idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
        S.kills++;
        const now = performance.now();
        if (now - S.lastKill < CFG.comboWindow) S.combo++; else S.combo = 1; S.lastKill = now;
        const mult = Math.min(S.combo, 8); S.score += (points * 100) * mult;
        updateHUD();
        if (!isBoss && Math.random() < 0.22) spawnPickup(Math.random() < 0.5 ? 'ammo' : 'shield', pos.x, 1.4, pos.z);
        status((isBoss ? 'OMEGA DESTROYED' : 'HOSTILE NEUTRALIZED') + (mult > 1 ? '  ×' + mult : ''), 1400);
        if (isBoss) { $('boss-bar').classList.add('hidden'); }
        checkObjective();
        if (S.mode === 'survive') { /* wave handled in director */ }
        updateObjectiveHUD();
    }
    function takeDamage(amt) {
        if (S.over || S.paused || S.codes.god) return;
        Audio.damage(); if (HELA.Settings.get('shake')) addShake(0.25);
        if (S.shield > 0) { S.shield = Math.max(0, S.shield - amt); if (S.shield === 0) status('SHIELD DEPLETED', 1500); }
        else S.health = Math.max(0, S.health - amt);
        updateHUD();
        const fx = document.createElement('div'); fx.style.cssText = 'position:fixed;inset:0;background:rgba(255,40,40,0.2);pointer-events:none;z-index:50;'; document.body.appendChild(fx); setTimeout(() => fx.remove(), 90);
        if (S.health <= 0) endGame();
    }
    function endGame() {
        S.over = true; S.running = false; document.exitPointerLock();
        if (HELA.UI && HELA.UI.onGameOver) HELA.UI.onGameOver({ score: S.score, kills: S.kills });
    }

    // ---- fx ----
    function addShake(a) { S.shake = Math.min(S.shake + a, 0.8); }
    function flash(pos, hex, intensity, ms) { const l = new BABYLON.PointLight('fl', pos.clone(), S.scene); l.diffuse = C.FromHexString(hex); l.intensity = intensity; l.range = 10; l.specular = new C(0, 0, 0); setTimeout(() => l.dispose(), ms); }
    function tracer(a, b, hex) { const line = BABYLON.MeshBuilder.CreateLines('tracer', { points: [a, b] }, S.scene); line.color = C.FromHexString(hex || '#00f3ff'); line.isPickable = false; setTimeout(() => line.dispose(), 55); }
    function impact(pos) {
        for (let i = 0; i < 5; i++) { const s = BABYLON.MeshBuilder.CreateBox('spark', { size: 0.12 }, S.scene); s.material = flatMat('spark', '#0a0a0a', '#ffcc66', 1.2); s.position.copyFrom(pos); s.isPickable = false; particles.push({ mesh: s, vel: new V3((Math.random() - 0.5) * 14, Math.random() * 10 + 3, (Math.random() - 0.5) * 14), life: 420, born: performance.now() }); }
        flash(pos, '#ffaa44', 1.3, 110);
    }
    function showHitMarker(kill) { const hm = $('hitmarker'); hm.classList.toggle('kill', kill); hm.classList.remove('hm-show'); void hm.offsetWidth; hm.classList.add('hm-show'); }
    function damageNumber(n, pos, color) {
        const div = document.createElement('div'); div.className = 'dmg-num'; div.textContent = Math.round(n); div.style.color = color; document.body.appendChild(div);
        const p = projectToScreen(pos); let life = 0; const sx = p.x, sy = p.y;
        const tick = () => { life++; const f = life / 28; div.style.left = (sx + Math.sin(life * 0.3) * 6) + 'px'; div.style.top = (sy - life * 1.4) + 'px'; div.style.opacity = (1 - f); if (f >= 1) div.remove(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
    }
    function projectToScreen(pos) { const w = canvas.clientWidth, h = canvas.clientHeight; const p = BABYLON.Vector3.Project(pos, BABYLON.Matrix.Identity(), S.scene.getTransformMatrix(), new BABYLON.Viewport(0, 0, w, h)); return { x: p.x, y: p.y }; }

    function tryInteract() {
        let closest = null, best = 6.5;
        for (const it of interactables) { if (it.hacked) continue; const d = V3.Distance(player.position, it.mesh.position); if (d < best) { best = d; closest = it; } }
        if (closest) tamper(closest); else status('NO TERMINAL IN RANGE', 1400);
    }

    // =================================================================
    //  UPDATES
    // =================================================================
    function updatePlayer(dt) {
        if (!S.running) return;
        const fwd = forwardVec(), right = rightVec();
        let mx = 0, mz = 0;
        if (S.keys['w']) mz += 1; if (S.keys['s']) mz -= 1; if (S.keys['d']) mx += 1; if (S.keys['a']) mx -= 1;
        let speed = CFG.moveSpeed * (S.keys['shift'] ? CFG.sprintMult : 1) * (S.codes.haste ? 1.6 : 1);
        let move = V3.Zero();
        if (mx || mz) { move = fwd.scale(mz).add(right.scale(mx)); move.y = 0; move.normalize().scaleInPlace(speed * dt); }
        if (S.dashVel.lengthSquared() > 0.01) { move.addInPlace(S.dashVel.scale(dt)); S.dashVel.scaleInPlace(Math.pow(0.0001, dt)); if (S.dashVel.length() < 0.5) S.dashVel = V3.Zero(); }
        if (move.lengthSquared() > 0) tryMove(move);
        // stand on whatever surface is underfoot (ground OR the cracked platform)
        const down = new BABYLON.Ray(new V3(player.position.x, player.position.y + 4, player.position.z), new V3(0, -1, 0), 16);
        const gh = S.scene.pickWithRay(down, groundPick);
        const surf = (gh && gh.hit) ? gh.pickedPoint.y : 0;
        let targetY = surf + 1.7;
        if (mx || mz) { player.metadata.bob += dt * 9; targetY += Math.sin(player.metadata.bob) * 0.06; }
        player.position.y += (targetY - player.position.y) * Math.min(1, dt * 14);
        S.groundY = surf + 1.7;
        player.rotation.y = S.yaw;
        const gun = player.getChildMeshes().find(m => m.name === 'gun'); if (gun) gun.rotation.x = -S.pitch * 0.5;
        const b = S.bounds; player.position.x = Math.max(-b, Math.min(b, player.position.x)); player.position.z = Math.max(-b, Math.min(b, player.position.z));
        updateCamera();
    }
    function groundPick(m) { return m.name === 'ground' || colliders.indexOf(m) >= 0; }
    function tryMove(move) {
        const test = (axis) => {
            const np = player.position.clone(); if (axis === 'x') np.x += move.x; else if (axis === 'z') np.z += move.z; else { np.x += move.x; np.z += move.z; }
            // Box sits ABOVE the floor the player stands on (so the start platform / ground
            // never blocks movement) but still catches walls, towers, trees and monoliths.
            const pBox = new BABYLON.BoundingBox(new V3(np.x - 0.6, S.groundY + 0.4, np.z - 0.6), new V3(np.x + 0.6, S.groundY + 2.3, np.z + 0.6));
            for (const c of colliders) {
                c.computeWorldMatrix(false);
                const cb = c.getBoundingInfo().boundingBox;
                if (cb.maximumWorld.y <= S.groundY + 0.4) continue;     // low enough to stand on — ignore
                if (BABYLON.BoundingBox.Intersects(pBox, cb)) return false;
            }
            return true;
        };
        if (test('both')) { player.position.x += move.x; player.position.z += move.z; }
        else { if (test('x')) player.position.x += move.x; if (test('z')) player.position.z += move.z; }
    }
    function updateCamera() {
        if (S.fpv) {
            const eye = player.position.add(new V3(0, 1.62, 0));
            if (S.shake > 0.001) { eye.addInPlace(new V3((Math.random() - 0.5) * S.shake * 0.5, (Math.random() - 0.5) * S.shake * 0.5, (Math.random() - 0.5) * S.shake * 0.5)); S.shake *= 0.86; }
            camera.position.copyFrom(eye);
            camera.setTarget(eye.add(aimVec(0)));
            return;
        }
        // Third-person: sit behind/above the operative but LOOK ALONG the aim
        // direction, so the screen-centre crosshair is the true line of fire.
        const aim = aimVec(0);
        const eye = player.position.add(new V3(0, 1.7, 0));
        const desired = eye.subtract(aim.scale(7.5)).add(new V3(0, 2.4, 0));
        if (desired.y < S.groundY + 1) desired.y = S.groundY + 1;
        camera.position = V3.Lerp(camera.position, desired, 0.18);
        if (S.shake > 0.001) { camera.position.addInPlace(new V3((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake)); S.shake *= 0.86; }
        camera.setTarget(eye.add(aim.scale(14)));
    }
    function updateEnemies(dt) {
        if (!S.running) return; const now = performance.now();
        for (const e of enemies) {
            if (!e.metadata.alive) continue;
            const md = e.metadata;
            const isZombie = md.kind === 'zombie';
            const stopDist = md.kind === 'boss' ? 8 : (isZombie ? 1.9 : 2.6);
            const to = player.position.subtract(e.position); to.y = 0; const dist = to.length();
            if (dist > stopDist) {
                to.normalize(); e.position.addInPlace(to.scale(md.speed * dt)); e.position.y = md.groundY - 0.5; e.rotation.y = Math.atan2(to.x, to.z);
                if (md.legs) { md.walk += dt * (isZombie ? 6 : 9); md.legs[0].rotation.x = Math.sin(md.walk) * 0.55; md.legs[1].rotation.x = -Math.sin(md.walk) * 0.55; }
                if (md.arms && isZombie) { const sway = Math.sin(md.walk * 0.5) * 0.12; md.arms[0].rotation.x = -1.2 + sway; md.arms[1].rotation.x = -1.2 - sway; }
            }
            // health bar follow
            const bp = e.position.add(new V3(0, md.headY, 0));
            md.barBg && md.barBg.position.copyFrom(bp); md.barFg && md.barFg.position.copyFrom(bp);
            if (md.barFg) md.barFg.scaling.x = Math.max(0, md.health / md.maxHealth);
            // attack
            if (isZombie) {
                if (dist <= stopDist + 0.6 && now - md.lastShot > md.fire) { md.lastShot = now; takeDamage(md.dmg + Math.random() * 4); if (HELA.Settings.get('shake')) addShake(0.12); }
            } else if (dist < (md.kind === 'boss' ? 60 : 42) && now - md.lastShot > md.fire) {
                md.lastShot = now;
                if (md.kind === 'boss') { for (let k = -2; k <= 2; k++) spawnBolt(e, k * 0.12); }
                else spawnBolt(e, 0);
            }
        }
    }
    function spawnBolt(e, spread) {
        const start = e.position.add(new V3(0, e.metadata.kind === 'boss' ? 2.0 : 1.1, 0));
        const bolt = BABYLON.MeshBuilder.CreateBox('bolt', { width: 0.22, height: 0.22, depth: 0.7 }, S.scene);
        const m = new BABYLON.StandardMaterial('boltm', S.scene); const col = e.metadata.compromised ? '#00ffff' : (e.metadata.kind === 'boss' ? '#ff2266' : '#ff3355'); m.emissiveColor = C.FromHexString(col); m.disableLighting = true;
        bolt.material = m; bolt.position.copyFrom(start); bolt.isPickable = false;
        const target = player.position.add(new V3(0, 1.7, 0));
        let dir = target.subtract(start).normalize();
        if (spread) dir.addInPlace(rightVec().scale(spread)).normalize();
        bolts.push({ mesh: bolt, dmg: e.metadata.dmg, speed: 50, dir, born: performance.now() });
        Audio.enemyShoot(panFor(e.position));
    }
    function updateBolts(dt) {
        const now = performance.now();
        for (let i = bolts.length - 1; i >= 0; i--) {
            const b = bolts[i];
            const target = player.position.add(new V3(0, 1.7, 0));
            // gently home toward player
            const homing = target.subtract(b.mesh.position).normalize();
            b.dir = V3.Lerp(b.dir, homing, 0.04).normalize();
            b.mesh.position.addInPlace(b.dir.scale(b.speed * dt));
            b.mesh.lookAt(b.mesh.position.add(b.dir));
            if (V3.Distance(b.mesh.position, target) < 1.3) { takeDamage(b.dmg + Math.random() * 4); b.mesh.dispose(); bolts.splice(i, 1); continue; }
            if (now - b.born > 2600) { b.mesh.dispose(); bolts.splice(i, 1); }
        }
    }
    function updateParticles() {
        const now = performance.now(), dtg = engine.getDeltaTime() / 1000, grav = S.codes.lowgrav ? 8 : 24;
        for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.mesh.position.addInPlace(p.vel.scale(dtg)); p.vel.y -= grav * dtg; p.vel.scaleInPlace(0.985); if (now - p.born > p.life || p.mesh.position.y < 0.2) { p.mesh.dispose(); particles.splice(i, 1); } }
        for (let i = pickups.length - 1; i >= 0; i--) {
            const pk = pickups[i]; pk.metadata.phase += dtg * 3; pk.position.y = 1.4 + Math.sin(pk.metadata.phase) * 0.3; pk.rotation.y += dtg * 1.8;
            if (player && V3.Distance(player.position, pk.position) < 3) {
                if (pk.metadata.collectible) applyCollectible(pk.metadata.ctype);
                else { applyPickup(pk.metadata.type); Audio.pickup(); }
                if (pk.metadata.light) pk.metadata.light.dispose();
                pk.dispose(); pickups.splice(i, 1);
            }
        }
    }
    function applyPickup(type) {
        if (type === 'ammo') { const a = curAmmo(); if (a.reserve !== Infinity) a.reserve = Math.min(a.reserve + 24, 300); status('+24 AMMO', 900); }
        else if (type === 'health') { S.health = Math.min(S.health + 35, 100); status('+35 INTEGRITY', 900); }
        else if (type === 'shield') { S.shield = Math.min(S.shield + 40, 100); status('+40 SHIELD', 900); }
        updateHUD();
    }
    function updateDome(t) { if (domeMesh) { domeMesh.rotation.y = t * 0.1; if (domeMesh.metadata.core) domeMesh.metadata.core.rotation.y = -t * 0.15; } if (S.scene) S.scene.fogDensity = S.level.fogDensity + Math.sin(t * 0.4) * 0.0018; }

    function drawMapTo(ctx, W, H, big) {
        const b = S.bounds, scale = W / (b * 2), w2m = (x, z) => ({ x: (x + b) * scale, y: (z + b) * scale });
        ctx.fillStyle = 'rgba(6,10,18,0.92)'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(0,243,255,0.13)'; ctx.lineWidth = 1;
        const div = big ? 10 : 6; for (let i = 0; i <= div; i++) { const p = (i / div) * W; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke(); }
        for (const c of colliders) { const bb = c.getBoundingInfo().boundingBox; const mn = w2m(bb.minimumWorld.x, bb.minimumWorld.z), mx = w2m(bb.maximumWorld.x, bb.maximumWorld.z); ctx.fillStyle = 'rgba(80,100,130,0.25)'; ctx.fillRect(mn.x, mn.y, mx.x - mn.x, mx.y - mn.y); }
        for (const it of interactables) { const m = w2m(it.mesh.position.x, it.mesh.position.z); ctx.fillStyle = it.hacked ? '#00ffcc' : '#00ff88'; const r = big ? 5 : 2.5; ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2); }
        for (const pk of pickups) { const m = w2m(pk.position.x, pk.position.z); const cache = pk.metadata && pk.metadata.ctype === 'datacache'; ctx.fillStyle = cache ? '#00f3ff' : '#ffee55'; const r = cache ? (big ? 4 : 2.5) : 1.5; ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2); }
        for (const e of enemies) { if (!e.metadata.alive) continue; const m = w2m(e.position.x, e.position.z); ctx.fillStyle = e.metadata.compromised ? '#00ffff' : (e.metadata.kind === 'boss' ? '#ff2266' : (e.metadata.kind === 'zombie' ? '#9bd14f' : (e.metadata.kind === 'human' ? '#ffaa33' : '#ff3355'))); const r = e.metadata.kind === 'boss' ? (big ? 9 : 6) : (big ? 5 : 4); ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, 6.28); ctx.fill(); }
        if (player) { const pm = w2m(player.position.x, player.position.z); ctx.save(); ctx.translate(pm.x, pm.y); ctx.rotate(S.yaw + Math.PI); ctx.fillStyle = '#00f3ff'; const sc = big ? 1.8 : 1; ctx.beginPath(); ctx.moveTo(0, -7 * sc); ctx.lineTo(-5 * sc, 6 * sc); ctx.lineTo(5 * sc, 6 * sc); ctx.closePath(); ctx.fill(); ctx.restore(); }
        ctx.strokeStyle = 'rgba(0,243,255,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
    }
    function updateMinimap() { if (minimapCtx && player) drawMapTo(minimapCtx, 156, 156, false); }
    function updateInteractPrompt() {
        const prompt = $('interact-prompt'); if (!S.running) { prompt.style.display = 'none'; return; }
        let near = null, best = 6.5;
        for (const it of interactables) { if (it.hacked) continue; const d = V3.Distance(player.position, it.mesh.position); if (d < best) { best = d; near = it; } }
        if (near) { $('interact-label').textContent = near.label; prompt.style.display = 'block'; } else prompt.style.display = 'none';
    }
    function updateBossBar() { if (!S.bossRef) return; const md = S.bossRef.metadata; $('boss-fill').style.width = Math.max(0, md.health / md.maxHealth * 100) + '%'; }

    // ---- HUD ----
    function updateHUD() {
        $('health-value').textContent = Math.floor(S.health); $('health-bar').style.width = S.health + '%';
        $('shield-value').textContent = Math.floor(S.shield); $('shield-bar').style.width = S.shield + '%';
        const w = curW(), a = curAmmo();
        $('weapon-name').textContent = w.name;
        const av = $('ammo-value'); av.textContent = S.codes.infammo ? '∞' : a.mag; av.classList.toggle('low', !S.codes.infammo && a.mag <= Math.ceil(w.mag * 0.25));
        $('ammo-reserve').textContent = (a.reserve === Infinity || S.codes.infammo) ? '∞' : a.reserve;
        $('score-value').textContent = S.score.toLocaleString();
        const remaining = enemies.filter(e => e.metadata.alive).length; const wr = $('wave-remaining'); if (wr) wr.textContent = remaining;
        const wn = $('wave-num'); if (wn) wn.textContent = Math.max(1, S.wave);
        const combo = $('combo'); const mult = Math.min(S.combo, 8); combo.textContent = (mult > 1 && performance.now() - S.lastKill < CFG.comboWindow) ? ('×' + mult + ' COMBO') : '';
        if (S.bossRef && S.bossRef.metadata.alive) updateBossBar();
    }
    function renderWeaponSlots() {
        const wrap = $('weapon-slots'); if (!wrap) return; wrap.innerHTML = '';
        HELA.WEAPON_ORDER.forEach(id => {
            const w = HELA.WEAPONS[id]; const unlocked = S.unlockedWeapons[id];
            const d = document.createElement('div'); d.className = 'wslot' + (id === S.curWeapon ? ' active' : '') + (unlocked ? '' : ' locked');
            d.innerHTML = '<span class="ws-key">' + w.slot + '</span>' + w.name;
            if (unlocked) d.onclick = () => switchWeapon(id);
            wrap.appendChild(d);
        });
    }
    let statusTimer;
    function status(msg, ms) { const el = $('status-text'); el.textContent = msg; el.style.opacity = '0.95'; clearTimeout(statusTimer); statusTimer = setTimeout(() => { if (!S.over) { el.textContent = 'HELA 02 • NEON BREACH'; el.style.opacity = '0.7'; } }, ms || 2400); }
    function announce(big, small) { const el = $('wave-announce'); el.innerHTML = big + '<span class="small">' + small + '</span>'; el.classList.remove('announce-anim'); void el.offsetWidth; el.classList.add('announce-anim'); }

    // ---- input ----
    function bindInput() {
        canvas.addEventListener('click', () => { if (S.running && !S.over && !S.paused && !S.pointerLocked) canvas.requestPointerLock(); });
        document.addEventListener('pointerlockchange', () => { S.pointerLocked = (document.pointerLockElement === canvas); });
        document.addEventListener('mousemove', (e) => {
            if (!S.pointerLocked || S.over || S.paused) return;
            const sens = CFG.baseSens * (HELA.Settings.get('sensitivity') || 1);
            S.yaw += e.movementX * sens;
            const inv = HELA.Settings.get('invertY') ? -1 : 1;
            S.pitch -= e.movementY * sens * inv;
            const lim = S.fpv ? 1.25 : 0.9;
            S.pitch = Math.max(-lim, Math.min(lim, S.pitch));
        });
        document.addEventListener('keydown', (e) => {
            if (!S.running && !S.paused) return;
            const k = e.key.toLowerCase(); S.keys[k] = true;
            if (k === 'r') reload();
            if (k === 'e') tryInteract();
            if (k === ' ') dash();
            if (k === 'p') HELA.Game.togglePause();
            if (k === 'm') { S.muted = !S.muted; $('mute-ind').textContent = S.muted ? '♪ MUTED' : ''; }
            if (k === 'tab') { e.preventDefault(); toggleMap(true); }
            if (k === 'q') cycleWeapon(-1);
            if (k === 'v') toggleView();
            if (k === 'h') useItem('medkit');
            if (k === 'g') useItem('grenade');
            if (['1', '2', '3', '4'].includes(k)) { const id = HELA.WEAPON_ORDER[parseInt(k) - 1]; if (id) switchWeapon(id); }
            if (e.key === 'Escape') { if (S.running && !S.paused) HELA.Game.togglePause(); }
        });
        document.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); S.keys[k] = false; if (k === 'tab') toggleMap(false); });
        canvas.addEventListener('mousedown', (e) => { if (e.button === 0 && S.pointerLocked && !S.over && !S.paused) { S.mouseDown = true; shoot(); } });
        document.addEventListener('mouseup', (e) => { if (e.button === 0) S.mouseDown = false; });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    function cycleWeapon(dir) {
        const list = HELA.WEAPON_ORDER.filter(id => S.unlockedWeapons[id]);
        let i = list.indexOf(S.curWeapon); i = (i + dir + list.length) % list.length; switchWeapon(list[i]);
    }
    function toggleMap(open) {
        S.mapOpen = open; const m = $('bigmap'); if (!m) return; m.classList.toggle('hidden', !open);
        if (open && bigmapCtx) drawMapTo(bigmapCtx, 520, 520, true);
    }

    // =================================================================
    //  MAIN LOOP
    // =================================================================
    function loop() {
        if (!S.scene) return;
        const dt = Math.min(engine.getDeltaTime() / 1000, 0.05), t = performance.now() / 1000;
        if (S.running && !S.paused) {
            updatePlayer(dt); updateViewmodel(dt); updateEnemies(dt); updateBolts(dt); updateGrenades(dt); updateParticles(); updateDome(t); updateWind(t); updateMinimap(); updateInteractPrompt(); updateDirector(dt);
            if (S.mouseDown && curW().auto) shoot();
            if (S.frame % 6 === 0) updateHUD();
            if (S.frame % 3 === 0) { const ray = new BABYLON.Ray(camera.position, aimVec(0), 140); const h = S.scene.pickWithRay(ray, (m) => m.metadata && m.metadata.enemy && m.metadata.enemy.metadata.alive); $('crosshair').classList.toggle('hot', !!(h && h.hit)); }
            if (S.mapOpen && bigmapCtx && S.frame % 4 === 0) drawMapTo(bigmapCtx, 520, 520, true);
        }
        S.scene.render();
        S.frame++; S.fpsTime += engine.getDeltaTime();
        if (S.fpsTime > 500) { $('fps').textContent = Math.round(engine.getFps()) + ' FPS'; S.fpsTime = 0; }
    }

    // expose a couple of internals for diagnostics/testing
    HELA.Game._state = S; HELA.Game._enemies = () => enemies;
})();
