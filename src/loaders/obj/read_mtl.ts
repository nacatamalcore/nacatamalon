import type { TColor } from '../../color';
import type { TGltfImage, TGltfSurface } from '../gltf/read_material';
import type { TTextureWrap } from '../../materials';

const WHITE: TColor = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

/**
 * A surface the material files do not describe: white, plain, the way a glTF piece with no material
 * is drawn.
 *
 * @internal
 */
export const plainSurface = (name: string): TGltfSurface => ({
    name,
    tint: WHITE,
    emissive: BLACK,
    image: null,
    emissiveImage: null,
    emissiveMasked: false,
    occlusion: null,
    transparent: false,
    doubleSided: false,
    alphaCutoff: null,
    wrap: { u: 'repeat', v: 'repeat' },
    uvTransform: null,
});

/**
 * How many words each option of a picture line takes after it. `-o`, `-s` and `-t` take up to three
 * numbers, read as many as there are.
 */
const OPTION_WORDS: Record<string, number> = {
    '-blendu': 1, '-blendv': 1, '-bm': 1, '-boost': 1, '-cc': 1, '-clamp': 1, '-imfchan': 1, '-texres': 1, '-type': 1, '-mm': 2,
};
const UP_TO_THREE = new Set(['-o', '-s', '-t']);

/**
 * The picture a `map_…` line names, and whether it asks to be clamped. The file name is what is left
 * once the options are read, and may hold spaces.
 *
 * A path an exporter wrote from its own computer (`C:\Users\…`, `/home/…`) means nothing on the
 * page, so only its last part is kept: the picture is looked for beside the material file, which is
 * where it is shipped.
 */
const pictureOf = (words: string[]): { file: string; clamp: boolean } | null => {
    let clamp = false;
    let at = 1;
    while (at < words.length && words[at].startsWith('-') && Number.isNaN(Number(words[at]))) {
        const option = words[at].toLowerCase();
        if (option === '-clamp') {
            clamp = words[at + 1]?.toLowerCase() === 'on';
        }
        if (UP_TO_THREE.has(option)) {
            at++;
            let taken = 0;
            while (taken < 3 && at < words.length && !Number.isNaN(Number(words[at]))) {
                at++;
                taken++;
            }
            continue;
        }
        at += 1 + (OPTION_WORDS[option] ?? 0);
    }
    const written = words.slice(at).join(' ').replace(/\\/g, '/');
    if (written === '') {
        return null;
    }
    const fromAnotherComputer = /^[a-z]:\//i.test(written) || written.startsWith('/');
    return { file: fromAnotherComputer ? written.slice(written.lastIndexOf('/') + 1) : written, clamp };
};

/**
 * The picture's type by its name, which is all a Wavefront file gives.
 */
const typeOf = (file: string): string => {
    const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
    return extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : 'image/png';
};

const colourOf = (words: string[]): TColor => {
    const value = (word: string | undefined): number => {
        const n = Number(word);
        return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0;
    };
    // One number is a grey.
    const r = value(words[1]);
    return { r, g: words.length > 2 ? value(words[2]) : r, b: words.length > 3 ? value(words[3]) : r, a: 1 };
};

/**
 * Reads a Wavefront material file (`.mtl`): the surfaces an `.obj` names, by name.
 *
 * **Colour, picture, glow and see-through are read; the rest is walked past**, as with a glTF:
 * shininess, reflections and bumps describe light the consoles this engine aims at never computed.
 * The colours are taken as written, as screen colours. A picture is named relative to the material
 * file, and `relativeTo` says where that is, so the address handed back is the picture's own.
 *
 * - `Kd` the colour, `map_Kd` its picture (`-clamp on` clamps it).
 * - `d` how solid it is (or `Tr`, how see-through), and below 1 it is drawn see-through.
 * - `map_d`, a picture of how solid each point is: drawn cut out where the colour picture's own
 *   alpha falls below one half, the look of a leaf or a fence.
 * - `Ke` the glow, `map_Ke` the picture it comes through.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readMtl = (text: string, resolve: (file: string) => string): Map<string, TGltfSurface> => {
    const surfaces = new Map<string, TGltfSurface>();
    let surface: TGltfSurface | null = null;
    let solid: number | null = null;

    const image = (file: string): TGltfImage => ({ uri: resolve(file), bufferView: undefined, type: typeOf(file) });

    for (const raw of text.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        const words = line.split(/\s+/);
        const keyword = words[0];
        if (keyword === 'newmtl') {
            const name = line.replace(/^\S+\s*/, '').trim();
            surface = plainSurface(name);
            solid = null;
            surfaces.set(name, surface);
            continue;
        }
        if (surface === null) {
            continue;
        }
        switch (keyword) {
            case 'Kd':
                surface.tint = { ...colourOf(words), a: surface.tint.a };
                break;
            case 'Ke':
                surface.emissive = colourOf(words);
                break;
            case 'd':
            case 'Tr': {
                const n = Number(words[words.length - 1]);
                if (!Number.isFinite(n)) break;
                // `d` says how solid, `Tr` how see-through; when a file writes both, `d` wins.
                if (keyword === 'Tr' && solid !== null) break;
                const a = Math.min(Math.max(keyword === 'd' ? n : 1 - n, 0), 1);
                if (keyword === 'd') solid = a;
                surface.tint = { ...surface.tint, a };
                surface.transparent = a < 1;
                break;
            }
            case 'map_Kd': {
                const picture = pictureOf(words);
                if (picture !== null) {
                    surface.image = image(picture.file);
                    const wrap: TTextureWrap = picture.clamp ? 'clamp' : 'repeat';
                    surface.wrap = { u: wrap, v: wrap };
                }
                break;
            }
            case 'map_Ke': {
                const picture = pictureOf(words);
                surface.emissiveMasked = true;
                if (picture !== null) surface.emissiveImage = image(picture.file);
                break;
            }
            case 'map_d':
                if (pictureOf(words) !== null) surface.alphaCutoff = 0.5;
                break;
            default:
                break;
        }
    }

    return surfaces;
};
