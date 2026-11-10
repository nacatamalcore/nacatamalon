import type { TColorOption } from '../../../color';
import type { IBuffer } from '../../../render/interface';
import type { TQuat } from '../../../math/quat';
import type { TMesh } from './t_mesh';
import type { TMeshOptions } from './t_mesh_options';

/**
 * Where one instance is, inside the model it belongs to, and what is its own. Everything left out is
 * the plain answer: at the model's middle, unturned, its own size, white, and four zeros.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshInstancePlacement = {
    x?: number;
    y?: number;
    z?: number;
    /**
     * Its turn about each axis, in radians, as a model's own: `rotation` about Z.
     */
    rotation?: number;
    rotationX?: number;
    rotationY?: number;
    /**
     * Its turn as a quaternion, which wins over the three angles when given.
     */
    quaternion?: TQuat | null;
    /**
     * Its size, the same every way. `scaleX`, `scaleY` and `scaleZ` say one way apart.
     */
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
    /**
     * Its colour, multiplied into the colour painted on the shape's corners and so into the
     * material's own tint: white leaves it as it is. Its alpha below 1 is only seen through on a
     * material that is `transparent`, or cut out with `alphaCutoff`; on any other it still hides
     * what is drawn behind it after it.
     */
    tint?: TColorOption;
    /**
     * Four numbers of its own, for the material's corner hook to read as `ctx.instance`: a seed,
     * how tall, how far along it is. Fewer than four are followed by zeros.
     */
    data?: readonly number[];
};

/**
 * The run of instances behind a `createMeshInstances`: its numbers here and on the card. The
 * renderer reads `buffer`, `count` and `bounds`; the rest is how the game keeps them up to date.
 * Never authored: write through `set` and `count`.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshInstanceRun = {
    /**
     * The run on the card, made the first frame it is drawn.
     */
    buffer: IBuffer | null;
    /**
     * How many are drawn: the model's `count`, kept within what there is room for.
     */
    count: number;
    /**
     * The box every drawn instance fits in, in the model's own space, measured again when one
     * changes. `null` until the shape has a box of its own.
     */
    bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
    /**
     * Twenty numbers an instance: the three rows of its placement, its colour, its four numbers.
     */
    data: Float32Array;
    /**
     * How many there is room for.
     */
    capacity: number;
    /**
     * The first instance written since the run last went up, and the one after the last. Equal
     * when nothing has changed.
     */
    dirtyFrom: number;
    dirtyTo: number;
    /**
     * What `bounds` was measured for: the shape's own box and how many were drawn. `null` asks for
     * it to be measured again.
     */
    measured: { box: object; count: number } | null;
};

/**
 * Many of one shape, drawn in one go: what `createMeshInstances` gives back. A model like any other
 * (its `transform` moves them all, its `material` is their surface), with a place for each instance.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshInstances = TMesh & {
    instances: TMeshInstanceRun;
    /**
     * How many are drawn, from the first. Starts at none and grows as `set` writes further along;
     * lower it to draw fewer, raise it again to draw them back. Never more than `capacity`. A `set`
     * past it raises it to reach that instance, so lower it again after setting ones that stay hidden.
     */
    count: number;
    /**
     * How many there is room for, said when it was made.
     */
    readonly capacity: number;
    /**
     * Says where instance `index` is and what is its own, whole: anything left out goes back to the
     * plain answer rather than staying as it was. Sent to the card once, on the next frame, however
     * many were set.
     */
    set: (index: number, placement?: TMeshInstancePlacement) => void;
};

/**
 * What `createMeshInstances` is asked for: everything `createMesh` is, and how many there is room for.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshInstancesOptions = TMeshOptions & {
    /**
     * How many instances there is room for. Fixed: the run on the card is made this long once.
     */
    capacity: number;
};
