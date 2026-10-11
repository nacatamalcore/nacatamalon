# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased (0.2.1)

### Added

- `useReady(callback)`: runs once everything being built with it exists, before the first frame. An
  object is built before the ones inside it, so a body, or a behaviour on the root of a scene laid
  out as a document, could not find its children with `findObject`: inside `useReady` it does. For
  something spawned later, it runs before the spawner's call returns. It runs with its object as the
  one being built, so hooks inside it belong to that object.

## 0.2.0 — 2026-10-11

### Added

- `TEditorHandle.setCanvasFit(fit)`: fits the game's canvas another way while a host asks, and
  `setCanvasFit(null)` puts the game's own `scaling`, `keep` and `pixelRatio` back. What an editor
  does to lay a level out through the whole of its window (`{ keep: 'none', pixelRatio: 'device' }`)
  while the game itself keeps its resolution. Type `TCanvasFit`, on `nacatamalon/authoring`.
