import { GEOMETRY_STRIDE } from '../../geometry';
import { computeNormals, toFlatShaded } from '../gltf/shading';
import type { TBuiltPart } from '../gltf/build_parts';
import type { TShading } from '../gltf/shading';

/**
 * One piece of a Wavefront file, built, with the name of the surface it wears.
 *
 * @internal
 */
export type TObjPart = TBuiltPart & {
    /**
     * The surface named by `usemtl`, or `''` when the piece never named one.
     */
    material: string;
};

/**
 * What came out of a Wavefront file: its pieces, and the material files it names.
 *
 * @internal
 */
export type TObjFile = {
    parts: TObjPart[];
    /**
     * The `.mtl` files it names, as written, in order.
     */
    libraries: string[];
    /**
     * The name of every piece it holds, found or not, for saying what there is when a piece asked
     * for is not.
     */
    names: string[];
};

/**
 * One piece while the file is read: its corners as the file numbers them, three to a triangle.
 */
type TGathering = {
    name: string;
    material: string;
    /**
     * Each triangle corner as three numbers into the file's lists: place, picture coordinate,
     * facing, `-1` for one the file left out.
     */
    corners: number[];
};

/**
 * A number the file wrote, or `0` when it wrote something that is not one.
 */
const numberOf = (word: string | undefined): number => {
    const value = Number(word);
    return Number.isFinite(value) ? value : 0;
};

/**
 * A list number as the file writes it (from 1, or from the end when negative) as a place from 0, or
 * `-1` when it is missing or points nowhere.
 */
const placeOf = (word: string | undefined, count: number): number => {
    if (word === undefined || word === '') {
        return -1;
    }
    const value = Number.parseInt(word, 10);
    if (!Number.isFinite(value) || value === 0) {
        return -1;
    }
    const at = value > 0 ? value - 1 : count + value;
    return at >= 0 && at < count ? at : -1;
};

/**
 * The rest of a line after its first word: a name, which may hold spaces.
 */
const restOf = (line: string): string => line.replace(/^\S+\s*/, '').trim();

/**
 * The material files a `mtllib` line names. Usually one; the format allows several, split by
 * spaces, and some exporters write one name that has spaces in it. Taken as several only when every
 * word of it is a material file.
 */
const librariesOf = (rest: string): string[] => {
    const words = rest.split(/\s+/).filter((word) => word !== '');
    return words.length > 1 && words.every((word) => word.toLowerCase().endsWith('.mtl')) ? words : rest === '' ? [] : [rest];
};

/**
 * Reads a Wavefront model (`.obj`): the plain text format nearly every 3D program writes.
 *
 * **One part per piece and surface**, as a glTF is: a piece is what the file calls an object or a
 * group (`o`, `g`, whichever came last), and a piece painted in two materials (`usemtl`) is two
 * parts with its name. A piece named again later in the file goes on growing the part it started.
 *
 * Faces of more than three corners are cut into triangles from their first corner, which is right
 * for the flat, convex ones exporters write. Lines, points and curves are left out. Colours written
 * on a corner (`v x y z r g b`) are carried, read as screen colours, the ones the artist saw.
 *
 * The picture coordinates are turned upside down on the way in: the format counts them from the
 * bottom of the picture and this engine, like glTF, from the top.
 *
 * Facings: what the file wrote under `'auto'`, or worked out smooth when it wrote none (or not for
 * every corner of a part); `'smooth'` and `'flat'` as for a glTF. Smoothing groups (`s`) are not
 * read: `shading` says how the whole model faces.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readObj = (text: string, shading: TShading, node: string | undefined): TObjFile => {
    const positions: number[] = [];
    const colours: number[] = [];
    let coloured = false;
    const uvs: number[] = [];
    const normals: number[] = [];
    const libraries: string[] = [];

    const gathering = new Map<string, TGathering>();
    let name = '';
    let material = '';
    let current: TGathering | null = null;

    const open = (): TGathering => {
        if (current !== null) {
            return current;
        }
        const key = `${name}\u0000${material}`;
        let found = gathering.get(key);
        if (found === undefined) {
            found = { name, material, corners: [] };
            gathering.set(key, found);
        }
        current = found;
        return found;
    };

    // A line ending in a backslash goes on in the next one.
    const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
    for (const raw of lines) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        const words = line.split(/\s+/);
        switch (words[0]) {
            case 'v': {
                positions.push(numberOf(words[1]), numberOf(words[2]), numberOf(words[3]));
                // Six or seven numbers is a place and a colour; four is a place and a weight.
                if (words.length >= 7) {
                    coloured = true;
                    colours.push(numberOf(words[4]), numberOf(words[5]), numberOf(words[6]));
                } else {
                    colours.push(1, 1, 1);
                }
                break;
            }
            case 'vt':
                uvs.push(numberOf(words[1]), 1 - numberOf(words[2]));
                break;
            case 'vn':
                normals.push(numberOf(words[1]), numberOf(words[2]), numberOf(words[3]));
                break;
            case 'f': {
                const piece = open();
                const count = words.length - 1;
                if (count < 3) {
                    break;
                }
                const corner = (word: string): [number, number, number] => {
                    const [v, t, n] = word.split('/');
                    return [placeOf(v, positions.length / 3), placeOf(t, uvs.length / 2), placeOf(n, normals.length / 3)];
                };
                const first = corner(words[1]);
                if (first[0] < 0) {
                    break;
                }
                let previous = corner(words[2]);
                for (let i = 3; i <= count; i++) {
                    const next = corner(words[i]);
                    if (previous[0] >= 0 && next[0] >= 0) {
                        piece.corners.push(...first, ...previous, ...next);
                    }
                    previous = next;
                }
                break;
            }
            case 'o':
            case 'g':
                name = restOf(line);
                current = null;
                break;
            case 'usemtl':
                material = restOf(line);
                current = null;
                break;
            case 'mtllib':
                libraries.push(...librariesOf(restOf(line)));
                break;
            default:
                // Smoothing groups, lines, points, curves and anything else: not drawn here.
                break;
        }
    }

    const all = [...gathering.values()].filter((piece) => piece.corners.length > 0);
    const names = [...new Set(all.map((piece) => piece.name))];
    const seen = new Map<string, number>();
    const parts: TObjPart[] = [];

    for (const piece of all) {
        // Counted over the whole file even when one piece is asked for, so a piece has the same
        // number however it was loaded.
        const occurrence = seen.get(piece.name) ?? 0;
        seen.set(piece.name, occurrence + 1);
        if (node !== undefined && piece.name !== node) {
            continue;
        }
        parts.push({ ...buildPiece(piece, positions, colours, coloured, uvs, normals, shading), name: piece.name, occurrence, material: piece.material });
    }

    return { parts, libraries, names };
};

/**
 * One piece's corners, one for each place, picture coordinate and facing the file put together,
 * laid out as the graphics card reads them.
 */
const buildPiece = (
    piece: TGathering,
    positions: number[],
    colours: number[],
    coloured: boolean,
    uvs: number[],
    normals: number[],
    shading: TShading,
): Omit<TBuiltPart, 'name' | 'occurrence'> => {
    const made = new Map<string, number>();
    const order: number[] = [];
    const triangleCorners = piece.corners.length / 3;
    const indices = triangleCorners > 65535 ? new Uint32Array(triangleCorners) : new Uint16Array(triangleCorners);
    for (let i = 0; i < triangleCorners; i++) {
        const v = piece.corners[i * 3];
        const t = piece.corners[i * 3 + 1];
        const n = piece.corners[i * 3 + 2];
        const key = `${v}/${t}/${n}`;
        let at = made.get(key);
        if (at === undefined) {
            at = order.length / 3;
            made.set(key, at);
            order.push(v, t, n);
        }
        indices[i] = at;
    }

    const count = order.length / 3;
    // Fewer corners than triangle corners, so the numbering may fit a smaller kind after all.
    const fitted = count <= 65535 && indices instanceof Uint32Array ? Uint16Array.from(indices) : indices;

    const place = new Float32Array(count * 3);
    let everyFacing = true;
    for (let i = 0; i < count; i++) {
        const v = order[i * 3];
        place[i * 3] = positions[v * 3];
        place[i * 3 + 1] = positions[v * 3 + 1];
        place[i * 3 + 2] = positions[v * 3 + 2];
        if (order[i * 3 + 2] < 0) everyFacing = false;
    }

    // Flat writes every facing again once the corners are split; a part missing a facing anywhere is
    // worked out whole, since one dark corner would show.
    const facing = shading === 'flat'
        ? new Float32Array(count * 3)
        : shading === 'auto' && everyFacing
            ? Float32Array.from({ length: count * 3 }, (_, k) => normals[order[Math.floor(k / 3) * 3 + 2] * 3 + (k % 3)])
            : computeNormals(place, fitted);

    const vertices = new Float32Array(count * GEOMETRY_STRIDE);
    const painted = coloured ? new Uint8Array(count * 4) : null;
    for (let i = 0; i < count; i++) {
        const v = order[i * 3];
        const t = order[i * 3 + 1];
        const base = i * GEOMETRY_STRIDE;
        vertices[base] = place[i * 3];
        vertices[base + 1] = place[i * 3 + 1];
        vertices[base + 2] = place[i * 3 + 2];
        vertices[base + 3] = facing[i * 3];
        vertices[base + 4] = facing[i * 3 + 1];
        vertices[base + 5] = facing[i * 3 + 2];
        vertices[base + 6] = t < 0 ? 0 : uvs[t * 2];
        vertices[base + 7] = t < 0 ? 0 : uvs[t * 2 + 1];
        if (painted !== null) {
            for (let c = 0; c < 3; c++) {
                painted[i * 4 + c] = Math.round(Math.min(Math.max(colours[v * 3 + c], 0), 1) * 255);
            }
            painted[i * 4 + 3] = 255;
        }
    }

    const shaped = shading === 'flat'
        ? toFlatShaded(vertices, fitted, null, painted)
        : { vertices, indices: fitted, skin: null, colors: painted };

    return {
        vertices: shaped.vertices,
        indices: shaped.indices,
        skin: null,
        colors: shaped.colors,
        detail: null,
        materialIndex: undefined,
        skeleton: undefined,
    };
};
