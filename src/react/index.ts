/**
 * `nacatamalon/react`: a game inside a React page, with the HUD and the menus written in React.
 *
 * The engine knows nothing about React and this door is the whole bridge: `<Game>` puts a game in
 * the page and anything inside it is drawn over the canvas; `useGame`, `useSignal` and
 * `useGameStore` let those components reach the game. `react` is an optional peer dependency, so a
 * game that never imports this door never needs it.
 *
 * Two rules live on either side of the canvas and do not mix. A scene's body runs **once** and
 * reacts through hooks like `useStore` and `useUpdate`; a component **renders again** whenever what
 * it reads changes. The engine's hooks belong in scenes and these belong in components.
 *
 * **Browser only, for now.** The native runtime shows what the engine draws and nothing of the page
 * around it, so a React HUD is not on screen in a game exported to desktop. `<Game>` says so in the
 * console when it finds itself there. A game meant to ship natively builds its HUD with the engine.
 *
 * @module
 */
export { Game } from './game';
export type { TGameProps } from './game';
export { useGame } from './use_game';
export { useSignal } from './use_signal';
export { useGameStore } from './use_game_store';
