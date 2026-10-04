import type { TGameHandle } from '../handle/t_game_handle';

/**
 * What a running game tells the page around it, and what each event carries.
 *
 * - `ready`: the renderer is up and the first scene has run. Carries the game's handle, which is
 *   how anything outside a scene (a React HUD, a debug panel) gets to talk to the game.
 * - `error`: the game could not start, most often because the browser has neither WebGPU nor
 *   WebGL2, or a scene's update threw once it was running. Carries why, so the page can say so
 *   instead of showing an empty box. A game that throws goes on running, so this is heard once,
 *   for the first error.
 * - `destroy`: the game has been taken down and its canvas removed.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameEvents = {
    ready: TGameHandle;
    error: Error;
    destroy: void;
};

/**
 * The name of one of the game's events.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameEventName = keyof TGameEvents;
