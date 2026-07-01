// =====================================================================
//  HELA 02 • NEON BREACH  —  ui.js
//  Studio splash, landing page, menus, settings, secret-code console,
//  save/continue, mission select, brief / complete / game-over screens.
// =====================================================================
window.HELA = window.HELA || {};

// ---- Persistent storage --------------------------------------------
HELA.Storage = {
    SAVE_KEY: 'helao2_save_v1',
    SET_KEY: 'helao2_settings_v1',
    loadSave() {
        try { return JSON.parse(localStorage.getItem(this.SAVE_KEY)) || null; } catch (e) { return null; }
    },
    writeSave(s) { try { localStorage.setItem(this.SAVE_KEY, JSON.stringify(s)); } catch (e) {} },
    loadSettings() {
        try { return Object.assign({}, HELA.Settings.defaults, JSON.parse(localStorage.getItem(this.SET_KEY)) || {}); }
        catch (e) { return Object.assign({}, HELA.Settings.defaults); }
    },
    writeSettings(s) { try { localStorage.setItem(this.SET_KEY, JSON.stringify(s)); } catch (e) {} },
};

HELA.Settings = {
    defaults: { master: 0.6, sfx: 0.85, sensitivity: 1.0, invertY: false, bloom: true, ssao: true, grain: true, shake: true },
    current: null,
    init() { this.current = HELA.Storage.loadSettings(); },
    get(k) { return this.current[k]; },
    set(k, v) { this.current[k] = v; HELA.Storage.writeSettings(this.current); if (HELA.Game && HELA.Game.onSettingsChanged) HELA.Game.onSettingsChanged(); },
};

// ---- Save model -----------------------------------------------------
HELA.Save = {
    data: null,
    init() {
        const d = HELA.Storage.loadSave() || {};
        this.data = Object.assign({
            unlocked: 1, bestScore: 0, lastLevel: 1, totalKills: 0, completed: [],
            level: 1, xp: 0, credits: 0, ability: 'overdrive',
            augmentsOwned: [], augmentsEquipped: [],
            challenges: { date: '', list: [] },
            lifetime: { kills: 0, waves: 0, caches: 0, missions: 0, nadekills: 0, hacks: 0 },
        }, d);
        // shape-guard nested objects for older saves
        this.data.lifetime = Object.assign({ kills: 0, waves: 0, caches: 0, missions: 0, nadekills: 0, hacks: 0 }, this.data.lifetime || {});
        this.data.challenges = this.data.challenges || { date: '', list: [] };
        this.data.augmentsOwned = this.data.augmentsOwned || [];
        this.data.augmentsEquipped = this.data.augmentsEquipped || [];
        this.ensureChallenges();
    },
    persist() { HELA.Storage.writeSave(this.data); },
    unlock(lvl) { if (lvl > this.data.unlocked) { this.data.unlocked = Math.min(lvl, HELA.LEVELS.length); this.persist(); } },
    recordComplete(lvl, score, kills) {
        if (this.data.completed.indexOf(lvl) < 0) this.data.completed.push(lvl);
        this.data.bestScore = Math.max(this.data.bestScore, score);
        this.data.totalKills += kills;
        this.data.lastLevel = lvl;
        this.unlock(lvl + 1);
        this.persist();
    },
    hasProgress() { return this.data && (this.data.unlocked > 1 || this.data.bestScore > 0 || this.data.level > 1); },

    // ---- progression ----
    xpForLevel(L) { return L * L * 120; },
    addXp(n) {
        this.data.xp += Math.round(n);
        while (this.data.xp >= this.xpForLevel(this.data.level + 1)) this.data.level++;
        this.persist();
    },
    addCredits(n) { this.data.credits += Math.round(n); this.persist(); },

    // ---- daily challenges ----
    todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
    ensureChallenges() {
        const today = this.todayKey();
        if (this.data.challenges.date === today && this.data.challenges.list.length) return;
        // deterministic 3-pick seeded by date so it's stable through the day
        let seed = 0; for (const c of today) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
        const pool = HELA.CHALLENGE_POOL.slice(), pick = [];
        for (let i = 0; i < 3 && pool.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; const idx = seed % pool.length; pick.push(pool.splice(idx, 1)[0]); }
        this.data.challenges = { date: today, list: pick.map(c => ({ id: c.id, prog: 0, claimed: false })) };
        this.persist();
    },
    track(metric, amount) {
        if (metric === 'kills') this.data.lifetime.kills += amount;
        if (metric === 'waves') this.data.lifetime.waves += amount;
        if (metric === 'caches') this.data.lifetime.caches += amount;
        if (metric === 'missions') this.data.lifetime.missions += amount;
        if (metric === 'nadekills') this.data.lifetime.nadekills += amount;
        if (metric === 'hacks') this.data.lifetime.hacks += amount;
        let changed = false;
        for (const ch of this.data.challenges.list) {
            const def = HELA.CHALLENGE_POOL.find(c => c.id === ch.id); if (!def || ch.claimed) continue;
            if (def.metric === metric) { ch.prog = Math.min(def.target, ch.prog + amount); changed = true; }
        }
        if (changed) this.persist();
    },
    trackBest(metric, value) {
        let changed = false;
        for (const ch of this.data.challenges.list) {
            const def = HELA.CHALLENGE_POOL.find(c => c.id === ch.id); if (!def || ch.claimed) continue;
            if (def.metric === metric && value > ch.prog) { ch.prog = Math.min(def.target, value); changed = true; }
        }
        if (changed) this.persist();
    },
    claimChallenge(id) {
        const ch = this.data.challenges.list.find(c => c.id === id); const def = HELA.CHALLENGE_POOL.find(c => c.id === id);
        if (!ch || !def || ch.claimed || ch.prog < def.target) return 0;
        ch.claimed = true; this.addCredits(def.reward); this.addXp(def.reward); this.persist(); return def.reward;
    },

    // ---- augments ----
    buyAugment(id) {
        const a = HELA.AUGMENTS[id]; if (!a || this.data.augmentsOwned.indexOf(id) >= 0 || this.data.credits < a.cost) return false;
        this.data.credits -= a.cost; this.data.augmentsOwned.push(id); this.persist(); return true;
    },
    toggleEquip(id) {
        if (this.data.augmentsOwned.indexOf(id) < 0) return;
        const eq = this.data.augmentsEquipped, i = eq.indexOf(id);
        if (i >= 0) eq.splice(i, 1);
        else { if (eq.length >= HELA.AUGMENT_SLOTS) return; eq.push(id); }
        this.persist();
    },
    setAbility(id) { if (HELA.ABILITIES[id]) { this.data.ability = id; this.persist(); } },
    equippedEffects() {
        const e = {};
        for (const id of this.data.augmentsEquipped) { const a = HELA.AUGMENTS[id]; if (!a) continue; for (const k in a.effect) e[k] = (k.endsWith('Mult')) ? (e[k] || 1) * a.effect[k] : (e[k] || 0) + a.effect[k]; }
        return e;
    },
};

// ---- UI controller --------------------------------------------------
HELA.UI = {
    el: {},
    activeCodes: {},
    konamiBuf: [],

    init() {
        HELA.Settings.init();
        HELA.Save.init();
        const $ = (id) => document.getElementById(id);
        this.el = {
            screens: document.querySelectorAll('.screen'),
            hud: $('hud'),
            toast: $('toast'),
            bgGrid: document.querySelector('.bg-grid'),
        };
        this.bindMenu();
        this.bindSettings();
        this.bindCodes();
        this.bindGlobalKeys();
        this.refreshContinueButton();
        this.runSplash();
    },

    // ---- screen management ----
    show(name) {
        this.el.screens.forEach(s => s.classList.toggle('active', s.dataset.screen === name));
        // HUD only visible while playing
        this.el.hud.classList.toggle('hidden', name !== 'playing');
        // The opaque menu backdrop must NOT cover the 3D canvas while playing or
        // on overlays drawn over the frozen game (pause / complete / game-over).
        const overlay = (name === 'pause' || name === 'complete' || name === 'gameover');
        if (this.el.bgGrid) this.el.bgGrid.style.display = (name === 'playing' || overlay) ? 'none' : 'block';
        document.body.dataset.screen = name;
    },

    runSplash() {
        this.show('splash');
        const skip = () => { document.removeEventListener('keydown', skip); document.removeEventListener('click', skip); this.toLanding(); };
        document.addEventListener('keydown', skip);
        document.addEventListener('click', skip);
        this._splashTimer = setTimeout(() => skip(), 4200);
    },
    toLanding() { clearTimeout(this._splashTimer); this.show('landing'); },

    // ---- main menu wiring ----
    bindMenu() {
        const $ = (id) => document.getElementById(id);
        $('btn-play').onclick = () => this.startNew();
        $('btn-landing-random').onclick = () => this.startRandomOp();
        $('btn-landing-missions').onclick = () => this.openMissions();
        $('btn-landing-settings').onclick = () => this.show('settings');
        $('btn-menu').onclick = () => this.show('menu');

        $('m-new').onclick = () => this.startNew();
        $('m-continue').onclick = () => this.continueGame();
        $('m-random').onclick = () => this.startRandomOp();
        $('m-armory').onclick = () => this.openArmory();
        $('m-missions').onclick = () => this.openMissions();
        $('m-settings').onclick = () => this.show('settings');
        $('m-codes').onclick = () => this.show('codes');
        $('m-credits').onclick = () => this.show('credits');
        $('m-landing').onclick = () => this.show('landing');

        document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => this.show(b.dataset.back));

        // pause menu
        $('p-resume').onclick = () => HELA.Game.togglePause();
        $('p-restart').onclick = () => { HELA.Game.stop(); this.beginLevel(HELA.Game.currentLevelId); };
        $('p-menu').onclick = () => { HELA.Game.stop(); this.show('menu'); };

        // complete / gameover
        $('c-next').onclick = () => this.nextLevel();
        $('c-menu').onclick = () => { HELA.Game.stop(); this.show('menu'); };
        $('go-retry').onclick = () => { HELA.Game.stop(); this.beginLevel(HELA.Game.currentLevelId); };
        $('go-menu').onclick = () => { HELA.Game.stop(); this.show('menu'); };

        // brief
        $('brief-start').onclick = () => this.beginLevel(this._pendingLevel);
    },

    refreshContinueButton() {
        const c = document.getElementById('m-continue');
        if (!c) return;
        if (HELA.Save.hasProgress()) { c.classList.remove('disabled'); c.querySelector('.sub').textContent = 'Mission ' + HELA.Save.data.lastLevel + ' • Best ' + HELA.Save.data.bestScore.toLocaleString(); }
        else { c.classList.add('disabled'); c.querySelector('.sub').textContent = 'No saved protocol'; }
    },

    startNew() { this.showBrief(1); },
    continueGame() {
        if (!HELA.Save.hasProgress()) return this.showBrief(1);
        this.showBrief(HELA.Save.data.lastLevel);
    },

    // ---- missions ----
    openMissions() {
        const wrap = document.getElementById('missions-list');
        wrap.innerHTML = '';
        HELA.LEVELS.forEach(lv => {
            const locked = lv.id > HELA.Save.data.unlocked && !this.activeCodes.unlockall;
            const done = HELA.Save.data.completed.indexOf(lv.id) >= 0;
            const card = document.createElement('div');
            card.className = 'mission-card' + (locked ? ' locked' : '');
            card.innerHTML =
                '<div class="mc-no">0' + lv.id + '</div>' +
                '<div class="mc-body"><div class="mc-name">' + lv.name + (done ? ' <span class="mc-done">✓ CLEARED</span>' : '') + '</div>' +
                '<div class="mc-jp">' + lv.jp + ' • ' + lv.codename + '</div>' +
                '<div class="mc-brief">' + lv.brief + '</div>' +
                '<div class="mc-obj">OBJECTIVE: ' + this.objectiveText(lv) + '</div></div>' +
                '<div class="mc-status">' + (locked ? '🔒 LOCKED' : 'DEPLOY ▶') + '</div>';
            if (!locked) card.onclick = () => this.showBrief(lv.id);
            wrap.appendChild(card);
        });
        this.show('missions');
    },
    objectiveText(lv) {
        switch (lv.objective) {
            case 'survive': return 'Survive ' + lv.waves + ' waves';
            case 'collect': return 'Recover ' + lv.collectTarget + ' data-caches';
            case 'hack': return 'Data-Spike all terminals';
            case 'eliminate': return 'Eliminate ' + lv.quota + ' hostiles';
            case 'boss': return 'Destroy the OMEGA war-mech';
        } return '—';
    },
    startRandomOp() {
        this.show('playing');
        HELA.Game.applyCodes(this.activeCodes);
        HELA.Game.startRandom();
    },

    // ---- Armory (profile / challenges / augments) ----
    openArmory() { HELA.Save.ensureChallenges(); this.renderArmory(); this.show('armory'); },
    renderArmory() {
        const S = HELA.Save.data, $ = (id) => document.getElementById(id);
        const cur = HELA.Save.xpForLevel(S.level), next = HELA.Save.xpForLevel(S.level + 1);
        const pct = Math.max(0, Math.min(100, ((S.xp - cur) / (next - cur)) * 100));
        $('arm-level').textContent = S.level;
        $('arm-credits').textContent = S.credits.toLocaleString();
        $('arm-xpbar').style.width = pct + '%';
        $('arm-xptext').textContent = (S.xp - cur) + ' / ' + (next - cur) + ' XP';

        // challenges
        const cw = $('arm-challenges'); cw.innerHTML = '';
        for (const ch of S.challenges.list) {
            const def = HELA.CHALLENGE_POOL.find(c => c.id === ch.id); if (!def) continue;
            const done = ch.prog >= def.target;
            const row = document.createElement('div'); row.className = 'chal-row';
            row.innerHTML = '<div class="chal-main"><div class="chal-desc">' + def.desc + '</div>' +
                '<div class="chal-bar"><div class="chal-fill" style="width:' + (ch.prog / def.target * 100) + '%"></div></div>' +
                '<div class="chal-prog">' + ch.prog + ' / ' + def.target + '</div></div>' +
                '<button class="btn ' + (ch.claimed ? 'ghost' : 'primary') + '" ' + ((!done || ch.claimed) ? 'disabled' : '') + ' data-claim="' + ch.id + '">' +
                (ch.claimed ? 'CLAIMED' : '+' + def.reward) + '</button>';
            cw.appendChild(row);
        }
        cw.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => { const r = HELA.Save.claimChallenge(b.dataset.claim); if (r) this.toast('+' + r + ' CREDITS & XP'); this.renderArmory(); });

        // active ability (pick one)
        const abw = $('arm-abilities'); abw.innerHTML = '';
        for (const id of HELA.ABILITY_ORDER) {
            const a = HELA.ABILITIES[id]; const sel = S.ability === id;
            const card = document.createElement('div'); card.className = 'aug-card' + (sel ? ' equipped' : '');
            card.innerHTML = '<div class="aug-ic">' + a.icon + '</div><div class="aug-name">' + a.name + '</div><div class="aug-desc">' + a.desc + '</div>' +
                '<button class="btn ' + (sel ? 'primary' : 'ghost') + '" data-ability="' + id + '">' + (sel ? 'SELECTED' : 'SELECT') + '</button>';
            abw.appendChild(card);
        }
        abw.querySelectorAll('[data-ability]').forEach(b => b.onclick = () => { HELA.Save.setAbility(b.dataset.ability); this.renderArmory(); });

        // augments
        const aw = $('arm-augments'); aw.innerHTML = '';
        $('arm-slots').textContent = S.augmentsEquipped.length + ' / ' + HELA.AUGMENT_SLOTS;
        for (const id in HELA.AUGMENTS) {
            const a = HELA.AUGMENTS[id]; const owned = S.augmentsOwned.indexOf(id) >= 0; const equipped = S.augmentsEquipped.indexOf(id) >= 0;
            const card = document.createElement('div'); card.className = 'aug-card' + (equipped ? ' equipped' : '') + (owned ? '' : ' locked');
            let btn;
            if (!owned) btn = '<button class="btn ghost" ' + (S.credits < a.cost ? 'disabled' : '') + ' data-buy="' + id + '">BUY ' + a.cost + '</button>';
            else btn = '<button class="btn ' + (equipped ? 'primary' : 'ghost') + '" data-equip="' + id + '">' + (equipped ? 'EQUIPPED' : 'EQUIP') + '</button>';
            card.innerHTML = '<div class="aug-ic">' + a.icon + '</div><div class="aug-name">' + a.name + '</div><div class="aug-desc">' + a.desc + '</div>' + btn;
            aw.appendChild(card);
        }
        aw.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { if (HELA.Save.buyAugment(b.dataset.buy)) this.toast('AUGMENT ACQUIRED'); else this.toast('NOT ENOUGH CREDITS'); this.renderArmory(); });
        aw.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => { HELA.Save.toggleEquip(b.dataset.equip); this.renderArmory(); });
    },

    // ---- award XP/credits + track challenges at mission end ----
    awardRun(stats, completed) {
        const mult = HELA.Save.equippedEffects().rewardMult || 1;
        const baseXp = stats.kills * 8 + (stats.wave || 0) * 20 + (completed ? 250 : 60);
        const baseCr = Math.round(stats.score / 12) + (completed ? 150 : 30);
        HELA.Save.addXp(Math.round(baseXp * mult));
        HELA.Save.addCredits(Math.round(baseCr * mult));
        HELA.Save.trackBest('bestrun', stats.score);
        if (completed) HELA.Save.track('missions', 1);
        this.toast('+' + Math.round(baseXp * mult) + ' XP · +' + Math.round(baseCr * mult) + ' CREDITS');
    },

    showBrief(levelId) {
        const lv = HELA.LEVELS.find(l => l.id === levelId);
        this._pendingLevel = levelId;
        const $ = (id) => document.getElementById(id);
        $('brief-no').textContent = 'MISSION 0' + lv.id;
        $('brief-name').textContent = lv.name;
        $('brief-jp').textContent = lv.jp + ' — ' + lv.codename;
        $('brief-text').textContent = lv.brief;
        $('brief-obj').textContent = this.objectiveText(lv);
        this.show('brief');
    },

    beginLevel(levelId) {
        this.show('playing');
        HELA.Game.applyCodes(this.activeCodes);
        HELA.Game.startLevel(levelId);
    },
    nextLevel() {
        const cur = HELA.Game.currentLevelId;
        const next = HELA.LEVELS.find(l => l.id === cur + 1);
        HELA.Game.stop();
        if (next) this.showBrief(next.id);
        else { this.show('credits'); }
    },

    // ---- callbacks from the engine ----
    onLevelComplete(stats) {
        const isRandom = (typeof HELA.Game.currentLevelId !== 'number');
        if (!isRandom) { HELA.Save.recordComplete(HELA.Game.currentLevelId, stats.score, stats.kills); this.refreshContinueButton(); }
        this.awardRun(stats, true);
        const $ = (id) => document.getElementById(id);
        const hasNext = !isRandom && !!HELA.LEVELS.find(l => l.id === HELA.Game.currentLevelId + 1);
        $('c-title').textContent = 'MISSION CLEARED';
        $('c-stats').innerHTML = 'SCORE <b>' + stats.score.toLocaleString() + '</b> &nbsp; • &nbsp; KILLS <b>' + stats.kills + '</b> &nbsp; • &nbsp; WAVE <b>' + stats.wave + '</b>';
        $('c-next').style.display = hasNext ? 'inline-block' : 'none';
        this.show('complete');
    },
    onGameOver(stats) {
        this.awardRun(stats, false);
        const $ = (id) => document.getElementById(id);
        $('go-stats').innerHTML = 'MISSION 0' + HELA.Game.currentLevelId + ' &nbsp; • &nbsp; SCORE <b>' + stats.score.toLocaleString() + '</b> &nbsp; • &nbsp; KILLS <b>' + stats.kills + '</b>';
        this.show('gameover');
    },
    onPause(p) { this.show(p ? 'pause' : 'playing'); },

    // ---- settings ----
    bindSettings() {
        const s = HELA.Settings;
        const bindRange = (id, key, fmt) => {
            const r = document.getElementById(id), lbl = document.getElementById(id + '-val');
            r.value = s.get(key); if (lbl) lbl.textContent = fmt ? fmt(s.get(key)) : s.get(key);
            r.oninput = () => { const v = parseFloat(r.value); s.set(key, v); if (lbl) lbl.textContent = fmt ? fmt(v) : v; };
        };
        const bindToggle = (id, key) => {
            const c = document.getElementById(id); c.checked = s.get(key);
            c.onchange = () => s.set(key, c.checked);
        };
        bindRange('set-master', 'master', v => Math.round(v * 100) + '%');
        bindRange('set-sfx', 'sfx', v => Math.round(v * 100) + '%');
        bindRange('set-sens', 'sensitivity', v => v.toFixed(2) + '×');
        bindToggle('set-invert', 'invertY');
        bindToggle('set-bloom', 'bloom');
        bindToggle('set-ssao', 'ssao');
        bindToggle('set-grain', 'grain');
        bindToggle('set-shake', 'shake');
        document.getElementById('set-reset').onclick = () => {
            HELA.Settings.current = Object.assign({}, HELA.Settings.defaults);
            HELA.Storage.writeSettings(HELA.Settings.current);
            this.bindSettings();
            if (HELA.Game.onSettingsChanged) HELA.Game.onSettingsChanged();
            this.toast('SETTINGS RESET');
        };
        document.getElementById('set-wipe').onclick = () => {
            if (confirm('Erase all saved progress?')) {
                localStorage.removeItem(HELA.Storage.SAVE_KEY);
                HELA.Save.init(); this.refreshContinueButton(); this.toast('SAVE DATA ERASED');
            }
        };
    },

    // ---- secret codes ----
    bindCodes() {
        const input = document.getElementById('code-input');
        const submit = () => this.submitCode(input.value);
        document.getElementById('code-submit').onclick = submit;
        input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
        const list = document.getElementById('codes-active');
        this._codesList = list;
    },
    submitCode(raw) {
        const code = (raw || '').trim().toUpperCase();
        document.getElementById('code-input').value = '';
        const def = HELA.CODES[code];
        if (!def) { this.toast('INVALID CODE: ' + (code || '—')); return; }
        this.applyCode(def.effect);
        this.toast(def.label);
    },
    applyCode(effect) {
        if (effect === 'unlockall') { this.activeCodes.unlockall = true; HELA.Save.data.unlocked = HELA.LEVELS.length; HELA.Save.persist(); this.refreshContinueButton(); }
        else if (effect === 'credits') { this.show('credits'); return; }
        else { this.activeCodes[effect] = true; }
        if (HELA.Game && HELA.Game.applyCodes) HELA.Game.applyCodes(this.activeCodes);
        this.renderActiveCodes();
    },
    renderActiveCodes() {
        if (!this._codesList) return;
        const names = { god: 'GODMODE', infammo: 'INFINITE AMMO', bighead: 'BIG-HEAD', lowgrav: 'LOW GRAVITY', haste: 'HASTE', giveall: 'FULL ARSENAL', unlockall: 'ALL MISSIONS' };
        const active = Object.keys(this.activeCodes).filter(k => this.activeCodes[k]);
        this._codesList.innerHTML = active.length ? active.map(k => '<span class="code-chip">' + (names[k] || k) + '</span>').join('') : '<span class="code-none">No active cheats</span>';
    },

    // ---- global keys (konami + esc/back) ----
    bindGlobalKeys() {
        document.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            // konami
            this.konamiBuf.push(k); if (this.konamiBuf.length > HELA.KONAMI.length) this.konamiBuf.shift();
            if (this.konamiBuf.join(',') === HELA.KONAMI.join(',')) {
                this.applyCode('giveall'); this.applyCode('god'); this.toast('▲▲▼▼◀▶◀▶ B A — OPERATIVE OVERDRIVE');
            }
        });
    },

    // ---- toast ----
    toast(msg, ms) {
        const t = this.el.toast;
        t.textContent = msg; t.classList.add('show');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => t.classList.remove('show'), ms || 2400);
    },
};
