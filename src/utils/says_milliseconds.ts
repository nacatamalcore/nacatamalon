/**
 * The places already told about, so a value asked for every frame is said once.
 */
const told = new Set<string>();

/**
 * Says, once for each place, when a time given in seconds is so long it was probably written in
 * milliseconds: the engine counted those once, and `rumble({ duration: 200 })` reads as two hundred
 * seconds now, not a fifth of one. The value is used as given.
 *
 * @param where What took it, named as a person writes it: `'rumble duration'`.
 * @param seconds The time given.
 * @param longest The longest it would sensibly be, in seconds.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const saysMilliseconds = (where: string, seconds: number, longest: number): void => {
    if (!(seconds > longest) || told.has(where)) return;
    told.add(where);
    console.warn(`[NacatamalOn] A ${where} of ${seconds} seconds. Times are in seconds: did you mean ${seconds / 1000}?`);
};
