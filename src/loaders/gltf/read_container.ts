import type { TGltfDoc } from './types/t_gltf_doc';

/**
 * `glTF` as four bytes, which is how a binary one introduces itself.
 */
const MAGIC = 0x46546c67;
/**
 * The two kinds of chunk a binary one is made of.
 */
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/**
 * What came out of the file: the description, and the block of numbers a binary one carries inside
 * it (a text one keeps those in separate files, so there is nothing here).
 *
 * @internal
 */
export type TGltfContainer = {
    doc: TGltfDoc;
    embedded: ArrayBuffer | null;
};

/**
 * Opens a model file, whichever of its two shapes it arrived in.
 *
 * **The bytes are asked, not the name.** The same model is handed around as `.gltf` (a description
 * in text, with its numbers and pictures in files beside it) and as `.glb` (all of it in one), and
 * which one somebody has is an accident of the button they pressed when they exported it. A file
 * renamed, or served by something that answers with no extension at all, would break a rule based
 * on the name and does not break this one.
 *
 * A binary one begins with the word `glTF`, a version, a length, and then its chunks: the
 * description first, the numbers second. Anything else is read as text.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readGltfContainer = (bytes: ArrayBuffer): TGltfContainer => {
    if (bytes.byteLength < 4) {
        throw new Error('[NacatamalOn] useLoadModel: the file is empty.');
    }

    const head = new DataView(bytes);
    if (head.getUint32(0, true) !== MAGIC) {
        return { doc: JSON.parse(new TextDecoder().decode(bytes)) as TGltfDoc, embedded: null };
    }

    if (bytes.byteLength < 20) {
        throw new Error('[NacatamalOn] useLoadModel: the file says it is a binary model but stops before its first part.');
    }

    const version = head.getUint32(4, true);
    if (version !== 2) {
        throw new Error(`[NacatamalOn] useLoadModel: binary models of version ${version} are not read; this engine reads version 2.`);
    }

    let doc: TGltfDoc | null = null;
    let embedded: ArrayBuffer | null = null;

    // The chunks run to the end of the file, each announcing its own length. Walked rather than
    // assumed to be two in a fixed order: the format allows others, and skipping an unknown one is
    // the difference between reading a file and refusing it.
    let at = 12;
    while (at + 8 <= bytes.byteLength) {
        const length = head.getUint32(at, true);
        const kind = head.getUint32(at + 4, true);
        const start = at + 8;
        if (start + length > bytes.byteLength) {
            throw new Error('[NacatamalOn] useLoadModel: a part of the binary model runs past the end of the file.');
        }

        if (kind === CHUNK_JSON && doc === null) {
            doc = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, start, length))) as TGltfDoc;
        } else if (kind === CHUNK_BIN && embedded === null) {
            embedded = bytes.slice(start, start + length);
        }

        // Every chunk is padded out to a round four bytes, and the padding is not in its length.
        at = start + Math.ceil(length / 4) * 4;
    }

    if (doc === null) {
        throw new Error('[NacatamalOn] useLoadModel: the binary model carries no description.');
    }
    return { doc, embedded };
};

/**
 * Turns a `data:` address into the bytes it spells out, for a file that carries its numbers or its
 * pictures inside itself instead of naming a neighbour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const decodeDataUri = (uri: string): ArrayBuffer => {
    const comma = uri.indexOf(',');
    if (comma < 0) {
        throw new Error('[NacatamalOn] useLoadModel: a built-in address inside the file is malformed.');
    }

    const body = uri.slice(comma + 1);
    if (!uri.slice(0, comma).endsWith(';base64')) {
        const plain = new TextEncoder().encode(decodeURIComponent(body));
        return plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) as ArrayBuffer;
    }

    const binary = atob(body);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out.buffer;
};

/**
 * Whether an address inside the file spells out its own bytes rather than naming a neighbour.
 */
export const isDataUri = (uri: string): boolean => uri.startsWith('data:');

/**
 * The first byte of a file that is not a space, a line end or the mark some editors put first in a
 * text file, or `-1` when there is none.
 */
const firstWritten = (bytes: ArrayBuffer): number => {
    const all = new Uint8Array(bytes);
    for (let i = 0; i < all.length; i++) {
        const byte = all[i];
        if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0xef && byte !== 0xbb && byte !== 0xbf) {
            return byte;
        }
    }
    return -1;
};

/**
 * Whether a model file is a glTF, of either kind, rather than a Wavefront one: a binary glTF begins
 * with its word, a text one with the brace its description opens with. A Wavefront file begins with
 * neither, being lines of keywords. A file too short to say, or with nothing written in it, is taken
 * as glTF, which says it is empty.
 *
 * **A web page is neither, and is refused here**: a server that answers a missing file with its own
 * page and a 200 would otherwise be read as a Wavefront file holding nothing, which hides why.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isGltfFile = (bytes: ArrayBuffer): boolean => {
    if (bytes.byteLength < 4 || new DataView(bytes).getUint32(0, true) === MAGIC) {
        return true;
    }
    const first = firstWritten(bytes);
    if (first === 0x3c) {
        throw new Error('the server answered with a web page, not a model: the file is probably not where it was looked for');
    }
    return first === 0x7b || first === -1;
};
