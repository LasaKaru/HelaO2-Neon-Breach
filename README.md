# HELA 02 • NEON BREACH

A **low-poly third-person shooter** that runs entirely in the browser, built on **Babylon.js** — a flagship web-tech title from **HelaO2 Studio** (**HelaO2 (Pvt) Limited**). It opens on a bright, clear **forest survival** map and escalates into the neon city.

Open `index.html` in any modern browser — no build step, no server required.

```
index.html      → studio splash, landing page, menus, HUD markup
styles.css      → all UI + HUD styling
js/data.js      → weapons, enemy archetypes, levels, secret codes (config)
js/ui.js        → screen flow, settings, save/continue, code console
js/game.js      → Babylon engine, worlds, weapons, AI, objectives, FX
```

## Front end / shell
- **HelaO2 Studio splash** → animated **landing web page** → **main menu**
- **Main menu**: New Protocol · **Continue** (saved progress) · Mission Select · Settings · Secret Codes · Credits
- **Mission brief** screen before each deployment; **pause**, **mission-complete** and **game-over** screens
- **Settings** (persisted to `localStorage`): master & SFX volume, mouse sensitivity, invert-Y, and graphics toggles (bloom / SSAO / grain / screen-shake)
- **Save / Continue**: unlocked missions, best score and completion are stored locally

## Missions (5 levels, distinct objectives)
| # | Mission | Theme | Objective |
|---|---------|-------|-----------|
| 01 | VERDANT | Bright forest | Survive 8 waves of the infected |
| 02 | NEON BREACH | Neon city | Survive 3 escalating waves |
| 03 | DATA HEIST | Neon city | Data-Spike every security terminal |
| 04 | CRIMSON GARRISON | Neon city | Eliminate 22 hostiles |
| 05 | CRIMSON SPIRE | Neon city | Destroy the OMEGA war-mech (boss) |

Each level is its own themed world — its own sky/fog, ground, props and enemy pool.

### VERDANT — the forest survival map
A **large open playground** (big bounds, ~400 m ground) rendered **bright and clear** in daylight:
low-poly **cone trees** with wind-swayed foliage, a dense **grass field** (thousands of GPU thin-instances),
scattered **rocks**, **dirt roads**, drifting pollen motes, and a soft sun — with **human-like zombie**
enemies (walkers, fast runners, heavy lurkers) that melee you. The previous "dusty/blurry" haze has been
dialled right back across the whole game (much lighter fog, minimal chromatic aberration & grain, brighter
exposure, FXAA) so the action reads clearly.

## Combat & systems
- **4 weapons** with independent ammo, switchable with `1-4` / `Q`:
  Spike-Rifle (auto), Wasp-SMG (auto), Breacher (8-pellet shotgun), Sidearm (infinite reserve)
- **Enemy roster** with floating health bars:
  Scout & Drone (flying), **humanoid Soldier & Elite** (animated bipeds with rifles), and the **OMEGA boss** with a dedicated health bar and fan-fire attack
- **Data-Spike / Tampering** USP — hack terminals (`E`) to drop the energy-shield dome and compromise hostiles in radius
- **Combo / score multiplier** (up to ×8), ammo / integrity / shield **pickups**
- **Procedural WebAudio SFX**, spatially panned — fire, hit, kill, reload, hack, damage, pickup, dash, wave, boss
- **Game feel** — screen shake, hit markers, floating damage numbers, homing enemy bolts, muzzle flashes, sparks/debris, pink/cyan emissive ground rails
- **Tactical map** (`TAB`), live minimap, objective tracker HUD

## Secret codes
Enter in the **Secret Codes** console (or some in-game): `GODMODE`, `FULLMETAL` (infinite ammo),
`GIVEALL` (full arsenal), `BIGHEAD`, `LOWGRAV`, `HASTE`, `UNLOCKALL`, `HELA02` (credits) —
plus the classic **▲▲▼▼◀▶◀▶ B A** Konami easter egg on any screen.

## The "hazy" look
Exponential-squared volumetric fog · bloom + GlowLayer · SSAO (auto-skips on weak GPUs) ·
chromatic aberration · film grain · vignette · tone mapping, over flat-shaded geometry with neon point lights.

## Controls
| Input | Action | | Input | Action |
|-------|--------|-|-------|--------|
| `WASD` | Move | | `1-4` / `Q` | Switch weapon |
| `Mouse` | Aim | | `E` | Data-Spike / Tamper |
| `Shift` | Sprint | | `TAB` | Tactical map |
| `Space` | Dash | | `P` / `Esc` | Pause |
| `LMB` | Fire | | `M` | Mute |
| `R` | Reload | | `V` | First / third-person |

The game plays in **first-person** by default (viewmodel weapon in hand, like the reference); press `V` for the over-the-shoulder third-person camera at any time.

## Tech notes
Plain `<script>` modules on a global `HELA` namespace (works over `file://`, no bundler).
Designed as the client vertical-slice for the larger authoritative-server build
(WebSockets + client prediction + reconciliation) described in the project brief.
