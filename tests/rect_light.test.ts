import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { collectLighting, resetLightWarnings } from '../src/game/loop/helper/collect_lights';
import { useDirectionalLight, usePointLight, useRectLight } from '../src/hooks/light';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { fillLightUniforms, LIGHT_FLOATS_PER_ITEM, LIGHT_UNIFORM_FLOATS } from '../src/render/shared';
import { transformForward } from '../src/render/shared/transform_basis';
import { MAX_SCENE_LIGHTS } from '../src/light';
import { parseSceneDoc, serializeScene, SCENE_FORMAT } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import { getColor } from '../src/color';
import type { TDrawLight } from '../src/render/interface/draw/t_draw_light';
import type { TRectLight } from '../src/light';

/**
 * A panel: a lamp shaped like a rectangle, which shines out of its front from its nearest point.
 * What reaches the card has to say both its sides and, through them, which way is its front: the
 * shader finds the front from the two sides, so a panel packed the wrong way round lights the wall
 * behind it and leaves the room dark.
 */

afterEach(() => resetLightWarnings());

const white = { r: 1, g: 1, b: 1, a: 1 };

const lit = (body: () => void) => {
    const { store } = createTestGame();
    const scene = startTestScene(store, 'Room', () => {
        body();
        return createScene();
    });
    return { scene, lighting: collectLighting(scene) };
};

/** A panel's placement, everything else left as it is. */
const placed = (turn: Partial<TDrawLight['transform']>): TDrawLight['transform'] => ({
    x: 1, y: 2, z: 3, rotation: 0, rotationX: -Math.PI / 2, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...turn,
});

const packed = (light: TDrawLight, camera: Parameters<typeof fillLightUniforms>[5] = null) => {
    const out = new Float32Array(LIGHT_UNIFORM_FLOATS);
    fillLightUniforms(out, [light], getColor('#404040'), null, null, camera);
    return out.subarray(4, 4 + LIGHT_FLOATS_PER_ITEM);
};

type TVec = { x: number; y: number; z: number };
const cross = (a: TVec, b: TVec): TVec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = (a: TVec) => Math.hypot(a.x, a.y, a.z);
const unit = (a: TVec): TVec => ({ x: a.x / length(a), y: a.y / length(a), z: a.z / length(a) });

/** The way the shader takes a packed panel to face: across its two sides, Y then X. */
const frontOf = (item: Float32Array): TVec => {
    const halfX = { x: item[8]!, y: item[9]!, z: item[10]! };
    const halfY = { x: item[12]!, y: item[13]!, z: item[14]! };
    return unit(cross(unit(halfY), unit(halfX)));
};

const panel = (transform: TDrawLight['transform'], width = 4, height = 2): TDrawLight =>
    ({ type: 'rect', color: white, intensity: 1, range: 6, width, height, transform } as TDrawLight);

describe('a panel in a scene', () => {
    it('is a rect light, facing down like one in the ceiling, a metre square with a reach of ten', () => {
        const { lighting } = lit(() => { useRectLight(); });
        const light = lighting.lights[0] as TRectLight;

        expect(light.type).toBe('rect');
        expect([light.width, light.height, light.range]).toEqual([1, 1, 10]);
        expect(transformForward(light.transform).y).toBeCloseTo(-1, 9);
    });

    it('counts against the thirty-two a scene holds', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { lighting } = lit(() => {
            for (let i = 0; i < MAX_SCENE_LIGHTS; i++) usePointLight({ transform: { x: i } });
            useRectLight();
        });
        warn.mockRestore();

        expect(lighting.lights).toHaveLength(MAX_SCENE_LIGHTS);
        expect(lighting.lights.some((light) => light.type === 'rect')).toBe(false);
    });

    it('never takes the one shadow a scene has, even asked to', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        lit(() => {
            useDirectionalLight({ castShadow: true });
            useSpawn(() => { useRectLight({ castShadow: true }); })();
        });

        // Only the sun can cast here, so nobody is told that one of two was left out.
        expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('ask to cast shadows'))).toBe(false);
        warn.mockRestore();
    });
});

describe('a panel on its way to the card', () => {
    it('says it is a panel, where its middle is, how bright and how far it reaches', () => {
        const item = packed({ ...panel(placed({})), intensity: 2 });

        expect(item[3]).toBe(3);
        expect(Array.from(item.subarray(0, 3))).toEqual([1, 2, 3]);
        expect(item[4]).toBe(2);
        expect(item[7]).toBe(6);
    });

    it('says its two sides as half of each, along its own X and Y', () => {
        const item = packed(panel(placed({}), 4, 2));
        const halfX = { x: item[8]!, y: item[9]!, z: item[10]! };
        const halfY = { x: item[12]!, y: item[13]!, z: item[14]! };

        expect(length(halfX)).toBeCloseTo(2, 6);
        expect(length(halfY)).toBeCloseTo(1, 6);
        // Facing down, its own X is still the world's X.
        expect(halfX.x).toBeCloseTo(2, 6);
    });

    const turns: Array<[string, Partial<TDrawLight['transform']>]> = [
        ['facing down', {}],
        ['facing ahead', { rotationX: 0 }],
        ['facing up', { rotationX: Math.PI / 2 }],
        ['turned to one side', { rotationX: 0, rotationY: Math.PI / 2 }],
        ['tilted and turned', { rotationX: -0.6, rotationY: 2.1 }],
        ['rolled', { rotationX: -0.4, rotationY: 0.7, rotation: 1.2 }],
    ];
    for (const [name, turn] of turns) {
        it(`is lit out of the way it is aimed, ${name}`, () => {
            const transform = placed(turn);
            const front = frontOf(packed(panel(transform)));
            const aimed = transformForward(transform);

            expect([front.x, front.y, front.z].map((v) => v.toFixed(6))).toEqual([aimed.x, aimed.y, aimed.z].map((v) => v.toFixed(6)));
        });
    }

    it('is lit out of the way it is aimed under a flat camera too, where up is down', () => {
        const transform = placed({ rotationX: -0.6, rotationY: 2.1 });
        const front = frontOf(packed(panel(transform), { flat: { x: 0, y: 0, rotation: 0, zoom: 1 } } as Parameters<typeof fillLightUniforms>[5]));
        const aimed = transformForward(transform);

        // The flat camera turns every way the card is told upside down, a torch's aim among them.
        expect([front.x, front.y, front.z].map((v) => v.toFixed(6))).toEqual([aimed.x, -aimed.y, aimed.z].map((v) => v.toFixed(6)));
    });

    it('is lit out of the way it is aimed when its turn is a quaternion', () => {
        // Half a turn about X from facing ahead, written as a quaternion: facing straight down.
        const s = Math.SQRT1_2;
        const transform = { ...placed({ rotationX: 0 }), quaternion: [-s, 0, 0, s] as [number, number, number, number] };
        const front = frontOf(packed(panel(transform)));
        const aimed = transformForward(transform);

        expect(aimed.y).toBeCloseTo(-1, 6);
        expect([front.x, front.y, front.z].map((v) => v.toFixed(6))).toEqual([aimed.x, aimed.y, aimed.z].map((v) => v.toFixed(6)));
    });
});

describe('a panel in a scene document', () => {
    it('is written down with its size and reach, and read back the same', () => {
        const { scene } = lit(() => { useRectLight({ width: 3, height: 0.5, range: 7, intensity: 2, transform: { y: 3 } }); });
        const doc = serializeScene(scene);
        const light = doc.root.components.find((component) => component.type === 'light') as Record<string, unknown>;

        expect(light).toMatchObject({ kind: 'rect', width: 3, height: 0.5, range: 7, intensity: 2 });
        expect(parseSceneDoc(doc, '/scenes/room.scene.json')).toEqual(doc);
    });

    it('takes a metre square when a document does not say, and has no angle of its own', () => {
        const doc = parseSceneDoc({
            format: SCENE_FORMAT,
            name: 'Room',
            root: { id: 'root', name: 'Room', components: [{ type: 'light', id: 'l', kind: 'rect' }], children: [] },
        }, '/scenes/room.scene.json');
        const light = doc.root.components[0] as Record<string, unknown>;

        expect(light).toMatchObject({ kind: 'rect', width: 1, height: 1, range: 10 });
        expect(light).not.toHaveProperty('angle');
    });
});
