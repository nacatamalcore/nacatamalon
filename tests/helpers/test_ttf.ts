import { deflateSync } from 'node:zlib';
import { DEFAULT_FONT_ATLAS_SIZE, newFont } from '../../src/loaders/font/new_font';
import { attachFont, uploadFontAtlas } from '../../src/loaders/font/font_glyphs';
import { parseFont } from '../../src/loaders/font/sfnt/parse_font';
import type { TFont } from '../../src/loaders';
import type { TRuntimeStore } from '../../src/store';

/**
 * A point of a test glyph, in font units. `on: false` is a curve's control point.
 */
export type TTestPoint = { x: number; y: number; on?: boolean };

/**
 * A test glyph: drawn with its own loops, or built from other glyphs.
 */
export type TTestGlyph = {
    advance: number;
    contours?: TTestPoint[][];
    components?: { glyph: number; dx: number; dy: number; scale?: number }[];
};

export type TTestFontSpec = {
    unitsPerEm?: number;
    ascender?: number;
    descender?: number;
    lineGap?: number;
    name?: string;
    /**
     * Glyph 0 is the missing glyph.
     */
    glyphs: TTestGlyph[];
    /**
     * Character to glyph number.
     */
    cmap: Record<string, number>;
    cmapFormat?: 4 | 12;
    /**
     * Format 4 only: map through the glyph table instead of by adding a number.
     */
    rangeOffsets?: boolean;
    longLoca?: boolean;
    /**
     * Pairs for the old `kern` table: [left glyph, right glyph, units].
     */
    kern?: [number, number, number][];
    /**
     * Pairs for `GPOS`, as a list of second glyphs per first glyph (1) or a grid of groups (2).
     */
    gpos?: { format: 1 | 2; pairs: [number, number, number][] };
};

/**
 * Bytes written one value at a time, big-endian like every font file.
 */
class Writer {
    bytes: number[] = [];
    u8(value: number): this { this.bytes.push(value & 0xff); return this; }
    i8(value: number): this { return this.u8(value < 0 ? value + 256 : value); }
    u16(value: number): this { return this.u8(value >> 8).u8(value); }
    i16(value: number): this { return this.u16(value < 0 ? value + 65536 : value); }
    u32(value: number): this { return this.u16(Math.floor(value / 65536)).u16(value % 65536); }
    tag(text: string): this { for (const char of text) this.u8(char.charCodeAt(0)); return this; }
    pad(to: number): this { while (this.bytes.length % to !== 0) this.u8(0); return this; }
    get length(): number { return this.bytes.length; }
    out(): Uint8Array { return Uint8Array.from(this.bytes); }
}

const encodeSimple = (contours: TTestPoint[][]): Uint8Array => {
    const points = contours.flat();
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const w = new Writer();
    w.i16(contours.length).i16(Math.min(...xs)).i16(Math.min(...ys)).i16(Math.max(...xs)).i16(Math.max(...ys));
    let end = -1;
    for (const contour of contours) {
        end += contour.length;
        w.u16(end);
    }
    w.u16(0);

    // Compact on purpose, so the reader's short moves, repeated flags and "same as before" are all used.
    const flags: number[] = [];
    const dx: number[] = [];
    const dy: number[] = [];
    let lx = 0;
    let ly = 0;
    for (const point of points) {
        const mx = point.x - lx;
        const my = point.y - ly;
        lx = point.x;
        ly = point.y;
        let flag = point.on === false ? 0 : 1;
        if (mx === 0) flag |= 16;
        else if (Math.abs(mx) < 256) flag |= 2 | (mx > 0 ? 16 : 0);
        if (my === 0) flag |= 32;
        else if (Math.abs(my) < 256) flag |= 4 | (my > 0 ? 32 : 0);
        flags.push(flag);
        dx.push(mx);
        dy.push(my);
    }
    for (let i = 0; i < flags.length;) {
        let run = 1;
        while (i + run < flags.length && flags[i + run] === flags[i] && run < 255) run++;
        if (run > 1) {
            w.u8(flags[i]! | 8).u8(run - 1);
        } else {
            w.u8(flags[i]!);
        }
        i += run;
    }
    for (let i = 0; i < flags.length; i++) {
        if ((flags[i]! & 2) !== 0) w.u8(Math.abs(dx[i]!));
        else if ((flags[i]! & 16) === 0) w.i16(dx[i]!);
    }
    for (let i = 0; i < flags.length; i++) {
        if ((flags[i]! & 4) !== 0) w.u8(Math.abs(dy[i]!));
        else if ((flags[i]! & 32) === 0) w.i16(dy[i]!);
    }
    return w.pad(4).out();
};

const encodeComposite = (components: NonNullable<TTestGlyph['components']>): Uint8Array => {
    const w = new Writer();
    w.i16(-1).i16(0).i16(0).i16(0).i16(0);
    components.forEach((part, i) => {
        let flags = 1 | 2;
        if (i < components.length - 1) flags |= 0x20;
        if (part.scale !== undefined) flags |= 8;
        w.u16(flags).u16(part.glyph).i16(part.dx).i16(part.dy);
        if (part.scale !== undefined) w.i16(Math.round(part.scale * 16384));
    });
    return w.pad(4).out();
};

const cmapTable = (spec: TTestFontSpec): Uint8Array => {
    const entries = Object.entries(spec.cmap)
        .map(([char, glyph]) => [char.codePointAt(0)!, glyph] as const)
        .sort((a, b) => a[0] - b[0]);
    const sub = new Writer();
    if (spec.cmapFormat === 12) {
        sub.u16(12).u16(0).u32(16 + entries.length * 12).u32(0).u32(entries.length);
        for (const [code, glyph] of entries) sub.u32(code).u32(code).u32(glyph);
    } else {
        const segments = [...entries.map(([code, glyph]) => ({ code, glyph })), { code: 0xffff, glyph: 0 }];
        const count = segments.length;
        const glyphIds: number[] = [];
        const length = 16 + count * 8 + (spec.rangeOffsets ? entries.length * 2 : 0);
        sub.u16(4).u16(length).u16(0).u16(count * 2).u16(0).u16(0).u16(0);
        for (const s of segments) sub.u16(s.code);
        sub.u16(0);
        for (const s of segments) sub.u16(s.code);
        for (const s of segments) sub.u16(spec.rangeOffsets || s.code === 0xffff ? (s.code === 0xffff ? 1 : 0) : (s.glyph - s.code + 65536) % 65536);
        segments.forEach((s, i) => {
            if (spec.rangeOffsets && s.code !== 0xffff) {
                // From this entry to its glyph in the list that follows the offsets.
                sub.u16((count - i) * 2 + glyphIds.length * 2);
                glyphIds.push(s.glyph);
            } else {
                sub.u16(0);
            }
        });
        for (const glyph of glyphIds) sub.u16(glyph);
    }
    const w = new Writer();
    w.u16(0).u16(1).u16(3).u16(spec.cmapFormat === 12 ? 10 : 1).u32(12);
    return Uint8Array.from([...w.out(), ...sub.out()]);
};

const kernTable = (pairs: [number, number, number][]): Uint8Array => {
    const sorted = [...pairs].sort((a, b) => a[0] * 65536 + a[1] - (b[0] * 65536 + b[1]));
    const w = new Writer();
    w.u16(0).u16(1);
    w.u16(0).u16(14 + sorted.length * 6).u16(1).u16(sorted.length).u16(0).u16(0).u16(0);
    for (const [l, r, v] of sorted) w.u16(l).u16(r).i16(v);
    return w.out();
};

const gposTable = (gpos: NonNullable<TTestFontSpec['gpos']>): Uint8Array => {
    const lefts = [...new Set(gpos.pairs.map((p) => p[0]))].sort((a, b) => a - b);
    const rights = [...new Set(gpos.pairs.map((p) => p[1]))].sort((a, b) => a - b);
    const coverage = new Writer();
    coverage.u16(1).u16(lefts.length);
    for (const g of lefts) coverage.u16(g);

    const sub = new Writer();
    if (gpos.format === 1) {
        const header = 10 + lefts.length * 2;
        const sets = lefts.map((left) => {
            const records = gpos.pairs.filter((p) => p[0] === left).sort((a, b) => a[1] - b[1]);
            const set = new Writer();
            set.u16(records.length);
            for (const [, right, value] of records) set.u16(right).i16(value);
            return set.out();
        });
        let at = header + coverage.length;
        sub.u16(1).u16(header).u16(4).u16(0).u16(lefts.length);
        for (const set of sets) { sub.u16(at); at += set.length; }
        sub.bytes.push(...coverage.bytes);
        for (const set of sets) sub.bytes.push(...set);
    } else {
        const classes1 = lefts.length + 1;
        const classes2 = rights.length + 1;
        const grid = 16 + classes1 * classes2 * 2;
        const class1 = new Writer();
        class1.u16(1).u16(lefts[0]!).u16(lefts.at(-1)! - lefts[0]! + 1);
        for (let g = lefts[0]!; g <= lefts.at(-1)!; g++) class1.u16(lefts.indexOf(g) + 1);
        const class2 = new Writer();
        class2.u16(2).u16(rights.length);
        rights.forEach((g, i) => class2.u16(g).u16(g).u16(i + 1));
        sub.u16(2).u16(grid).u16(4).u16(0).u16(grid + coverage.length).u16(grid + coverage.length + class1.length).u16(classes1).u16(classes2);
        for (let c1 = 0; c1 < classes1; c1++) {
            for (let c2 = 0; c2 < classes2; c2++) {
                const pair = gpos.pairs.find((p) => lefts.indexOf(p[0]) + 1 === c1 && rights.indexOf(p[1]) + 1 === c2);
                sub.i16(pair?.[2] ?? 0);
            }
        }
        sub.bytes.push(...coverage.bytes, ...class1.bytes, ...class2.bytes);
    }

    const w = new Writer();
    // Header, empty script list, one 'kern' feature, one lookup.
    w.u16(1).u16(0).u16(10).u16(12).u16(26);
    w.u16(0);                                            // 10: script list
    w.u16(1).tag('kern').u16(8).u16(0).u16(1).u16(0);    // 12: feature list, feature at +8
    w.u16(1).u16(4);                                     // 26: lookup list, lookup at +4
    w.u16(2).u16(0).u16(1).u16(8);                       // 30: lookup, subtable at +8
    w.bytes.push(...sub.bytes);                          // 38
    return w.out();
};

const nameTable = (name: string): Uint8Array => {
    const w = new Writer();
    w.u16(0).u16(1).u16(18);
    w.u16(3).u16(1).u16(0x409).u16(4).u16(name.length * 2).u16(0);
    for (const char of name) w.u16(char.charCodeAt(0));
    return w.out();
};

/**
 * Builds a whole TrueType file from a description, so the font reader is tested against bytes laid
 * out exactly as the format says, with no font of anyone else's in the repository.
 */
export const buildTtf = (spec: TTestFontSpec): Uint8Array => {
    const glyphData = spec.glyphs.map((glyph) => (glyph.components !== undefined
        ? encodeComposite(glyph.components)
        : glyph.contours !== undefined && glyph.contours.length > 0 ? encodeSimple(glyph.contours) : new Uint8Array(0)));
    const glyf = Uint8Array.from(glyphData.flatMap((data) => [...data]));
    const loca = new Writer();
    let offset = 0;
    for (const data of [...glyphData, null]) {
        if (spec.longLoca) loca.u32(offset);
        else loca.u16(offset / 2);
        offset += data?.length ?? 0;
    }

    const head = new Writer();
    head.u32(0x00010000).u32(0).u32(0).u32(0x5f0f3cf5).u16(0).u16(spec.unitsPerEm ?? 1000);
    for (let i = 0; i < 16; i++) head.u8(0);
    head.i16(0).i16(0).i16(0).i16(0).u16(0).u16(0).i16(0).i16(spec.longLoca ? 1 : 0).i16(0);

    const hhea = new Writer();
    hhea.u32(0x00010000).i16(spec.ascender ?? 800).i16(spec.descender ?? -200).i16(spec.lineGap ?? 0);
    for (let i = 0; i < 12; i++) hhea.i16(0);
    hhea.u16(spec.glyphs.length);

    const maxp = new Writer();
    maxp.u32(0x00005000).u16(spec.glyphs.length);

    const hmtx = new Writer();
    for (const glyph of spec.glyphs) hmtx.u16(glyph.advance).i16(0);

    const tables: [string, Uint8Array][] = [
        ['cmap', cmapTable(spec)],
        ['glyf', glyf],
        ['head', head.out()],
        ['hhea', hhea.out()],
        ['hmtx', hmtx.out()],
        ['loca', loca.out()],
        ['maxp', maxp.out()],
        ['name', nameTable(spec.name ?? 'Test Sans')],
    ];
    if (spec.kern !== undefined) tables.push(['kern', kernTable(spec.kern)]);
    if (spec.gpos !== undefined) tables.push(['GPOS', gposTable(spec.gpos)]);
    tables.sort((a, b) => (a[0] < b[0] ? -1 : 1));

    const file = new Writer();
    file.u32(0x00010000).u16(tables.length).u16(0).u16(0).u16(0);
    let at = 12 + tables.length * 16;
    const placed: number[] = [];
    for (const [tag, data] of tables) {
        file.tag(tag).u32(0).u32(at).u32(data.length);
        placed.push(at);
        at += data.length + ((4 - (data.length % 4)) % 4);
    }
    for (const [, data] of tables) {
        file.bytes.push(...data);
        file.pad(4);
    }
    return file.out();
};

/**
 * Wraps a TrueType file as a `.woff`: the same tables, each compressed when that makes it smaller.
 */
export const toWoff = (ttf: Uint8Array): Uint8Array => {
    const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
    const count = view.getUint16(4);
    const tables: { tag: number; data: Uint8Array; stored: Uint8Array }[] = [];
    for (let i = 0; i < count; i++) {
        const entry = 12 + i * 16;
        const data = ttf.subarray(view.getUint32(entry + 8), view.getUint32(entry + 8) + view.getUint32(entry + 12));
        const packed = new Uint8Array(deflateSync(data));
        tables.push({ tag: view.getUint32(entry), data, stored: packed.length < data.length ? packed : data });
    }
    const w = new Writer();
    w.tag('wOFF').u32(0x00010000).u32(0).u16(count).u16(0).u32(ttf.length).u16(1).u16(0);
    w.u32(0).u32(0).u32(0).u32(0).u32(0);
    let at = 44 + count * 20;
    for (const table of tables) {
        w.u32(table.tag).u32(at).u32(table.stored.length).u32(table.data.length).u32(0);
        at += table.stored.length + ((4 - (table.stored.length % 4)) % 4);
    }
    for (const table of tables) {
        w.bytes.push(...table.stored);
        w.pad(4);
    }
    return w.out();
};

/**
 * A small font with the shapes the tests need: a square "I" (glyph 1), a triangle "A" (2), an "O"
 * with a hole and curved corners (3), an "É" built from the "I" and a scaled-down square (4), and a
 * space (5). The missing glyph (0) is a box. Units per em 1000.
 */
export const TEST_TTF_SPEC: TTestFontSpec = {
    name: 'Test Sans',
    glyphs: [
        { advance: 500, contours: [[{ x: 50, y: 0 }, { x: 50, y: 700 }, { x: 450, y: 700 }, { x: 450, y: 0 }]] },
        { advance: 600, contours: [[{ x: 100, y: 0 }, { x: 100, y: 700 }, { x: 500, y: 700 }, { x: 500, y: 0 }]] },
        { advance: 700, contours: [[{ x: 0, y: 0 }, { x: 350, y: 700 }, { x: 700, y: 0 }]] },
        {
            advance: 800,
            contours: [
                // Outer loop, clockwise, with every corner a curve: control points only, so the
                // reader has to imply the on-curve points between them.
                [{ x: 0, y: 0, on: false }, { x: 0, y: 700, on: false }, { x: 700, y: 700, on: false }, { x: 700, y: 0, on: false }],
                // The hole, the other way round.
                [{ x: 250, y: 250 }, { x: 450, y: 250 }, { x: 450, y: 450 }, { x: 250, y: 450 }],
            ],
        },
        { advance: 600, components: [{ glyph: 1, dx: 0, dy: 0 }, { glyph: 1, dx: 100, dy: 800, scale: 0.25 }] },
        { advance: 250 },
    ],
    cmap: { I: 1, A: 2, O: 3, 'É': 4, ' ': 5 },
};

/**
 * A vector font record already loaded from `spec`, attached to `store` as the loader would leave it.
 */
export const createTestVectorFont = (store: TRuntimeStore, spec: TTestFontSpec = TEST_TTF_SPEC, key = 'test-sans.ttf', size = DEFAULT_FONT_ATLAS_SIZE): TFont => {
    const font = newFont(key, key, size);
    const parsed = parseFont(buildTtf(spec));
    font.meta = {
        name: parsed.name,
        unitsPerEm: parsed.unitsPerEm,
        ascender: parsed.ascender,
        descender: parsed.descender,
        lineGap: parsed.lineGap,
        atlasWidth: 0,
        atlasHeight: 0,
    };
    attachFont(font, parsed, store);
    uploadFontAtlas(font);
    font.status = 'ready';
    store.get('assets').fonts.set(key, font);
    return font;
};
