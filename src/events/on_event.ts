import { connectObjectEvent } from './object_events';
import type { TBox } from '../box';
import type { TObjectEventHandler } from './object_events';

/**
 * Listens to an event an object tells its parent: a button that was pressed, an enemy that died, a
 * room whose coins are all gone.
 *
 * The object's behaviours send it with `useEvent`, and it travels **up** from whatever sent it to the
 * first object that listens, so listening on a whole thing hears what any part of it says. That is how
 * a game hears a pack: listen on what `createPack` gave back (or pass `on` to `createPack`, which does
 * this), even though the pack's content is only built when the pack lands.
 *
 * - It can be called at any moment, and it adds: two handlers on one event both run.
 * - It stops by itself when the object goes away. The function it returns stops it earlier.
 * - For something the whole game should hear, from anywhere, a signal (`createGameSignal`) is the tool.
 *   This is for one object telling the one above it.
 *
 * @param object What to listen on: the event reaches it from itself or from anything inside it.
 * @param name The event, as the behaviour sending it named it.
 * @param handler What to do, given what came with the event and the object that sent it.
 * @returns A function that stops listening.
 *
 * @example
 * ```ts
 * declare const enemy: TGameObject;
 * let score = 0;
 *
 * onEvent<{ points: number }>(enemy, 'died', ({ points }) => {
 *     score += points;
 * });
 * ```
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const onEvent = <T = unknown>(object: TBox, name: string, handler: TObjectEventHandler<T>): (() => void) =>
    connectObjectEvent(object, name, handler);
