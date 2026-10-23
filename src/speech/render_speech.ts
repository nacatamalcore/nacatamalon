import { buildPhoneme, mouthOf, nextSoundOf, pauseSegment } from './build_phoneme';
import { parsePhonemes } from './parse_phonemes';
import { PHONEMES, isVowel } from './phonemes';
import { textToPhonemes } from './text_to_phonemes';
import { renderVoice } from './voice';
import { pitchTrack, voiceSettingsOf } from './voice_settings';
import type { TSampledSound } from '../audio/types/t_sound';
import type { TSpeechOptions } from './types/t_speech';
import type { TVoiceSegment } from './voice';

const FRAME = 0.005;
const LEAD = 0.03;

/**
 * Says words aloud with the engine's synthetic voice, and hands them back as a sound a game plays
 * like any other (`useSound(renderSpeech({ text: 'hola' }))`).
 *
 * The voice is made, not recorded: a throat and a mouth worked out sample by sample, the way the
 * machines of the eighties spoke. Text is read by the rules of its language; a word the rules read
 * wrong, or a language with none, is written as `phonemes`. The pitch falls over a phrase, rises on
 * stressed syllables by `melody`, and climbs at the end of a question.
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
 *     const greeting = useSound(renderSpeech({ text: '¡Hola, jugador!', pitch: 48 }));
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
    const tokens = parsePhonemes(options.phonemes ?? textToPhonemes(options.text ?? '', options.language));

    const segments: TVoiceSegment[] = [];
    const accents: { at: number; width: number; height: number }[] = [];
    const phrases: { start: number; end: number; question: boolean }[] = [];
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
            if (time > phraseStart) phrases.push({ start: phraseStart, end: time, question: token.mark === '?' });
            segments.push(pauseSegment(token.pause / speed, mouth));
            time += token.pause / speed;
            phraseStart = time;
            return;
        }
        const name = token.name === 'AH' && token.stress === 0 ? 'AX' : token.name;
        const phoneme = PHONEMES[name]!;
        const vowel = isVowel(name);
        let length = phoneme.length / speed;
        if (vowel) {
            length *= token.stress === 1 ? 1.2 : token.stress === 2 ? 1 : 0.8;
            if (lastVowelBeforePause(i)) length *= 1.3;
        }
        const built = buildPhoneme(name, length, nextSoundOf(nameAt(i + 1)), nameAt(i - 1) === 'S');
        const took = built.reduce((sum, segment) => sum + segment.length, 0);
        if (vowel && token.stress > 0) accents.push({ at: time + took / 2, width: took, height: melody * (token.stress === 1 ? 1 : 0.4) });
        segments.push(...built);
        mouth = built[built.length - 1]!.to ?? built[built.length - 1]!.from;
        time += took;
    });
    if (time > phraseStart) phrases.push({ start: phraseStart, end: time, question: false });
    segments.push(pauseSegment(0.06, mouth));
    time += 0.06;

    const frames = new Float32Array(Math.ceil(time / FRAME) + 2).fill(base);
    for (const phrase of phrases) {
        const length = phrase.end - phrase.start;
        for (let f = Math.floor(phrase.start / FRAME); f * FRAME < phrase.end; f += 1) {
            const along = (f * FRAME - phrase.start) / length;
            let rise = 1 - 2.5 * along;
            if (phrase.question) rise += 5 * Math.max(0, (f * FRAME - (phrase.end - 0.3)) / 0.3);
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
