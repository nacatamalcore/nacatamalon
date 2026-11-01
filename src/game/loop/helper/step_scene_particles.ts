import { MAX_VIEWS } from '../../../render/webgpu/sprite/write_sprite_instance';
import { openParticleState, particleStateOf } from '../../../gameobjects/particles/particle_state';
import { simulateParticles, simulateParticles3d } from '../../../gameobjects/particles/simulate_particles';
import { worldOf } from '../../../render/shared/world_of';
import { computeModelMatrix } from '../../../render/shared/compute_mvp_3d';
import * as mat from '../../../math/mat4';
import { PARTICLE_FLOATS, PARTICLE_OFFSET } from '../../../render/shared/particle_instance';
import { waitsForSheet } from '../../../gameobjects/particles/particle_run';
import { backFromTie, onPixels, unturned } from '../../../camera/camera_as_drawn';
import type { TParticlesFile } from '../../../loaders/particles/types/t_particles_file';
import type { TDrawTexture } from '../../../render/interface/draw/t_draw_texture';
import type { TDrawable } from '../../../gameobjects/types';
import type { TDrawParticles, TDrawParticles3d } from '../../../render/interface';
import type { TParticles } from '../../../gameobjects/particles/types/t_particles';
import type { TParticles3d } from '../../../gameobjects/particles/types/t_particles_3d';
import type { TSceneColliders } from '../../../gameobjects/particles/collide';
import type { TChildParticles, TParticleState } from '../../../gameobjects/particles/types/t_particle_pool';

/**
 * Each emitter's stand-in, reused from one frame to the next, so a burning torch allocates nothing.
 *
 * The same trick a text's letters use, and for the same reason: something has to stand in front of
 * a record that cannot hold what the card wants, and making a new one every frame would be rubbish
 * to collect sixty times a second.
 */
const stand = new WeakMap<
    TParticles | TParticles3d,
    { -readonly [K in keyof (TDrawParticles | TDrawParticles3d)]: (TDrawParticles | TDrawParticles3d)[K] }
>();

/**
 * A child effect's stand-in, kept like an emitter's.
 */
const childStand = new WeakMap<TChildParticles, { -readonly [K in keyof TDrawParticles]: TDrawParticles[K] }>();

/**
 * The picture a file's particles show: its sheet's when it has one, otherwise its own.
 */
const pictureOf = (file: TParticlesFile): TDrawTexture | null => file.atlas?.texture ?? file.texture;

/**
 * What stands in for the effects an emitter's particles set off, however deep, each drawn after its
 * parent. Only those whose particles exist yet: one whose file is still on its way draws nothing.
 */
const childrenDrawn = (
    state: TParticleState,
    type: 'particles' | 'particles-3d',
    smooth: boolean | undefined,
): TDrawParticles[] | undefined => {
    if (state.children.length === 0) {
        return undefined;
    }
    const out: TDrawParticles[] = [];
    for (const child of state.children) {
        if (child.state === null || child.file.doc === null) {
            continue;
        }
        let drawn = childStand.get(child);
        if (drawn === undefined) {
            drawn = { type: 'particles', instances: EMPTY, count: 0, texture: null, blend: 'alpha' };
            childStand.set(child, drawn);
        }
        (drawn as { type: string }).type = type;
        drawn.instances = child.state.instances;
        // Simulated all along, and drawn once its sheet is here, as a sprite on a sheet on its way is not.
        drawn.count = waitsForSheet(child.file) ? 0 : child.state.instanceCount;
        drawn.texture = pictureOf(child.file);
        drawn.blend = child.file.doc.blend;
        drawn.smooth = smooth;
        drawn.children = childrenDrawn(child.state, type, smooth);
        out.push(drawn);
    }
    return out;
};

/**
 * Where an emitter in depth is when nothing above it has a placement: its own, built here. Scratch,
 * because it is read inside this frame's step and never kept.
 */
const ownMatrix = mat.create();

/**
 * A scene with nothing solid in it.
 */
const NOTHING_SOLID: TSceneColliders = { flat: [], deep: [] };

/**
 * Stands in for an emitter whose file has not landed: nothing to draw, and nothing to read.
 */
const EMPTY = new Float32Array(0);

/**
 * The pixels a pass puts flat particles on: how many of them a unit of the world takes for those seen
 * through the scene's camera (`pixelsPerUnit`, `0` under `pixelSnap: 'off'`), and which camera that
 * is in the pass. Pinned ones are drawn at zoom 1, as a pinned sprite is.
 *
 * @internal
 * @since 1.0.0
 */
export type TParticlePixels = { perUnit: number; camera: number };

/**
 * Nothing put on pixels: what a pass is that does not say.
 */
const NO_PIXELS: TParticlePixels = { perUnit: 0, camera: -1 };

/**
 * The grid the particles of the drawable at `i` go on.
 */
const perUnitAt = (pixels: TParticlePixels, cameraIndex: number[], i: number): number => {
    if (pixels.perUnit === 0) {
        return 0;
    }
    return pixels.camera >= 0 && cameraIndex[i] === pixels.camera ? pixels.perUnit : 1;
};

/**
 * The simulation's own numbers behind each stand-in, before they were put on pixels: what a second
 * look starts from, so a view with another zoom puts them on its own grid and not on the screen's.
 */
const rawOf = new WeakMap<object, Float32Array>();

/**
 * The numbers each stand-in draws once put on pixels, kept between frames so nothing is made frame
 * after frame.
 */
const onPixelsOf = new WeakMap<object, Float32Array>();

/**
 * Copies `count` particles from `from` into `into`, put on the grid of `perUnit` by the rule a sprite
 * follows: its size made whole pixels, its middle on a pixel, and, unturned, held back half a pixel
 * when that leaves its edges between two, so its edges land on the grid and never on a pixel's
 * middle, where each graphics card would cover that row or not by its own rounding. A turned one has
 * its edges on no grid, and only its middle is put on one.
 */
const putOnPixels = (from: Float32Array, into: Float32Array, count: number, perUnit: number): void => {
    for (let at = 0; at < count * PARTICLE_FLOATS; at += PARTICLE_FLOATS) {
        for (let k = 0; k < PARTICLE_FLOATS; k++) {
            into[at + k] = from[at + k]!;
        }
        // Rounded and not held at one at least: a particle shrinking away goes, as it does unsnapped.
        const size = Math.round(from[at + PARTICLE_OFFSET.size]! * perUnit) / perUnit;
        let x = onPixels(from[at + PARTICLE_OFFSET.x]!, perUnit);
        let y = onPixels(from[at + PARTICLE_OFFSET.y]!, perUnit);
        if (unturned(from[at + PARTICLE_OFFSET.rotation]!)) {
            x -= backFromTie(x - size / 2, perUnit);
            y -= backFromTie(y - size / 2, perUnit);
        }
        into[at + PARTICLE_OFFSET.size] = size;
        into[at + PARTICLE_OFFSET.x] = x;
        into[at + PARTICLE_OFFSET.y] = y;
    }
};

/**
 * Puts a flat cloud the screen draws, and the effects it set off, on pixels: into a copy of its own,
 * so the simulation's numbers stay as they were for whoever looks again.
 */
const drawnOnPixels = (drawn: TDrawParticles, perUnit: number): void => {
    rawOf.set(drawn, drawn.instances);
    if (perUnit > 0 && drawn.count > 0) {
        const needed = drawn.count * PARTICLE_FLOATS;
        let into = onPixelsOf.get(drawn);
        if (into === undefined || into.length < needed) {
            into = new Float32Array(Math.max(needed, drawn.instances.length));
            onPixelsOf.set(drawn, into);
        }
        putOnPixels(drawn.instances, into, drawn.count, perUnit);
        (drawn as { instances: Float32Array }).instances = into;
    }
    for (const child of drawn.children ?? []) {
        drawnOnPixels(child, perUnit);
    }
};

/**
 * Moves every emitter in this stretch of the list on by `delta`, and leaves it ready to draw.
 *
 * Here, rather than among the ordinary updates, for one reason: a particle is born **where the
 * emitter ended up**, and that is only known once the tree has been walked and every placement
 * composed. Simulating before that would read where the emitter was last frame, so a cloud trailing
 * a fast-moving thing would lag a frame behind it and nothing would say why.
 *
 * A scene that is paused passes `0`, so it freezes and keeps drawing exactly what it last drew.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepSceneParticles = (
    drawables: TDrawable[],
    cameraIndex: number[],
    start: number,
    delta: number,
    colliders: TSceneColliders = NOTHING_SOLID,
    pixels: TParticlePixels = NO_PIXELS,
): void => {
    for (let i = start; i < drawables.length; i++) {
        const emitter = drawables[i];
        if (emitter.type !== 'particles' && emitter.type !== 'particles-3d') {
            continue;
        }

        // The stand-in is put in place FIRST and on every path, before anything can go wrong or
        // return early. An emitter and its stand-in both answer to the same `type`, so one left
        // in the list would reach a backend pretending to be the other, and a record has none of
        // the fields drawing reads. That was a real crash, and this ordering is what makes it
        // impossible rather than merely unlikely.
        let drawn = stand.get(emitter);
        if (drawn === undefined) {
            drawn = { type: emitter.type, instances: EMPTY, count: 0, texture: null, blend: 'alpha' };
            stand.set(emitter, drawn);
        }
        drawn.count = 0;
        (drawn as { children?: unknown }).children = undefined;
        drawables[i] = drawn as unknown as TDrawable;

        // Its file may have landed since the last frame, which is the moment there is finally a
        // number to size its particles by.
        const state = particleStateOf(emitter) ?? openParticleState(emitter);
        const doc = emitter.file.doc;
        if (state === null || doc === null) {
            continue;
        }

        const tint = { r: emitter.tint.r, g: emitter.tint.g, b: emitter.tint.b, a: emitter.tint.a * emitter.alpha };
        const step = emitter.paused ? 0 : delta;

        if (emitter.type === 'particles-3d') {
            // `openParticleState` has already refused a flat file for this one.
            if (doc.kind !== 'particles-3d') {
                continue;
            }
            const matrix = emitter.worldMatrix ?? computeModelMatrix(emitter.transform, ownMatrix);
            simulateParticles3d(state, doc, step, matrix, emitter.emitting, tint, emitter.overrides, colliders.deep);
        } else {
            if (doc.kind !== 'particles-2d') {
                continue;
            }
            // Slot 0 of the views is the screen, so camera `c` is in slot `c + 1`: the rule the
            // sprites follow, because they are looked at through the same table.
            const camera = cameraIndex[i] ?? -1;
            const view = camera >= 0 && camera < MAX_VIEWS - 1 ? camera + 1 : 0;
            simulateParticles(state, doc, step, worldOf(emitter), emitter.emitting, tint, view, emitter.overrides, colliders.flat);
        }

        // Now it has something to say.
        drawn.instances = state.instances;
        drawn.count = emitter.visible === false || waitsForSheet(emitter.file) ? 0 : state.instanceCount;
        drawn.texture = pictureOf(emitter.file);
        drawn.blend = doc.blend;
        drawn.smooth = emitter.smooth;
        (drawn as { children?: unknown }).children = emitter.visible === false ? undefined : childrenDrawn(state, emitter.type, emitter.smooth);
        // Flat ones on the pixels the sprites around them are on; a cloud in depth is not on any.
        if (emitter.type === 'particles') {
            drawnOnPixels(drawn as TDrawParticles, perUnitAt(pixels, cameraIndex, i));
        }
    }
};

/**
 * A flat cloud and the effects it set off, copied with `view` written into every particle, and put
 * on this look's pixels from the simulation's own numbers: never from the screen's, which are on the
 * screen's grid, and never into them.
 */
const seenThrough = (drawn: TDrawParticles, view: number, perUnit: number): TDrawParticles => {
    const raw = rawOf.get(drawn) ?? drawn.instances;
    const instances = raw.slice(0, drawn.count * PARTICLE_FLOATS);
    if (perUnit > 0) {
        putOnPixels(instances, instances, drawn.count, perUnit);
    }
    for (let at = 0; at < instances.length; at += PARTICLE_FLOATS) {
        instances[at + PARTICLE_OFFSET.view] = view;
    }
    return { ...drawn, instances, children: drawn.children?.map((child) => seenThrough(child, view, perUnit)) };
};

/**
 * The same emitters seen once more in the same frame, by a capture or a preview: nothing is moved,
 * and what the screen's pass stepped a moment ago is shown.
 *
 * **Not stepped again, even by nothing.** A flat particle carries the camera it is seen through
 * inside its own numbers, and those numbers are shared with the screen's pass. Stepping them for a
 * second look would write the second look's camera into them, and the screen would draw its
 * particles through a camera it is not using, for as long as a preview stays open. So a flat cloud
 * gets a copy of its numbers with its own camera written in, and the screen's are left as they
 * were. One small copy per emitter, paid only while something looks again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lookAgainAtParticles = (drawables: TDrawable[], cameraIndex: number[], start: number, pixels: TParticlePixels = NO_PIXELS): void => {
    for (let i = start; i < drawables.length; i++) {
        const emitter = drawables[i];
        if (emitter.type !== 'particles' && emitter.type !== 'particles-3d') {
            continue;
        }
        const drawn = stand.get(emitter);
        if (drawn === undefined) {
            // Never stepped by the screen: nothing to show yet, and nothing of the record may reach
            // a backend (see `stepSceneParticles`).
            drawables[i] = { type: emitter.type, instances: EMPTY, count: 0, texture: null, blend: 'alpha' } as unknown as TDrawable;
            continue;
        }
        if (emitter.type === 'particles-3d') {
            drawables[i] = drawn as unknown as TDrawable;
            continue;
        }

        const camera = cameraIndex[i] ?? -1;
        const view = camera >= 0 && camera < MAX_VIEWS - 1 ? camera + 1 : 0;
        drawables[i] = seenThrough(drawn as TDrawParticles, view, perUnitAt(pixels, cameraIndex, i)) as unknown as TDrawable;
    }
};
