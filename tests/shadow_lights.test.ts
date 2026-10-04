import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { collectLighting } from '../src/game/loop/helper/collect_lights';
import { createScene } from '../src/scene/create_scene';
import { lightSpaceMatrix, reportCastersOutside, resetShadowWarnings } from '../src/render/shared/light_space';
import { useLight } from '../src/hooks/light/use_light';
import { usePointLight } from '../src/hooks/light/use_point_light';
import { useAmbientLight } from '../src/hooks/light/use_ambient_light';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSpotLight } from '../src/hooks/light/use_spot_light';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawCamera3d, TDrawLight, TDrawMesh } from '../src/render/interface';

/**
 * The two ways this feature goes wrong without anything appearing to go wrong.
 *
 * Both are the same shape of problem: the frame draws, nothing throws, the console is clean, and a
 * shadow that should be there is not. There is nothing on screen that tells either of them apart
 * from a scene where nothing happens to stand in the light's way, which is why each one costs a
 * sentence rather than being left for somebody to find by moving a cube around.
 */

const at = (fields: Record<string, number> = {}) => ({
    x: 0, y: 0, z: 0, rotation: 0, rotationX: -0.9, rotationY: 0.4, scaleX: 1, scaleY: 1, scaleZ: 1, ...fields,
});

const sun = (fields: Partial<TDrawLight> = {}): TDrawLight => ({
    type: 'directional',
    color: { r: 1, g: 1, b: 1, a: 1 },
    intensity: 1,
    castShadow: true,
    transform: at(),
    ...fields,
});

const camera: TDrawCamera3d = {
    projection: 'perspective',
    transform: at({ rotationX: 0, rotationY: 0, y: 2, z: 6 }),
    fov: 55, near: 0.1, far: 100, zoom: 1,
};

const caster = (x: number, y = 0, z = 0): TDrawMesh => ({
    type: 'mesh',
    geometry: null,
    transform: at({ x, y, z, rotationX: 0, rotationY: 0 }),
    material: {} as TDrawMesh['material'],
    skeleton: null,
});

describe('a second light that asks to cast', () => {
    afterEach(() => { mock.restore(); });

    it('is told it will not, once, instead of being dropped in silence', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();

        const root = startTestScene(store, 'Level', () => {
            useLight({ castShadow: true });
            useSpawn(() => { useLight({ castShadow: true }); })();
            return createScene();
        });
        collectLighting(root);

        const said = warn.mock.calls.map((call) => String(call[0])).join('\n');
        // There is one map, so there is one point of view to spend. Core keeps the first one too
        // and says nothing, which leaves somebody turning a flag on and off on a light that was
        // never going to be the one.
        expect(said).toContain('cast shadows');
        expect(said).toContain('The first is used');
    });

    it('says nothing at all when only one asked, which is every ordinary scene', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();

        const root = startTestScene(store, 'Level', () => {
            useLight({ castShadow: true });
            useSpawn(() => { usePointLight({ range: 5 }); })();
            return createScene();
        });
        collectLighting(root);

        expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain('cast shadows');
    });
});

describe('something that casts but falls outside the square', () => {
    // Said once for the life of a game, which is right there and wrong here: without this the first
    // case below would silence the two after it, and those would pass having checked nothing.
    beforeEach(() => { resetShadowWarnings(); });
    afterEach(() => { mock.restore(); });

    const matrixFor = (light: TDrawLight): Float32Array => lightSpaceMatrix(light, camera, new Float32Array(16));

    it('is named, and so is the number that fixes it', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const light = sun({ shadowArea: 12 });

        // Two hundred units away with a square twelve wide. It draws, it is lit, and it casts
        // nothing: the map simply has no room for it.
        reportCastersOutside([caster(200)], light, matrixFor(light));

        const said = String(warn.mock.calls[0]?.[0] ?? '');
        expect(said).toContain('shadowArea');
        // The number it is at now, because the fix is knowing which way to move it.
        expect(said).toContain('12');
    });

    it('says nothing when everything is inside, which must stay free', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const light = sun({ shadowArea: 40 });

        reportCastersOutside([caster(0), caster(3), caster(-4, 0, 2)], light, matrixFor(light));

        expect(warn).not.toHaveBeenCalled();
    });

    it('leaves a torch alone, because outside its cone is not out of range', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const torch = sun({ type: 'spot', range: 8, angle: 0.4, transform: at({ y: 4, rotationX: -Math.PI / 2 }) });

        reportCastersOutside([caster(500)], torch, matrixFor(torch));

        // Something outside a torch's cone is simply not lit by it, and the scene already shows
        // that. A sun is different: it lights everything and shadows only part of it.
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('what a light hook accepts', () => {
    /**
     * A guard that runs at build time rather than here.
     *
     * Each hook's options and its constructor's are written out twice, by hand, in two files, and
     * nothing holds the two together: `useLight` went a whole slice without `shadowArea`, which
     * typechecked perfectly because nothing ever called it with one. The sandbox did, and the
     * sandbox's examples are strings that no compiler ever reads.
     *
     * So the guard is a call. Narrow any of these and `tsc` fails on this file, which is the only
     * place that difference can be seen from.
     */
    it('is everything its constructor accepts, checked by this file compiling at all', () => {
        const { store } = createTestGame();

        const root = startTestScene(store, 'Level', () => {
            useLight({
                color: { r: 1, g: 1, b: 1, a: 1 }, intensity: 1, ambient: 0.3,
                x: 1, y: 2, z: 3, rotationX: -0.5, rotationY: 0.5,
                castShadow: true, shadowBias: 0.002, shadowStrength: 0.8,
                shadowArea: 40, shadowDistance: 60,
            });
            useSpawn(() => {
                usePointLight({ intensity: 1, range: 9, castShadow: true, shadowBias: 0.001, shadowStrength: 0.5 });
            })();
            useSpawn(() => {
                useSpotLight({ intensity: 1, range: 9, angle: 0.5, penumbra: 0.3, castShadow: true, shadowBias: 0.001, shadowStrength: 0.5 });
            })();
            useSpawn(() => { useAmbientLight({ intensity: 0.4 }); })();
            return createScene();
        });

        expect(collectLighting(root).lights).toHaveLength(3);
    });
});
