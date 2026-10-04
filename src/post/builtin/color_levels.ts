/**
 * How many steps a channel had on the machines this engine is aimed at.
 *
 * A Mega Drive wrote three bits a channel, so eight steps. A SNES and a PlayStation wrote five, so
 * thirty-two. `poster` is not a machine: it is the number that makes the effect obvious when you are
 * looking at what it does rather than trying to be a console.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const COLOR_LEVELS = {
    genesis: 8,
    snes: 32,
    ps1: 32,
    poster: 4,
} as const;
