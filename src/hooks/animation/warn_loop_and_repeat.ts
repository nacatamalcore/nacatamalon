import { firstTimeIn } from '../../utils/first_time_in';

/**
 * Says, once a page, that something asked both to go round for ever and for a number of times.
 *
 * `repeat` decides, so `loop` would otherwise be ignored without a word.
 *
 * @param who - What was called, as it starts the message.
 * @param what - What said both: `the clip 'walk'`.
 * @param options - Where the two are read from.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const warnLoopAndRepeat = (who: string, what: string, options: { loop?: boolean; repeat?: number }): void => {
    if (options.loop === undefined || options.repeat === undefined) return;
    if (!firstTimeIn(null, `${who} ${what} loop and repeat`)) return;
    console.warn(`[NacatamalOn] ${who}: ${what} has both loop and repeat, and repeat decides. Keep the one you mean.`);
};
