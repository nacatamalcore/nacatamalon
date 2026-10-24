import { createShiftRegister, frequencyOf, noiseRateOf, pulse, triangle } from './oscillators';
import { parseSongNotes } from './parse_song_notes';
import { BUILTIN_PREFIX, builtinInstrument, builtinSample, songInstrumentNames } from './builtin';
import { dpcmRateOf, toDpcm } from './dpcm';
import { CHIP_VOICES, isDrumVoice, songVoicesOf } from './chips';
import { renderEcho, SNES_MOST, SNES_RATE, snesValueAt, toSnes } from './snes';
import type { TSnesSample } from './snes';
import { createFmVoice, createPsgNoise, psgFrequencyOf, psgGainOf, psgNoiseRateOf } from './genesis';
import type {
    TFmPatch, TRenderedSong, TSongDoc, TSongError, TSongInstrument, TSongInstrumentError, TSongInstrumentList, TSongNote, TSongSample, TSongVoiceName,
} from './types/t_song';

/**
 * The order voices are read and drawn in.
 */
export const SONG_VOICES: readonly TSongVoiceName[] = [...CHIP_VOICES.nes, ...CHIP_VOICES.snes, ...CHIP_VOICES.genesis];

/**
 * How loud each voice is at full volume. The first four add up to less than `1`, so they never go
 * past what a speaker takes together, and nothing has to be turned down afterwards. A song that uses
 * `dpcm` as well has all five brought down by the same amount, so the five together still do not.
 */
const LEVELS: Record<TSongVoiceName, number> = {
    pulse1: 0.26, pulse2: 0.22, triangle: 0.3, noise: 0.18, dpcm: 0.2,
    // Eight voices that together, at full, stay under what a speaker takes, with room for the echo.
    s1: 0.11, s2: 0.11, s3: 0.11, s4: 0.11, s5: 0.11, s6: 0.11, s7: 0.11, s8: 0.11,
    fm1: 0.15, fm2: 0.15, fm3: 0.15, fm4: 0.15, fm5: 0.15, fm6: 0.15, psg1: 0.04, psg2: 0.04, psg3: 0.04, psgNoise: 0.08,
};
const FOUR = LEVELS.pulse1 + LEVELS.pulse2 + LEVELS.triangle + LEVELS.noise;
const WITH_DPCM = FOUR / (FOUR + LEVELS.dpcm);



/**
 * How long a note takes to come in and to go out, in seconds. Short enough not to be heard as a
 * fade, long enough that a note starting or stopping does not click.
 */
const ATTACK = 0.002;
const RELEASE = 0.008;

/**
 * How quickly a drum hit dies away, in seconds, when no instrument says otherwise: noise is played
 * as a drum, not as a held tone.
 */
const DRUM_DECAY = 0.05;

/**
 * How many times a second an instrument's lists move on: the frames of the console's screen, which
 * is what its music was stepped by.
 */
const FRAMES = 60;

/**
 * The four colours of a square wave, by the number an instrument's `duty` names them with.
 */
const DUTY_STEPS = [0.125, 0.25, 0.5, 0.75] as const;

/**
 * One of an instrument's lists, read: its numbers, and where it starts again, or `-1` to keep the
 * last.
 */
type TSequence = { values: number[]; loop: number };

/**
 * An instrument with its lists read once, rather than once a note.
 */
type TReadInstrument = {
    volume: TSequence | null;
    duty: TSequence | null;
    arpeggio: TSequence | null;
    pitch: TSequence | null;
    vibrato: { speed: number; depth: number; delay: number } | null;
    slide: number;
    adsr: TAdsr;
    echo: boolean;
    raw: TSongInstrument;
};

/**
 * How a note comes in and goes out, in seconds, and the level it holds at.
 */
type TAdsr = { attack: number; decay: number; sustain: number; release: number };

const DEFAULT_ADSR: TAdsr = { attack: 0, decay: 0, sustain: 1, release: 0.02 };

/**
 * The numbers each list takes, and what to say about one outside them.
 */
const LIST_RANGES: Partial<Record<TSongInstrumentList, { least: number; most: number; whole: boolean; said: string }>> = {
    volume: { least: 0, most: 15, whole: false, said: 'from 0, silent, to 15, as loud as the voice goes' },
    duty: { least: 0, most: 3, whole: true, said: '0, 1, 2 or 3 (12.5, 25, 50 or 75 %)' },
};

/**
 * One of an instrument's lists read, with what is wrong in it said and left out: a word that is
 * not a number, a second `|`, or a number the list cannot take, which is brought into its range.
 */
const readSequence = (
    text: string | undefined,
    instrument: string,
    field: TSongInstrumentList,
    errors: TSongInstrumentError[],
): TSequence | null => {
    if (text === undefined) {
        return null;
    }
    const fail = (position: number | undefined, message: string): void => {
        errors.push({ instrument, field, ...(position !== undefined ? { position } : {}), message });
    };
    const range = LIST_RANGES[field];
    const values: number[] = [];
    let loop = -1;
    let position = 0;
    for (const word of text.split(/\s+/)) {
        if (word === '') {
            continue;
        }
        position += 1;
        if (word === '|') {
            if (loop >= 0) {
                fail(position, 'a list has one | at most: where it starts again.');
            } else {
                loop = values.length;
            }
            continue;
        }
        let value = Number(word);
        if (!Number.isFinite(value)) {
            fail(position, `'${word}' is not a number.`);
            continue;
        }
        if (range !== undefined && (value < range.least || value > range.most || (range.whole && !Number.isInteger(value)))) {
            fail(position, `${word} is not a ${field}: it goes ${range.said}.`);
            value = Math.min(range.most, Math.max(range.least, range.whole ? Math.round(value) : value));
        }
        values.push(value);
    }
    if (values.length === 0) {
        fail(undefined, 'the list has no numbers.');
        return null;
    }
    if (loop >= values.length) {
        fail(position, 'nothing comes after the |, so there is nothing to start again from.');
        loop = -1;
    }
    return { values, loop };
};

/**
 * The number a list gives at a frame: its own while it lasts, then round from its `|` again, or
 * its last for ever.
 */
const valueAt = (sequence: TSequence, frame: number): number => {
    const { values, loop } = sequence;
    if (frame < values.length) {
        return values[frame]!;
    }
    if (loop < 0) {
        return values[values.length - 1]!;
    }
    return values[loop + ((frame - values.length) % (values.length - loop))]!;
};

const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * An instrument read once, with what is wrong in it said: a field that cannot be used is left out
 * and the rest of the instrument still plays.
 */
const readInstrument = (name: string, instrument: TSongInstrument, errors: TSongInstrumentError[]): TReadInstrument => {
    let vibrato: TReadInstrument['vibrato'] = null;
    if (instrument.vibrato !== undefined) {
        const { speed, depth, delay = 0 } = instrument.vibrato;
        if (isAmount(speed) && isAmount(depth) && isAmount(delay)) {
            vibrato = { speed, depth, delay };
        } else {
            errors.push({ instrument: name, field: 'vibrato', message: 'a vibrato is its speed (times a second), its depth (semitones) and its delay (seconds), each a number from 0 up.' });
        }
    }
    let slide = 0;
    if (instrument.slide !== undefined) {
        if (isAmount(instrument.slide)) {
            slide = instrument.slide;
        } else {
            errors.push({ instrument: name, field: 'slide', message: 'a slide is how many seconds a note takes to glide in, a number from 0 up.' });
        }
    }
    const adsr = { ...DEFAULT_ADSR };
    if (instrument.adsr !== undefined) {
        for (const part of ['attack', 'decay', 'sustain', 'release'] as const) {
            const value = instrument.adsr[part];
            if (value === undefined) continue;
            if (!isAmount(value) || (part === 'sustain' && value > 1)) {
                errors.push({ instrument: name, field: 'adsr', message: `its ${part} is ${part === 'sustain' ? 'a level from 0 to 1' : 'seconds, a number from 0 up'}.` });
            } else {
                adsr[part] = value;
            }
        }
    }
    if (instrument.fm !== undefined) {
        const { algorithm, feedback, operators } = instrument.fm;
        const whole = (value: number | undefined) => value === undefined || (Number.isInteger(value) && value >= 0 && value <= 7);
        if (!whole(algorithm) || !whole(feedback)) {
            errors.push({ instrument: name, field: 'fm', message: 'its algorithm and its feedback are each a whole number from 0 to 7.' });
        }
        operators.forEach((operator, k) => {
            const wrong = (['multiple', 'level', 'attack', 'decay', 'sustain', 'release'] as const)
                .filter((part) => operator[part] !== undefined && (!isAmount(operator[part]) || (part === 'sustain' && operator[part]! > 1) || (part === 'level' && operator[part]! > 1)));
            if (wrong.length > 0) {
                errors.push({ instrument: name, field: 'fm', message: `operator ${k + 1} has ${wrong.join(', ')} out of range: a level and a sustain go from 0 to 1, the rest from 0 up.` });
            }
        });
    }
    if (instrument.root !== undefined && !Number.isFinite(instrument.root)) {
        errors.push({ instrument: name, field: 'root', message: 'its root is the note its sample sounds as it is, a number: 60 is middle C.' });
    }
    if (instrument.loop !== undefined && !isAmount(instrument.loop)) {
        errors.push({ instrument: name, field: 'loop', message: 'its loop is where, in seconds, its sample starts again, a number from 0 up.' });
    }
    return {
        volume: readSequence(instrument.volume, name, 'volume', errors),
        duty: readSequence(instrument.duty, name, 'duty', errors),
        arpeggio: readSequence(instrument.arpeggio, name, 'arpeggio', errors),
        pitch: readSequence(instrument.pitch, name, 'pitch', errors),
        vibrato,
        slide,
        adsr,
        echo: instrument.echo === true,
        raw: instrument,
    };
};

/**
 * What is wrong in a song's instruments, without making its sound: for a tool that shows the
 * mistakes while a person writes, the way `parseSongNotes` shows those in the notes.
 *
 * @param doc - The song.
 * @returns Each mistake with its instrument, its field and, in a list, its word. The same ones
 * `renderSong` gives back.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const songInstrumentErrors = (doc: TSongDoc): TSongInstrumentError[] => {
    const errors: TSongInstrumentError[] = [];
    for (const [name, instrument] of Object.entries(doc.instruments ?? {})) {
        readInstrument(name, instrument, errors);
    }
    return errors;
};

/**
 * How one note is shaped as it plays: its instrument's, with what the note does on its own on top.
 */
type TShape = {
    volume: TSequence | null;
    duty: TSequence | null;
    arpeggio: TSequence | null;
    pitch: TSequence | null;
    vibrato: { speed: number; depth: number; delay: number } | null;
    slide: number;
    /**
     * How loud on top of its instrument, `0` to `1`.
     */
    gain: number;
    /**
     * What the `dpcm` voice plays, made into the console's bits.
     */
    bits: Float32Array | null;
};

const shapeOf = (note: TSongNote, instrument: TReadInstrument | null, bits: Float32Array | null): TShape => {
    const effects = note.effects;
    const vibrato = effects?.vibrato;
    return {
        volume: instrument?.volume ?? null,
        duty: instrument?.duty ?? null,
        arpeggio: effects?.arpeggio !== undefined ? { values: effects.arpeggio, loop: 0 } : instrument?.arpeggio ?? null,
        pitch: instrument?.pitch ?? null,
        vibrato: vibrato !== undefined ? { speed: vibrato.speed, depth: vibrato.depth, delay: vibrato.delay ?? 0 } : instrument?.vibrato ?? null,
        slide: effects?.slide ?? instrument?.slide ?? 0,
        gain: effects?.volume !== undefined ? effects.volume / 15 : 1,
        bits,
    };
};

/**
 * One note on its way into its voice's track, written a stretch at a time. What it was making is
 * kept between stretches, so a note written in one go and one written in a hundred come out sample
 * for sample the same: it is what lets a song be made as it plays rather than all at once.
 *
 * @internal
 */
export type TNoteWriter = {
    /**
     * The first sample of the song it writes, and one past the last it may: it can be over sooner,
     * when its sample runs out or its sound has died away, and then it is `done`.
     */
    readonly from: number;
    readonly end: number;
    done: boolean;
    /**
     * Writes on up to `upto`, a place in the song, into `track` (and into `send`, for a SNES note
     * that goes into the echo), where the song's sample `base` is the track's first. With no track
     * it only works out what it would have written: how a note is brought to a place in its middle.
     */
    run(upto: number, track: Float32Array | null, send: Float32Array | null, base: number): void;
};

/**
 * One note of a NES voice.
 *
 * Its pitch, loudness and colour are worked out again at every frame, from its instrument and what
 * it does on its own, as the console's music did, and its wave is drawn sample by sample in between.
 */
const nesNote = (
    note: TSongNote,
    from: number,
    to: number,
    limit: number,
    sampleRate: number,
    level: number,
    duty: number,
    shape: TShape,
    before: number | null,
): TNoteWriter => {
    const noise = note.voice === 'noise' ? createShiftRegister() : null;
    const span = to - from;
    const attack = Math.max(1, Math.round(ATTACK * sampleRate));
    const release = Math.max(1, Math.round(RELEASE * sampleRate));
    const samplesPerFrame = sampleRate / FRAMES;
    const slide = before !== null ? shape.slide : 0;
    let phase = 0;
    let frame = -1;
    let step = 0;
    let gain = shape.gain;
    let width = duty;
    let i = 0;
    const writer: TNoteWriter = {
        from,
        end: from + Math.max(0, Math.min(span, limit - from)),
        done: false,
        run: (upto, track, _send, base) => {
            for (; i < span && from + i < limit && from + i < upto; i += 1) {
                const now = Math.floor(i / samplesPerFrame);
                if (now !== frame) {
                    frame = now;
                    const seconds = i / sampleRate;
                    let pitch = note.pitch;
                    if (slide > 0) {
                        pitch = before! + (note.pitch - before!) * Math.min(1, seconds / slide);
                    }
                    if (shape.arpeggio !== null) pitch += valueAt(shape.arpeggio, frame);
                    if (shape.pitch !== null) pitch += valueAt(shape.pitch, frame);
                    const vibrato = shape.vibrato;
                    if (vibrato !== null && seconds > vibrato.delay) {
                        pitch += vibrato.depth * Math.sin(2 * Math.PI * vibrato.speed * (seconds - vibrato.delay));
                    }
                    gain = shape.gain * (shape.volume !== null ? Math.min(15, Math.max(0, valueAt(shape.volume, frame))) / 15 : 1);
                    if (shape.duty !== null) {
                        width = DUTY_STEPS[Math.min(3, Math.max(0, Math.round(valueAt(shape.duty, frame))))]!;
                    }
                    step = noise !== null ? noiseRateOf(pitch) / sampleRate
                        : shape.bits !== null ? dpcmRateOf(pitch) / sampleRate
                            : frequencyOf(pitch) / sampleRate;
                }
                let wave: number;
                if (shape.bits !== null) {
                    // A sample plays once, to its end or the note's, whichever comes first.
                    const at = Math.floor(phase);
                    if (at >= shape.bits.length) {
                        writer.done = true;
                        return;
                    }
                    wave = shape.bits[at]!;
                } else if (noise !== null) {
                    wave = noise(step);
                    if (shape.volume === null) {
                        wave *= Math.exp(-i / (DRUM_DECAY * sampleRate));
                    }
                } else if (note.voice === 'triangle') {
                    wave = triangle(phase);
                } else {
                    wave = pulse(phase, width);
                }
                phase += step;
                const envelope = Math.min(1, i / attack, (span - i) / release);
                if (track !== null) track[from + i - base] = wave * envelope * level * gain;
            }
            if (i >= span || from + i >= limit) writer.done = true;
        },
    };
    return writer;
};

/**
 * How loud an envelope is at a sample of its note: coming in, falling to its level and holding, and
 * once the note is over (`span`), dying away from where it was.
 */
const envelopeAt = (adsr: TAdsr, i: number, span: number, sampleRate: number): number => {
    const held = (at: number): number => {
        const seconds = at / sampleRate;
        if (seconds < adsr.attack) return seconds / adsr.attack;
        const falling = seconds - adsr.attack;
        if (falling < adsr.decay) return 1 - (1 - adsr.sustain) * (falling / adsr.decay);
        return adsr.sustain;
    };
    if (i < span) return held(i);
    const after = (i - span) / sampleRate;
    if (adsr.release <= 0 || after >= adsr.release) return 0;
    return held(span) * (1 - after / adsr.release);
};

/**
 * One note of a SNES voice: its sample at the pitch the frame says, stepped at the console's rate
 * and smoothed as it smoothed, its envelope dying away after the note until the next one starts
 * (`until`), and as much again into the echo when its instrument goes into it (`echoes`).
 */
const snesNote = (
    note: TSongNote,
    from: number,
    to: number,
    until: number,
    limit: number,
    echoes: boolean,
    sampleRate: number,
    level: number,
    shape: TShape,
    before: number | null,
    sample: TSnesSample,
    adsr: TAdsr,
): TNoteWriter => {
    const span = to - from;
    const total = Math.min(until, limit) - from;
    const attack = Math.max(1, Math.round(ATTACK * sampleRate));
    const release = Math.max(1, Math.round(RELEASE * sampleRate));
    const samplesPerFrame = sampleRate / FRAMES;
    const tick = SNES_RATE / sampleRate;
    const slide = before !== null ? shape.slide : 0;
    let frame = -1;
    let ratio = 1;
    let gain = shape.gain;
    let clock = 0;
    let position = 0;
    let value = snesValueAt(sample, 0);
    let i = 0;
    const writer: TNoteWriter = {
        from,
        end: from + Math.max(0, total),
        done: false,
        run: (upto, track, send, base) => {
            for (; i < total && from + i < upto; i += 1) {
                const now = Math.floor(i / samplesPerFrame);
                if (now !== frame) {
                    frame = now;
                    const seconds = i / sampleRate;
                    let pitch = note.pitch;
                    if (slide > 0) pitch = before! + (note.pitch - before!) * Math.min(1, seconds / slide);
                    if (shape.arpeggio !== null) pitch += valueAt(shape.arpeggio, frame);
                    if (shape.pitch !== null) pitch += valueAt(shape.pitch, frame);
                    const vibrato = shape.vibrato;
                    if (vibrato !== null && seconds > vibrato.delay) pitch += vibrato.depth * Math.sin(2 * Math.PI * vibrato.speed * (seconds - vibrato.delay));
                    ratio = Math.min(SNES_MOST, 2 ** ((pitch - sample.root) / 12));
                    gain = shape.gain * (shape.volume !== null ? Math.min(15, Math.max(0, valueAt(shape.volume, frame))) / 15 : 1);
                }
                // One step of the console's at a time, the value held in between.
                clock += tick;
                while (clock >= 1) {
                    clock -= 1;
                    position += ratio;
                    value = snesValueAt(sample, position);
                }
                if (sample.loop < 0 && position >= sample.data.length + 2) {
                    writer.done = true;
                    return;
                }
                const envelope = envelopeAt(adsr, i, span, sampleRate);
                if (i >= span && envelope === 0) {
                    writer.done = true;
                    return;
                }
                // Never a click where it comes in, nor where the next note cuts it.
                const edges = Math.min(1, i / attack, (total - i) / release);
                const out = value * envelope * edges * level * gain;
                if (track !== null) track[from + i - base] = out;
                if (echoes && send !== null) send[from + i - base]! += out;
            }
            if (i >= total) writer.done = true;
        },
    };
    return writer;
};

/**
 * One note of a Genesis voice: an FM voice with its four operators, or a square or the noise of the
 * second chip, at the pitch the frame says. An FM note rings on by its operators' envelopes after it
 * ends, until the next one starts (`until`).
 */
const genesisNote = (
    note: TSongNote,
    from: number,
    to: number,
    until: number,
    limit: number,
    sampleRate: number,
    level: number,
    shape: TShape,
    before: number | null,
    fm: TFmPatch | null,
): TNoteWriter => {
    const span = to - from;
    const total = (fm === null ? Math.min(to, limit) : Math.min(until, limit)) - from;
    const attack = Math.max(1, Math.round(ATTACK * sampleRate));
    const release = Math.max(1, Math.round(RELEASE * sampleRate));
    const samplesPerFrame = sampleRate / FRAMES;
    const slide = before !== null ? shape.slide : 0;
    const voice = fm === null ? null : createFmVoice(fm, sampleRate);
    const noise = note.voice === 'psgNoise' ? createPsgNoise() : null;
    let frame = -1;
    let hz = 0;
    let gain = shape.gain;
    let phase = 0;
    let i = 0;
    const writer: TNoteWriter = {
        from,
        end: from + Math.max(0, total),
        done: false,
        run: (upto, track, _send, base) => {
            for (; i < total && from + i < upto; i += 1) {
                const now = Math.floor(i / samplesPerFrame);
                if (now !== frame) {
                    frame = now;
                    const seconds = i / sampleRate;
                    let pitch = note.pitch;
                    if (slide > 0) pitch = before! + (note.pitch - before!) * Math.min(1, seconds / slide);
                    if (shape.arpeggio !== null) pitch += valueAt(shape.arpeggio, frame);
                    if (shape.pitch !== null) pitch += valueAt(shape.pitch, frame);
                    const vibrato = shape.vibrato;
                    if (vibrato !== null && seconds > vibrato.delay) pitch += vibrato.depth * Math.sin(2 * Math.PI * vibrato.speed * (seconds - vibrato.delay));
                    const volume = shape.volume !== null ? Math.min(15, Math.max(0, valueAt(shape.volume, frame))) : 15;
                    if (voice !== null) {
                        hz = frequencyOf(pitch);
                        gain = shape.gain * (volume / 15);
                    } else {
                        hz = noise !== null ? psgNoiseRateOf(pitch) : psgFrequencyOf(frequencyOf(pitch));
                        // The second chip's volume goes in steps of two decibels.
                        gain = shape.gain * psgGainOf(volume);
                    }
                }
                let wave: number;
                if (voice !== null) {
                    const sound = voice(hz, i < span);
                    if (!sound.sounding) {
                        writer.done = true;
                        return;
                    }
                    wave = sound.out;
                } else if (noise !== null) {
                    wave = noise(hz / sampleRate);
                    if (shape.volume === null) wave *= Math.exp(-i / (DRUM_DECAY * sampleRate));
                } else {
                    wave = phase % 1 < 0.5 ? 1 : -1;
                    phase += hz / sampleRate;
                }
                const edges = Math.min(1, i / attack, (total - i) / release);
                if (track !== null) track[from + i - base] = wave * edges * level * gain;
            }
            if (i >= total) writer.done = true;
        },
    };
    return writer;
};

/**
 * Reads the notes of every voice a song's console has, voice after voice, each moved by `transpose`
 * but the drums: what the song plays, without making any of its sound.
 *
 * @internal
 */
export const readSongNotes = (doc: TSongDoc, transpose = 0): { notes: TSongNote[]; errors: TSongError[]; end: number } => {
    const names = songInstrumentNames(doc.instruments);
    const notes: TSongNote[] = [];
    const errors: TSongError[] = [];
    let end = 0;
    for (const voice of songVoicesOf(doc.chip ?? 'nes')) {
        const written = doc.voices[voice];
        if (written === undefined) {
            continue;
        }
        const read = parseSongNotes(written.notes, voice, doc.meter, {
            ...(written.instrument !== undefined ? { first: written.instrument } : {}),
            names,
        });
        if (transpose !== 0 && !isDrumVoice(voice)) {
            for (const note of read.notes) {
                note.pitch += transpose;
            }
        }
        notes.push(...read.notes);
        errors.push(...read.errors);
        end = Math.max(end, read.end);
    }
    return { notes, errors, end };
};

/**
 * Reads a song: its notes, its instruments and samples, how long it is and where it loops, and each
 * voice's notes as writers that make their sound, a stretch at a time. What `renderSong` makes the
 * whole song from at once, and a song played as it is made makes from as it goes.
 *
 * @internal
 */
export const readSong = (
    doc: TSongDoc,
    sampleRate = 44100,
    options: { transpose?: number; samples?: ReadonlyMap<string, TSongSample> } = {},
): TReadSong => {
    const secondsPerBeat = 60 / doc.tempo;
    const samplesPerBeat = secondsPerBeat * sampleRate;
    const barBeats = doc.meter[0];
    const chip = doc.chip ?? 'nes';

    const { notes, errors, end } = readSongNotes(doc, options.transpose ?? 0);

    // Whole bars, at least one, and at least up to the bar the loop goes back to.
    const loopBar = doc.loop?.bar ?? 1;
    const bars = Math.max(1, Math.ceil(end / barBeats - 1e-9), loopBar);
    const length = Math.round(bars * barBeats * samplesPerBeat);
    const loopSample = Math.round((loopBar - 1) * barBeats * samplesPerBeat);

    // Each instrument read the first time a note plays with it: the song's own of that name, or else
    // the engine's.
    const instrumentErrors: TSongInstrumentError[] = [];
    const instruments = new Map<string, TReadInstrument | null>();
    for (const [name, instrument] of Object.entries(doc.instruments ?? {})) {
        instruments.set(name, readInstrument(name, instrument, instrumentErrors));
    }
    const instrumentOf = (name: string): TReadInstrument | null => {
        if (!instruments.has(name)) {
            const own = name.startsWith(BUILTIN_PREFIX) ? undefined : doc.instruments?.[name];
            const found = own ?? builtinInstrument(name);
            instruments.set(name, found === undefined ? null : readInstrument(name, found, instrumentErrors));
        }
        return instruments.get(name) ?? null;
    };

    // The samples the dpcm and SNES voices play: found once each, and made into each console's form
    // once each.
    const said = new Set<string>();
    const sampleOf = (name: string | undefined, voiceSays: string): { sample: TSongSample; key: string; raw: TSongInstrument } | null => {
        if (name === undefined) {
            return null;
        }
        const own = name.startsWith(BUILTIN_PREFIX) ? undefined : doc.instruments?.[name];
        const raw = own ?? builtinInstrument(name);
        const key = raw?.sample;
        if (raw === undefined || key === undefined) {
            if (!said.has(name)) {
                said.add(name);
                instrumentErrors.push({ instrument: name, field: 'sample', message: `it plays on ${voiceSays}, which plays samples, and it has no "sample".` });
            }
            return null;
        }
        const sample = options.samples?.get(key) ?? builtinSample(key);
        if (sample === undefined) {
            if (!said.has(name)) {
                said.add(name);
                instrumentErrors.push({
                    instrument: name,
                    field: 'sample',
                    message: `its sample '${key}' is not one of the engine's and was not loaded, so its notes are silent.`,
                });
            }
            return null;
        }
        return { sample, key, raw };
    };
    const bitsMade = new Map<string, Float32Array>();
    const bitsOf = (name: string | undefined): Float32Array | null => {
        const found = sampleOf(name, 'the dpcm voice');
        if (found === null) return null;
        if (!bitsMade.has(found.key)) bitsMade.set(found.key, toDpcm(found.sample));
        return bitsMade.get(found.key)!;
    };
    // A SNES sample is the same file whatever plays it, but an instrument can say where it loops
    // and what note it is: made once for each of those.
    const snesMade = new Map<string, TSnesSample>();
    const snesOf = (name: string | undefined): TSnesSample | null => {
        const found = sampleOf(name, 'a SNES voice');
        if (found === null) return null;
        const { sample, key, raw } = found;
        const id = `${key}|${raw.loop ?? ''}|${raw.root ?? ''}`;
        let made = snesMade.get(id);
        if (made === undefined) {
            made = toSnes({
                ...sample,
                ...(raw.loop !== undefined ? { loopStart: raw.loop * sample.sampleRate } : {}),
                ...(raw.root !== undefined ? { root: raw.root } : {}),
            });
            snesMade.set(id, made);
        }
        return made;
    };

    // An FM voice's four operators, as its instrument says them.
    const fmOf = (name: string | undefined): TFmPatch | null => {
        if (name === undefined) return null;
        const own = name.startsWith(BUILTIN_PREFIX) ? undefined : doc.instruments?.[name];
        const fm = (own ?? builtinInstrument(name))?.fm;
        if (fm === undefined && !said.has(name)) {
            said.add(name);
            instrumentErrors.push({ instrument: name, field: 'fm', message: 'it plays on an FM voice, which needs an "fm": its four operators and how they are joined.' });
        }
        return fm ?? null;
    };

    const scale = doc.voices.dpcm === undefined || chip !== 'nes' ? 1 : WITH_DPCM;
    const voices: TReadVoice[] = [];
    let sent = false;
    for (const voice of songVoicesOf(chip)) {
        const written = doc.voices[voice];
        if (written === undefined) {
            continue;
        }
        const level = LEVELS[voice] * scale * Math.min(1, Math.max(0, written.volume ?? 1));
        const duty = written.duty ?? 0.5;
        const own = notes.filter((note) => note.voice === voice);
        const writers: Array<() => TNoteWriter> = [];
        // The note before in this voice, which a slide starts from.
        let before: number | null = null;
        own.forEach((note, index) => {
            const from = Math.round(note.start * samplesPerBeat);
            const to = Math.round((note.start + note.beats) * samplesPerBeat);
            const instrument = note.instrument === undefined ? null : instrumentOf(note.instrument);
            const slideFrom = before;
            if (chip === 'genesis') {
                const isFm = voice.startsWith('fm');
                const patch = isFm ? fmOf(note.instrument) : null;
                if (!isFm || patch !== null) {
                    const next = own[index + 1];
                    const until = next === undefined ? length : Math.round(next.start * samplesPerBeat);
                    const shape = shapeOf(note, instrument, null);
                    writers.push(() => genesisNote(note, from, to, until, length, sampleRate, level, shape, slideFrom, patch));
                }
            } else if (chip === 'snes') {
                const sample = snesOf(note.instrument);
                if (sample !== null) {
                    // A note may ring on after it ends, until the next one in its voice.
                    const next = own[index + 1];
                    const until = next === undefined ? length : Math.round(next.start * samplesPerBeat);
                    const echoes = instrument?.echo === true;
                    sent ||= echoes;
                    const shape = shapeOf(note, instrument, null);
                    const adsr = instrument?.adsr ?? DEFAULT_ADSR;
                    writers.push(() => snesNote(note, from, to, until, length, echoes, sampleRate, level, shape, slideFrom, sample, adsr));
                }
            } else {
                const bits = voice === 'dpcm' ? bitsOf(note.instrument) : null;
                if (voice !== 'dpcm' || bits !== null) {
                    const shape = shapeOf(note, instrument, bits);
                    writers.push(() => nesNote(note, from, to, length, sampleRate, level, duty, shape, slideFrom));
                }
            }
            before = note.pitch;
        });
        voices.push({ voice, notes: writers.map((make) => ({ make, ...spanOf(make()) })) });
    }

    return {
        sampleRate,
        length,
        loopSample,
        voices,
        echo: chip === 'snes' && sent ? doc.echo ?? {} : null,
        notes,
        errors,
        instrumentErrors,
    };
};

/**
 * Where a note writes, read off one made for the purpose.
 */
const spanOf = (writer: TNoteWriter): { from: number; end: number } => ({ from: writer.from, end: writer.end });

/**
 * One voice of a read song: its notes in order, each with where it writes and a way to make it,
 * fresh, as often as it is needed.
 *
 * @internal
 */
export type TReadVoice = {
    voice: TSongVoiceName;
    notes: Array<{ from: number; end: number; make: () => TNoteWriter }>;
};

/**
 * A song read and ready to be made into sound: how long it is, where it loops, what each voice
 * plays, and the echo's settings when the SNES's echo has anything going into it.
 *
 * @internal
 */
export type TReadSong = {
    sampleRate: number;
    length: number;
    loopSample: number;
    voices: TReadVoice[];
    echo: NonNullable<TSongDoc['echo']> | null;
    notes: TSongNote[];
    errors: TSongError[];
    instrumentErrors: TSongInstrumentError[];
};

/**
 * Turns a song into sound: one track per voice, of samples between `-1` and `1`, all the same length
 * so they play together as layers and can be mixed into one.
 *
 * It needs nothing of the browser, so the same song sounds the same in a game, in the editor that
 * wrote it, and in a test that measures it. Given the same song it gives back the same samples,
 * every time.
 *
 * Whatever in the text could not be read is in `errors`, with where it was, and the rest is played:
 * a wrong note costs that note, not the song. What could not be read in its instruments is in
 * `instrumentErrors`.
 *
 * An instrument is the song's own when it has one of that name, and otherwise the engine's
 * (`BUILTIN.MUSIC.INSTRUMENTS`); `nacatamalon:` in front of a name always means the engine's.
 *
 * @param doc - The song.
 * @param sampleRate - Samples per second. Default `44100`.
 * @param options - `transpose`: semitones up (or down, below zero) for every voice but the noise and
 * the samples, which play drums and have no key. `samples`: the sound files its instruments' `sample`
 * name, already read, by that name; the engine's own (`nacatamalon:kick`) need not be given.
 * @returns The tracks, how long they are, where the loop goes back to, every note, and the errors.
 *
 * @example
 * ```ts
 * const song = renderSong({
 *     format: SONG_FORMAT,
 *     tempo: 120,
 *     meter: [3, 4],
 *     voices: { pulse1: { notes: "d'4 g8 a b c' | d'4 g g |" } },
 * });
 * song.errors; // [] when every bar adds up
 * ```
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const renderSong = (
    doc: TSongDoc,
    sampleRate = 44100,
    options: { transpose?: number; samples?: ReadonlyMap<string, TSongSample> } = {},
): TRenderedSong => {
    const read = readSong(doc, sampleRate, options);
    const { length, loopSample } = read;
    const voices: Partial<Record<TSongVoiceName, Float32Array>> = {};
    const send = read.echo !== null ? new Float32Array(length) : null;
    for (const { voice, notes } of read.voices) {
        const track = new Float32Array(length);
        for (const note of notes) {
            note.make().run(length, track, send, 0);
        }
        voices[voice] = track;
    }
    const echo = send !== null ? renderEcho(send, sampleRate, loopSample, read.echo ?? undefined) : undefined;

    return {
        sampleRate,
        length,
        duration: length / sampleRate,
        loopSample,
        loopStart: loopSample / sampleRate,
        voices,
        ...(echo !== undefined ? { echo } : {}),
        notes: read.notes,
        errors: read.errors,
        instrumentErrors: read.instrumentErrors,
    };
};

/**
 * Every voice of a rendered song added into one track, for a file or a measure of the whole.
 *
 * @param song - What `renderSong` gave back.
 * @returns One track, as long as the song.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mixSong = (song: TRenderedSong): Float32Array => {
    const mix = new Float32Array(song.length);
    for (const track of [...SONG_VOICES.map((voice) => song.voices[voice]), song.echo]) {
        if (track === undefined) {
            continue;
        }
        for (let i = 0; i < mix.length; i += 1) {
            mix[i]! += track[i]!;
        }
    }
    return mix;
};
