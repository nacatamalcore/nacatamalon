import { CURVE_STEPS } from './bake_curves';
import { emitOne } from './emit';
import { emitOne3d } from './emit_3d';
import { collide2d, collide3d } from './collide';
import type { TPlacedCollider2d, TPlacedCollider3d } from './collide';
import { createParticleState, killParticle, TRAIL_SAMPLE_SECONDS } from './particle_pool';
import { childrenOf } from './particle_state';
import { MAX_CHILD_DEPTH } from '../../loaders/particles/load_particles';
import { particleRunOf, runWindowAt } from './particle_run';
import type { TParticleRun } from './particle_run';
import { PARTICLE_3D_OFFSET, PARTICLE_FLOATS, PARTICLE_OFFSET } from '../../render/shared/particle_instance';
import type { TParticleOverrides } from './types/t_particles';
import type { TParticlesDoc, TParticlesDoc2d, TParticlesDoc3d, TParticleTrail } from '../../loaders/particles/types/t_particles_doc';
import type { TChildParticles, TParticleState } from './types/t_particle_pool';
import type { TParticlesFile } from '../../loaders/particles/types/t_particles_file';
import type { TTransform2d } from '../types/t_transform_2d';

/**
 * What a particle's colour and size are at `t` through its life, read from the baked tables.
 */
const stepFor = (t: number): number => Math.min(CURVE_STEPS, Math.max(0, Math.round(t * CURVE_STEPS)));

/**
 * How many tail places the living particles hold between them, which is where their own numbers
 * start: the tails are written first so each particle is drawn over its own tail.
 */
const tailsOf = (state: TParticleState, trail: TParticleTrail | null): number => {
    const { pool } = state;
    if (trail === null || pool.trailLength === 0) {
        return 0;
    }
    let tails = 0;
    for (let i = 0; i < pool.live; i++) {
        tails += pool.trailFill[i]!;
    }
    return tails;
};

/**
 * Where the `j`th newest place of particle `i`'s tail is kept. The head points at the next place to
 * write, so the newest is one behind it.
 */
const ringAt = (state: TParticleState, i: number, j: number): number => {
    const length = state.pool.trailLength;
    return i * length + ((state.pool.trailHead[i]! - 1 - j + 2 * length) % length);
};

/**
 * The whole picture, for particles without a sheet.
 */
const WHOLE = new Float32Array([0, 0, 1, 1]);

/**
 * Writes the window of the picture particle `i` shows at `at`, the same for its tail: every copy of
 * the tail shows the frame the particle shows now.
 */
const writeWindow = (instances: Float32Array, at: number, run: TParticleRun | null, age: number, life: number): void => {
    const windows = run === null ? WHOLE : run.windows;
    const from = run === null ? 0 : runWindowAt(run, age, life);
    instances[at + PARTICLE_OFFSET.window] = windows[from]!;
    instances[at + PARTICLE_OFFSET.window + 1] = windows[from + 1]!;
    instances[at + PARTICLE_OFFSET.window + 2] = windows[from + 2]!;
    instances[at + PARTICLE_OFFSET.window + 3] = windows[from + 3]!;
};

/**
 * Keeps each particle's place for its tail, sixty times a second whatever the frame rate: once a
 * frame would make a tail of six a tenth of a second on one machine and a fifth on another. After the
 * move, so the newest place is where the particle is now. Once a frame at most: two places kept in
 * one frame would be the same place twice.
 */
const keepTails = (state: TParticleState, delta: number): void => {
    const { pool } = state;
    const length = pool.trailLength;
    if (length === 0) {
        return;
    }
    state.trailClock += delta;
    if (state.trailClock < TRAIL_SAMPLE_SECONDS) {
        return;
    }
    state.trailClock %= TRAIL_SAMPLE_SECONDS;
    for (let i = 0; i < pool.live; i++) {
        const slot = i * length + pool.trailHead[i]!;
        pool.tx[slot] = pool.x[i]!;
        pool.ty[slot] = pool.y[i]!;
        pool.tz[slot] = pool.z[i]!;
        pool.trailHead[i] = (pool.trailHead[i]! + 1) % length;
        if (pool.trailFill[i]! < length) {
            pool.trailFill[i]!++;
        }
    }
};

/**
 * Writes what the card reads: one run of numbers per living particle, and one per place of its tail.
 *
 * This is where the curves are spent, and it is the only pass that touches them. Sampling them
 * during the move instead would mean carrying a colour on every particle for a frame, which is four
 * more arrays for a number nothing reads until now.
 *
 * **A tail is more of the same particle**: copies at its last places, narrower towards the end and,
 * with `fade`, fainter. That is how a tail was drawn in that era, and it needs nothing the draw does
 * not already have.
 */
const packInstances = (
    state: TParticleState,
    trail: TParticleTrail | null,
    tintR: number, tintG: number, tintB: number, tintA: number,
    view: number,
    carriedBy: TTransform2d | null,
): void => {
    const { pool, instances, colorTable, scaleTable } = state;
    // Where the emitter is now, laid over particles that live in its own space. `null` for the
    // ordinary ones, which already are where they are.
    const cos = carriedBy === null ? 1 : Math.cos(carriedBy.rotation);
    const sin = carriedBy === null ? 0 : Math.sin(carriedBy.rotation);
    const place = (at: number, x: number, y: number): void => {
        if (carriedBy === null) {
            instances[at + PARTICLE_OFFSET.x] = x;
            instances[at + PARTICLE_OFFSET.y] = y;
            return;
        }
        const sx = x * carriedBy.scaleX;
        const sy = y * carriedBy.scaleY;
        instances[at + PARTICLE_OFFSET.x] = carriedBy.x + sx * cos - sy * sin;
        instances[at + PARTICLE_OFFSET.y] = carriedBy.y + sx * sin + sy * cos;
    };
    const write = (at: number, size: number, rotation: number, step: number, fade: number): void => {
        instances[at + PARTICLE_OFFSET.size] = size;
        instances[at + PARTICLE_OFFSET.rotation] = rotation;
        instances[at + PARTICLE_OFFSET.r] = colorTable[step * 4]! * tintR;
        instances[at + PARTICLE_OFFSET.g] = colorTable[step * 4 + 1]! * tintG;
        instances[at + PARTICLE_OFFSET.b] = colorTable[step * 4 + 2]! * tintB;
        instances[at + PARTICLE_OFFSET.a] = colorTable[step * 4 + 3]! * tintA * fade;
        instances[at + PARTICLE_OFFSET.view] = view;
    };

    const tails = tailsOf(state, trail);
    const run = state.file === null ? null : particleRunOf(state.file);
    let cursor = 0;
    for (let i = 0; i < pool.live; i++) {
        const at = (tails + i) * PARTICLE_FLOATS;
        const step = stepFor(pool.age[i]! / pool.life[i]!);
        const size = pool.size[i]! * scaleTable[step]!;
        place(at, pool.x[i]!, pool.y[i]!);
        write(at, size, pool.rotation[i]!, step, 1);
        writeWindow(instances, at, run, pool.age[i]!, pool.life[i]!);

        if (tails === 0) {
            continue;
        }
        const fill = pool.trailFill[i]!;
        for (let j = 0; j < fill; j++) {
            const ring = ringAt(state, i, j);
            const taper = 1 - j / (fill + 1);
            const to = cursor++ * PARTICLE_FLOATS;
            place(to, pool.tx[ring]!, pool.ty[ring]!);
            write(to, size * trail!.width * taper, pool.rotation[i]!, step, trail!.fade ? taper : 1);
            writeWindow(instances, to, run, pool.age[i]!, pool.life[i]!);
        }
    }
    state.instanceCount = tails + pool.live;
};

/**
 * The same for particles in three dimensions, laid out the way their own draw reads them.
 *
 * `carriedBy` is the emitter's matrix for particles that live in its own space, and `null` for the
 * ordinary ones.
 */
const packInstances3d = (
    state: TParticleState,
    trail: TParticleTrail | null,
    tintR: number, tintG: number, tintB: number, tintA: number,
    carriedBy: Float32Array | null,
): void => {
    const { pool, instances, colorTable, scaleTable } = state;
    const m = carriedBy;
    const place = (at: number, x: number, y: number, z: number): void => {
        if (m === null) {
            instances[at + PARTICLE_3D_OFFSET.x] = x;
            instances[at + PARTICLE_3D_OFFSET.y] = y;
            instances[at + PARTICLE_3D_OFFSET.z] = z;
            return;
        }
        instances[at + PARTICLE_3D_OFFSET.x] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
        instances[at + PARTICLE_3D_OFFSET.y] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
        instances[at + PARTICLE_3D_OFFSET.z] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
    };
    const write = (at: number, size: number, rotation: number, step: number, fade: number): void => {
        instances[at + PARTICLE_3D_OFFSET.size] = size;
        instances[at + PARTICLE_3D_OFFSET.rotation] = rotation;
        instances[at + PARTICLE_3D_OFFSET.r] = colorTable[step * 4]! * tintR;
        instances[at + PARTICLE_3D_OFFSET.g] = colorTable[step * 4 + 1]! * tintG;
        instances[at + PARTICLE_3D_OFFSET.b] = colorTable[step * 4 + 2]! * tintB;
        instances[at + PARTICLE_3D_OFFSET.a] = colorTable[step * 4 + 3]! * tintA * fade;
    };

    const tails = tailsOf(state, trail);
    const run = state.file === null ? null : particleRunOf(state.file);
    let cursor = 0;
    for (let i = 0; i < pool.live; i++) {
        const at = (tails + i) * PARTICLE_FLOATS;
        const step = stepFor(pool.age[i]! / pool.life[i]!);
        const size = pool.size[i]! * scaleTable[step]!;
        place(at, pool.x[i]!, pool.y[i]!, pool.z[i]!);
        write(at, size, pool.rotation[i]!, step, 1);
        writeWindow(instances, at, run, pool.age[i]!, pool.life[i]!);

        if (tails === 0) {
            continue;
        }
        const fill = pool.trailFill[i]!;
        for (let j = 0; j < fill; j++) {
            const ring = ringAt(state, i, j);
            const taper = 1 - j / (fill + 1);
            const to = cursor++ * PARTICLE_FLOATS;
            place(to, pool.tx[ring]!, pool.ty[ring]!, pool.tz[ring]!);
            write(to, size * trail!.width * taper, pool.rotation[i]!, step, trail!.fade ? taper : 1);
            writeWindow(instances, to, run, pool.age[i]!, pool.life[i]!);
        }
    }
    state.instanceCount = tails + pool.live;
};

/**
 * Step 1, which does not care about dimensions: ageing, and killing what has lived its life.
 * `onDeath` is told each one just before it goes, while it is still where it died.
 */
const ageAndKill = (state: TParticleState, delta: number, onDeath: ((index: number) => void) | null = null): void => {
    const { pool } = state;
    // Backwards, because a death moves the last living particle into the slot just vacated, and
    // walking forwards would step straight over it without ever ageing it.
    for (let i = pool.live - 1; i >= 0; i--) {
        pool.age[i]! += delta;
        if (pool.age[i]! >= pool.life[i]!) {
            onDeath?.(i);
            killParticle(pool, i);
        }
    }
};

/**
 * Where a child effect's particles are simulated: nowhere, since each is born at its own place.
 */
const NOWHERE_2D: TTransform2d = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const NOWHERE_3D = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * Where a child is set off from, rewritten for every trigger rather than made for each one.
 */
const setOffAt2d: TTransform2d = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const setOffAt3d = new Float32Array(16);

/**
 * Children whose file is for the other dimension, so it is said once and not every frame.
 */
const wrongKind = new WeakSet<TParticlesFile>();
/**
 * The files already said to be set off past `MAX_CHILD_DEPTH`, so each is said once and not each frame.
 */
const tooDeep = new WeakSet<TParticlesFile>();

/**
 * A child's particles, made the first time it is needed once its file is here. `null` while it is
 * on its way, past `MAX_CHILD_DEPTH`, or when its file is for the other dimension, which is said
 * once. Seeded from the parent's own stream, so a run that replays replays its sparks too.
 */
const particlesOf = (child: TChildParticles, kind: 'particles-2d' | 'particles-3d', parent: TParticleState, depth: number): TParticleState | null => {
    if (child.state !== null) {
        return child.state;
    }
    const doc = child.file.doc;
    if (depth >= MAX_CHILD_DEPTH) {
        if (!tooDeep.has(child.file)) {
            tooDeep.add(child.file);
            console.warn(`[NacatamalOn] particles "${child.file.src}" is set off more than ${MAX_CHILD_DEPTH} set-offs down from the first effect, so it is left out. Set off fewer.`);
        }
        return null;
    }
    if (doc === null) {
        return null;
    }
    if (doc.kind !== kind) {
        if (!wrongKind.has(child.file)) {
            wrongKind.add(child.file);
            console.warn(`[NacatamalOn] particles "${child.file.src}" is set off by a ${kind} effect but is itself ${doc.kind}. It is left out.`);
        }
        return null;
    }
    child.state = createParticleState(doc, Math.floor(parent.random.rand() * 0x7fffffff), child.file);
    child.state.children = childrenOf(child.file);
    return child.state;
};

/**
 * Sets off every child that goes off `when`, from where particle `i` is in the world. Its
 * particles stay in the world once born: they are sparks left behind, not a cloud that follows,
 * even when the child's own file says it rides its emitter, since what set it off is no emitter.
 */
const setOff2d = (state: TParticleState, doc: TParticlesDoc2d, placement: TTransform2d, when: 'birth' | 'death', i: number, depth: number): void => {
    const { pool } = state;
    let x = pool.x[i]!;
    let y = pool.y[i]!;
    // Only the first effect may ride its emitter: below it, every particle is in the world already.
    if (!doc.worldSpace && depth === 0) {
        const cos = Math.cos(placement.rotation);
        const sin = Math.sin(placement.rotation);
        const sx = x * placement.scaleX;
        const sy = y * placement.scaleY;
        x = placement.x + sx * cos - sy * sin;
        y = placement.y + sx * sin + sy * cos;
    }
    const { rotation } = placement;
    for (const child of state.children) {
        const own = child.on === when ? particlesOf(child, 'particles-2d', state, depth) : null;
        if (own === null) {
            continue;
        }
        const childDoc = child.file.doc as TParticlesDoc2d;
        const atBirth = setsOff(own, 'birth');
        for (let k = 0; k < child.count; k++) {
            // Set again each time: what this one sets off in turn moves it.
            setOffAt2d.x = x;
            setOffAt2d.y = y;
            setOffAt2d.rotation = rotation;
            const slot = emitOne(own, childDoc, setOffAt2d, undefined, true);
            if (atBirth && slot >= 0) {
                setOff2d(own, childDoc, setOffAt2d, 'birth', slot, depth + 1);
            }
        }
    }
};

/**
 * The same in space. The child is set off turned the way its parent is, and not stretched: a spark
 * is the size its own file says, whatever box the rocket was in.
 */
const setOff3d = (state: TParticleState, doc: TParticlesDoc3d, matrix: Float32Array, when: 'birth' | 'death', i: number, depth: number): void => {
    const { pool } = state;
    const x = pool.x[i]!;
    const y = pool.y[i]!;
    const z = pool.z[i]!;
    const m = matrix;
    const world = doc.worldSpace || depth > 0
        ? { x, y, z }
        : {
            x: m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
            y: m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
            z: m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
        };
    for (let column = 0; column < 3; column++) {
        const at = column * 4;
        const length = Math.hypot(m[at]!, m[at + 1]!, m[at + 2]!);
        const unit = length > 0 ? 1 / length : 0;
        setOffAt3d[at] = m[at]! * unit;
        setOffAt3d[at + 1] = m[at + 1]! * unit;
        setOffAt3d[at + 2] = m[at + 2]! * unit;
        setOffAt3d[at + 3] = 0;
    }
    setOffAt3d[12] = world.x;
    setOffAt3d[13] = world.y;
    setOffAt3d[14] = world.z;
    setOffAt3d[15] = 1;
    for (const child of state.children) {
        const own = child.on === when ? particlesOf(child, 'particles-3d', state, depth) : null;
        if (own === null) {
            continue;
        }
        const childDoc = child.file.doc as TParticlesDoc3d;
        const atBirth = setsOff(own, 'birth');
        for (let k = 0; k < child.count; k++) {
            const slot = emitOne3d(own, childDoc, setOffAt3d, undefined, true);
            if (atBirth && slot >= 0) {
                // Its own copy: what this one sets off in turn writes over the shared one.
                const here = setOffAt3d.slice();
                setOff3d(own, childDoc, here, 'birth', slot, depth + 1);
                setOffAt3d.set(here);
            }
        }
    }
};

/**
 * Packs again what an effect set off, all the way down: a birth this frame may have set off a particle
 * several effects below this one, and each of those has packed itself already, before it was born.
 */
const packChildren2d = (state: TParticleState, tint: { r: number; g: number; b: number; a: number }, view: number): void => {
    for (const child of state.children) {
        if (child.state !== null) {
            packInstances(child.state, (child.file.doc as TParticlesDoc2d).trail, tint.r, tint.g, tint.b, tint.a, view, null);
            packChildren2d(child.state, tint, view);
        }
    }
};

/**
 * The same in space.
 */
const packChildren3d = (state: TParticleState, tint: { r: number; g: number; b: number; a: number }): void => {
    for (const child of state.children) {
        if (child.state !== null) {
            packInstances3d(child.state, (child.file.doc as TParticlesDoc3d).trail, tint.r, tint.g, tint.b, tint.a, null);
            packChildren3d(child.state, tint);
        }
    }
};

/**
 * Whether any child goes off `when`, so an effect with none pays for no callback.
 */
const setsOff = (state: TParticleState, when: 'birth' | 'death'): boolean =>
    state.children.some((child) => child.on === when);

/**
 * Step 3, which does not care about dimensions either: how many are born this frame, and when a
 * burst re-arms. `birth` puts one in, however its dimension does that.
 */
const emitDue = (
    state: TParticleState,
    doc: TParticlesDoc,
    delta: number,
    emitting: boolean,
    overrides: TParticleOverrides | undefined,
    birth: () => void,
): void => {
    // What the game asked for first, and it happens whether or not the emitter is running: firing a
    // one-shot by hand is not the same as turning a fountain on.
    for (let i = 0; i < state.pending; i++) {
        birth();
    }
    state.pending = 0;

    if (!emitting) {
        return;
    }
    const wasAtStart = state.cycleTime === 0;
    const cycleEnds = doc.emission.duration > 0;
    const running = !cycleEnds || state.cycleTime < doc.emission.duration;

    if (wasAtStart && doc.emission.burst > 0) {
        for (let i = 0; i < doc.emission.burst; i++) {
            birth();
        }
    }

    if (running && doc.emission.rate > 0) {
        // Only the part of this frame that falls inside the cycle counts, so the last frame of a
        // cycle emits its own fraction rather than a whole frame's worth.
        const inside = cycleEnds ? Math.min(delta, doc.emission.duration - state.cycleTime) : delta;
        state.carry += doc.emission.rate * (overrides?.rateScale ?? 1) * Math.max(0, inside);
        const whole = Math.floor(state.carry);
        state.carry -= whole;
        for (let i = 0; i < whole; i++) {
            birth();
        }
    }

    state.cycleTime += delta;
    if (cycleEnds && state.cycleTime >= doc.emission.duration) {
        // Exactly zero, not a remainder: that is what re-arms the burst for the next turn.
        state.cycleTime = doc.emission.loop ? 0 : doc.emission.duration;
    }
};

/**
 * Moves one emitter on by `delta` seconds and leaves it ready to draw.
 *
 * **A function of what it is given and nothing else**: no store, no card, no looking anything up.
 * That is what makes the whole of this testable without a browser, and it is the single best thing
 * about the version this replaces.
 *
 * **The order is load-bearing**, and it is:
 *
 * 1. age and kill, walking backwards so a death cannot skip the particle moved into its place
 * 2. move, and push back out whatever moved into something solid
 * 3. emit
 * 4. pack
 *
 * Ageing before moving means a particle's last frame is drawn at the end of its curve rather than
 * one frame past it. Emitting **after** both means one born this frame appears at the emitter rather
 * than already a frame's travel away from it, which is what makes a fast emitter look attached to
 * whatever is carrying it.
 *
 * @param state Everything this emitter owns beyond its record.
 * @param doc The effect it follows.
 * @param placement Where the emitter ended up this frame.
 * @param emitting Whether new ones should appear.
 * @param tint The colour and opacity this emitter lays over the effect's own.
 * @param view Which view it is drawn through: `0` is the screen, a camera is its index plus one.
 * @param overrides What this emitter disagrees with its file about.
 * @param colliders What is solid in its scene this frame, for an effect that collides.
 * @param depth How many effects deep this one is, `0` for one a scene holds. See `MAX_CHILD_DEPTH`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const simulateParticles = (
    state: TParticleState,
    doc: TParticlesDoc2d,
    delta: number,
    placement: TTransform2d,
    emitting: boolean,
    tint: { r: number; g: number; b: number; a: number },
    view: number,
    overrides?: TParticleOverrides,
    colliders: readonly TPlacedCollider2d[] = [],
    depth = 0,
): void => {
    const { pool } = state;

    // 0. The effects it sets off move first: one set off this frame is then not aged by a whole
    // frame the moment it is born. Each is born where it was set off, so each is simulated nowhere.
    for (const child of state.children) {
        const own = particlesOf(child, 'particles-2d', state, depth);
        if (own !== null) {
            simulateParticles(own, child.file.doc as TParticlesDoc2d, delta, NOWHERE_2D, false, tint, view, undefined, colliders, depth + 1);
        }
    }

    // 1. Age and kill.
    ageAndKill(state, delta, setsOff(state, 'death') ? (i) => setOff2d(state, doc, placement, 'death', i, depth) : null);

    // 2. Move. Semi-implicit Euler: the pull is applied to the speed and the new speed moves it.
    // The drag is held at zero rather than allowed to go negative, so a damping larger than one
    // over the frame time stops a particle instead of sending it backwards.
    const drag = Math.max(0, 1 - doc.damping * delta);
    for (let i = 0; i < pool.live; i++) {
        pool.vx[i]! = (pool.vx[i]! + doc.gravity.x * delta) * drag;
        pool.vy[i]! = (pool.vy[i]! + doc.gravity.y * delta) * drag;
        pool.x[i]! += pool.vx[i]! * delta;
        pool.y[i]! += pool.vy[i]! * delta;
        pool.rotation[i]! += pool.spin[i]! * delta;
    }
    // Only for particles that have a place in the world. A cloud riding its emitter has none of its
    // own, and the loader has said so; one set off by another effect is born in the world, and has.
    if (doc.collision !== null && (doc.worldSpace || depth > 0) && colliders.length > 0) {
        collide2d(pool, doc.collision, colliders);
    }
    // Where each one is now, for its tail.
    keepTails(state, delta);

    // 3. Emit.
    const atBirth = setsOff(state, 'birth');
    emitDue(state, doc, delta, emitting, overrides, () => {
        const slot = emitOne(state, doc, placement, overrides);
        if (atBirth && slot >= 0) {
            setOff2d(state, doc, placement, 'birth', slot, depth);
        }
    });

    // 4. Pack, and pack again what it set off this frame, so a spark born by a death this frame is
    // drawn this frame.
    packInstances(state, doc.trail, tint.r, tint.g, tint.b, tint.a, view, doc.worldSpace ? null : placement);
    // Only the first effect packs what is below it: it runs last, so it sees all they set off.
    if (depth === 0) {
        packChildren2d(state, tint, view);
    }
};

/**
 * Moves one emitter in three dimensions on by `delta` seconds and leaves it ready to draw.
 *
 * The same four steps in the same order as the flat one, and for the same reasons. The differences
 * are the third axis, and where the emitter is: a **matrix**, the one its box's composition leaves
 * for it, because in three dimensions a turn is not one number.
 *
 * There is no view to pass. A particle in depth is always seen through its scene's camera, and the
 * draw is told which one for the whole emitter at once.
 *
 * @param state Everything this emitter owns beyond its record.
 * @param doc The effect it follows.
 * @param matrix Where the emitter ended up this frame.
 * @param emitting Whether new ones should appear.
 * @param tint The colour and opacity this emitter lays over the effect's own.
 * @param overrides What this emitter disagrees with its file about.
 * @param colliders What is solid in its scene this frame, for an effect that collides.
 * @param depth How many effects deep this one is, `0` for one a scene holds. See `MAX_CHILD_DEPTH`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const simulateParticles3d = (
    state: TParticleState,
    doc: TParticlesDoc3d,
    delta: number,
    matrix: Float32Array,
    emitting: boolean,
    tint: { r: number; g: number; b: number; a: number },
    overrides?: TParticleOverrides,
    colliders: readonly TPlacedCollider3d[] = [],
    depth = 0,
): void => {
    const { pool } = state;

    for (const child of state.children) {
        const own = particlesOf(child, 'particles-3d', state, depth);
        if (own !== null) {
            simulateParticles3d(own, child.file.doc as TParticlesDoc3d, delta, NOWHERE_3D, false, tint, undefined, colliders, depth + 1);
        }
    }

    ageAndKill(state, delta, setsOff(state, 'death') ? (i) => setOff3d(state, doc, matrix, 'death', i, depth) : null);

    const drag = Math.max(0, 1 - doc.damping * delta);
    for (let i = 0; i < pool.live; i++) {
        pool.vx[i]! = (pool.vx[i]! + doc.gravity.x * delta) * drag;
        pool.vy[i]! = (pool.vy[i]! + doc.gravity.y * delta) * drag;
        pool.vz[i]! = (pool.vz[i]! + doc.gravity.z * delta) * drag;
        pool.x[i]! += pool.vx[i]! * delta;
        pool.y[i]! += pool.vy[i]! * delta;
        pool.z[i]! += pool.vz[i]! * delta;
        pool.rotation[i]! += pool.spin[i]! * delta;
    }
    if (doc.collision !== null && (doc.worldSpace || depth > 0) && colliders.length > 0) {
        collide3d(pool, doc.collision, colliders);
    }
    keepTails(state, delta);

    const atBirth = setsOff(state, 'birth');
    emitDue(state, doc, delta, emitting, overrides, () => {
        const slot = emitOne3d(state, doc, matrix, overrides);
        if (atBirth && slot >= 0) {
            setOff3d(state, doc, matrix, 'birth', slot, depth);
        }
    });

    packInstances3d(state, doc.trail, tint.r, tint.g, tint.b, tint.a, doc.worldSpace ? null : matrix);
    if (depth === 0) {
        packChildren3d(state, tint);
    }
};
