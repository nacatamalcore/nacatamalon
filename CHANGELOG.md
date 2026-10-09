# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased (0.1.9)

### Added

- **`nacatamalon/react`**, a new door for a game inside a React page, with the HUD and menus written
  as React components drawn over the canvas. `<Game options scenes>` puts the game in the page and
  draws its children over it, full screen included; `useGameStore(store, selector)` reads a store and
  renders again when the selected value changes; `useGame()` hands a component the game's handle
  (`null` while it starts); `useSignal(signal, handler)` listens from a component. It works under
  `StrictMode`. `react` (18 or later) is an optional peer dependency: a game that never imports this
  door never needs it. Type `TGameProps`.
- `useGameStore` warns once when a selector picks an object out of the state (it never looks
  changed, because the state is changed in place) or builds a new one on every read.
- **Browser only for now**: the native runtime shows only what the engine draws, so a React HUD is not
  on screen in a desktop build. `<Game>` says so in the console when it runs there.

### Changed

- `useGame`, `useSignal` and `useStore` called outside a scene now say, in their error, what to
  import instead from a React component.

## 0.1.8 — 2026-10-08

### Added

- **Mouse capture.** `usePointer()` gains `lock({ raw? })`, `unlock()` and `isLocked()`, to capture
  the mouse for a first-person camera: the cursor hides and the mouse moves without stopping at the
  game's edge. `lock()` answers `false` instead of throwing when the browser refuses (it must be
  called from a click or a key press). Esc gives the mouse back, and `isLocked()` follows it.
- **`movementX` and `movementY`** on every pointer event: how far the mouse moved, in pixels of the
  page, added up over the frame. What a mouse-look camera reads, captured or not. Type
  `TPointerLockOptions`.
- **`drawText(pixels, text, x, y, options?)`** writes text into a picture painted in code: a sign, a
  number on a door. Laid out exactly as `createText`, with `fontSize`, `align`, spacing, `color` and an
  `anchor` to centre it. With no font it uses the built-in one and needs no game and no loading; a
  bitmap font is copied pixel for pixel and a vector font is drawn from its outlines (`smooth: false`
  for hard edges). Type `TDrawTextOptions`.
- **`fillEllipse` and `drawEllipse`**, beside `fillCircle` and `drawCircle`, with the same stepped
  edge; equal radii give exactly the circle.
- **Additive sprites.** `createSprite({ blend: 'additive' })` adds its colour to what is behind
  instead of covering it, for halos, flashes and beams of light, on WebGPU and WebGL2, with or without
  a material. Changeable any frame, and kept in scene documents.
- **Particle effects written in code.** `createParticles({ effect })` and `createParticles3d` also take
  the effect itself, with the fields of a `.particles` file, so it can depend on the game. Ready at
  once; colours can be `TColor` values (`lerpColor`), and `texture` a texture made in code. The same
  object handed to several emitters is one shared effect. A scene saved with one leaves that emitter
  out, with a warning, as there is no file to name. Types `TParticlesEffect`, `TParticlesEffect2d`,
  `TParticlesEffect3d`, `TParticleColorStopInput`.
- **`visible` on models.** What `createModel` returns has `visible`, which hides or shows every piece,
  including pieces whose file has not arrived yet.

### Changed

- A bitmap font's image is downloaded once and kept in memory as well as on the card, so `drawText`
  can copy its letters. Only PNG images can be read that way; others still draw as text.
