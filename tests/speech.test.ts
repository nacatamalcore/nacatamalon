import { describe, expect, test } from 'bun:test';
import { renderSinging, renderSpeech, textToPhonemes } from '../src/speech';

describe('textToPhonemes, Spanish', () => {
    test('stresses the penultimate syllable of a word ending in a vowel, n or s, and the last otherwise', () => {
        expect(textToPhonemes('casa')).toBe('K A1 S A0');
        expect(textToPhonemes('reloj')).toBe('RR E0 L O1 X');
    });

    test('a written accent wins', () => {
        expect(textToPhonemes('canción')).toBe('K A0 N S Y O1 N');
    });

    test('an unstressed i or u beside a vowel slides into it', () => {
        expect(textToPhonemes('bueno')).toBe('B W E1 N O0');
        expect(textToPhonemes('ciudad')).toBe('S Y U0 D A1 D');
    });

    test('tells the tap from the trill, and reads gu, gü, qu, ll and ñ', () => {
        expect(textToPhonemes('perro')).toBe('P E1 RR O0');
        expect(textToPhonemes('caro')).toBe('K A1 DX O0');
        expect(textToPhonemes('guitarra')).toBe('G I0 T A1 RR A0');
        expect(textToPhonemes('pingüino')).toBe('P I0 N G W I1 N O0');
        expect(textToPhonemes('queso llama niño')).toBe('K E1 S O0 Y A1 M A0 N I1 NY O0');
    });

    test('keeps punctuation as pauses', () => {
        expect(textToPhonemes('¿Qué hora es?')).toBe('K E1 O1 DX A0 E1 S ?');
    });
});

describe('renderSpeech', () => {
    test('is the same every time, and loud without clipping', () => {
        const a = renderSpeech({ text: 'hola' });
        const b = renderSpeech({ text: 'hola' });
        expect(a.sampleRate).toBe(22050);
        expect(a.samples).toEqual(b.samples);
        const peak = a.samples.reduce((most, value) => Math.max(most, Math.abs(value)), 0);
        expect(peak).toBeCloseTo(0.8, 3);
    });

    test('phonemes win over text', () => {
        expect(renderSpeech({ text: 'hola', phonemes: 'S' }).samples).toEqual(renderSpeech({ phonemes: 'S' }).samples);
    });

    test('says what phoneme it does not know', () => {
        expect(() => renderSpeech({ phonemes: 'AA1 QQ' })).toThrow('"QQ"');
    });

    test('speaks more slowly at a lower speed', () => {
        const fast = renderSpeech({ text: 'buenos días', speed: 2 }).samples.length;
        const slow = renderSpeech({ text: 'buenos días' }).samples.length;
        expect(slow).toBeGreaterThan(fast * 1.5);
    });
});

describe('renderSinging', () => {
    test('lasts as long as its beats', () => {
        const song = renderSinging({ tempo: 120, notes: [{ pitch: 'C3', beats: 2, lyric: 'la' }, { pitch: 'D3', beats: 2, lyric: 'la' }] });
        const seconds = song.samples.length / song.sampleRate;
        expect(seconds).toBeGreaterThan(2);
        expect(seconds).toBeLessThan(2.4);
    });

    test('a note without a syllable holds the one before, and one without a pitch is a rest', () => {
        const song = renderSinging({ tempo: 60, notes: [{ pitch: 48, lyric: 'a' }, { pitch: 50 }, {}, { pitch: 48, lyric: 'a' }] });
        const sampleRate = song.sampleRate;
        const loudness = (from: number) => {
            let sum = 0;
            for (let i = 0; i < sampleRate * 0.2; i += 1) sum += song.samples[Math.round((from + 0.04) * sampleRate) + i]! ** 2;
            return Math.sqrt(sum / (sampleRate * 0.2));
        };
        expect(loudness(1.4)).toBeGreaterThan(0.05);
        expect(loudness(2.4)).toBeLessThan(0.01);
    });

    test('says where the first beat lands, after the consonants that come before it', () => {
        const plain = renderSinging({ notes: [{ pitch: 48, lyric: 'a' }] });
        const opened = renderSinging({ notes: [{ pitch: 48, lyric: 'tra' }] });
        expect(opened.start).toBeGreaterThan(plain.start + 0.05);
        // Everything after it is the song: the same length after the beat, whatever came before.
        expect(opened.samples.length - opened.start * opened.sampleRate).toBeCloseTo(plain.samples.length - plain.start * plain.sampleRate, -1);
    });

    test('says which note it cannot read', () => {
        expect(() => renderSinging({ notes: [{ pitch: 'H2', lyric: 'a' }] })).toThrow('"H2"');
    });
});
