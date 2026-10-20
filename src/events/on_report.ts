import { connectReport } from './reports';
import type { TBox } from '../box';
import type { TReportHandler } from './reports';

/**
 * Hears what a piece reports to whoever placed it: a pack's button pressed, a behaviour's box out of
 * lives. The piece sends it with `useReport`; it climbs from there to the first object that listens,
 * so listening on a whole copy hears any part of it.
 *
 * For pieces made of data, a pack or a behaviour, which cannot be handed a function. A component of
 * your own code takes a callback in its props instead (`useSpawn(Enemy)({ onDied })`); something the
 * whole game hears is a signal.
 *
 * Stops when the object goes away, and, called while something is being built, when that something
 * does. The function it returns stops it earlier.
 *
 * @param object What to listen on: the report reaches it from itself or from anything inside it.
 * @param name The report, as the piece sending it named it.
 * @param handler What to do, given what came with it and the object that sent it.
 * @returns A function that stops listening.
 *
 * @example
 * ```ts
 * declare const copy: TGameObject;
 *
 * onReport<{ label: string }>(copy, 'pressed', ({ label }) => {
 *     console.log(label);
 * });
 * ```
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const onReport = <T = unknown>(object: TBox, name: string, handler: TReportHandler<T>): (() => void) =>
    connectReport(object, name, handler);
