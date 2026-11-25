import { describe, expect, test } from 'bun:test';
import { renderSinging, renderSpeech, textToPhonemes } from '../src/speech';
import { isRunTogether, readSpanish, spanishMelody } from '../src/speech/languages/spanish_speech';

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

    test('a colon, a dash and a parenthesis pause too, but not before the first word', () => {
        expect(textToPhonemes('pan: vino')).toBe('P A1 N ; B I1 N O0');
        expect(textToPhonemes('—pan— (vino)')).toBe('P A1 N , B I1 N O0 ,');
    });

    test('marks that come together are one pause', () => {
        expect(textToPhonemes('ven!...')).toBe('B E1 N !');
        expect(textToPhonemes('(ven.) ven')).toBe('B E1 N . B E1 N');
        expect(textToPhonemes('ven...?')).toBe('B E1 N ?');
    });

    test('a c or a g that ends a word is hard, and sc is one s', () => {
        expect(textToPhonemes('Isaac')).toBe('I0 S A0 A1 K');
        expect(textToPhonemes('zigzag')).toBe('S I0 G S A1 G');
        expect(textToPhonemes('discípulo')).toBe('D I0 S I1 P U0 L O0');
        expect(textToPhonemes('cielo')).toBe('S Y E1 L O0');
        expect(textToPhonemes('escribe')).toBe('E0 S K DX I1 B E0');
    });

    test('reads accents written as a letter and a mark', () => {
        expect(textToPhonemes('señor Jesús'.normalize('NFD'))).toBe(textToPhonemes('señor Jesús'));
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

describe('Spanish said as Spanish', () => {
    const said = (text: string) => readSpanish(text).map((token) => ('name' in token ? token.name : token.mark)).join(' ');
    const endings = (text: string) => readSpanish(text).flatMap((token) => ('pause' in token ? [token.asksWhat] : []));

    test('b, d and g are soft except after a pause, a nasal or, the d, an l', () => {
        expect(said('boca dada')).toBe('B O K A DDH A DDH A');
        expect(said('la boda')).toBe('L A BH O DDH A');
        expect(said('un dado, gato')).toBe('U N D A DDH O , G A T O');
        expect(said('caldo')).toBe('K A L D O');
    });

    test('an n is made where the next consonant is, across words too', () => {
        expect(said('un beso')).toBe('U M B E S O');
        expect(said('cinco')).toBe('S I NG K O');
        expect(said('nuevo')).toBe('N W E BH O');
        expect(said('Manuel')).toBe('M A N W E L');
        expect(said('un huevo')).toBe('U NG W E BH O');
    });

    test('the same sound twice across words is said once, and vowels that meet are shortened', () => {
        expect(said('los cielos')).toBe('L O S Y E L O S');
        expect(said('la amiga')).toBe('L A M I GH A');
        const seconds = (text: string) => renderSpeech({ text }).samples.length;
        expect(seconds('me ama')).toBeLessThan(seconds('me, ama'));
        expect(isRunTogether(readSpanish('te oro'), 1)).toBe(true);
        expect(isRunTogether(readSpanish('leo'), 2)).toBe(false);
    });

    test('knows a question that asks what from one that asks for a yes or a no', () => {
        expect(endings('¿Y de dónde vienes?')).toEqual([true]);
        expect(endings('¿Cómo tú, siendo judío, pides?')).toEqual([true, true, true]);
        expect(endings('¿No sabes qué es?')).toEqual([false]);
        expect(endings('Ven. Qué es?')).toEqual([false, true]);
        expect(endings('¿—Qué es?')).toEqual([true]);
        expect(endings('Señor, ¿dónde estás?')).toEqual([false, true]);
        expect(said('Ven. ¿? hola')).toBe('B E N . O L A');
        expect(said('Ven. ¿...? hola')).toBe('B E N . O L A');
        expect(endings('Ven, ¿...qué es?')).toEqual([false, true]);
        expect(endings('Ven, ¿…qué es?')).toEqual([false, true]);
    });

    test('a word between emphasis tags stands out, and a small one has its stress back', () => {
        const emphasized = (text: string) => readSpanish(text).flatMap((token) => ('name' in token ? [token.emphasis] : []));
        expect(emphasized('<emphasis>yo</emphasis> soy')).toEqual(['moderate', 'moderate', undefined, undefined, undefined]);
        expect(emphasized('<emphasis level="strong">yo</emphasis>')).toEqual(['strong', 'strong']);
        expect(textToPhonemes('<emphasis>mi</emphasis> casa')).toBe('M I1 K A1 S A0');
        expect(textToPhonemes('<emphasis level="reduced">mi</emphasis> casa')).toBe(textToPhonemes('mi casa'));
        const length = (text: string) => renderSpeech({ text }).samples.length;
        const plain = length('yo soy');
        expect(length('<emphasis>yo</emphasis> soy')).toBeGreaterThan(plain);
        expect(length('<emphasis level="strong">yo</emphasis> soy')).toBeGreaterThan(length('<emphasis>yo</emphasis> soy'));
        expect(length('<emphasis level="reduced">yo</emphasis> soy')).toBeLessThan(plain);
    });

    test('a sound two words share is as the one that brings its stress', () => {
        const vowel = (text: string, n: number) => readSpanish(text).flatMap((token) => ('name' in token ? [token.emphasis] : []))[n];
        expect(vowel('<emphasis level="reduced">la</emphasis> <emphasis level="strong">alma</emphasis>', 1)).toBe('strong');
        expect(vowel('<emphasis level="strong">casa</emphasis> alma', 3)).toBeUndefined();
        expect(vowel('<emphasis level="strong">casa</emphasis> alegre', 3)).toBe('strong');
    });

    test('the small words of a phrase that stands out still lean on it', () => {
        expect(textToPhonemes('<emphasis>el pan de la vida</emphasis>')).toBe(textToPhonemes('el pan de la vida'));
        expect(textToPhonemes('¿<emphasis>?mi</emphasis> casa')).toBe('M I1 K A1 S A0');
        expect(textToPhonemes('¿<emphasis>por</emphasis> 5?')).toBe(textToPhonemes('¿pór cinco?'));
        const stresses = (text: string) => readSpanish(text).flatMap((token) => ('name' in token ? [token.stress] : []));
        expect(stresses('<emphasis level="reduced">nuestro</emphasis> padre')).toEqual(stresses('nuestro padre'));
    });

    test('an emphasis does not move with its phrase', () => {
        const accents = [{ at: 0.2, width: 0.1, height: 2 }, { at: 0.5, width: 0.1, height: 4, fixed: true }, { at: 0.9, width: 0.1, height: 2 }];
        spanishMelody(new Float32Array(200), 0.005, [{ start: 0, end: 1, mark: '.', asks: false, asksWhat: false, begins: false }], accents, 45, 2.5);
        expect(accents[0]!.at).toBeGreaterThan(0.2);
        expect(accents[1]).toEqual({ at: 0.5, width: 0.1, height: 4, fixed: true });
    });

    test('says which tag it does not read, and which has no pair', () => {
        expect(() => renderSpeech({ text: '<b>a</b>' })).toThrow('"<b>" is not a tag');
        expect(() => renderSpeech({ text: '<emphasis level="none">a</emphasis>' })).toThrow('is not a tag');
        expect(() => renderSpeech({ text: 'a</emphasis>' })).toThrow('has no pair');
        expect(() => renderSpeech({ text: '<emphasis>a <emphasis>b</emphasis>' })).toThrow('has no pair');
        expect(() => renderSpeech({ text: '<emphasis>a' })).toThrow('not closed');
        expect(() => renderSpeech({ text: '<emphasis level="strong" yo' })).toThrow('is not a tag');
        expect(() => renderSpeech({ text: '< emphasis>yo</emphasis>' })).toThrow('is not a tag');
        expect(() => renderSpeech({ text: '<ñandú>' })).toThrow('is not a tag');
        expect(() => renderSpeech({ text: '<H1>' })).toThrow('"<H1>"');
        expect(textToPhonemes('a < b, 3 <3')).toBe(textToPhonemes('a b, 3 3'));
    });

    test('reads numbers as words', () => {
        expect(textToPhonemes('5.000 panes')).toBe(textToPhonemes('cinco mil panes'));
        expect(textToPhonemes('21.131')).toBe(textToPhonemes('veintiún mil ciento treinta y uno'));
    });

    test('reads decimals, zeros and numbers beside letters', () => {
        const same = (a: string, b: string) => expect(textToPhonemes(a)).toBe(textToPhonemes(b));
        same('3,14', 'tres coma catorce');
        same('3.05', 'tres punto cero cinco');
        same('0.500', 'cero punto quinientos');
        same('1.500,50', 'mil quinientos coma cincuenta');
        same('007', 'cero cero siete');
        same('1,2,3', 'uno, dos, tres');
        same('100 y 101000', 'cien y ciento un mil');
        same('1234567', 'uno dos tres cuatro cinco seis siete');
        same('J1 5km', 'j uno cinco km');
        same('Son 12.', 'son doce.');
    });

    test('a question after a name begins as high as one alone', () => {
        const first = (text: string) => {
            const frames = new Float32Array(400);
            const name = text.startsWith('S');
            const phrase = { start: name ? 1 : 0, end: name ? 2 : 1, mark: '?', asks: true, asksWhat: true, begins: true };
            const before = { start: 0, end: 0.9, mark: ',', asks: false, asksWhat: false, begins: false };
            spanishMelody(frames, 0.005, name ? [before, phrase] : [phrase], [], 45, 2.5);
            return frames[name ? 200 : 0]!;
        };
        expect(first('Señor, ¿dónde?')).toBeCloseTo(first('¿dónde?'), 4);
    });

    test('a phrase ends by its mark: a comma up, a full stop down, a yes or no question high', () => {
        const end = (mark: string, asksWhat = false) => {
            const frames = new Float32Array(200);
            spanishMelody(frames, 0.005, [{ start: 0, end: 1, mark, asks: mark === '?', asksWhat, begins: true }], [], 45, 2.5);
            return frames[199]!;
        };
        expect(end('.')).toBeLessThan(end(';'));
        expect(end(';')).toBeLessThan(end(','));
        expect(end(',')).toBeLessThan(end('?'));
        expect(end('?', true)).toBeLessThan(end(';'));
    });

    test('a word that names something every object has is read', () => {
        expect(textToPhonemes('constructor')).toBe('K O0 N S T DX U0 K T O1 DX');
    });

    test('an exclamation is not said as a statement', () => {
        expect(renderSpeech({ text: 'ven!' }).samples).not.toEqual(renderSpeech({ text: 'ven.' }).samples);
    });

    test('its sounds are not phonemes to write, and phonemes are said as written', () => {
        expect(() => renderSpeech({ phonemes: 'A1 BH A0' })).toThrow('"BH"');
        expect(renderSpeech({ phonemes: 'A1 D A0' }).samples).not.toEqual(renderSpeech({ text: 'ada' }).samples);
    });

    test('nothing, or only marks, is silence', () => {
        for (const text of ['', '...', '¿?']) expect(renderSpeech({ text }).samples.every((value) => value === 0)).toBe(true);
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

    test('with no notes, it is silence with a beat in it', () => {
        const song = renderSinging({ notes: [] });
        expect(song.start).toBeCloseTo(0.04, 5);
        expect(song.samples.every((value) => value === 0)).toBe(true);
    });

    test('says which note it cannot read', () => {
        expect(() => renderSinging({ notes: [{ pitch: 'H2', lyric: 'a' }] })).toThrow('"H2"');
    });
});
