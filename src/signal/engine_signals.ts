import { createGameSignal } from './create_game_signal';

/**
 * What a scene pause signal carries: which scene it was.
 *
 * Signals belong to the page, so with two games running at once both are heard here. The name is
 * what tells them apart when that happens.
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScenePauseEvent = { scene: string };

/**
 * What a game pause signal carries: who asked for it. `pause()` with no reason says `'game'`.
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGamePauseEvent = { reason: string };

/**
 * A scene has been paused: it stops updating but keeps being drawn.
 *
 * The engine does not touch sound, timers or anything else when this happens, because what should
 * stop is the game's decision: the music of a level usually carries on under its pause menu, its
 * footsteps do not. This is how a game hears about it.
 *
 * Fired only when it really changes: pausing a scene that is already paused says nothing.
 *
 * @example
 * ```ts
 * declare const steps: TSoundHandle;
 *
 * useSignal(scenePaused, ({ scene }) => { if (scene === 'Level') steps.pause(); });
 * useSignal(sceneResumed, ({ scene }) => { if (scene === 'Level') steps.resume(); });
 * ```
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const scenePaused = createGameSignal<TScenePauseEvent>();

/**
 * A scene that was paused is running again. The other half of {@link scenePaused}.
 *
 * A scene that is stopped rather than resumed says nothing: it is gone, and everything of it left
 * with it.
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sceneResumed = createGameSignal<TScenePauseEvent>();

/**
 * The whole game has been paused: no scene updates at all. Fired for the **first** hold only, so a
 * pause menu opening over a game already paused by losing focus does not say it twice.
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gamePaused = createGameSignal<TGamePauseEvent>();

/**
 * The game is running again, once the **last** hold has been let go: while anything still holds it
 * paused, it is still paused.
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gameResumed = createGameSignal<TGamePauseEvent>();
