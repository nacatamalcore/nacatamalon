import { describe, expect, it } from 'bun:test';
import { atlasDocFrames, emptyAtlasDoc, parseAtlasDoc, serializeAtlasDoc, ATLAS_FORMAT } from '../src/atlas/document';

/**
 * The `.atlas` file, as tools and the engine both read it.
 *
 * The format came over from the old engine field for field, because projects already hold these
 * files: the numbers here are the old engine's answers, and a file written by one must read the
 * same in the other.
 */

const GRID = { format: 1, kind: 'atlas', texture: 'hero.png', grid: { frameWidth: 16, frameHeight: 16 } };

describe('parseAtlasDoc', () => {
    it('reads a grid and its runs, keeping only what each run said', () => {
        const doc = parseAtlasDoc({ ...GRID, sequences: { walk: { frames: [0, 1], fps: 8 }, punch: { frames: [2], loop: false, next: 'walk' } } }, 'hero.atlas');

        expect(doc.grid).toEqual({ frameWidth: 16, frameHeight: 16 });
        expect(doc.sequences).toEqual({ walk: { frames: [0, 1], fps: 8 }, punch: { frames: [2], loop: false, next: 'walk' } });
    });

    it('says which file is wrong and why', () => {
        const cases: Array<[unknown, RegExp]> = [
            ['not an object', /must be a JSON object/],
            [{ ...GRID, kind: 'tilemap' }, /expected "atlas"/],
            [{ ...GRID, format: undefined }, /numeric "format"/],
            [{ ...GRID, format: ATLAS_FORMAT + 1 }, /reads up to 1/],
            [{ ...GRID, texture: '' }, /"texture" path/],
            [{ ...GRID, packed: {} }, /exactly one of "grid" or "packed"/],
            [{ format: 1, kind: 'atlas', texture: 'x.png' }, /exactly one of "grid" or "packed"/],
            [{ ...GRID, sequences: { walk: { frames: [] } } }, /non-empty "frames"/],
            [{ ...GRID, sequences: { walk: { frames: [true] } } }, /neither an index nor a name/],
            [{ ...GRID, sequences: { walk: { frames: [0], fps: 0 } } }, /non-positive "fps"/],
            [{ ...GRID, sequences: { walk: { frames: [0], next: 3 } } }, /non-string "next"/],
        ];
        for (const [value, message] of cases) {
            expect(() => parseAtlasDoc(value, 'hero.atlas')).toThrow(message);
            expect(() => parseAtlasDoc(value, 'hero.atlas')).toThrow(/"hero.atlas"/);
        }
    });

    it('leaves a next that names no run for playing to report: its author may be halfway through', () => {
        expect(parseAtlasDoc({ ...GRID, sequences: { punch: { frames: [0], next: 'nothing yet' } } }, 'hero.atlas').sequences?.punch.next).toBe('nothing yet');
    });
});

describe('serializeAtlasDoc', () => {
    it('writes four spaces, a newline at the end, and no runs where there were none', () => {
        const text = serializeAtlasDoc({ format: 1, kind: 'atlas', texture: 'hero.png', grid: { frameWidth: 16 }, sequences: {} });

        expect(text).toBe('{\n    "format": 1,\n    "kind": "atlas",\n    "texture": "hero.png",\n    "grid": {\n        "frameWidth": 16\n    }\n}\n');
    });

    it('reads back what it wrote', () => {
        const doc = parseAtlasDoc({ ...GRID, sequences: { walk: { frames: [0, 'a'], fps: 8, loop: false, next: 'idle' } } }, 'hero.atlas');

        expect(parseAtlasDoc(JSON.parse(serializeAtlasDoc(doc)), 'hero.atlas')).toEqual(doc);
    });
});

describe('emptyAtlasDoc', () => {
    it('is a square 16-pixel grid with no runs, unless told the cell size', () => {
        expect(emptyAtlasDoc({ texture: 'hero.png' })).toEqual({ format: 1, kind: 'atlas', texture: 'hero.png', grid: { frameWidth: 16, frameHeight: 16 }, sequences: {} });
        expect(emptyAtlasDoc({ texture: 'hero.png', frameWidth: 24 }).grid).toEqual({ frameWidth: 24, frameHeight: 24 });
        expect(emptyAtlasDoc({ texture: 'hero.png', frameWidth: 16, frameHeight: 32 }).grid).toEqual({ frameWidth: 16, frameHeight: 32 });
    });
});

describe('atlasDocFrames', () => {
    const doc = (grid: object) => parseAtlasDoc({ ...GRID, grid }, 'hero.atlas');

    it('cuts a grid row by row, in the image\'s fractions and in pixels', () => {
        const frames = atlasDocFrames(doc({ frameWidth: 16, frameHeight: 16 }), 32, 32);

        expect(frames).toHaveLength(4);
        expect(frames[1]).toEqual({ uvOffset: { x: 0.5, y: 0 }, uvScale: { x: 0.5, y: 0.5 }, width: 16, height: 16 });
        expect(frames[2].uvOffset).toEqual({ x: 0, y: 0.5 });
    });

    it('leaves out a strip at the edge that is not a whole cell', () => {
        // 40 pixels of 16-pixel cells is two, with 8 left over: rounding would make it three.
        const frames = atlasDocFrames(doc({ frameWidth: 16, frameHeight: 16 }), 40, 16);

        expect(frames).toHaveLength(2);
        expect(frames[1].uvScale.x).toBe(16 / 40);
    });

    it('steps over margins and gaps, and stops at count', () => {
        const frames = atlasDocFrames(doc({ frameWidth: 8, frameHeight: 8, margin: 1, spacing: 2, count: 3 }), 30, 20);

        expect(frames).toHaveLength(3);
        expect(frames.map((f) => f.uvOffset.x * 30)).toEqual([1, 11, 21]);
        expect(frames[0].uvOffset.y * 20).toBe(1);
    });

    it('works the cell size out from a count', () => {
        const frames = atlasDocFrames(doc({ columns: 4, rows: 2 }), 64, 32);

        expect(frames).toHaveLength(8);
        expect(frames[0].width).toBe(16);
    });

    it('numbers a packed sheet in the order the file lists it, with the names', () => {
        const packed = parseAtlasDoc({ format: 1, kind: 'atlas', texture: 'x.png', packed: { b: { x: 10, y: 0, w: 5, h: 5 }, a: { x: 0, y: 0, w: 10, h: 20 } } }, 'x.atlas');
        const frames = atlasDocFrames(packed, 20, 20);

        expect(frames.map((f) => f.name)).toEqual(['b', 'a']);
        expect(frames[0]).toEqual({ name: 'b', uvOffset: { x: 0.5, y: 0 }, uvScale: { x: 0.25, y: 0.25 }, width: 5, height: 5 });
    });

    it('refuses a grid that says neither its cell size nor its count', () => {
        expect(() => atlasDocFrames(doc({ margin: 2 }), 32, 32)).toThrow(/frameWidth and frameHeight, or columns and rows/);
    });
});
