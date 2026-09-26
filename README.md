# F1 Rules Explorer

An interactive, explodable 3D Formula 1 car (three.js) that explains the 2026 FIA
Formula 1 Technical Regulations part by part. The car is procedurally modelled and
deliberately generic: no team, no logos.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## What you can do

- **Hover** any part to highlight it, with a callout explaining its rules. **Click** to pin the callout.
- **Disassemble**: use presets (remove bodywork, remove wheels, bare chassis, power unit, exploded) or the explode slider.
- **Layers**: toggle bodywork, wings & floor, wheels, brakes & suspension, chassis, power unit, cockpit and FIA electronics.
- **Rule colours**: tint every part by who designs it (FIA single supplier, defined spec, PU, transferable, open source, team-designed).
- **X-ray** the bodywork and survival cell to see the fuel cell, battery and engine in place.
- **Dimensions**: overlay the key regulated measurements.
- **Active aero**: switch Corner Mode / Straight Mode to animate the 2026 movable wings.
- Change the **tyre compound**.

## Code map

| Path | Purpose |
| --- | --- |
| `src/car/geometry.js` | Loft / aerofoil / strut / lathe helpers used to build smooth surfaces |
| `src/car/materials.js` | Procedural carbon weave, heat-tint, foil and plank textures, plus the position-based livery shader |
| `src/car/body.js`, `aero.js`, `corners.js`, `internals.js`, `cockpit.js` | Car sub-assemblies |
| `src/car/registry.js` | Part registry (explode offsets, layers, mirroring) |
| `src/data/parts.js` | Rules content, component categories and layers |
| `src/main.js` | Scene, post-processing, picking, animation |
| `src/ui/` | Callout card with leader line, and the top / bottom toolbars |
| `src/dimensions.js` | Dimension overlay |

## Sources

FIA 2026 Formula 1 Regulations: Section C [Technical] (Issue 20, 5 Aug 2026) and
Section B [Sporting] (Issue 07, 25 Jun 2026). Component classes come from Article C17 /
Appendix C6. Background from FIA, formula1.com and Pirelli. This is a simplified explainer.
The regulations themselves are the binding text.
