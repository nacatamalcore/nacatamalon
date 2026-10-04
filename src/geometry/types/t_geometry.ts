import type { TLoadStatus } from '../../loaders';
import type { IBuffer } from '../../render/interface';
import type { TGeometrySource } from './t_geometry_source';

/**
 * A shape on the graphics card: its corners, and the order they make triangles in.
 *
 * It is an asset, like an image: built or loaded once, kept under a name, and shared by every model
 * that shows it. A hundred crates are a hundred placements over one of these.
 *
 * The corners are eight numbers each, in one run: where the corner is, which way the surface faces
 * there, and which part of the picture it shows. One run rather than three, because the graphics
 * card reads a corner at a time and three separate runs would make it jump about for every one.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGeometry = {
    readonly type: 'geometry';
    /**
     * What it is kept under. A shape asked for twice with the same size is the same one.
     */
    key: string;
    /**
     * A built shape is ready the moment you have it. One that came out of a file is `'loading'`
     * until the file arrives, and models showing it simply are not drawn until then.
     */
    status: TLoadStatus;
    /**
     * How it was made, so it can be made again from a file. `null` for a shape built from raw
     * vertex data, which nothing can write down and which a scene document leaves out.
     */
    source: TGeometrySource | null;
    /**
     * How many corners, and how many triangle points.
     */
    vertexCount: number;
    indexCount: number;
    /**
     * The box it fits inside, in its own units.
     */
    bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
    /**
     * Where each corner is, kept on this side: the graphics card's copy cannot be read back.
     */
    positions: Float32Array | null;
    /**
     * Which corners make up each triangle, three at a time: the companion of `positions`, kept on
     * this side for the same reason and useless without it.
     *
     * The pair of them is what a collider made of a shape's **real** triangles is built from, dents
     * and all, which is how a room or a piece of ground is collided with. The corners alone answer
     * a looser question (the smallest solid that wraps them), and the box it fits inside answers a
     * looser one still.
     */
    indices: Uint16Array | Uint32Array | null;
    vertexBuffer: IBuffer | null;
    indexBuffer: IBuffer | null;
    /**
     * How wide each triangle point is. Small shapes use the narrow one, which is half the memory;
     * a shape of more than 65.536 corners cannot be addressed that way and uses the wide one.
     */
    indexType: 'uint16' | 'uint32';
    /**
     * Which bones move each corner and how much, for a shape that came off a rig. `null` for
     * everything else, which is nearly everything.
     *
     * A run of its own rather than mixed in with the rest: a shape without bones would otherwise
     * carry eight unused numbers per corner, and every piece of code that walks corners would have
     * to ask how wide they are this time.
     */
    skinBuffer: IBuffer | null;
    /**
     * The colour painted on each corner, four bytes apiece (red, green, blue, and how opaque),
     * which the card smears across each triangle and multiplies into the surface.
     *
     * It is how the consoles of this engine's era lit a level: the light was worked out once, by the
     * artist or the tools, and baked into the corners, so a cave could be dark in its corners and
     * bright by its torches without a single lamp being computed. A shape nobody painted is white
     * all over, which changes nothing, so every shape has one and every model is drawn the same way.
     *
     * A run of its own for the same reason the bones have one: the first run stays exactly what it
     * always was.
     */
    colorBuffer: IBuffer | null;
};

/**
 * How many numbers each corner takes: where it is, which way it faces, what it shows.
 */
export const GEOMETRY_STRIDE = 8;

/**
 * How many bytes a corner's painted colour takes: red, green, blue and how opaque, one each.
 */
export const COLOR_STRIDE = 4;

/**
 * How many numbers a corner of a deformed shape takes on top: four bones, and four weights.
 */
export const SKIN_STRIDE = 8;
