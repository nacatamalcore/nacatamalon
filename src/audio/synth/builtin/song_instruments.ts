import type { TSongInstrument, TSongVoiceName } from '../types/t_song';

/**
 * One instrument the engine has: what it is called, what it is for, which voices it is meant for,
 * and the instrument itself.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongInstrumentInfo = {
    /**
     * What the notes call it: `@lead`, or `@nacatamalon:lead` to say it is the engine's.
     */
    key: string;
    label: string;
    description: string;
    /**
     * The voices it sounds right on. Any voice can play it.
     */
    voices: readonly TSongVoiceName[];
    instrument: TSongInstrument;
};

const SQUARES = ['pulse1', 'pulse2', 'psg1', 'psg2', 'psg3'] as const;
const FM = ['fm1', 'fm2', 'fm3', 'fm4', 'fm5', 'fm6'] as const;
const SNES = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

/**
 * The instruments the engine has, so a song can sound like a real one before anyone writes a list of
 * numbers: `@lead`, `@bass`, `@kick`. A song's own instrument of the same name is played instead, and
 * `@nacatamalon:lead` always means this one.
 *
 * Grouped by the voice they are for: the squares carry the tune and the chords, the triangle the bass,
 * the noise the drums, and `dpcm` the drums recorded.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SONG_INSTRUMENTS: readonly TSongInstrumentInfo[] = [
    {
        key: 'lead',
        label: 'Lead',
        description: 'A tune that sings: thin as it starts, rounder after, settling, and a wobble once it is held.',
        voices: SQUARES,
        instrument: { volume: '15 14 13 12 11 10 10 9 | 9', duty: '0 0 1', vibrato: { speed: 6, depth: 0.25, delay: 0.2 } },
    },
    {
        key: 'soft',
        label: 'Soft lead',
        description: 'A gentle, hollow tune that swells in: for a town, a menu, a calm night.',
        voices: SQUARES,
        instrument: { volume: '6 8 10 11 12 | 12', duty: '2', vibrato: { speed: 5, depth: 0.15, delay: 0.3 } },
    },
    {
        key: 'pluck',
        label: 'Pluck',
        description: 'A note that dies away fast, like a plucked string: for quick runs and accompaniment.',
        voices: SQUARES,
        instrument: { volume: '15 12 10 8 7 6 5 4 3 2 2 1 1 0', duty: '1' },
    },
    {
        key: 'bell',
        label: 'Bell',
        description: 'Thin and ringing, fading slowly: a chime, a music box, a sparkle.',
        voices: SQUARES,
        instrument: { volume: '15 13 12 11 10 10 9 9 8 8 7 7 6 6 5 5 4 4 3 3 2 2 1 1 0', duty: '0' },
    },
    {
        key: 'major',
        label: 'Major chord',
        description: 'A major chord played one note a frame, as the console did chords: bright, happy.',
        voices: SQUARES,
        instrument: { volume: '11 10 9 8 7 | 7 6', duty: '2', arpeggio: '| 0 4 7' },
    },
    {
        key: 'minor',
        label: 'Minor chord',
        description: 'A minor chord played one note a frame: dark, sad, tense.',
        voices: SQUARES,
        instrument: { volume: '11 10 9 8 7 | 7 6', duty: '2', arpeggio: '| 0 3 7' },
    },
    {
        key: 'power',
        label: 'Power chord',
        description: 'The note, its fifth and its octave, one a frame: the sound of an action game.',
        voices: SQUARES,
        instrument: { volume: '13 12 11 | 10', duty: '1', arpeggio: '| 0 7 12' },
    },
    {
        key: 'stab',
        label: 'Stab',
        description: 'A short, punchy major chord: hits on the beat, a fanfare.',
        voices: SQUARES,
        instrument: { volume: '15 12 9 6 3 1 0', duty: '2', arpeggio: '| 0 4 7' },
    },
    {
        key: 'bass',
        label: 'Bass',
        description: 'A bass that glides a little into each note.',
        voices: ['triangle'],
        instrument: { slide: 0.02 },
    },
    {
        key: 'tri-kick',
        label: 'Triangle kick',
        description: 'A kick drum made with the triangle, dropping fast: under the noise drums it gives them a body.',
        voices: ['triangle'],
        instrument: { volume: '15 15 14 0', pitch: '24 12 4 0' },
    },
    {
        key: 'kick',
        label: 'Kick',
        description: 'A low drum that drops.',
        voices: ['noise', 'psgNoise'],
        instrument: { volume: '15 13 10 7 4 2 0', pitch: '0 -8 -16 -20' },
    },
    {
        key: 'snare',
        label: 'Snare',
        description: 'A sharp drum with a tail.',
        voices: ['noise', 'psgNoise'],
        instrument: { volume: '15 13 11 9 7 5 4 3 2 1 0', pitch: '8 4 0' },
    },
    {
        key: 'hat',
        label: 'Hi-hat',
        description: 'A short, high tick, for the eighths between the drums.',
        voices: ['noise', 'psgNoise'],
        instrument: { volume: '9 5 2 0', pitch: '20' },
    },
    {
        key: 'open-hat',
        label: 'Open hi-hat',
        description: 'A high hiss left ringing.',
        voices: ['noise', 'psgNoise'],
        instrument: { volume: '10 9 8 7 6 5 4 3 2 1 0', pitch: '20' },
    },
    {
        key: 'crash',
        label: 'Crash',
        description: 'A long, bright crash for the start of a section.',
        voices: ['noise', 'psgNoise'],
        instrument: { volume: '15 14 13 12 11 10 9 9 8 8 7 7 6 6 5 5 4 4 3 3 2 2 1 1 0', pitch: '16' },
    },
    {
        key: 'drum-kick',
        label: 'Recorded kick',
        description: 'A full kick drum, as a sample.',
        voices: ['dpcm', ...SNES],
        instrument: { sample: 'nacatamalon:kick' },
    },
    {
        key: 'drum-snare',
        label: 'Recorded snare',
        description: 'A full snare drum, as a sample.',
        voices: ['dpcm', ...SNES],
        instrument: { sample: 'nacatamalon:snare' },
    },
    {
        key: 'drum-clap',
        label: 'Clap',
        description: 'Hands clapping, as a sample.',
        voices: ['dpcm', ...SNES],
        instrument: { sample: 'nacatamalon:clap' },
    },
    {
        key: 'drum-tom',
        label: 'Tom',
        description: 'A tom drum: lower notes for a lower tom, for fills.',
        voices: ['dpcm', ...SNES],
        instrument: { sample: 'nacatamalon:tom' },
    },
    {
        key: 'orch-hit',
        label: 'Orchestra hit',
        description: 'A whole band hitting one chord at once.',
        voices: ['dpcm', ...SNES],
        instrument: { sample: 'nacatamalon:orch' },
    },
    {
        key: 'zap',
        label: 'Zap',
        description: 'A laser falling: for a hit in the music, a sound that answers the game.',
        voices: ['dpcm', ...SNES],
        instrument: { sample: 'nacatamalon:zap' },
    },
    {
        key: 'piano',
        label: 'Piano',
        description: 'A piano note that dies away, in a room.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:piano', adsr: { release: 0.3 }, echo: true },
    },
    {
        key: 'strings',
        label: 'Strings',
        description: 'A string section that swells in and lingers: for a sad scene, a castle, an ending.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:strings', adsr: { attack: 0.18, release: 0.45 }, echo: true, vibrato: { speed: 5, depth: 0.12, delay: 0.3 } },
    },
    {
        key: 'brass',
        label: 'Brass',
        description: 'Bright brass: a fanfare, a march, a hero.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:brass', adsr: { attack: 0.04, decay: 0.2, sustain: 0.8, release: 0.15 } },
    },
    {
        key: 'flute',
        label: 'Flute',
        description: 'A soft flute that sings after a moment: a forest, a village.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:flute', adsr: { attack: 0.06, release: 0.2 }, echo: true, vibrato: { speed: 5.5, depth: 0.2, delay: 0.25 } },
    },
    {
        key: 'organ',
        label: 'Organ',
        description: 'A church organ, held: a cathedral, a villain\'s hall.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:organ', adsr: { attack: 0.01, release: 0.1 }, echo: true },
    },
    {
        key: 'choir',
        label: 'Choir',
        description: 'Voices singing "ah", slow to come in: a temple, a final boss.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:choir', adsr: { attack: 0.3, release: 0.6 }, echo: true },
    },
    {
        key: 'marimba',
        label: 'Marimba',
        description: 'A wooden bar struck: an island, a puzzle.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:marimba', adsr: { release: 0.1 } },
    },
    {
        key: 'guitar',
        label: 'Guitar',
        description: 'A plucked guitar string: a town, a campfire.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:guitar', adsr: { release: 0.15 } },
    },
    {
        key: 'synth-bass',
        label: 'Synth bass',
        description: 'A round, plucked bass.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:synth-bass', adsr: { release: 0.08 } },
    },
    {
        key: 'square-lead',
        label: 'Square lead',
        description: 'A hollow square wave, held, with a wobble: an 8-bit lead on the SNES.',
        voices: SNES,
        instrument: { sample: 'nacatamalon:square-lead', adsr: { release: 0.08 }, vibrato: { speed: 6, depth: 0.2, delay: 0.25 } },
    },
    {
        key: 'epiano',
        label: 'Electric piano',
        description: 'A bell-like electric piano that fades: the sound of a 16-bit ballad.',
        voices: FM,
        instrument: { fm: { algorithm: 4, feedback: 3, operators: [{ multiple: 1, level: 0.35, decay: 0.6, sustain: 0.2, release: 0.3 }, { level: 1, decay: 1.5, sustain: 0.3, release: 0.3 }, { multiple: 7, level: 0.25, decay: 0.25, sustain: 0, release: 0.2 }, { level: 0.9, decay: 1.2, sustain: 0.25, release: 0.3 }] } },
    },
    {
        key: 'slap-bass',
        label: 'Slap bass',
        description: 'A bass with a snap at the front: the funk of a Genesis racing game.',
        voices: FM,
        instrument: { fm: { algorithm: 4, feedback: 4, operators: [{ level: 0.8, decay: 0.15, sustain: 0.1, release: 0.05 }, { multiple: 0.5, level: 1, decay: 0.6, sustain: 0.4, release: 0.08 }, { multiple: 3, level: 0.4, decay: 0.08, sustain: 0, release: 0.05 }, { multiple: 0.5, level: 0.6, decay: 0.4, sustain: 0.3, release: 0.08 }] } },
    },
    {
        key: 'fm-bass',
        label: 'FM bass',
        description: 'A round, warm bass.',
        voices: FM,
        instrument: { fm: { algorithm: 4, feedback: 2, operators: [{ level: 0.7, decay: 0.2, sustain: 0.3, release: 0.05 }, { multiple: 0.5, level: 1, decay: 0.8, sustain: 0.6, release: 0.08 }, { multiple: 2, level: 0.3, decay: 0.1, sustain: 0.1, release: 0.05 }, { multiple: 0.5, level: 0.7, decay: 0.6, sustain: 0.5, release: 0.08 }] } },
    },
    {
        key: 'fm-brass',
        label: 'Brass',
        description: 'Bright, buzzing brass: a fanfare, a boss.',
        voices: FM,
        instrument: { fm: { algorithm: 4, feedback: 5, operators: [{ level: 0.6, attack: 0.05, decay: 0.3, sustain: 0.8, release: 0.1 }, { level: 1, attack: 0.03, decay: 0.2, sustain: 0.9, release: 0.12 }, { level: 0.5, attack: 0.08, decay: 0.3, sustain: 0.7, release: 0.1 }, { detune: 7, level: 0.9, attack: 0.03, decay: 0.2, sustain: 0.9, release: 0.12 }] } },
    },
    {
        key: 'fm-strings',
        label: 'Strings',
        description: 'A soft string pad, three operators a hair apart: slow scenes, endings.',
        voices: FM,
        instrument: { fm: { algorithm: 5, feedback: 2, operators: [{ level: 0.35, attack: 0.2, sustain: 1, release: 0.4 }, { detune: -7, level: 0.9, attack: 0.25, sustain: 1, release: 0.5 }, { multiple: 2, level: 0.5, attack: 0.3, sustain: 1, release: 0.5 }, { detune: 7, level: 0.9, attack: 0.25, sustain: 1, release: 0.5 }] }, vibrato: { speed: 6, depth: 0.2, delay: 0.3 } },
    },
    {
        key: 'fm-organ',
        label: 'Organ',
        description: 'Four operators heard at once, an octave apart: a drawbar organ.',
        voices: FM,
        instrument: { fm: { algorithm: 7, operators: [{ multiple: 0.5, level: 0.8, release: 0.05 }, { level: 1, release: 0.05 }, { multiple: 2, level: 0.6, release: 0.05 }, { multiple: 4, level: 0.4, release: 0.05 }] } },
    },
    {
        key: 'fm-bell',
        label: 'Bell',
        description: 'A metallic bell that rings for long: a clock tower, a temple.',
        voices: FM,
        instrument: { fm: { algorithm: 4, operators: [{ multiple: 3.5, level: 0.6, decay: 2, sustain: 0, release: 0.8 }, { level: 1, decay: 2.5, sustain: 0, release: 0.8 }, { multiple: 7, level: 0.3, decay: 1, sustain: 0, release: 0.5 }, { multiple: 2, level: 0.5, decay: 1.5, sustain: 0, release: 0.6 }] } },
    },
    {
        key: 'dist-guitar',
        label: 'Distorted guitar',
        description: 'Each operator bending the next, the first bending itself hard: a rock guitar.',
        voices: FM,
        instrument: { fm: { algorithm: 0, feedback: 6, operators: [{ level: 0.7, decay: 0.4, sustain: 0.6, release: 0.1 }, { level: 0.8, decay: 0.3, sustain: 0.7, release: 0.1 }, { multiple: 2, level: 0.5, decay: 0.3, sustain: 0.6, release: 0.1 }, { level: 1, decay: 0.5, sustain: 0.9, release: 0.15 }] } },
    },
    {
        key: 'fm-lead',
        label: 'FM lead',
        description: 'A bright lead that cuts through, with a wobble once held.',
        voices: FM,
        instrument: { fm: { algorithm: 4, feedback: 4, operators: [{ multiple: 2, level: 0.5, decay: 0.3, sustain: 0.6, release: 0.1 }, { level: 1, sustain: 1, release: 0.12 }, { level: 0.4, decay: 0.2, sustain: 0.5, release: 0.1 }, { detune: 5, level: 0.8, sustain: 1, release: 0.12 }] }, vibrato: { speed: 6, depth: 0.2, delay: 0.3 } },
    },
];

/**
 * What `@nacatamalon:` in front of a name says: the engine's own, whatever the song has.
 */
export const BUILTIN_PREFIX = 'nacatamalon:';

const BY_KEY = new Map(SONG_INSTRUMENTS.map((info) => [info.key, info.instrument]));

/**
 * The engine's instrument a name means, with or without `nacatamalon:` in front, or `undefined`.
 *
 * @internal
 */
export const builtinInstrument = (name: string): TSongInstrument | undefined =>
    BY_KEY.get(name.startsWith(BUILTIN_PREFIX) ? name.slice(BUILTIN_PREFIX.length) : name);

/**
 * Every name a song's notes can play with: its own instruments, and the engine's with and without
 * `nacatamalon:` in front.
 *
 * @param own - The song's `instruments`.
 * @returns The names, the song's own first.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const songInstrumentNames = (own: Record<string, TSongInstrument> | undefined): string[] => [
    ...Object.keys(own ?? {}),
    ...SONG_INSTRUMENTS.flatMap((info) => (own?.[info.key] !== undefined ? [] : [info.key])),
    ...SONG_INSTRUMENTS.map((info) => `${BUILTIN_PREFIX}${info.key}`),
];
