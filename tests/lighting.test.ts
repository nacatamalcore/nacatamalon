import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { collectLighting, resetLightWarnings } from '../src/game/loop/helper/collect_lights';
import { useAmbientLight, useDirectionalLight, usePointLight, useSpotLight } from '../src/hooks/light';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useTransform } from '../src/hooks/transform/use_transform';
import { fillLightUniforms, LIGHT_FLOATS_PER_ITEM, LIGHT_UNIFORM_FLOATS } from '../src/render/shared';
import { MAX_SCENE_LIGHTS } from '../src/light';
import { createTestGame, startTestScene } from './helpers/test_game';
import { getColor } from '../src/color';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';

/**
 * What lights a scene, and the numbers that reach the card.
 *
 * The rules here are decisions, not arithmetic: a scene that said nothing is still lit, only eight
 * shine at once, and the level of the dark side is a property of the scene rather than a sum of its
 * lamps. Each one has a test because each one is a thing someone could "fix" into being wrong.
 */

const white = { r: 1, g: 1, b: 1, a: 1 };

/**
 * Starts a scene and gives back what lights it.
 */
const lit = (body: () => void) => {
    const { store } = createTestGame();
    const scene = startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    return collectLighting(scene);
};

describe('what lights a scene', () => {
    it('is a light of the engine\'s own when the scene said nothing', () => {
        const lighting = lit(() => {});

        // A new scene that draws a black silhouette looks broken, and the first thing anyone does
        // is start turning things off to find out why.
        expect(lighting.lights).toHaveLength(1);
        expect(lighting.lights[0].type).toBe('directional');
        expect(lighting.ambient.r).toBeCloseTo(0.35, 5);
    });

    it('is what the scene asked for when it asked', () => {
        const lighting = lit(() => {
            useDirectionalLight({ intensity: 2 });
            // On its own object, because one object holds one light.
            useSpawn(() => { usePointLight({ transform: { x: 5 }, range: 20 }); })();
        });

        expect(lighting.lights.map((light) => light.type)).toEqual(['directional', 'point']);
    });

    it('holds thirty-two at a time, with one warning', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const lighting = lit(() => {
            for (let i = 0; i < MAX_SCENE_LIGHTS + 3; i++) usePointLight({ transform: { x: i } });
        });
        const said = warn.mock.calls.length;
        warn.mockRestore();

        expect(lighting.lights).toHaveLength(MAX_SCENE_LIGHTS);
        // The first ones, in the order they were made: dropping the last ones is at least
        // predictable, which "some of them" would not be. Each model takes its eight from these.
        expect(lighting.lights.map((light) => light.transform.x)).toEqual([...Array(MAX_SCENE_LIGHTS).keys()]);
        expect(said).toBe(1);
    });
});

describe('the level of the dark side', () => {
    it('is what an ambient light says when a scene has one', () => {
        const lighting = lit(() => {
            useDirectionalLight({ ambient: 0.9 });
            useSpawn(() => { useAmbientLight({ intensity: 0.1 }); })();
        });

        // The one that was asked for wins over what any lamp would have settled on.
        expect(lighting.ambient.r).toBeCloseTo(0.1, 5);
    });

    it('is the brightest any one light asks for, not the sum', () => {
        const lighting = lit(() => {
            useDirectionalLight({ ambient: 0.2 });
            useSpawn(() => { usePointLight({ ambient: 0.5 }); })();
            useSpawn(() => { usePointLight({ ambient: 0.3 }); })();
        });

        // Summing would mean that adding a fourth lamp to a room washed the whole thing flat.
        expect(lighting.ambient.r).toBeCloseTo(0.5, 5);
    });

    it('is the last ambient light made when there are several, and says so once', () => {
        resetLightWarnings();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const lighting = lit(() => {
            useAmbientLight({ intensity: 0.4 });
            useSpawn(function Cave() { useAmbientLight({ intensity: 0.05 }); })();
        });
        const said = warn.mock.calls.map((call) => String(call[0]));
        warn.mockRestore();

        expect(lighting.ambient.r).toBeCloseTo(0.05, 5);
        expect(said.filter((line) => line.includes('ambient'))).toHaveLength(1);
    });
});

describe('a light inside something that moves', () => {
    it('moves with it', () => {
        const lighting = lit(() => {
            useSpawn(() => {
                useTransform({ x: 100, y: 40 });
                usePointLight({ transform: { x: 5 } });
            })();
        });

        const [lamp] = lighting.lights;
        expect(lamp.transform.x).toBeCloseTo(105, 5);
        expect(lamp.transform.y).toBeCloseTo(40, 5);
    });

    it('is left out when that thing is not drawn', () => {
        const lighting = lit(() => {
            useDirectionalLight({ intensity: 3 });
            useSpawn(() => {
                useSelf().visible = false;
                usePointLight({ intensity: 9 });
            })();
        });

        // Hiding something takes its lamp with it, which is what anyone turning a thing off means.
        expect(lighting.lights).toHaveLength(1);
        expect(lighting.lights[0].intensity).toBe(3);
    });

    it('gives off as many as an object asks for, without a word: the lamps of a room, in the scene', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const lighting = lit(() => {
            useDirectionalLight();
            usePointLight({ transform: { x: 2 } });
            usePointLight({ transform: { x: 8 } });
        });
        const said = warn.mock.calls.length;
        warn.mockRestore();

        expect(lighting.lights.map((light) => light.type)).toEqual(['directional', 'point', 'point']);
        expect(lighting.lights.map((light) => light.transform.x)).toEqual([0, 2, 8]);
        expect(said).toBe(0);
    });

    it('gives a car its headlights and its tail lights, each where it is placed, moving with it', () => {
        const lighting = lit(() => {
            useSpawn(function Car() {
                useTransform({ x: 50, y: 10 });
                useSpotLight({ transform: { x: -0.6 } });
                useSpotLight({ transform: { x: 0.6 } });
                usePointLight({ range: 1.5, transform: { x: -0.6, y: 2 } });
                usePointLight({ range: 1.5, transform: { x: 0.6, y: 2 } });
            })();
        });

        expect(lighting.lights.map((light) => light.type)).toEqual(['spot', 'spot', 'point', 'point']);
        expect(lighting.lights.map((light) => light.transform.x)).toEqual([49.4, 50.6, 49.4, 50.6]);
        expect(lighting.lights.map((light) => light.transform.y)).toEqual([10, 10, 12, 12]);
    });
});

describe('the numbers that reach the card', () => {
    const packed = (lights: Parameters<typeof fillLightUniforms>[1]) => {
        const out = new Float32Array(LIGHT_UNIFORM_FLOATS);
        fillLightUniforms(out, lights, getColor('#404040'));
        return out;
    };

    it('start with the level and the count', () => {
        const out = packed([]);
        expect(out[0]).toBeCloseTo(0.25, 2);
        expect(out[3]).toBe(0);
    });

    it('give a sun the way towards it, not the way it shines', () => {
        // Facing straight down: the way towards it is straight up.
        const out = packed([{ type: 'directional', color: white, intensity: 1, transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: -Math.PI / 2, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]);

        expect(out[3]).toBe(1);
        expect(out[4 + 0]).toBeCloseTo(0, 5);
        expect(out[4 + 1]).toBeCloseTo(1, 5);
        expect(out[4 + 2]).toBeCloseTo(0, 5);
        // Kind 0, and the colour already multiplied by how strong it is.
        expect(out[4 + 3]).toBe(0);
    });

    it('give a lamp its place and its reach', () => {
        const out = packed([{ type: 'point', color: white, intensity: 2, range: 15, transform: { x: 3, y: 4, z: 5, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]);

        expect(Array.from(out.subarray(4, 8))).toEqual([3, 4, 5, 1]);
        expect(out[4 + 4]).toBe(2);
        expect(out[4 + 7]).toBe(15);
    });

    it('give a torch both of its angles', () => {
        const out = packed([{ type: 'spot', color: white, intensity: 1, range: 10, angle: 0.5, penumbra: 0.4, transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]);

        expect(out[4 + 3]).toBe(2);
        expect(out[4 + 11]).toBeCloseTo(Math.cos(0.5), 5);
        // Where the soft edge ends, inside the outer angle.
        expect(out[4 + 12]).toBeCloseTo(Math.cos(0.5 * 0.6), 5);
        expect(out[4 + 12]).toBeGreaterThan(out[4 + 11]);
    });

    it('leave every light slot they do not fill at nothing', () => {
        const out = packed([{ type: 'point', color: white, intensity: 1, range: 1, transform: { x: 9, y: 9, z: 9, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]);

        // The shader stops at the count, but a leftover from a frame with more lights in it is the
        // kind of thing that shows up as one stray highlight and nowhere else.
        const lightsEnd = 4 + MAX_SCENE_LIGHTS * LIGHT_FLOATS_PER_ITEM;
        for (let i = 4 + LIGHT_FLOATS_PER_ITEM; i < lightsEnd; i++) {
            expect(out[i]).toBe(0);
        }
    });

    it('say there is no shadow to read, which is what every scene until one asks says', () => {
        const out = packed([{ type: 'directional', color: white, intensity: 1, transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: -1, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]);
        const shadowAt = 4 + MAX_SCENE_LIGHTS * LIGHT_FLOATS_PER_ITEM;

        // `-1` is the whole of how the shader is told to sample nothing, so it is worth asserting
        // rather than assuming: zero would mean "the first light casts", which is a real answer.
        expect(out[shadowAt + 19]).toBe(-1);
        expect(out.length).toBe(LIGHT_UNIFORM_FLOATS);
    });
});

describe('several lights on one object, written down', () => {
    it('are each a component of their box, and come back the same', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Street', () => {
            useAmbientLight({ intensity: 0.2 });
            usePointLight({ range: 5, transform: { x: -8, y: 3 } });
            usePointLight({ range: 5, transform: { x: 8, y: 3 } });
            return createScene();
        });
        const doc = serializeScene(root);
        const lights = doc.root.components.filter((component) => component.type === 'light');
        expect(lights.map((light) => (light as { kind: string }).kind)).toEqual(['ambient', 'point', 'point']);
        expect(parseSceneDoc(doc, '/scenes/street.scene.json')).toEqual(doc);

        const { store: again } = createTestGame();
        registerScene(again, doc.name, sceneFromDoc(doc));
        expect(serializeScene(startScene(again, doc.name))).toEqual(doc);
    });
});
