import type { TSongChip, TSongVoiceName } from './types/t_song';

/**
 * The voices each console has, in the order they are read and drawn in.
 */
export const CHIP_VOICES: Readonly<Record<TSongChip, readonly TSongVoiceName[]>> = {
    nes: ['pulse1', 'pulse2', 'triangle', 'noise', 'dpcm'],
    snes: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
    genesis: ['fm1', 'fm2', 'fm3', 'fm4', 'fm5', 'fm6', 'psg1', 'psg2', 'psg3', 'psgNoise'],
};

/**
 * The voices of a song's console.
 *
 * @param chip - The song's `chip`. Default `'nes'`.
 * @returns Its voices, in order.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const songVoicesOf = (chip: TSongChip | undefined): readonly TSongVoiceName[] => CHIP_VOICES[chip ?? 'nes'];

/**
 * The consoles a song can sound like.
 *
 * @internal
 */
export const SONG_CHIPS = Object.keys(CHIP_VOICES) as TSongChip[];

/**
 * Whether a voice plays drums: its notes have no key, a change of key leaves them alone, and its
 * notes are drawn in the drum lane.
 *
 * @internal
 */
export const isDrumVoice = (voice: TSongVoiceName): boolean => voice === 'noise' || voice === 'dpcm' || voice === 'psgNoise';
