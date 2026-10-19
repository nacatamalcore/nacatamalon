#!/usr/bin/env bun
/**
 * Turns the fonts built into the engine, drawn as text in `fonts/*.txt`, into the modules that
 * carry them: `src/gameobjects/text/fonts/<name>_font.ts`, each with its characters, their widths
 * and its image as a PNG written into the code, so a text needs nothing downloaded to show.
 *
 * The letters are kept as text so they can be read and changed by hand, and reviewed in a diff;
 * the PNG is what the engine reads. The image is a grid of 8 x 8 cells, sixteen to a row, in the
 * order the characters are written in their file.
 *
 * Run: `bun scripts/build_fonts.ts` (`bun run build:fonts`), after changing a font's file. The
 * modules it writes are committed, so a build of the engine does not run it.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'fonts');
const OUT = join(ROOT, 'src', 'gameobjects', 'text', 'fonts');
const CELL = 8;
const COLUMNS = 16;

type TGlyph = { char: string; rows: string[] };
type TFontFile = { name: string; key: string; tracking: number; baseline: number; glyphs: TGlyph[] };

const readFont = (path: string): TFontFile => {
    const lines = readFileSync(path, 'utf8').split('\n').map((line) => line.trimEnd());
    const header = new Map<string, string>();
    const glyphs: TGlyph[] = [];
    let current: TGlyph | null = null;
    for (const [i, line] of lines.entries()) {
        const where = `${basename(path)}:${i + 1}`;
        if (line === '') {
            current = null;
        } else if (current === null && line.startsWith('# ')) {
            // A comment, outside a character: inside one, a row may start with '#'.
        } else if (line.startsWith('= ')) {
            const name = line.slice(2);
            const char = name === 'space' ? ' ' : name;
            if ([...char].length !== 1) throw new Error(`${where}: '${name}' is not one character`);
            if (glyphs.some((glyph) => glyph.char === char)) throw new Error(`${where}: '${name}' is drawn twice`);
            current = { char, rows: [] };
            glyphs.push(current);
        } else if (current !== null) {
            if (!/^[#.]+$/.test(line)) throw new Error(`${where}: a row is only '#' and '.'`);
            current.rows.push(line);
        } else {
            const [key, ...value] = line.split(':');
            header.set(key.trim(), value.join(':').trim());
        }
    }
    for (const glyph of glyphs) {
        const width = glyph.rows[0]?.length ?? 0;
        if (glyph.rows.length !== CELL || glyph.rows.some((row) => row.length !== width) || width >= CELL) {
            throw new Error(`${basename(path)}: '${glyph.char}' must be ${CELL} rows of one width under ${CELL}`);
        }
    }
    const field = (name: string): string => {
        const value = header.get(name);
        if (value === undefined) throw new Error(`${basename(path)}: no '${name}:'`);
        return value;
    };
    return { name: field('name'), key: field('key'), tracking: Number(field('tracking')), baseline: Number(field('baseline')), glyphs };
};

const CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
};

/**
 * White ink on nothing, RGBA, so a text's tint colours it.
 */
const encodePng = (font: TFontFile): Buffer => {
    const width = COLUMNS * CELL;
    const height = Math.ceil(font.glyphs.length / COLUMNS) * CELL;
    const raw = Buffer.alloc(height * (1 + width * 4));
    font.glyphs.forEach((glyph, i) => {
        const left = (i % COLUMNS) * CELL;
        const top = Math.floor(i / COLUMNS) * CELL;
        glyph.rows.forEach((row, y) => {
            [...row].forEach((pixel, x) => {
                const at = (top + y) * (1 + width * 4) + 1 + (left + x) * 4;
                if (pixel === '#') raw.fill(255, at, at + 4);
            });
        });
    });
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 6, 0, 0, 0], 8);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', new Uint8Array()),
    ]);
};

const writeModule = (file: string, font: TFontFile): string => {
    const id = basename(file, '.txt').replace(/^nacatamal_/, '');
    const name = `${id.toUpperCase()}_FONT`;
    const base64 = encodePng(font).toString('base64');
    const lines = base64.match(/.{1,100}/g) ?? [];
    const chars = font.glyphs.map((glyph) => glyph.char).join('');
    // One past the drawing: the empty column every character keeps after it.
    const widths = font.glyphs.map((glyph) => glyph.rows[0].length + 1).join('');
    const code = [
        '/*',
        ` * ${font.name}, one of the fonts built into the engine. Written by \`bun run build:fonts\` from`,
        ` * \`fonts/${basename(file)}\`: change the letters there, not here.`,
        ' */',
        "import type { TBuiltinFont } from '../types/t_builtin_font';",
        '',
        `export const ${name}: TBuiltinFont = {`,
        `    name: '${font.name}',`,
        `    key: '${font.key}',`,
        `    tracking: ${font.tracking},`,
        `    baseline: ${font.baseline},`,
        `    chars: '${chars.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`,
        `    widths: '${widths}',`,
        "    atlas: 'data:image/png;base64,' +",
        ...lines.map((line, i) => `        '${line}'${i === lines.length - 1 ? ',' : ' +'}`),
        '};',
        '',
    ].join('\n');
    writeFileSync(join(OUT, `${id}_font.ts`), code);
    return `${font.name}: ${font.glyphs.length} characters, ${base64.length} bytes of image`;
};

for (const file of readdirSync(SOURCES).filter((name) => name.endsWith('.txt')).sort()) {
    console.log(`[fonts] ${writeModule(file, readFont(join(SOURCES, file)))}`);
}
