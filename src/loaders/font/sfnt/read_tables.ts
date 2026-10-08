import { inflate } from '../../../pixels/inflate';

const fail = (reason: string): never => {
    throw new Error(`[NacatamalOn] useLoadFont: ${reason}`);
};

/**
 * The four bytes at `at` as text: how a font file names its kind and its tables.
 */
const tagAt = (view: DataView, at: number): string =>
    String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));

/**
 * Where a table sits inside the file, checked against the file's length so a damaged directory is
 * refused here rather than read past later, which would come back as a glyph made of nonsense.
 */
const slice = (bytes: Uint8Array, offset: number, length: number, tag: string): Uint8Array => {
    if (offset + length > bytes.length) {
        fail(`its '${tag}' table runs past the end of the file.`);
    }
    return bytes.subarray(offset, offset + length);
};

/**
 * A plain font file: a short header, then one sixteen-byte entry per table saying where it is.
 */
const readPlain = (bytes: Uint8Array, view: DataView): Map<string, DataView> => {
    const tables = new Map<string, DataView>();
    const count = view.getUint16(4);
    for (let i = 0; i < count; i++) {
        const entry = 12 + i * 16;
        const tag = tagAt(view, entry);
        const table = slice(bytes, view.getUint32(entry + 8), view.getUint32(entry + 12), tag);
        tables.set(tag, new DataView(table.buffer, table.byteOffset, table.byteLength));
    }
    return tables;
};

/**
 * A web font file: the same tables, each one compressed on its own when that made it smaller. A
 * table whose compressed and plain lengths match was stored as it is.
 */
const readWeb = (bytes: Uint8Array, view: DataView): Map<string, DataView> => {
    const tables = new Map<string, DataView>();
    const count = view.getUint16(12);
    for (let i = 0; i < count; i++) {
        const entry = 44 + i * 20;
        const tag = tagAt(view, entry);
        const stored = slice(bytes, view.getUint32(entry + 4), view.getUint32(entry + 8), tag);
        const length = view.getUint32(entry + 12);
        const table = stored.length < length ? inflate(stored) : stored;
        if (table.length !== length) {
            fail(`its '${tag}' table did not unpack to the size the file says.`);
        }
        tables.set(tag, new DataView(table.buffer, table.byteOffset, table.byteLength));
    }
    return tables;
};

/**
 * Splits a font file into its tables, by name: `cmap`, `glyf`, `hmtx` and the rest.
 *
 * Reads TrueType files (`.ttf`) and the first kind of web font (`.woff`), which is the same thing
 * with each table compressed. Refuses, with a message that says why, the kinds it does not read yet:
 * fonts whose letters are drawn with cubic curves (most `.otf`), the second kind of web font
 * (`.woff2`), and collections of several fonts in one file (`.ttc`).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readTables = (bytes: Uint8Array): Map<string, DataView> => {
    if (bytes.length < 12) {
        fail('the file is too short to be a font.');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const signature = tagAt(view, 0);

    if (signature === 'wOF2') {
        fail('.woff2 files are not read yet. Use the .ttf or .woff version of the font.');
    }
    if (signature === 'ttcf') {
        fail('this is a collection of several fonts (.ttc). Use the .ttf of the one you want.');
    }
    const web = signature === 'wOFF';
    const flavor = web ? tagAt(view, 4) : signature;
    if (flavor === 'OTTO') {
        fail('its letters are drawn with cubic curves (an .otf with CFF outlines), which are not read yet. Use a .ttf version of the font.');
    }
    if (flavor !== '\u0000\u0001\u0000\u0000' && flavor !== 'true') {
        fail('the data is not a TrueType font.');
    }

    return web ? readWeb(bytes, view) : readPlain(bytes, view);
};
