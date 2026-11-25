/**
 * The air through the vocal folds over one vibration, `phase` from `0` to `1`: it opens slowly,
 * shuts fast and stays shut. The fast shut is what gives a voice its buzz.
 *
 * @internal
 */
export const glottalFlow = (phase: number): number => {
    if (phase < 0.4) return 0.5 * (1 - Math.cos((Math.PI * phase) / 0.4));
    if (phase < 0.56) return Math.cos((Math.PI * (phase - 0.4)) / 0.32);
    return 0;
};
