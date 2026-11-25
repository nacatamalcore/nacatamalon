import { describe, expect, test } from 'bun:test';
import { renderSinging, renderSpeech, textToPhonemes } from '../src/speech';
import { phraseMelody } from '../src/speech/languages/melody';
import { isRunTogether, readSpanish, spanishAccent } from '../src/speech/languages/spanish_speech';
import { parsePhonemes } from '../src/speech/parse_phonemes';
import { readEnglish, sayEnglish } from '../src/speech/languages/english_speech';

const spanish = (text: string): string => textToPhonemes(text, 'es');

describe('textToPhonemes, Spanish', () => {
    test('stresses the penultimate syllable of a word ending in a vowel, n or s, and the last otherwise', () => {
        expect(spanish('casa')).toBe('K A1 S A0');
        expect(spanish('reloj')).toBe('RR E0 L O1 X');
    });

    test('a written accent wins', () => {
        expect(spanish('canción')).toBe('K A0 N S Y O1 N');
    });

    test('an unstressed i or u beside a vowel slides into it', () => {
        expect(spanish('bueno')).toBe('B W E1 N O0');
        expect(spanish('ciudad')).toBe('S Y U0 D A1 D');
    });

    test('tells the tap from the trill, and reads gu, gü, qu, ll and ñ', () => {
        expect(spanish('perro')).toBe('P E1 RR O0');
        expect(spanish('caro')).toBe('K A1 DX O0');
        expect(spanish('guitarra')).toBe('G I0 T A1 RR A0');
        expect(spanish('pingüino')).toBe('P I0 N G W I1 N O0');
        expect(spanish('queso llama niño')).toBe('K E1 S O0 Y A1 M A0 N I1 NY O0');
    });

    test('keeps punctuation as pauses', () => {
        expect(spanish('¿Qué hora es?')).toBe('K E1 O1 DX A0 E1 S ?');
    });

    test('a colon, a dash and a parenthesis pause too, but not before the first word', () => {
        expect(spanish('pan: vino')).toBe('P A1 N ; B I1 N O0');
        expect(spanish('—pan— (vino)')).toBe('P A1 N , B I1 N O0 ,');
    });

    test('marks that come together are one pause', () => {
        expect(spanish('ven!...')).toBe('B E1 N !');
        expect(spanish('(ven.) ven')).toBe('B E1 N . B E1 N');
        expect(spanish('ven...?')).toBe('B E1 N ?');
    });

    test('a c or a g that ends a word is hard, and sc is one s', () => {
        expect(spanish('Isaac')).toBe('I0 S A0 A1 K');
        expect(spanish('zigzag')).toBe('S I0 G S A1 G');
        expect(spanish('discípulo')).toBe('D I0 S I1 P U0 L O0');
        expect(spanish('cielo')).toBe('S Y E1 L O0');
        expect(spanish('escribe')).toBe('E0 S K DX I1 B E0');
    });

    test('reads accents written as a letter and a mark', () => {
        expect(spanish('señor Jesús'.normalize('NFD'))).toBe(spanish('señor Jesús'));
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
        const seconds = (text: string) => renderSpeech({ text, language: 'es' }).samples.length;
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
        expect(spanish('<emphasis>mi</emphasis> casa')).toBe('M I1 K A1 S A0');
        expect(spanish('<emphasis level="reduced">mi</emphasis> casa')).toBe(spanish('mi casa'));
        const length = (text: string) => renderSpeech({ text, language: 'es' }).samples.length;
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
        expect(spanish('<emphasis>el pan de la vida</emphasis>')).toBe(spanish('el pan de la vida'));
        expect(spanish('¿<emphasis>?mi</emphasis> casa')).toBe('M I1 K A1 S A0');
        expect(spanish('¿<emphasis>por</emphasis> 5?')).toBe(spanish('¿pór cinco?'));
        const stresses = (text: string) => readSpanish(text).flatMap((token) => ('name' in token ? [token.stress] : []));
        expect(stresses('<emphasis level="reduced">nuestro</emphasis> padre')).toEqual(stresses('nuestro padre'));
    });

    test('an emphasis does not move with its phrase', () => {
        const accents = [{ at: 0.2, width: 0.1, height: 2 }, { at: 0.5, width: 0.1, height: 4, fixed: true }, { at: 0.9, width: 0.1, height: 2 }];
        phraseMelody(new Float32Array(200), 0.005, [{ start: 0, end: 1, mark: '.', asks: false, asksWhat: false, begins: false }], accents, 45, 2.5, spanishAccent);
        expect(accents[0]!.at).toBeGreaterThan(0.2);
        expect(accents[1]).toEqual({ at: 0.5, width: 0.1, height: 4, fixed: true });
    });

    test('says which tag it does not read, and which has no pair', () => {
        expect(() => renderSpeech({ text: '<b>a</b>', language: 'es' })).toThrow('"<b>" is not a tag');
        expect(() => renderSpeech({ text: '<emphasis level="none">a</emphasis>', language: 'es' })).toThrow('is not a tag');
        expect(() => renderSpeech({ text: 'a</emphasis>', language: 'es' })).toThrow('has no pair');
        expect(() => renderSpeech({ text: '<emphasis>a <emphasis>b</emphasis>', language: 'es' })).toThrow('has no pair');
        expect(() => renderSpeech({ text: '<emphasis>a', language: 'es' })).toThrow('not closed');
        expect(() => renderSpeech({ text: '<emphasis level="strong" yo', language: 'es' })).toThrow('is not a tag');
        expect(() => renderSpeech({ text: '< emphasis>yo</emphasis>', language: 'es' })).toThrow('is not a tag');
        expect(() => renderSpeech({ text: '<ñandú>', language: 'es' })).toThrow('is not a tag');
        expect(() => renderSpeech({ text: '<H1>', language: 'es' })).toThrow('"<H1>"');
        expect(spanish('a < b, 3 <3')).toBe(spanish('a b, 3 3'));
    });

    test('reads numbers as words', () => {
        expect(spanish('5.000 panes')).toBe(spanish('cinco mil panes'));
        expect(spanish('21.131')).toBe(spanish('veintiún mil ciento treinta y uno'));
    });

    test('reads decimals, zeros and numbers beside letters', () => {
        const same = (a: string, b: string) => expect(spanish(a)).toBe(spanish(b));
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
            phraseMelody(frames, 0.005, name ? [before, phrase] : [phrase], [], 45, 2.5, spanishAccent);
            return frames[name ? 200 : 0]!;
        };
        expect(first('Señor, ¿dónde?')).toBeCloseTo(first('¿dónde?'), 4);
    });

    test('a phrase ends by its mark: a comma up, a full stop down, a yes or no question high', () => {
        const end = (mark: string, asksWhat = false) => {
            const frames = new Float32Array(200);
            phraseMelody(frames, 0.005, [{ start: 0, end: 1, mark, asks: mark === '?', asksWhat, begins: true }], [], 45, 2.5, spanishAccent);
            return frames[199]!;
        };
        expect(end('.')).toBeLessThan(end(';'));
        expect(end(';')).toBeLessThan(end(','));
        expect(end(',')).toBeLessThan(end('?'));
        expect(end('?', true)).toBeLessThan(end(';'));
    });

    test('a word that names something every object has is read', () => {
        expect(spanish('constructor')).toBe('K O0 N S T DX U0 K T O1 DX');
    });

    test('an exclamation is not said as a statement', () => {
        expect(renderSpeech({ text: 'ven!', language: 'es' }).samples).not.toEqual(renderSpeech({ text: 'ven.', language: 'es' }).samples);
    });

    test('its sounds are not phonemes to write, and phonemes are said as written', () => {
        expect(() => renderSpeech({ phonemes: 'A1 BH A0' })).toThrow('"BH"');
        expect(renderSpeech({ phonemes: 'A1 D A0' }).samples).not.toEqual(renderSpeech({ text: 'ada', language: 'es' }).samples);
    });

    test('nothing, or only marks, is silence', () => {
        for (const text of ['', '...', '¿?']) expect(renderSpeech({ text, language: 'es' }).samples.every((value) => value === 0)).toBe(true);
    });
});

describe('textToPhonemes, English', () => {
    test('is the language when none is said', () => {
        expect(textToPhonemes('Hello, player!')).toBe('HH AH0 L OW1 , P L EY1 ER0 !');
        expect(textToPhonemes('hello')).toBe(textToPhonemes('hello', 'en'));
    });

    test('reads the words English does not write as it says them', () => {
        expect(textToPhonemes('though through tough thought')).toBe('DH OW1 TH R UW1 T AH1 F TH AO1 T');
        expect(textToPhonemes('sword knight island')).toBe('S AO1 R D N AY1 T AY1 L AH0 N D');
    });

    test('reads the rest by rules, a silent e making its vowel long', () => {
        expect(textToPhonemes('rat rate')).toBe('R AE1 T R EY1 T');
        expect(textToPhonemes('shield bright')).toBe('SH IY1 L D B R AY1 T');
        expect(textToPhonemes('potion')).toBe('P OW1 SH AH0 N');
    });

    test('says an ending by the sound before it', () => {
        expect(textToPhonemes('cats games boxes')).toBe('K AE1 T S G EY1 M Z B AA1 K S IH0 Z');
        expect(textToPhonemes('jumped opened wanted')).toBe('JH AH1 M P T OW1 P AH0 N D W AA1 N T IH0 D');
        expect(textToPhonemes('hopping hoping')).toBe('HH AA1 P IH0 NG HH OW1 P IH0 NG');
        expect(textToPhonemes("the dragon's")).toBe('DH AH0 D R AE1 G AH0 N Z');
        expect(textToPhonemes('don’t')).toBe(textToPhonemes("don't"));
    });

    test('reads what an apostrophe leaves of a word', () => {
        expect(textToPhonemes("I'd you've we'll it'll")).toBe('AY0 D Y UW0 V W IY0 L IH0 T AH0 L');
        expect(textToPhonemes("wasn't aren't haven't mustn't")).toBe('W AH1 Z AH0 N T AA1 R N T HH AE1 V AH0 N T M AH1 S AH0 N T');
        expect(textToPhonemes("that'd they'd")).toBe('DH AE0 T AH0 D DH EY0 D');
    });

    test('spells a word with no vowel, and reads accents, titles and places', () => {
        expect(textToPhonemes('HP')).toBe('EY2 CH P IY1');
        expect(textToPhonemes('NPCs')).toBe('EH2 N P IY2 S IY1 Z');
        expect(textToPhonemes('café')).toBe('K AE0 F EY1');
        expect(textToPhonemes('señor')).toBe(textToPhonemes('senor'));
        expect(textToPhonemes('1,000th')).toBe(textToPhonemes('one thousandth'));
        expect(textToPhonemes('Mr. Fox')).toBe('M IH1 S T ER0 F AA1 K S');
        expect(textToPhonemes('1st 22nd 30th')).toBe(textToPhonemes('first twenty second thirtieth'));
        expect(textToPhonemes('shred bred sacred')).toBe('SH R EH1 D B R EH1 D S EY1 K R AH0 D');
    });

    test('takes no long time over a word that is not one', () => {
        // It would take minutes, or overflow, if it looked for other words in these.
        for (const word of [`abc${'man'.repeat(5000)}`, `a${"'s".repeat(8000)}`, 'ness'.repeat(5000)]) expect(textToPhonemes(word).length).toBeGreaterThan(0);
    });

    test('a word made of two is stressed on the first', () => {
        expect(textToPhonemes('gameplay')).toBe('G EY1 M P L EY2');
    });

    test('reads numbers', () => {
        const same = (a: string, b: string) => expect(textToPhonemes(a)).toBe(textToPhonemes(b));
        same('25 coins', 'twenty five coins');
        same('5,000', 'five thousand');
        same('3.05', 'three point zero five');
        same('007', 'zero zero seven');
        same('1,2,3', 'one, two, three');
        same('P1', 'p one');
    });

    test('reads any word there is, and nothing', () => {
        for (const word of ['constructor', 'rhythm', 'hmm', 'xyzzy', 'q', 'aaaa', "'", 'tsk']) expect(() => renderSpeech({ text: word })).not.toThrow();
        expect(textToPhonemes('')).toBe('');
        expect(renderSpeech({ text: '...' }).samples.every((value) => value === 0)).toBe(true);
    });
});

describe('English said as English', () => {
    const names = (text: string) => readEnglish(text).map((token) => ('name' in token ? token.name : token.mark)).join(' ');
    const asked = (text: string) => readEnglish(text).flatMap((token) => ('pause' in token ? [token.asksWhat] : []));

    test('a t or a d between vowels, the second unstressed, is a tap', () => {
        expect(names('water ready')).toBe('W AO DX ER R EH DX IY');
        expect(names('attack')).toBe('AH T AE K');
    });

    test('a stop has air before a stressed vowel, and not after an s', () => {
        const air = (text: string) => readEnglish(text).flatMap((token) => ('air' in token ? [token.air] : []));
        expect(air('pin')).toEqual([true]);
        expect(air('spin')).toEqual([false]);
        expect(air('clean')).toEqual([true]);
    });

    test('a vowel is cut short by an unvoiced sound after it', () => {
        const length = (text: string) => renderSpeech({ phonemes: text }).samples.length;
        expect(length('S IY1 F')).toBeLessThan(length('S IY1 V') + (length('F') - length('V')));
    });

    test('is made of numbers, inside its volume', () => {
        for (const text of ['Hello, player!', 'Where is the <emphasis level="strong">dragon</emphasis>?', 'HP: 25/100 — (ok)…']) {
            for (const value of renderSpeech({ text, volume: 0.7 }).samples) if (!(Math.abs(value) <= 0.7001)) throw new Error(`${text}: ${value}`);
        }
    });

    test('the is said thee before a vowel', () => {
        expect(names('the door')).toBe('DH AH D AO R');
        expect(names('the end')).toContain('DH IY');
    });

    test('knows a question that asks what from one that asks for a yes or a no', () => {
        expect(asked('Where is it?')).toEqual([true]);
        expect(asked('And from where, sir, are you?')).toEqual([true, true, true]);
        expect(asked("What's that?")).toEqual([true]);
        expect(asked('Is it you, who opened it?')).toEqual([false, false]);
        expect(asked('Well, tell me, what is it?')).toEqual([false, false, true]);
        const begins = readEnglish('Tell me, what is it? Come.').flatMap((token) => ('pause' in token ? [[token.asks, token.begins]] : []));
        expect(begins).toEqual([[false, false], [true, true], [false, false]]);
        expect(asked('Tell me, what is it?')).toEqual([false, true]);
        expect(asked('If you find him before the night ends, what then?')).toEqual([false, false]);
        expect(asked('Are you ready?')).toEqual([false]);
        expect(asked('Come. Who is it?')).toEqual([false, true]);
    });

    test('an emphasized small word has its stress', () => {
        expect(textToPhonemes('<emphasis>you</emphasis> did it')).toBe('Y UW1 D IH1 D IH0 T');
        expect(textToPhonemes('you did it')).toBe('Y UW0 D IH1 D IH0 T');
    });
});

describe('a language for phonemes', () => {
    test('says them its own way, English when none is said', () => {
        const phonemes = 'W AO1 T ER0 .';
        const said = (language?: 'en' | 'es' | 'none') => renderSpeech({ phonemes, language }).samples;
        expect(said()).toEqual(said('en'));
        expect(said('none')).not.toEqual(said('en'));
        expect(said('es')).not.toEqual(said('none'));
    });

    test('a written question asks what by how its first word sounds', () => {
        const asks = (phonemes: string) => sayEnglish(parsePhonemes(phonemes)).flatMap((token) => ('pause' in token ? [token.asksWhat] : []));
        expect(asks('W AH1 T IH0 Z IH0 T ?')).toEqual([true]);
        expect(asks('W AH0 Z IH0 T ?')).toEqual([false]);
        expect(asks('W EH1 N T ?')).toEqual([false]);
        expect(asks('W EH1 N D IH1 D Y UW0 ?')).toEqual([true]);
        expect(asks('HH AW1 SH UH1 D AY0 ?')).toEqual([true]);
    });

    test('none reads no text', () => {
        expect(() => renderSpeech({ text: 'hello', language: 'none' })).toThrow('"none" reads no text');
        expect(() => textToPhonemes('hello', 'none')).toThrow('no rules to read "none"');
        expect(() => renderSpeech({ text: 'salut', language: 'fr' as 'en' })).toThrow('"fr"');
    });
});

describe('renderSinging', () => {
    test('lasts as long as its beats', () => {
        const song = renderSinging({ language: 'es', tempo: 120, notes: [{ pitch: 'C3', beats: 2, lyric: 'la' }, { pitch: 'D3', beats: 2, lyric: 'la' }] });
        const seconds = song.samples.length / song.sampleRate;
        expect(seconds).toBeGreaterThan(2);
        expect(seconds).toBeLessThan(2.4);
    });

    test('a note without a syllable holds the one before, and one without a pitch is a rest', () => {
        const song = renderSinging({ language: 'es', tempo: 60, notes: [{ pitch: 48, lyric: 'a' }, { pitch: 50 }, {}, { pitch: 48, lyric: 'a' }] });
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
        const plain = renderSinging({ language: 'es', notes: [{ pitch: 48, lyric: 'a' }] });
        const opened = renderSinging({ language: 'es', notes: [{ pitch: 48, lyric: 'tra' }] });
        expect(opened.start).toBeGreaterThan(plain.start + 0.05);
        // Everything after it is the song: the same length after the beat, whatever came before.
        expect(opened.samples.length - opened.start * opened.sampleRate).toBeCloseTo(plain.samples.length - plain.start * plain.sampleRate, -1);
    });

    test('with no notes, it is silence with a beat in it', () => {
        const song = renderSinging({ language: 'es', notes: [] });
        expect(song.start).toBeCloseTo(0.04, 5);
        expect(song.samples.every((value) => value === 0)).toBe(true);
    });

    test('says which note it cannot read', () => {
        expect(() => renderSinging({ language: 'es', notes: [{ pitch: 'H2', lyric: 'a' }] })).toThrow('"H2"');
    });
});
