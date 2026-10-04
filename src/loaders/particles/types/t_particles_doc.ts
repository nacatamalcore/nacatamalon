import type { TColor } from '../../../color';

/**
 * The format number a `.particles` file written today carries.
 *
 * Bumped only for a change an older reader could not survive. A new optional field does not bump
 * it, because an older reader ignoring a field it has never heard of is the whole point of having
 * optional fields.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLES_FORMAT = 1;

/**
 * How a particle is laid over what is already there.
 *
 * `alpha` covers, which is what smoke and dust want. `additive` **adds light**, which is the only
 * way fire, sparks and anything glowing read as bright: two overlapping embers should be brighter
 * than one, and under `alpha` they are merely nearer.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleBlend = 'alpha' | 'additive';

/**
 * A pair of numbers a particle draws one value from when it is born.
 *
 * Written as `[min, max]`, or as a bare number when every particle should get the same one.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleRange = [number, number];

/**
 * Where a particle is **born**, in the emitter's own space.
 *
 * Deliberately apart from which way it then moves, which is `direction` and `spread` below. A ring
 * of sparks flying outwards and a ring of rain falling straight down are the same birth area with
 * different velocities, and folding the two together makes the second one impossible to say.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEmitShape2d =
    /**
     * Every particle born at the emitter's own point.
     */
    | { kind: 'point' }
    /**
     * Born inside a disc of `radius`, or on its rim when `edge` is set.
     */
    | { kind: 'circle'; radius: number; edge: boolean }
    /**
     * Born inside a `width` by `height` rectangle, centred on the emitter.
     */
    | { kind: 'rect'; width: number; height: number }
    /**
     * Born along a line of `length` turned by `angle` radians: a bar of rain, a scorch mark.
     */
    | { kind: 'line'; length: number; angle: number };

/**
 * Where a particle is **born** in three dimensions, in the emitter's own space.
 *
 * The same split as the flat shapes, position only, with one exception: a cone also **aims** what it
 * emits, along its own wall, because a cone whose particles ignored it would be a disc.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEmitShape3d =
    /**
     * Every particle born at the emitter's own point.
     */
    | { kind: 'point' }
    /**
     * Born inside a ball of `radius`, or on its surface when `edge` is set.
     */
    | { kind: 'sphere'; radius: number; edge: boolean }
    /**
     * Born inside a box of `size`, centred on the emitter and lined up with it.
     */
    | { kind: 'box'; size: [number, number, number] }
    /**
     * Born on a disc of `radius` across `direction`, and sent out along a wall that opens by `angle`
     * radians from it. `spread` means nothing to a cone: its wall already says which way.
     */
    | { kind: 'cone'; radius: number; angle: number };

/**
 * When and how many appear.
 *
 * `rate` and `burst` are both here and they mean different things: `rate` is a fountain, so many a
 * second for as long as it runs, and `burst` is an explosion, all of them the moment the cycle
 * starts. An effect usually wants one and occasionally wants both, so neither can be said with the
 * other.
 *
 * **Both at zero is a perfectly good effect**, not a mistake: it is one that something else fires
 * with `emitParticles`.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEmissionDoc = {
    /**
     * Per second, for as long as the cycle runs. `0` for an effect that only bursts.
     */
    rate: number;
    /**
     * How many appear at once when the cycle starts. `0` for one that only pours.
     */
    burst: number;
    /**
     * How long one cycle emits for, in seconds. `0` is forever: a torch rather than an explosion.
     * Particles already alive when a cycle ends still live out their own lives.
     */
    duration: number;
    /**
     * Start the cycle again when `duration` runs out. Means nothing when `duration` is `0`.
     */
    loop: boolean;
};

/**
 * One stop of the colour a particle walks through as it ages. `t` is `0` at birth and `1` at death.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleColorStop = { t: number; color: TColor; alpha: number };

/**
 * One stop of how big it is as it ages, as a multiple of the size it was born with.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleScaleStop = { t: number; scale: number };

/**
 * What a particle does when it runs into something solid in the scene.
 *
 * Only **how it reacts**, never **what it runs into**: the file is shared by every room that uses the
 * effect, so where the floor is belongs to the scene, which says it with colliders on its objects.
 * Sparks bounce and rain is gone, in any room.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleCollision = {
    /**
     * `bounce` sends it back off the surface; `die` ends it there, which is what rain wants.
     */
    mode: 'bounce' | 'die';
    /**
     * How much of its speed into the surface it keeps on the way back, `0` to `1`.
     */
    bounce: number;
    /**
     * How much of its speed along the surface it loses at each touch, `0` to `1`.
     */
    friction: number;
};

/**
 * A tail drawn behind each particle, out of where it has just been.
 *
 * It is more of the same particle and not a ribbon: copies of it, smaller and fainter towards the
 * end, which is how a trail was drawn in that era and needs nothing the draw does not already have.
 * `length` is in copies because that is what it costs: `max × length` more of them, set aside once.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleTrail = {
    /**
     * How many of its last places each particle keeps.
     */
    length: number;
    /**
     * How wide, against the particle's own size.
     */
    width: number;
    /**
     * Whether it also fades towards the end, and not only narrows.
     */
    fade: boolean;
};

/**
 * How far an effect reaches: a box in the emitter's own space, centred where it says, because a
 * fountain reaches up and dust reaches sideways.
 *
 * **Said, and not enforced.** Nothing is stopped at its faces and nothing is left undrawn because of
 * it: an effect that outgrows its box has the wrong box. It is here so a tool can draw it and a
 * renderer could one day skip an effect that is nowhere near the screen. A flat effect leaves `z` at
 * zero on both.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesBounds = {
    /**
     * The middle of the box.
     */
    center: { x: number; y: number; z: number };
    /**
     * Its whole size on each axis, not half of it.
     */
    size: { x: number; y: number; z: number };
};

/**
 * Another effect a particle sets off when it is born or when it dies: the sparks a firework leaves.
 *
 * `src` is another `.particles`, relative to this one, never an effect written inline: a child is an
 * effect like any other, made, looked at and used again like one.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TChildEmitter = {
    /**
     * When in a particle's life it goes off.
     */
    on: 'birth' | 'death';
    /**
     * The other file, relative to this one.
     */
    src: string;
    /**
     * How many of the child's particles each one sets off.
     */
    count: number;
};

/**
 * A flat `.particles` file, read: pixels, with **+y down**, like everything else in the plane.
 *
 * **Normalized as it is read**, which is what lets everything downstream be a plain walk with no
 * guards: the curves come out sorted with their `t` inside `0` to `1`, a bare number has been
 * widened into a range, and a range somebody wrote backwards has been turned round rather than
 * refused.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesDoc2d = {
    format: number;
    kind: 'particles2d';
    /**
     * The picture every particle shows, relative to the file rather than to the page.
     */
    texture: string | null;
    /**
     * A sheet to take the picture from instead, relative to the file. Read and written back, and
     * **not drawn yet**: this version shows the particles without a picture when it is given one.
     */
    atlas: string | null;
    /**
     * Which frame of that sheet, by its place or its name. At most one of this and `anim`.
     */
    frame: number | string | null;
    /**
     * A run of that sheet played over each particle's whole life. At most one of this and `frame`.
     */
    anim: string | null;
    /**
     * How many may be alive at once. Asked for once and never grown.
     */
    max: number;
    blend: TParticleBlend;
    /**
     * Whether a particle keeps living where it was born when the emitter moves on.
     *
     * `true`, the default, is what a trail of smoke behind a moving thing needs. `false` drags the
     * whole cloud along with the emitter, which is what a magical aura wants.
     */
    worldSpace: boolean;
    emission: TEmissionDoc;
    shape: TEmitShape2d;
    /**
     * The middle of the direction they fly, in radians. `0` is to the right; with y downwards, up is `-π/2`.
     */
    direction: number;
    /**
     * How wide that fan is, in radians. A whole turn is every direction at once.
     */
    spread: number;
    /**
     * How long they live, in seconds.
     */
    life: TParticleRange;
    /**
     * How fast they set off, in pixels a second.
     */
    speed: TParticleRange;
    /**
     * How big they are born, in pixels.
     */
    size: TParticleRange;
    /**
     * How fast they turn, in radians a second.
     */
    spin: TParticleRange;
    /**
     * A steady pull, in pixels a second squared. `+y` is **down**.
     */
    gravity: { x: number; y: number };
    /**
     * How much of its speed a particle sheds each second, `0` to `1`.
     */
    damping: number;
    colorOverLife: TParticleColorStop[];
    sizeOverLife: TParticleScaleStop[];
    /**
     * What it does when it runs into a collider in the scene, or `null` to pass through everything.
     */
    collision: TParticleCollision | null;
    /**
     * The tail each particle leaves, or `null` for none.
     */
    trail: TParticleTrail | null;
    /**
     * How far it reaches, or `null` when nobody has said. See `TParticlesBounds`.
     */
    bounds: TParticlesBounds | null;
    /**
     * The effects its particles set off.
     */
    children: TChildEmitter[];
    /**
     * Whatever else the file declared, kept exactly as written and **not acted on** by this version.
     *
     * Keeping it is not the same mistake as inventing a field nobody reads: throwing it away would
     * quietly rewrite somebody's file the first time a tool saved it.
     */
    unsupported: Record<string, unknown>;
};

/**
 * A `.particles` file for three dimensions, read: world units, with **+y up**.
 *
 * Everything but four fields reads as it does in the flat one. The four are the ones a dimension
 * changes the meaning of: where they are born, which way they fly, which way they fall, and the kind
 * that says so. Pixels and units differ by a factor of a hundred, so the two never share defaults.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesDoc3d = Omit<TParticlesDoc2d, 'kind' | 'shape' | 'direction' | 'gravity'> & {
    kind: 'particles3d';
    shape: TEmitShape3d;
    /**
     * The middle of the direction they fly, one unit long. Straight up unless the file says otherwise.
     */
    direction: { x: number; y: number; z: number };
    /**
     * A steady pull, in units a second squared. `+y` is **up**, so falling is negative.
     */
    gravity: { x: number; y: number; z: number };
};

/**
 * A `.particles` file, read, for whichever dimension it says it is.
 *
 * The dimension is the file's and not the emitter's, because it decides what every other number in
 * it means. An emitter is made for one of the two, and pointing it at the other is refused.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesDoc = TParticlesDoc2d | TParticlesDoc3d;
