import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createParticles } from '../src/gameobjects/particles';
import { createScene } from '../src/scene/create_scene';
import { destroy, flushDestroyed } from '../src/destroy';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { releaseAsset, whenLoaded } from '../src/loaders';
import { wearersOf } from '../src/loaders/worn_pictures';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGlb, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfModel } from '../src/loaders';
import type { TParticles } from '../src/gameobjects/particles';
import type { TParticlesEffect2d } from '../src/loaders/particles';

/**
 * The picture of an effect written in code, shared with a model that wears the same file. The effect
 * is in no cache, so it has to say it is using the picture, and only while something draws it.
 */

const EFFECT: TParticlesEffect2d = { kind: 'particles-2d', max: 8, life: 5, emission: { rate: 0, burst: 4 }, texture: 'spark.png' };

afterEach(() => { mock.restore(); });

const withBoth = async () => {
    const served = serveGltf({
        'crate.glb': asGlb({ nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ image: 'spark.png' }] }),
        'spark.png': 'png',
    });
    const { store } = createTestGame();
    let crate!: TGltfModel;
    let emitter!: TParticles;
    startTestScene(store, 'Shop', () => {
        crate = useLoadGltf({ src: 'crate.glb' });
        emitter = createParticles({ effect: { ...EFFECT } });
        return createScene();
    });
    await whenLoaded(crate);
    const texture = emitter.file.texture!;
    expect(crate.parts[0]!.texture).toBe(texture);
    return { store, crate, emitter, texture, restore: served.restore };
};

describe('a picture an effect written in code shares with a model', () => {
    it('stays for the effect when the model is let go of', async () => {
        const { store, crate, texture, restore } = await withBoth();
        releaseAsset(store, crate);

        expect(texture.status).toBe('ready');
        expect(texture.gpu).not.toBeNull();
        restore();
    });

    it('goes with the model when the effect has no emitter left', async () => {
        const { store, crate, emitter, texture, restore } = await withBoth();
        destroy(emitter);
        flushDestroyed(store);
        releaseAsset(store, crate);

        expect(texture.status).toBe('released');
        expect(texture.gpu).toBeNull();
        restore();
    });

    it('does not keep hold of an effect that nothing draws any more', async () => {
        const { store, emitter, texture, restore } = await withBoth();
        expect(wearersOf(texture)).toContain(emitter.file);
        destroy(emitter);
        flushDestroyed(store);

        expect(wearersOf(texture)).not.toContain(emitter.file);
        restore();
    });

    it('is held again when the effect is drawn again, while it was never let go of', async () => {
        const { store, crate, emitter, texture, restore } = await withBoth();
        const effect = emitter.file;
        destroy(emitter);
        flushDestroyed(store);
        startTestScene(store, 'Again', () => {
            createParticles({ effect });
            return createScene();
        });
        expect(effect.bound.length).toBe(1);
        expect(wearersOf(texture)).toContain(effect);

        releaseAsset(store, crate);
        expect(texture.status).toBe('ready');
        restore();
    });

    it('is asked for afresh by an effect used again after it went', async () => {
        const served = serveGltf({
            'crate.glb': asGlb({ nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ image: 'spark.png' }] }),
            'spark.png': 'png',
        });
        const { store } = createTestGame();
        const effect = { ...EFFECT };
        let crate!: TGltfModel;
        let first!: TParticles;
        startTestScene(store, 'Shop', () => {
            crate = useLoadGltf({ src: 'crate.glb' });
            first = createParticles({ effect });
            return createScene();
        });
        await whenLoaded(crate);
        const gone = first.file.texture!;
        destroy(first);
        flushDestroyed(store);
        releaseAsset(store, crate);
        expect(gone.status).toBe('released');

        let again!: TParticles;
        startTestScene(store, 'Again', () => {
            again = createParticles({ effect });
            return createScene();
        });

        expect(again.file).toBe(first.file);
        expect(again.file.texture).not.toBe(gone);
        expect(again.file.texture!.status).not.toBe('released');
        served.restore();
    });
});
