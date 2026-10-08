# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

To be released as 0.1.8.

### Added

- **Mouse capture.** `usePointer()` gains `lock({ raw? })`, `unlock()` and `isLocked()`, to capture
  the mouse for a first-person camera: the cursor hides and the mouse moves without stopping at the
  game's edge. `lock()` answers `false` instead of throwing when the browser refuses (it must be
  called from a click or a key press). Esc gives the mouse back, and `isLocked()` follows it.
- **`movementX` and `movementY`** on every pointer event: how far the mouse moved, in pixels of the
  page, added up over the frame. What a mouse-look camera reads, captured or not. Type
  `TPointerLockOptions`.

## 0.1.7 — 2026-10-08

0.1.6 was never published, so this covers everything since 0.1.5.

### Breaking

- **`useLoadFont` is now `useLoadBitmapFont`**: the loader for bitmap fonts (an image of the letters
  plus a JSON of where each one is). Its types are renamed with it: `TUseLoadBitmapFontOptions`,
  `TBitmapFont`, `TBitmapFontMeta`, `TBitmapFontGlyph`. The name `useLoadFont` now loads vector fonts
  (see below), so code calling it with `{ json, atlas }` must switch to `useLoadBitmapFont`.
- **In scene documents and packs, a bitmap font asset is `"type": "bitmapFont"`.** A file saved with
  `{ "type": "font", "json": ..., "atlas": ... }` loses that font until its type is changed:
  `"font"` now means a vector font.

### Added

- **Vector fonts.** `useLoadFont({ src, key?, size?, chars? })` loads a `.ttf` or `.woff` and
  `createText` draws it sharp at any `fontSize`, and scaled, turned or through a zoomed camera. Each
  letter is kept as a multi-channel distance field, drawn the first time it is shown, on WebGPU and
  WebGL2 alike, with the font's own kerning. Accents, ñ and any character the font has work with no
  list to keep in sync. A material on such a text works as on a sprite. Read in plain TypeScript, so
  it runs anywhere the engine does.
  - On a vector font, `style.fontSize` is the size of the font as in CSS (one em, default 16); the
    line is as tall as the font says.
  - `size` (default 48) is how finely letters are kept; raise it for very thin strokes. `chars` draws
    letters while loading instead of the first time they are shown.
  - Not read yet, and reported as such: `.otf` with cubic (CFF) outlines, `.woff2`, `.ttc`, and
    scripts whose letters change shape by their neighbours.
- **A font by its key.** `createText({ text, font: 'title' })` uses the font loaded under that key, by
  this scene or an earlier one, so a loading scene can load every font once and the rest of the game
  name them. A key nothing was loaded under throws, naming it.
- **`"type": "font"` in scene documents and packs**: `{ "type": "font", "key", "src", "size"? }`.
- Types `TFont`, `TFontMeta` and `TUseLoadFontOptions`.
