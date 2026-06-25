# HELA 02 • NEON BREACH

An atmospheric **low-poly third-person shooter** that runs entirely in the browser, built on **Babylon.js**. A flagship web-tech showcase for **HelaO2 Technologies**.

Open `index.html` in any modern browser — no build step, no server required.

## The look ("good hazy")
Flat-shaded low-poly geometry contrasted with a high-end modern lighting/post stack:

- **Volumetric haze** — exponential-squared fog (`FOGMODE_EXP2`) that breathes over time
- **Bloom + GlowLayer** — intense neon emissive on visors, signs, projectiles and terminals
- **SSAO** — ambient occlusion gives the simple geometry weight and depth (auto-skips on weak GPUs)
- **Chromatic aberration, film grain, vignette, tone mapping** for a moody cyberpunk grade

## Gameplay
- Fast, tactical low-poly combat against a hostile drone swarm
- **Data-Spike / Tampering** mechanic (the USP): hack security terminals with `E` to bypass the
  arena's energy-shield dome, weaken and compromise nearby hostiles, and drop ammo caches
- Third-person camera, dash, sprint, shield + integrity layers, live minimap and HUD

## Controls
| Input | Action |
|-------|--------|
| `WASD` | Move |
| `Mouse` | Aim |
| `Shift` | Sprint |
| `Space` | Dash |
| `LMB` | Fire |
| `R` | Reload |
| `E` | Data-Spike / Tamper terminal |
| `Esc` | Release pointer |

## Tech notes
- Single self-contained `index.html`; Babylon.js loaded from CDN
- HUD is a decoupled HTML/CSS overlay layered over the WebGL canvas (the recommended
  React-to-WebGL pattern, kept dependency-free here for a drop-in demo)
- Designed as the boilerplate/vertical-slice for a larger authoritative-server build
  (WebSockets + client prediction + server reconciliation) described in the project brief
