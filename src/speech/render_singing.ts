import { buildPhoneme, mouthOf, nextSoundOf, pauseSegment } from './build_phoneme';
import { parsePhonemes } from './parse_phonemes';
import { PHONEMES, isVowel } from './phonemes';
import { textToPhonemes } from './text_to_phonemes';
import { singingPitch, vibratoWave } from './singing_pitch';
import { renderVoice } from './voice';
import type { TPlacedNote } from './singing_pitch';
import type { TVoiceSettings } from './voice';
import { voiceSettingsOf } from './voice_settings';
import type { TSingingOptions, TSungNote, TSungSound } from './types/t_speech';
import type { TVoiceSegment, TVoiceTarget } from './voice';

const NOTE_NAMES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * The shortest a vowel is sung, however much consonant is around it.
 */
const SHORTEST_VOWEL = 0.05;

/**
 * A note's pitch as a MIDI number: `'C4'` is 60.
 */
const pitchOf = (pitch: number | string): number => {
    if (typeof pitch === 'number') return pitch;
    const match = /^([A-G])([#b]?)(-?\d)$/.exec(pitch.trim());
    if (!match) throw new Error(`[NacatamalOn] speech: "${pitch}" is not a note. Write it as C4, F#5 or Bb3.`);
    const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
    return 12 * (Number(match[3]) + 1) + NOTE_NAMES[match[1]!]! + accidental;
};

/**
 * One syllable and the notes it is sung over, or a rest.
 */
type TGroup = { names: string[]; notes: { pitch: number; start: number }[]; start: number; end: number; share?: number } | { rest: true; start: number; end: number };

/**
 * Sings a melody with words, with the engine's synthetic voice, and hands it back as a sound.
 *
 * Each note carries a syllable. The consonants that open it are sung just before the beat, so the
 * vowel lands on it, the way a singer does; the vowel is held for the rest of the note, and a
 * diphthong turns at its end ("dai-" holds the a and slides to the i). A note with no syllable holds
 * the one before over it, at its own pitch.
 *
 * @param options - The notes, the tempo and the voice.
 * @returns The samples, ready for `useSound`, and where the first beat lands in them, which is
 *   where an accompaniment starts.
 *
 * @example
 * ```ts
 * import { renderSinging } from 'nacatamalon/speech';
 *
 * const song = renderSinging({
 *     tempo: 100,
 *     language: 'es',
 *     notes: [
 *         { pitch: 'G3', beats: 1, lyric: 'cum' }, { pitch: 'G3', lyric: 'ple' },
 *         { pitch: 'A3', beats: 2, lyric: 'a' }, { pitch: 'G3', beats: 2, lyric: 'ños' },
 *     ],
 * });
 * ```
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const renderSinging = (options: TSingingOptions): TSungSound => {
    const plan = planSinging(options);
    const samples = renderVoice(plan.segments, singingPitch(plan.notes, plan.vibrato, plan.settings.seed), sungSettings(plan));
    return { samples, sampleRate: plan.settings.sampleRate, key: 'singing', start: plan.offset };
};

/**
 * A sung line worked out but not yet made: what the mouth does, segment by segment, the notes its
 * pitch follows, and where in it the first beat lands. Working it out is quick; making it is what
 * takes time, and can be done a stretch at a time.
 *
 * @internal
 */
export type TSingingPlan = {
    segments: TVoiceSegment[];
    notes: TPlacedNote[];
    /** Where the first beat lands, in seconds. */
    offset: number;
    settings: TVoiceSettings;
    vibrato: number;
    /**
     * Where the voice can start again from silence, at the start of a rest: the segment it starts
     * on, and when, in seconds.
     */
    restarts: { segment: number; time: number }[];
};

/**
 * How much louder a voice gets as it wavers, up and down, at the top of its vibrato.
 */
const SWELL = 0.09;

/**
 * A plan's settings for the voice that sings it: it swells with its vibrato. Made anew for every
 * voice, as it keeps its place.
 *
 * @internal
 */
export const sungSettings = (plan: TSingingPlan): TVoiceSettings => {
    const wave = vibratoWave(plan.notes, plan.settings.seed);
    return { ...plan.settings, swell: plan.vibrato === 0 ? () => 1 : (time) => 1 + SWELL * wave(time) };
};

/**
 * A note of a line, and how much of its loudness is this voice's when others sing it too.
 *
 * @internal
 */
export type TSharedNote = TSungNote & { share?: number };

/**
 * Works out how a line is sung, without making it.
 *
 * @internal
 */
export const planSinging = (options: Omit<TSingingOptions, 'notes'> & { notes: readonly TSharedNote[] }): TSingingPlan => {
    const settings = voiceSettingsOf(options);
    const beat = 60 / Math.max(1, options.tempo ?? 120);
    const vibrato = options.vibrato ?? 0.25;
    const transpose = options.transpose ?? 0;

    const groups = groupsOf(options.notes, beat, transpose, (note) =>
        parsePhonemes(note.phonemes ?? textToPhonemes(spokenOf(note.lyric ?? ''), options.language)).flatMap((token) => ('name' in token ? [token.name === 'AH' && token.stress === 0 ? 'AX' : token.name] : [])));

    // Each syllable's opening consonants, built once to know how long they take.
    const onsets = groups.map((group, g) => {
        if ('rest' in group) return [];
        const first = group.names.findIndex(isVowel);
        const names = group.names.slice(0, first < 0 ? group.names.length : first);
        return names.flatMap((name, i) => buildPhoneme(name, PHONEMES[name]!.length * 0.85, nextSoundOf(names[i + 1] ?? group.names[first]), names[i - 1] === 'S' || (i === 0 && lastNameOf(groups[g - 1]) === 'S')));
    });
    const onsetLength = onsets.map((segments) => segments.reduce((sum, segment) => sum + segment.length, 0));
    // A syllable takes its opening from the end of the one before, at most a part of it.
    const lead = groups.map((group, g) => (g === 0 || 'rest' in group ? (g === 0 ? onsetLength[0]! : 0) : Math.min(onsetLength[g]!, 0.4 * (groups[g - 1]!.end - groups[g - 1]!.start))));
    const offset = (lead[0] ?? 0) + 0.04;

    const segments: TVoiceSegment[] = [pauseSegment(offset - (lead[0] ?? 0), mouthOf(PHONEMES.AX!))];
    const restarts = [{ segment: 0, time: 0 }];
    let mouth: TVoiceTarget = segments[0]!.from;
    groups.forEach((group, g) => {
        const from = group.start - lead[g]! + offset;
        const to = (groups[g + 1] ? groups[g + 1]!.start - lead[g + 1]! : group.end) + offset;
        const span = Math.max(0.01, to - from);
        if ('rest' in group) {
            restarts.push({ segment: segments.length, time: segments.reduce((sum, segment) => sum + segment.length, 0) });
            const before = groups[g - 1];
            // What is still dying away in a rest is as loud as it was sung.
            segments.push(...shared([pauseSegment(span, mouth)], before && !('rest' in before) ? before.share : undefined));
            return;
        }
        const first = group.names.findIndex(isVowel);
        if (first < 0) {
            segments.push(...shared(scaled(onsets[g]!, span / Math.max(1e-6, onsetLength[g]!)), group.share));
            mouth = segments[segments.length - 1]!.from;
            return;
        }
        let last = first;
        while (last + 1 < group.names.length && isVowel(group.names[last + 1]!)) last += 1;
        const vowels = group.names.slice(first, last + 1);
        const coda = group.names.slice(last + 1);
        const nextFirst = groups[g + 1] && !('rest' in groups[g + 1]!) ? (groups[g + 1] as { names: string[] }).names[0] : undefined;
        const codaSegments = coda.flatMap((name, i) => buildPhoneme(name, PHONEMES[name]!.length * 0.85, nextSoundOf(coda[i + 1] ?? nextFirst), coda[i - 1] === 'S'));
        const codaLength = codaSegments.reduce((sum, segment) => sum + segment.length, 0);

        let consonants = 1;
        let vowelLength = span - onsetLength[g]! - codaLength;
        if (vowelLength < SHORTEST_VOWEL) {
            consonants = Math.max(0.05, (span - SHORTEST_VOWEL) / Math.max(1e-6, onsetLength[g]! + codaLength));
            vowelLength = span - (onsetLength[g]! + codaLength) * consonants;
        }
        const syllable = scaled(onsets[g]!, consonants);
        const each = vowelLength / vowels.length;
        for (const name of vowels) {
            const phoneme = PHONEMES[name]!;
            const [held] = buildPhoneme(name, each, undefined);
            if (phoneme.to) {
                // A diphthong is held on its first vowel and turns to its second at the end.
                const turn = Math.min(each * 0.3, 0.12);
                syllable.push({ length: each - turn, from: held!.from }, { length: turn, from: held!.from, to: held!.to });
            } else syllable.push(held!);
        }
        syllable.push(...scaled(codaSegments, consonants));
        segments.push(...shared(syllable, group.share));
        const end = segments[segments.length - 1]!;
        mouth = end.to ?? end.from;
    });
    const ending = groups[groups.length - 1];
    segments.push(...shared([pauseSegment(0.1, mouth)], ending && !('rest' in ending) ? ending.share : undefined));

    const notes = groups.flatMap((group, g) => {
        if ('rest' in group) return [];
        const before = groups[g - 1];
        const rested = before === undefined || 'rest' in before;
        return group.notes.map((note, k) => ({ pitch: note.pitch, start: note.start + offset, held: group.start + offset, fresh: k === 0 && rested }));
    });
    return { segments, notes, offset, settings, vibrato, restarts };
};

/**
 * A syllable's lyric as it is read: a hyphen at its end only says the word goes on in the next one.
 */
const spokenOf = (lyric: string): string => lyric.replace(/-$/, '');

/**
 * The notes as syllables with the notes each is held over, and rests, placed in seconds.
 */
const groupsOf = (notes: readonly TSharedNote[], beat: number, transpose: number, phonemesOf: (note: TSungNote) => string[]): TGroup[] => {
    const groups: TGroup[] = [];
    let time = 0;
    for (const note of notes) {
        const length = Math.max(0, note.beats ?? 1) * beat;
        const current = groups[groups.length - 1];
        if (note.pitch === undefined) {
            groups.push({ rest: true, start: time, end: time + length });
        } else if (note.lyric === undefined && note.phonemes === undefined && current && !('rest' in current)) {
            current.notes.push({ pitch: pitchOf(note.pitch) + transpose, start: time });
            current.end = time + length;
        } else {
            const names = note.lyric === undefined && note.phonemes === undefined ? ['AX'] : phonemesOf(note);
            groups.push({ share: note.share, names: names.length > 0 ? names : ['AX'], notes: [{ pitch: pitchOf(note.pitch) + transpose, start: time }], start: time, end: time + length });
        }
        time += length;
    }
    return groups;
};

const lastNameOf = (group: TGroup | undefined): string | undefined => (group && !('rest' in group) ? group.names[group.names.length - 1] : undefined);

const scaled = (segments: readonly TVoiceSegment[], by: number): TVoiceSegment[] => (by === 1 ? [...segments] : segments.map((segment) => ({ ...segment, length: segment.length * by })));

const shared = (segments: readonly TVoiceSegment[], share: number | undefined): readonly TVoiceSegment[] => (share === undefined ? segments : segments.map((segment) => ({ ...segment, share })));
