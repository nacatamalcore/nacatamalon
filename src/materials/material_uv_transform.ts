import type { TMaterialUvTransform, TMaterialUvTransformRecord } from './types/t_material';

/**
 * The two uniforms a material with a `uvTransform` is drawn with: its turn and scale as a 2 by 2, in
 * columns, and its slide. Reserved names, which the shader's corner stage looks for to move the
 * picture place (see mesh_material_shader.ts, `movedBy`), written by the engine every frame from the
 * material's `uvTransform`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const UV_MATRIX = 'uvTransformMatrix';
export const UV_OFFSET = 'uvTransformOffset';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * A `uvTransform` as the record keeps it, checked: every part filled in, `undefined` when none was
 * asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uvTransformOf = (asked: TMaterialUvTransform | null | undefined, caller = 'createMaterial'): TMaterialUvTransformRecord | undefined => {
    if (asked === undefined || asked === null) {
        return undefined;
    }
    if (typeof asked !== 'object') {
        throw new Error(`[NacatamalOn] ${caller}: uvTransform is ${String(asked)}, and it takes { scale, rotation, offset }, each one optional.`);
    }
    const scale = asked.scale ?? 1;
    const across = typeof scale === 'number' ? scale : scale?.x;
    const down = typeof scale === 'number' ? scale : scale?.y;
    if (!finite(across) || !finite(down) || across === 0 || down === 0) {
        throw new Error(`[NacatamalOn] ${caller}: uvTransform.scale is ${JSON.stringify(scale)}, and it takes how many times the picture is laid, a number or { x, y }, not 0 (a negative one mirrors it).`);
    }
    const rotation = asked.rotation ?? 0;
    if (!finite(rotation)) {
        throw new Error(`[NacatamalOn] ${caller}: uvTransform.rotation is ${String(rotation)}, and it takes how far the picture is turned, in radians.`);
    }
    const offset = asked.offset ?? { x: 0, y: 0 };
    if (typeof offset !== 'object' || offset === null || !finite(offset.x) || !finite(offset.y)) {
        throw new Error(`[NacatamalOn] ${caller}: uvTransform.offset is ${JSON.stringify(offset)}, and it takes how far the picture is slid, { x, y }, in pictures.`);
    }
    return { scale: { x: across, y: down }, rotation, offset: { x: offset.x, y: offset.y } };
};

/**
 * A number of the record kept usable when a game set it to something that is not: a scale of `0`
 * squashes the picture to a line, and the way across it to nothing, so it is kept a hair away.
 */
const usable = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.abs(value) < 1e-6 ? (value < 0 ? -1e-6 : 1e-6) : value;
};

/**
 * What the two uniforms are, for the signature of a material that moves its picture: declared by
 * the engine, never among the game's own uniforms, so a bag a game hands to several materials, or a
 * scene starting again, holds only what the game put in it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const UV_SIGNATURE = { [UV_MATRIX]: 'vec4<f32>', [UV_OFFSET]: 'vec2<f32>' } as const;

/**
 * Writes a material's `uvTransform` as the two uniforms it is drawn with, straight into the numbers a
 * draw hands the card, at their places (`matrixAt`, `offsetAt`): nothing made, however often a game
 * changes it. Scaled, turned, then slid, as the file format's reference viewer lays it:
 * `uv' = offset + turn(rotation) * (scale * uv)`, the turn with columns `(cos, -sin)` and `(sin, cos)`,
 * which turns the picture clockwise as it is seen, the picture's `v` growing down.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeUvTransform = (out: Float32Array, matrixAt: number, offsetAt: number, transform: TMaterialUvTransformRecord): void => {
    const sx = usable(transform.scale.x, 1);
    const sy = usable(transform.scale.y, 1);
    const rotation = Number.isFinite(transform.rotation) ? transform.rotation : 0;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    // In columns: where across lands, then where down lands.
    out[matrixAt] = c * sx;
    out[matrixAt + 1] = -s * sx;
    out[matrixAt + 2] = s * sy;
    out[matrixAt + 3] = c * sy;
    out[offsetAt] = Number.isFinite(transform.offset.x) ? transform.offset.x : 0;
    out[offsetAt + 1] = Number.isFinite(transform.offset.y) ? transform.offset.y : 0;
};
