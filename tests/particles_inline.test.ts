import { describe, expect, it, spyOn } from 'bun:test';
import { createParticles, createParticles3d, particleCount } from '../src/gameobjects/particles';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createPixels } from '../src/pixels';
import { createScene } from '../src/scene/create_scene';
import { serializeScene } from '../src/scene/document';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { getColor, lerpColor } from '../src/color';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TParticles, TParticles3d } from '../src/gameobjects/particles';
import type { TParticlesEffect2d } from '../src/loaders/particles';
import type { TTexture } from '../src/loaders';

/**
 * An effect written in code instead of a `.particles` file: the same fields, ready at once, and
 * shared when the same object is handed over twice.
 */

const BURST: TParticlesEffect2d = {
    kind: 'particles2d',
    max: 30,
    life: 5,
    emission: { rate: 0, burst: 12, loop: false },
};

const running = (body: () => void) => {
    const { store } = createTestGame();
    const root = startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    const ctx = createFrameContext();
    const frame = () => fillFrameContext(store, ctx, 1 / 60);
    return { store, root, frame };
};

describe('an effect written in code', () => {
    it('is ready at once and emits on the first frame, with nothing to download', () => {
        let emitter!: TParticles;
        const { frame } = running(() => {
            emitter = createParticles({ effect: BURST });
        });

        expect(emitter.file.status).toBe('ready');
        frame();
        expect(particleCount(emitter)).toBe(12);
    });

    it('fills in what it leaves out, exactly as a file would', () => {
        let emitter!: TParticles;
        running(() => {
            emitter = createParticles({ effect: { kind: 'particles2d', speed: 50 } });
        });

        const doc = emitter.file.doc!;
        expect(doc.kind).toBe('particles2d');
        expect(doc.speed).toEqual([50, 50]);
        expect(doc.max).toBe(100);
        expect(doc.texture).toBeNull();
    });

    it('takes a colour already worked out, which is how it follows the game', () => {
        const dusk = getColor('#ff8800');
        const night = getColor('#000044');
        let emitter!: TParticles;
        running(() => {
            emitter = createParticles({
                effect: { kind: 'particles2d', colorOverLife: [{ t: 0, color: lerpColor(dusk, night, 0.5) }, { t: 1, color: '#ffffff', alpha: 0 }] },
            });
        });

        expect(emitter.file.doc!.colorOverLife[0]!.color).toEqual(lerpColor(dusk, night, 0.5));
        expect(emitter.file.doc!.colorOverLife[0]!.alpha).toBe(1);
        expect(emitter.file.doc!.colorOverLife[1]!.alpha).toBe(0);
    });

    it('is one effect for every emitter handed the same object, and another for a new one', () => {
        const emitters: TParticles[] = [];
        running(() => {
            emitters.push(createParticles({ effect: BURST }));
            emitters.push(createParticles({ effect: BURST }));
            emitters.push(createParticles({ effect: { ...BURST } }));
        });

        expect(emitters[0]!.file).toBe(emitters[1]!.file);
        expect(emitters[2]!.file).not.toBe(emitters[0]!.file);
        // Each still runs on its own clock and its own particles.
        expect(emitters[0]).not.toBe(emitters[1]);
    });

    it('shows a picture painted in code', () => {
        let texture!: TTexture;
        let emitter!: TParticles;
        running(() => {
            texture = createPixelTexture(createPixels(4, 4, getColor('#ffffff')));
            emitter = createParticles({ effect: { ...BURST, texture } });
        });

        expect(emitter.file.texture).toBe(texture);
        expect(emitter.file.doc!.texture).toBeNull();
    });

    it('works in three dimensions, and refuses the wrong dimension on the line that asked', () => {
        let deep!: TParticles3d;
        running(() => {
            deep = createParticles3d({ effect: { kind: 'particles3d', direction: { x: 0, y: 1, z: 0 } } });
        });
        expect(deep.file.doc!.kind).toBe('particles3d');

        expect(() => running(() => {
            createParticles3d({ effect: BURST });
        })).toThrow('particles2d');
    });

    it('says what is wrong with it at once, like a file that will not read', () => {
        expect(() => running(() => {
            createParticles({ effect: { kind: 'particles2d', life: 0 } });
        })).toThrow('[NacatamalOn] particles "(effect in code)"');
    });

    it('is left out of a saved scene, since there is no file to name', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { root } = running(() => {
            createParticles({ effect: BURST, name: 'dust' });
        });

        expect(serializeScene(root).root.components).toEqual([]);
        expect(warn.mock.calls.some(([message]) => String(message).includes('"dust"'))).toBe(true);
        warn.mockRestore();
    });
});
