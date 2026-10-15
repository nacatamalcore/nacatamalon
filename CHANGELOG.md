# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased (0.2.3)

### Added

- `useLateUpdate(callback)`: runs once per frame after every `useUpdate` of the scene, tweens and
  physics included, with the same `delta` and `time`. For what reads where something ended up rather
  than moving it: a camera that follows the player, a marker over an enemy, a shadow under a sprite.
  In `useUpdate` the scene runs before the objects inside it, so a camera there read the player one
  step behind, and the character shook against the screen whenever its speed changed. It stops while
  the scene is paused, starts on the frame after its object is spawned, and is skipped by an object
  destroyed during the updates (and by everything beneath it).
