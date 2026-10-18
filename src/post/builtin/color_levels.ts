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
    // Two bits a channel: 64 colours in all.
    masterSystem: 4,
    // Three bits a channel, like the Mega Drive: 512 colours.
    pcEngine: 8,
    genesis: 8,
    // Four bits a channel: 4096 colours.
    gameGear: 16,
    snes: 32,
    // Fifteen-bit colour, five bits a channel.
    saturn: 32,
    ps1: 32,
    // Its usual 16-bit frame keeps five bits a channel.
    n64: 32,
    // Its usual 16-bit frame (565) keeps five bits for red and blue, six for green: five is the
    // closer single number.
    dreamcast: 32,
    // Six bits a channel, the frame mode it switched to whenever it needed alpha, and dithered.
    gameCube: 64,
    poster: 4,
} as const;
