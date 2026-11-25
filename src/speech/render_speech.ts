import { EMPHASES } from './languages/emphasis';
import { SPEECHES } from './languages/language_speech';
import { phraseMelody } from './languages/melody';
import { buildPhoneme, mouthOf, nextSoundOf, pauseSegment } from './build_phoneme';
import { parsePhonemes } from './parse_phonemes';
import { PHONEMES, isVowel, soundOf } from './phonemes';
import { renderVoice } from './voice';
import { pitchTrack, voiceSettingsOf } from './voice_settings';
import type { TSampledSound } from '../audio/types/t_sound';
import type { TLanguageSpeech } from './languages/language_speech';
import type { TSpeechLanguage, TSpeechOptions } from './types/t_speech';
import type { TAccent, TPhrase } from './languages/melody';
import type { TSaidSound, TSaidToken } from './languages/said';
import type { TPhonemeToken } from './parse_phonemes';
import type { TVoiceSegment, TVoiceTarget } from './voice';

const FRAME = 0.005;
const LEAD = 0.03;

/**
 * Says words aloud with the engine's synthetic voice, and hands them back as a sound a game plays
 * like any other (`useSound(renderSpeech({ text: 'hello' }))`).
 *
 * The voice is made, not recorded: a throat and a mouth worked out sample by sample, the way the
 * machines of the eighties spoke. Text is read by the rules of its language; a word the rules read
 * wrong, or a language with none, is written as `phonemes`. The pitch falls over a phrase, rises on
 * stressed syllables by `melody`, and climbs at the end of a question. Each language
 * is said its own way: the soft t of "water", the soft b, d and g of Spanish, a comma that leaves the
 * pitch up, a question with "what" or "how" that falls. It is English unless `language` says otherwise.
 *
 * @param options - What to say and in what voice.
 * @returns The samples, ready for `useSound`.
 *
 * @example
 * ```ts
 * import { createScene, useSound } from 'nacatamalon';
 * import { renderSpeech } from 'nacatamalon/speech';
 *
 * const Level = () => {
 *     const greeting = useSound(renderSpeech({ text: 'Hello, player!', pitch: 48 }));
 *     greeting.play();
 *     return createScene();
 * };
 * ```
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const renderSpeech = (options: TSpeechOptions): TSampledSound => {
    const settings = voiceSettingsOf(options);
    const speed = Math.max(0.1, options.speed ?? 1);
    const melody = options.melody ?? 2.5;
    const base = options.pitch ?? 45;
    const language = options.language ?? 'en';
    const speech = language === 'none' ? null : languageSpeech(language);
    if (speech === null && options.phonemes === undefined) throw new Error('[NacatamalOn] renderSpeech: language "none" reads no text. Write it as phonemes.');
    const written = options.phonemes === undefined ? [] : parsePhonemes(options.phonemes);
    const tokens: readonly (TPhonemeToken | TSaidToken)[] = speech === null ? written : options.phonemes === undefined ? speech.read(options.text ?? '') : speech.say(written);

    const segments: TVoiceSegment[] = [];
    const accents: TAccent[] = [];
    const phrases: TPhrase[] = [];
    let mouth = mouthOf(PHONEMES.AX!);
    let time = LEAD;
    let phraseStart = time;
    segments.push(pauseSegment(LEAD, mouth));

    const nameAt = (i: number): string | undefined => {
        const token = tokens[i];
        return token && 'name' in token ? token.name : undefined;
    };
    const lastVowelBeforePause = (i: number): boolean => {
        for (let j = i + 1; j < tokens.length; j += 1) {
            const token = tokens[j]!;
            if ('pause' in token) return true;
            if (isVowel(token.name)) return false;
        }
        return true;
    };

    tokens.forEach((token, i) => {
        if ('pause' in token) {
            if (time > phraseStart) {
                const asked = 'asks' in token ? token : { asks: token.mark === '?', asksWhat: false, begins: false };
                phrases.push({ start: phraseStart, end: time, mark: token.mark, asks: asked.asks, asksWhat: asked.asksWhat, begins: asked.begins });
            }
            segments.push(pauseSegment(token.pause / speed, mouth));
            time += token.pause / speed;
            phraseStart = time;
            return;
        }
        const name = token.name === 'AH' && token.stress === 0 ? 'AX' : token.name;
        const phoneme = soundOf(name)!;
        const vowel = isVowel(name);
        let length = phoneme.length / speed;
        if (vowel) {
            length *= speech?.vowel(tokens as readonly TSaidToken[], i, nameAt(i + 1)) ?? (token.stress === 1 ? 1.2 : token.stress === 2 ? 1 : 0.8);
            if (lastVowelBeforePause(i)) length *= 1.3;
        }
        const level = 'emphasis' in token ? token.emphasis : undefined;
        const emphasis = level && EMPHASES[level];
        if (emphasis) length *= vowel && token.stress === 1 ? emphasis.vowel : emphasis.sounds;
        const how = speech ? { shape: speech.shape, puff: speech.puff(token as TSaidSound) } : undefined;
        const built = withPower(buildPhoneme(name, length, nextSoundOf(nameAt(i + 1)), nameAt(i - 1) === 'S', how), emphasis?.power ?? 1);
        const took = built.reduce((sum, segment) => sum + segment.length, 0);
        if (vowel && token.stress > 0) {
            const height = melody * (token.stress === 1 ? 1 : 0.4) * (emphasis?.accent ?? 1);
            // What stands out rises early in its syllable, where an accent of its phrase rises late.
            accents.push(level === 'strong' || level === 'moderate'
                ? { at: time + took * 0.45, width: Math.max(took, 0.13), height, fixed: true }
                : { at: time + took / 2, width: took, height });
        }
        segments.push(...built);
        mouth = built[built.length - 1]!.to ?? built[built.length - 1]!.from;
        time += took;
    });
    if (time > phraseStart) phrases.push({ start: phraseStart, end: time, mark: '.', asks: false, asksWhat: false, begins: false });
    segments.push(pauseSegment(0.06, mouth));
    time += 0.06;

    const frames = new Float32Array(Math.ceil(time / FRAME) + 2).fill(base);
    if (speech) phraseMelody(frames, FRAME, phrases, accents, base, melody, speech.accent);
    else for (const phrase of phrases) {
        const length = phrase.end - phrase.start;
        for (let f = Math.floor(phrase.start / FRAME); f * FRAME < phrase.end; f += 1) {
            const along = (f * FRAME - phrase.start) / length;
            let rise = 1 - 2.5 * along;
            if (phrase.mark === '?') rise += 5 * Math.max(0, (f * FRAME - (phrase.end - 0.3)) / 0.3);
            frames[f] = base + rise;
        }
    }
    for (const accent of accents) {
        const from = Math.max(0, Math.floor((accent.at - accent.width) / FRAME));
        const to = Math.min(frames.length - 1, Math.ceil((accent.at + accent.width) / FRAME));
        for (let f = from; f <= to; f += 1) {
            const distance = Math.abs(f * FRAME - accent.at) / accent.width;
            if (distance < 1) frames[f] = frames[f]! + accent.height * 0.5 * (1 + Math.cos(Math.PI * distance));
        }
    }

    const samples = renderVoice(segments, pitchTrack(frames, FRAME), settings);
    return { samples, sampleRate: settings.sampleRate, key: 'speech' };
};

/**
 * A sound made louder or softer, its mouth as it is.
 */
const withPower = (segments: TVoiceSegment[], power: number): TVoiceSegment[] => {
    if (power === 1) return segments;
    const louder = (target: TVoiceTarget): TVoiceTarget => ({ ...target, voice: target.voice * power, aspiration: target.aspiration * power, noise: target.noise * power });
    return segments.map((segment) => ({ ...segment, from: louder(segment.from), to: segment.to && louder(segment.to) }));
};

const languageSpeech = (language: Exclude<TSpeechLanguage, 'none'>): TLanguageSpeech => {
    const speech = SPEECHES[language];
    if (!speech) throw new Error(`[NacatamalOn] renderSpeech: there are no rules to say "${language as string}". Write it as phonemes, in language "none".`);
    return speech;
};
