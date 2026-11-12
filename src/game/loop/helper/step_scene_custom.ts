import { computeModelMatrix } from '../../../render/shared/compute_mvp_3d';
import { UPRIGHT } from '../../../render/shared/fill_mesh_uniforms';
import { recordOf } from './view_walk';
import { drawableKindOf } from '../../../gameobjects/custom';
import * as mat from '../../../math/mat4';
import type { TDrawable } from '../../../gameobjects/types';
import type { TDrawCustom } from '../../../render/interface';
import type { TCustomDrawable } from '../../../gameobjects/custom';

/**
 * Each drawing's stand-in, reused from one frame to the next.
 */
const stand = new WeakMap<TCustomDrawable, { -readonly [K in keyof TDrawCustom]: TDrawCustom[K] }>();

/**
 * The drawing each stand-in stands for, as its plugin made it: what a picture told to leave a drawing
 * out (an object's own surroundings, `useEnvironment({ around })`) knows it by.
 */
const standsFor = new WeakMap<object, TCustomDrawable>();

/**
 * The drawing a plugin made that `item` stands in for in the list, or `item` itself when it stands
 * for none.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const customRecordOf = (item: object): object => standsFor.get(item) ?? item;

/**
 * Where a drawing is when nothing above it has a placement: its own, built here. Scratch.
 */
const ownMatrix = mat.create();

/**
 * A flat placement as a matrix: moved, turned about `z` and grown, `z` left alone, as a sprite is.
 */
const flatMatrix = (t: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }, out: Float32Array): void => {
    const c = Math.cos(t.rotation);
    const s = Math.sin(t.rotation);
    out[0] = c * t.scaleX; out[1] = s * t.scaleX; out[2] = 0; out[3] = 0;
    out[4] = -s * t.scaleY; out[5] = c * t.scaleY; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = t.x; out[13] = t.y; out[14] = 0; out[15] = 1;
};

/**
 * Gets every drawing of a registered kind in this stretch of the list ready to draw: its kind
 * prepares it, and a stand-in carrying what it prepared takes its place in the list.
 *
 * After the walk, as lines are, because what a kind prepares usually depends on where the drawing
 * ended up, and that is only known once every placement above it has been composed. A drawing whose
 * kind is not registered is drawn as nothing (`createDrawable` refuses to make one, so it can only
 * be a record made by hand).
 *
 * `upright`: the scene's 3D camera follows the 2D one, so its world has `y` down, and a drawing in
 * depth is turned over in its own frame first, as the engine's models are (`fillMeshUniforms`): its
 * kind is handed where it is drawn, and draws it standing the right way with nothing to do.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepSceneCustom = (drawables: TDrawable[], start: number, upright = false): void => {
    for (let i = start; i < drawables.length; i++) {
        const drawable = drawables[i];
        if (drawable.type !== 'custom') {
            continue;
        }
        // A view's own copy of a flat drawing has a stand-in of its own, with its own place, while
        // the kind is asked about the drawing it made, which is what it keeps its state by.
        let drawn = stand.get(drawable);
        if (drawn === undefined) {
            drawn = { type: 'custom', kind: drawable.kind, space: drawable.space, payload: null, world: mat.create(), bounds: null };
            stand.set(drawable, drawn);
        }
        const record = recordOf(drawable);
        standsFor.set(drawn, record);
        drawn.zIndex = drawable.zIndex;
        // Its own copy: the record's is written over when it is placed again for another view.
        if (drawable.space === '2d') {
            flatMatrix(drawable.worldTransform ?? drawable.transform, drawn.world);
        } else {
            drawn.world.set(drawable.worldMatrix ?? computeModelMatrix(drawable.transform, ownMatrix));
            if (upright) mat.scale(drawn.world, UPRIGHT, drawn.world);
        }
        const kind = drawableKindOf(drawable.kind);
        drawn.payload = kind === undefined ? null : kind.prepare(record, drawn.world);
        drawn.bounds = kind?.bounds?.(record) ?? null;
        drawables[i] = drawn as unknown as TDrawable;
    }
};
