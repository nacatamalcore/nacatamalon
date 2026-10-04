import type { IBuffer } from '../i_buffer';
import type { TDrawMaterial } from './t_draw_material';

/**
 * What a backend needs to know about the bones moving a model.
 *
 * Only the finished numbers: who hangs off whom, and how the movement was worked out, are the
 * game's business and stop at this line. The backend puts the run on the card and names it in the
 * shader, nothing more.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawSkeleton = {
    /**
     * What it is kept under, which is how a backend recognises the same bones again.
     */
    readonly key: string;
    /**
     * 16 numbers a bone, worked out afresh each frame.
     */
    readonly jointMatrices: Float32Array;
};

/**
 * What a backend needs to draw one model: a shape on the card, where it is, and what its surface is
 * like.
 *
 * Owned by the renderer, like every other draw type: the game's record fits by shape, so the same
 * object is passed and nothing is copied.
 *
 * Unlike a sprite, this carries no size: a model's size is in the shape itself, and its placement
 * scales it. And unlike a sprite it is **placed with a matrix**, because turning in three dimensions
 * cannot be said with one angle.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawMesh = {
    readonly type: 'mesh';
    /**
     * The shape. `null`, or one with no buffers, draws nothing: a model whose shape has not arrived
     * is skipped rather than drawn as something else.
     */
    readonly geometry: {
        readonly vertexBuffer: IBuffer | null;
        readonly indexBuffer: IBuffer | null;
        readonly indexCount: number;
        /**
         * How wide each triangle point is, which the backend has to bind it as.
         */
        readonly indexType: 'uint16' | 'uint32';
        /**
         * Which bones move each corner and how much, for a shape off a rig.
         */
        readonly skinBuffer: IBuffer | null;
        /**
         * The colour painted on each corner, four bytes apiece. White when nobody painted it.
         */
        readonly colorBuffer: IBuffer | null;
    } | null;
    /**
     * Where it is, how it is turned, how big. Read when nothing above it moved it.
     */
    readonly transform: {
        x: number; y: number; z: number;
        rotation: number; rotationX: number; rotationY: number;
        scaleX: number; scaleY: number; scaleZ: number;
    };
    /**
     * Where it ends up once something above it did, already as a matrix.
     */
    readonly worldMatrix?: Float32Array;
    /**
     * What its surface is like, and any shader of its own.
     *
     * A whole object rather than the loose fields it used to be, because several models can be
     * handed the same one: that is what lets a backend recognise the same surface again and keep one
     * compiled pipeline for all of them instead of one apiece.
     */
    readonly material: TDrawMaterial;
    /**
     * The bones moving it, or `null`. With them the model is drawn by the pipeline that bends; it
     * is the one thing here that decides which of the two draws it.
     */
    readonly skeleton: TDrawSkeleton | null;
    /**
     * Whether it is drawn into the shadow map. Absent casts, which is what nearly everything should
     * do.
     *
     * `false` is for the things a shadow of would be wrong rather than expensive: the ground the
     * shadows land on, a decal, the soft disc of a blob shadow. It costs nothing at all in a scene
     * whose lights never asked to cast, because then there is no map to be left out of.
     */
    readonly castShadow?: boolean;
};
