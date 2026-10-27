import type { TRuntimeStore } from '../store/types/t_runtime_store';
import { firstTimeIn } from './first_time_in';

/**
 * Says, once for each place, when a time given in seconds is so long it was probably written in
 * milliseconds: the engine counted those once, and `rumble({ duration: 200 })` reads as two hundred
 * seconds now, not a fifth of one. The value is used as given.
 *
 * @param where What took it, named as a person writes it: `'rumble duration'`.
 * @param seconds The time given.
 * @param longest The longest it would sensibly be, in seconds.
 * @param game The game it was given in, so each game says it once; left out, once for the page.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const saysMilliseconds = (where: string, seconds: number, longest: number, game?: TRuntimeStore): void => {
    // Once for each place, so a value asked for every frame is said once.
    if (!(seconds > longest) || !firstTimeIn(game, `milliseconds: ${where}`)) return;
    console.warn(`[NacatamalOn] A ${where} of ${seconds} seconds. Times are in seconds: did you mean ${seconds / 1000}?`);
};
