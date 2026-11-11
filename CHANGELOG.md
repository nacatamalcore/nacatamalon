# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- **Matcaps, `matcap(texture, { tint })`.** A material recipe that colours a model with a picture of
  a ball already lit, its colour, shadow and shine, read by which way each part faces the camera: no
  lamp needed nor read, the light always from the same side of the screen, the soft look of a clay
  model or a product shot. Only options of a material (`lighting: unlitLighting()` and a
  `reflection` of the picture at full, `metal: 1`), so the tint and the model's own picture multiply
  it, its `alpha` fades it as any surface's, and steps go on top. A scene document keeps it when its
  picture is a file.
- **`paintMatcap({ base, shade, shine, gloss, from, size })`** in `nacatamalon/pixels` paints one: a
  ball lit by one light, where it comes from as the camera sees it, with a highlight as glossy as
  asked. A matcap from a 3D program or a picture loads just the same.
- **The ground's bounce, `groundBounce({ color, reach, amount, groundY })`.** A material step that
  brings the ground's colour up onto what stands on it: more the closer a part is to the ground and
  the more it looks down, none `reach` above the ground nor on a face looking up. It goes on a matcap as well as on the engine's light;
  its numbers are uniforms (`groundBounceAmount`…), and a scene document keeps it.

### Changed

- **What a metal reflects no longer covers a see-through surface.** A reflection made a see-through
  surface more solid where it reflected, so a glass shows its edges; with `metal` that part now
  stays as see-through as the surface, since what it reflects is in the surface's own colour. Only a
  material with both `metal` and `alpha` under 1 looks different; the metal recipes are solid.

## 0.8.5 — 2026-11-11

### Added

- **Light at every pixel, `perPixel`.** `perPixel: true` on `createMaterial({ shader: 'mesh3d' })`,
  `createMesh`, `createMeshInstances` or `createModel` works a model's light out at every pixel
  rather than at its corners, so a shine is a round spot that slides across the surface however few
  triangles it has: the glossy plastic and chrome of the era's computer graphics. It can change while
  the game runs (`mesh.material.perPixel = true`), and a shader of your own receives it in
  `ctx.light` and `ctx.shine` unchanged, so `toonLighting()` and `rim()` take it too.
- **Reflection on a material.** `reflection` on the same four lays a picture of the surroundings over
  the surface, read round from the way each pixel faces: the picture alone, or `{ texture, front,
  edge, metal }`, how much it reflects facing the camera (default `0.04`, plastic; `0.9` is chrome),
  where it turns away (default `1`), and how much what it reflects takes the surface's colour
  (default `0`; `1` is gold). It goes with toon and rim, the numbers are uniforms that change while it
  runs, and what is reflected makes a see-through surface show its edges. A scene document keeps it.
- **Material recipes.** Thirteen functions that give back a model material's options, for
  `createMaterial` or to open with a spread: `plastic()`, `ceramic()`, `rubber()`, `carPaint()`,
  `pearl()`, `glass()`, `neon()`, `hologram()`, `chrome()`, `gold()`, `copper()`, `brass()` and
  `anodized({ tint })`, each taking `{ tint, environment }`.
- **Mirrors, `useMirror`.** `reflection: useMirror({ front, edge, metal, blur, scale })` on any flat
  model, a polished floor, a mirror on a wall, a lake: the scene drawn again from its 3D camera
  reflected across the model's plane, read where each pixel is on the screen, more of it where it is
  seen low. The plane is read from where the model ends up each frame, so it can move, and what is
  behind it is never in it.
- **The real surroundings, `useEnvironment`.** `useEnvironment({ around, height, live, size })` draws
  the scene round a model as the six faces of a cube, for chrome that reflects the room it is really
  in, leaving the model out of its own surroundings and following it as it moves. Captured once when
  the scene has loaded (`capture()` draws it again) or every frame with `live: true`. A material reads
  it as `read: 'cube'`; a shader with `envCubeUv(ctx)`, the composer with `composerCubeUv()`.
- **Normal maps.** `normalMap: texture` or `{ texture, strength }` on `createMaterial`, `createMesh`
  and `createModel` bends the surface's facing at every pixel before it is lit (`normalStrength` is
  its uniform); such a material is lit at every pixel unless it says `perPixel: false`. A scene
  document keeps it. `normalsFromHeight(pixels, { depth, wrap })` in `nacatamalon/pixels` makes one
  from a picture of heights, or from the texture itself.
- **A two-coloured ambient.** `useAmbientLight({ color, ground })`: `color` comes down from above
  and `ground` up from below, shared out by which way a surface faces. Without `ground` it is one
  colour, as before. A scene document keeps it on the ambient light.
- **Studio lighting in one line, `useStudio`.** A warm key light that casts, a cool fill panel, a
  back panel for a rim and a two-coloured ambient, and the studio painted for reflections; it gives
  back `{ ambient, key, fill, back, environment }` to change each.
- **Pictures to reflect.** `studioEnvironment({ top, horizon, ground, panels, panelColor, size })` in
  `nacatamalon/pixels` paints a photographer's studio as the round picture a reflection reads, and
  `sphereFromPanorama(pixels, { across, size })` makes a panorama or a photo into one.
- **Render styles.** `createGame({ style })` draws every scene in a style and `useRenderStyle(style)`
  one scene, giving back `{ style, set }` to change it while it runs. A style is plain data: how a
  material that does not say is drawn (`perPixel`, `affine`, `vertexSnap`), the screen effects after
  the scene's own (`post`), and the screen it brings (`width`, `height`, `pixelAspect`, `smooth`,
  `smoothScaling`), which the game can still set over it. `RENDER.STYLES` has `nes`, `snes`,
  `genesis`, `gameBoy`, `gba`, `ps1`, `saturn`, `n64`, `dreamcast` and `cgi`. A material that says
  `false` keeps out of its style.
- **`smoothScaling`** in `createGame` and in a style: how the screen is scaled up to the page, apart
  from `smooth`, which is for the pictures. Left out, it follows `smooth`, as before.
- **`useGame().setResolution(width, height)`** changes the game's resolution while it runs; a HUD
  placed in pixels is placed again in `onResized`.
- **`width` and `height` in `createGame` are optional.** Left out, they come from the style, and with
  none they are 800 × 600. A game that gives either one gives the resolution, and the one it leaves
  out is the default's, as before.

### Fixed

- **`envUv` is right from wherever the camera looks.** It worked the reflection out in the world's
  axes, so it was only right with the camera looking down -z; turned round, the picture folded in
  the middle of the chrome. With the camera looking down -z it gives what it gave before.
- **`setSmooth` changes how the screen is scaled up on the page too**, which stayed as it was when
  the game started.

### Changed

- **`vertexSnap`, `affine` and `perPixel` are written to a document when the material says them,
  `false` included.** Left out, a material takes its scene's style; before, only `true` was written.
- **A `fragmentGlsl` of your own that declares `meshLight`, `sampleLight` or `litBy` no longer
  compiles**: model materials now have them, for light at every pixel, as their WGSL already did.
