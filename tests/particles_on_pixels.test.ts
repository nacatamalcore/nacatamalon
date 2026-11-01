import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createParticles } from '../src/gameobjects/particles';
import { particleStateOf } from '../src/gameobjects/particles/particle_state';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { PARTICLE_OFFSET } from '../src/render/shared/particle_instance';
import { createTestGame, startTestScene } from './helpers/test_game';
import { SPRITE_SHADER_HEAD } from '../src/render/webgpu/sprite/sprite_shader';
import { SPRITE_FRAGMENT_HEAD_GLSL } from '../src/render/webgl2/sprite/sprite_shader';
import { PARTICLES_SHADER } from '../src/render/webgpu/particles/particles_shader';
import { PARTICLES_3D_SHADER } from '../src/render/webgpu/particles/particles_3d_shader';
import { PARTICLES_FRAGMENT_SHADER } from '../src/render/webgl2/particles/particles_shader';
import { OFF_THE_SEAM_GLSL, OFF_THE_SEAM_WGSL } from '../src/render/shared/texel_seam';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TDrawParticles } from '../src/render/interface';
import type { TParticles } from '../src/gameobjects/particles/types/t_particles';
import type { TParticlesEffect2d } from '../src/loaders/particles';
import type { TTexture } from '../src/loaders';
import type { TPixelSnap } from '../src/game/types/t_game_options';

/**
 * Flat particles on the pixels the sprites are on: under `pixelSnap`, each one's size is whole pixels
 * and, unturned, its edges land between two pixels, never on one's middle, where each graphics card
 * would cover that row by its own rounding. Through each pass's own camera, into each pass's own
 * numbers, and nothing at all under `'off'`.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/** One particle that stays where it is born, `size` across, turning at `spin`. */
const still = (size: number, spin = 0): TParticlesEffect2d => ({ kind: 'particles-2d', max: 4, life: 100, speed: 0, size, spin, emission: { rate: 0, burst: 1, loop: false } });

const frames = (store: Parameters<typeof fillFrameContext>[0], count: number): TFrameContext => {
    let ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    for (let i = 0; i < count; i++) {
        ctx = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 1 / 60);
    }
    return ctx;
};

const screenOf = (ctx: TFrameContext): TRenderPass => ctx.passes[ctx.passes.length - 1]!;
const cloudIn = (pass: TRenderPass): TDrawParticles => (pass.drawables ?? []).find((item) => item.type === 'particles') as unknown as TDrawParticles;

/** The first particle a cloud draws: where, how big, how turned. */
const first = (instances: Float32Array) => ({
    x: instances[PARTICLE_OFFSET.x]!,
    y: instances[PARTICLE_OFFSET.y]!,
    size: instances[PARTICLE_OFFSET.size]!,
    rotation: instances[PARTICLE_OFFSET.rotation]!,
});

/** Whether `value`, counted in pixels of `perUnit`, is a whole number of them. */
const whole = (value: number, perUnit: number): boolean => Math.abs(value * perUnit - Math.round(value * perUnit)) < 1e-3;

/** A scene with one emitter at a place between pixels, and its camera. */
const scene = (effect: TParticlesEffect2d, snap: TPixelSnap, camera: { zoom?: number; rotation?: number } = {}) => {
    const { store } = createTestGame({ pixelSnap: snap } as never);
    let emitter!: TParticles;
    startTestScene(store, 'Level', () => {
        const own = useCamera2d({ zoom: camera.zoom ?? 1 });
        own.transform.rotation = camera.rotation ?? 0;
        emitter = createParticles({ effect, transform: { x: 10.3, y: 20.7 } });
        return createScene();
    });
    return { store, emitter };
};

describe('flat particles under pixelSnap', () => {
    it('are whole pixels across, with their edges between pixels, whether even, odd or neither', () => {
        for (const size of [4, 5, 4.6]) {
            const { store } = scene(still(size), 'screen');
            const drawn = first(cloudIn(screenOf(frames(store, 2))).instances);

            expect(whole(drawn.size, 1)).toBe(true);
            expect(drawn.size).toBe(Math.round(size));
            expect(whole(drawn.x - drawn.size / 2, 1)).toBe(true);
            expect(whole(drawn.y - drawn.size / 2, 1)).toBe(true);
        }
    });

    it('are on the pixels of the camera\'s zoom', () => {
        const { store } = scene(still(5), 'screen', { zoom: 2 });
        const drawn = first(cloudIn(screenOf(frames(store, 2))).instances);

        expect(whole(drawn.size, 2)).toBe(true);
        expect(whole(drawn.x - drawn.size / 2, 2)).toBe(true);
        expect(whole(drawn.y - drawn.size / 2, 2)).toBe(true);
    });

    it('turned, have only their middle put on a pixel, and a turned camera changes nothing of that', () => {
        const turning = scene(still(5, 3), 'screen');
        const spun = first(cloudIn(screenOf(frames(turning.store, 10))).instances);
        expect(spun.rotation).not.toBe(0);
        expect(whole(spun.x, 1)).toBe(true);
        expect(whole(spun.y, 1)).toBe(true);
        expect(spun.size).toBe(5);

        const tilted = scene(still(5), 'screen', { rotation: 0.3 });
        const drawn = first(cloudIn(screenOf(frames(tilted.store, 2))).instances);
        expect(whole(drawn.x - drawn.size / 2, 1)).toBe(true);
        expect(whole(drawn.y - drawn.size / 2, 1)).toBe(true);
    });

    it('are left as they are under \'off\', and the simulation\'s own numbers are never touched', () => {
        const off = scene(still(4.6), 'off');
        const drawn = cloudIn(screenOf(frames(off.store, 2)));
        expect(drawn.instances).toBe(particleStateOf(off.emitter)!.instances);
        expect(first(drawn.instances).x).toBeCloseTo(10.3, 4);

        const on = scene(still(4.6), 'screen');
        frames(on.store, 2);
        expect(first(particleStateOf(on.emitter)!.instances)).toMatchObject({ size: expect.closeTo(4.6, 4), x: expect.closeTo(10.3, 4), y: expect.closeTo(20.7, 4) });
    });

    it('are put on each view\'s own pixels, without one look writing over another\'s or the screen\'s', () => {
        const { store } = createTestGame({ pixelSnap: 'screen' } as never);
        let emitter!: TParticles;
        let near!: TTexture;
        let far!: TTexture;
        startTestScene(store, 'Level', () => {
            useCamera2d();
            emitter = createParticles({ effect: still(5), transform: { x: 10.3, y: 20.7 } });
            near = createSpriteTexture({ width: 64, height: 64, sees: 'world' }, () => {
                useCamera2d({ zoom: 2 });
            });
            far = createSpriteTexture({ width: 64, height: 64, sees: 'world' }, () => {
                useCamera2d({ zoom: 0.5 });
            });
            return createScene();
        });
        const ctx = frames(store, 2);
        const passOf = (texture: TTexture) => ctx.passes.find((pass) => pass.renderTarget === texture.gpu)!;
        const looks = [
            { cloud: cloudIn(screenOf(ctx)), perUnit: 1 },
            { cloud: cloudIn(passOf(near)), perUnit: 2 },
            { cloud: cloudIn(passOf(far)), perUnit: 0.5 },
        ];

        // Three sets of numbers, none of them the simulation's.
        const buffers = new Set([...looks.map((look) => look.cloud.instances), particleStateOf(emitter)!.instances]);
        expect(buffers.size).toBe(4);
        // Each on its own grid, read after all three were filled in: the last look wrote over none.
        for (const { cloud, perUnit } of looks) {
            const drawn = first(cloud.instances);
            expect(whole(drawn.size, perUnit)).toBe(true);
            expect(whole(drawn.x - drawn.size / 2, perUnit)).toBe(true);
            expect(whole(drawn.y - drawn.size / 2, perUnit)).toBe(true);
        }
        expect(first(looks[0]!.cloud.instances).size).toBe(5);
        expect(first(looks[1]!.cloud.instances).size).toBe(5);
        expect(first(looks[2]!.cloud.instances).size).toBe(6);
        // From the simulation's 10.3, not from the screen's 9.5: on the half pixels of zoom 2 it is
        // 10.5, where the screen's would have stayed 9.5.
        expect(first(looks[0]!.cloud.instances).x).toBe(9.5);
        expect(first(looks[1]!.cloud.instances).x).toBe(10.5);
        expect(first(particleStateOf(emitter)!.instances).x).toBeCloseTo(10.3, 4);
    });
});

describe('a read on the seam between two texels', () => {
    // Each card works out the read at a pixel by its own rounding, so one landing on a seam took one
    // texel in WebGPU and the one before in WebGL2: a minimap's tiny sprite a row of its picture apart.
    // What it does on the card is checked in Chrome by nacative's parity/texel_seams.ts.
    it('is moved just past it, in every shader that reads a window, and only when it is on one', () => {
        for (const shader of [SPRITE_SHADER_HEAD, PARTICLES_SHADER, PARTICLES_3D_SHADER]) {
            expect(shader).toContain(OFF_THE_SEAM_WGSL);
            expect(shader).toContain('offTheSeam(');
        }
        for (const shader of [SPRITE_FRAGMENT_HEAD_GLSL, PARTICLES_FRAGMENT_SHADER]) {
            expect(shader).toContain(OFF_THE_SEAM_GLSL);
            expect(shader).toContain('offTheSeam(');
        }
        // Only on a seam: the read is left as it is unless it is within SEAM of one.
        expect(OFF_THE_SEAM_WGSL).toContain('select(read, seam + SEAM, abs(read - seam) < vec2f(SEAM))');
        expect(OFF_THE_SEAM_GLSL).toContain('mix(read, seam + SEAM, lessThan(abs(read - seam), vec2(SEAM)))');
    });
});
