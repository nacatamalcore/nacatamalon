import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { DOCUMENTS, parsePaletteDoc, parseSongDoc, parseStoreDoc } from '../src';

/**
 * A document written by a newer engine than the one reading it. A song, a palette and a store are
 * read as far as they can be, and say so: read as though nothing had changed, a song played by an old
 * game would come out wrong with no word why.
 */

const SONG = { tempo: 120, meter: [4, 4], voices: { pulse1: { notes: "c'1 |" } } };
const PALETTE = { kind: 'palette', name: 'Dusk', colors: ['#102030'] };
const STORE = { format: DOCUMENTS.STORE.FORMAT, key: 'save', fields: [] };

let warn: ReturnType<typeof spyOn>;
beforeEach(() => { warn = spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

describe('a document newer than this engine', () => {
    it('is said of a song, which plays what it can', () => {
        const song = parseSongDoc({ ...SONG, format: DOCUMENTS.SONG.FORMAT + 1 }, 'music/x.song');

        expect(warn.mock.calls[0]![0]).toContain('song "music/x.song": written by a newer version');
        expect(song.tempo).toBe(120);
    });

    it('is said of a palette, by where it came from or by its name', () => {
        const palette = parsePaletteDoc({ ...PALETTE, format: DOCUMENTS.PALETTE.FORMAT + 1 }, 'dusk.palette');
        parsePaletteDoc({ ...PALETTE, format: DOCUMENTS.PALETTE.FORMAT + 1 });

        expect(warn.mock.calls[0]![0]).toContain('palette "dusk.palette": written by a newer version');
        expect(warn.mock.calls[1]![0]).toContain('palette "Dusk"');
        expect(palette.colors).toEqual(['#102030']);
    });

    it('is said of a store, which opens what it can', () => {
        const store = parseStoreDoc({ ...STORE, version: DOCUMENTS.STORE.VERSION + 1 }, 'save.store');

        expect(warn.mock.calls[0]![0]).toContain('store "save.store": written by a newer version');
        expect(store.key).toBe('save');
    });
});

describe('a document this engine can read', () => {
    it('says nothing, at its version or an older one', () => {
        parseSongDoc({ ...SONG, format: DOCUMENTS.SONG.FORMAT });
        parseSongDoc(SONG);
        parsePaletteDoc({ ...PALETTE, format: DOCUMENTS.PALETTE.FORMAT });
        parseStoreDoc({ ...STORE, version: DOCUMENTS.STORE.VERSION }, 'save.store');
        parseStoreDoc({ ...STORE, version: 1 }, 'old.store');

        expect(warn).not.toHaveBeenCalled();
    });
});
