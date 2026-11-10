import { BOX2D_WASM } from './box2d_wasm';

/**
 * What the compiled 2D physics offers, call by call: Box2D v3 behind a flat layer of numbers (see
 * `native/physics2d/naca_physics2d.c`). A world is a number, and so are a body, a shape and a joint.
 *
 * @internal
 */
export type TBox2dExports = {
    memory: WebAssembly.Memory;
    _initialize?: () => void;
    nb_in: (floats: number) => number;
    nb_out: () => number;
    nb_units: (pixelsPerMeter: number) => void;
    nb_world_create: (gx: number, gy: number) => number;
    nb_world_destroy: (world: number) => void;
    nb_world_step: (world: number, dt: number, substeps: number) => void;
    nb_world_gravity: (world: number, x: number, y: number) => void;
    nb_world_events: (world: number) => number;
    nb_body_create: (world: number, type: number, x: number, y: number, angle: number) => number;
    nb_body_destroy: (body: number) => void;
    nb_body_valid: (body: number) => number;
    nb_body_x: (body: number) => number;
    nb_body_y: (body: number) => number;
    nb_body_angle: (body: number) => number;
    nb_body_vx: (body: number) => number;
    nb_body_vy: (body: number) => number;
    nb_body_spin: (body: number) => number;
    nb_body_mass: (body: number) => number;
    nb_body_inertia: (body: number) => number;
    nb_body_mass_x: (body: number) => number;
    nb_body_mass_y: (body: number) => number;
    nb_body_type: (body: number) => number;
    nb_body_impulse: (body: number, x: number, y: number, wake: number) => void;
    nb_body_impulse_at: (body: number, x: number, y: number, px: number, py: number, wake: number) => void;
    nb_body_turn_impulse: (body: number, impulse: number, wake: number) => void;
    nb_body_force: (body: number, x: number, y: number, wake: number) => void;
    nb_body_set_velocity: (body: number, x: number, y: number) => void;
    nb_body_set_spin: (body: number, spin: number) => void;
    nb_body_set_transform: (body: number, x: number, y: number, angle: number) => void;
    nb_body_move_to: (body: number, x: number, y: number, angle: number, dt: number) => void;
    nb_body_set_mass: (body: number, mass: number, inertia: number) => void;
    nb_body_damping: (body: number, linear: number, angular: number) => void;
    nb_body_fixed_rotation: (body: number, fixed: number) => void;
    nb_body_sleep: (body: number, enable: number) => void;
    nb_body_wake: (body: number) => void;
    nb_shape_circle: (body: number, x: number, y: number, radius: number, density: number, friction: number, bounce: number, flags: number, category: number, mask: number) => number;
    nb_shape_box: (body: number, halfWidth: number, halfHeight: number, x: number, y: number, radius: number, density: number, friction: number, bounce: number, flags: number, category: number, mask: number) => number;
    nb_shape_polygon: (body: number, count: number, radius: number, density: number, friction: number, bounce: number, flags: number, category: number, mask: number) => number;
    nb_shape_capsule: (body: number, x1: number, y1: number, x2: number, y2: number, radius: number, density: number, friction: number, bounce: number, flags: number, category: number, mask: number) => number;
    nb_shape_filter: (shape: number, category: number, mask: number) => void;
    nb_shape_contact_events: (shape: number, on: number) => void;
    nb_shape_body: (shape: number) => number;
    nb_shape_flags: (shape: number) => number;
    nb_shape_bottom: (shape: number) => number;
    nb_joint_hinge: (a: number, b: number, ax: number, ay: number, bx: number, by: number, reference: number, limit: number, lower: number, upper: number, motor: number, maxTorque: number, speed: number, collide: number) => number;
    nb_joint_slider: (a: number, b: number, ax: number, ay: number, bx: number, by: number, axisX: number, axisY: number, reference: number, limit: number, lower: number, upper: number, motor: number, maxForce: number, speed: number, collide: number) => number;
    nb_joint_distance: (a: number, b: number, ax: number, ay: number, bx: number, by: number, length: number, spring: number, hertz: number, damping: number, limit: number, minLength: number, maxLength: number, collide: number) => number;
    nb_joint_weld: (a: number, b: number, ax: number, ay: number, bx: number, by: number, reference: number, linearHertz: number, angularHertz: number, damping: number, collide: number) => number;
    nb_joint_valid: (joint: number) => number;
    nb_joint_destroy: (joint: number) => void;
    nb_joint_anchor_x: (joint: number) => number;
    nb_joint_anchor_y: (joint: number) => number;
    nb_mover_collide: (world: number, x1: number, y1: number, x2: number, y2: number, radius: number, category: number, mask: number, skipFlags: number, skipShape: number) => number;
    nb_mover_solve: (dx: number, dy: number, count: number) => void;
    nb_mover_cast: (world: number, x1: number, y1: number, x2: number, y2: number, radius: number, dx: number, dy: number, category: number, mask: number, skipFlags: number, skipShape: number) => number;
    nb_cast_segment: (world: number, x1: number, y1: number, x2: number, y2: number, dx: number, dy: number, category: number, mask: number, skipFlags: number, skipShape: number) => number;
    nb_cast_ray: (world: number, x: number, y: number, dx: number, dy: number, category: number, mask: number, skipFlags: number, skipShape: number) => number;
};

/**
 * Asked by the solver about a contact touching a ledge or a character, before it is resolved: whether
 * to resolve it. Each world answers for its own.
 *
 * @internal
 */
export type TPresolve = (shapeA: number, shapeB: number, normalX: number, normalY: number) => boolean;

/**
 * The loaded 2D physics: its calls, and views into its memory for the calls that answer through it.
 *
 * @internal
 */
export type TBox2d = {
    b2: TBox2dExports;
    /**
     * Where to write `floats` numbers for the next call that reads them.
     */
    input: (floats: number) => Float32Array;
    /**
     * The last answer written to memory, as numbers and as whole numbers (the same bytes).
     */
    output: (count: number) => { f32: Float32Array; i32: Int32Array };
    /**
     * Who answers the solver's question for a world, while it is open.
     */
    presolvers: Map<number, TPresolve>;
};

/**
 * What a shape is besides its geometry, as the shim keeps it. The same numbers as `native/physics2d/naca_physics2d.c`.
 *
 * @internal
 */
export const SHAPE_SENSOR = 1;
/** @internal */
export const SHAPE_LEDGE = 2;
/** @internal */
export const SHAPE_PRESENCE = 4;

/**
 * Pixels to a metre, for Box2D's tolerances. A metre of 16 pixels is a tile, and the scale a 2D game's
 * things are drawn at: a crate is a metre, a character two, a level a few hundred.
 */
const PIXELS_PER_METER = 16;

const decode = (base64: string): Uint8Array<ArrayBuffer> => {
    const text = atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(text.length));
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes;
};

let modulePromise: Promise<TBox2d> | null = null;

/**
 * Loads (once a page) what simulates the 2D physics, and hands back the way to call it.
 *
 * The WebAssembly travels inside the engine as base64 rather than as a file beside it: it works under
 * any bundler, in a desktop shell and in a test with nothing to serve or resolve, for some 105 KB gzip.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadBox2D = (): Promise<TBox2d> => {
    if (modulePromise === null) {
        const presolvers = new Map<number, TPresolve>();
        modulePromise = WebAssembly.instantiate(decode(BOX2D_WASM), {
            env: {
                presolve: (world: number, shapeA: number, shapeB: number, normalX: number, normalY: number): number =>
                    (presolvers.get(world)?.(shapeA, shapeB, normalX, normalY) ?? true) ? 1 : 0,
            },
        }).then(({ instance }) => {
            const b2 = instance.exports as unknown as TBox2dExports;
            b2._initialize?.();
            b2.nb_units(PIXELS_PER_METER);
            return {
                b2,
                presolvers,
                // The address first: making room can grow the memory, which leaves a buffer read before it
                // behind.
                input: (floats: number) => {
                    const at = b2.nb_in(floats);
                    return new Float32Array(b2.memory.buffer, at, floats);
                },
                output: (count: number) => {
                    const at = b2.nb_out();
                    return { f32: new Float32Array(b2.memory.buffer, at, count), i32: new Int32Array(b2.memory.buffer, at, count) };
                },
            };
        });
    }
    return modulePromise;
};

/**
 * Loads what simulates the 2D physics, ahead of the first scene that needs it: once a page, however
 * often it is called. A world loads it on its own the first time, and its bodies wait for it, so this
 * is only for a game that would rather pay that wait on a loading screen than in its first level.
 *
 * @example
 * ```ts
 * import { installPhysics2d, loadPhysics2d } from 'nacatamalon/physics2d';
 *
 * installPhysics2d();
 * await loadPhysics2d();
 * ```
 *
 * @returns Done once it is ready.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadPhysics2d = async (): Promise<void> => {
    await loadBox2D();
};
