import { describe, expect, it, spyOn } from 'bun:test';
import { useLight2d, useAmbientLight2d, useUnlit2d } from '../src/hooks/light';
import { usePointLight, useAmbientLight } from '../src/hooks/light';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture/create_sprite_texture';
import { createScene } from '../src/scene/create_scene';
import { collectLighting2d } from '../src/game/loop/helper/collect_lights_2d';
import { mayHaveLights2d } from '../src/light/count_lights_2d';
import { destroy } from '../src/destroy';
import { collectLighting } from '../src/game/loop/helper/collect_lights';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { fillLighting2d, FRAME_FLOATS_2D, LIGHTING_2D_START, LIGHTING_2D_FLOATS } from '../src/render/shared/lighting_2d';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import { PARTICLES_SHADER } from '../src/render/webgpu/particles/particles_shader';
import { PARTICLES_3D_SHADER } from '../src/render/webgpu/particles/particles_3d_shader';
import { PARTICLES_3D_FRAGMENT_SHADER, PARTICLES_FRAGMENT_SHADER, PARTICLES_VERTEX_SHADER } from '../src/render/webgl2/particles/particles_shader';
import type { TFrameContext } from '../src/render';

const level = (body: () => void) => {
    const { store } = createTestGame();
    const root = startTestScene(store, 'Level', () => { body(); return createScene(); });
    return { store, root };
};
const frame = (store: ReturnType<typeof createTestGame>['store']) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes.find(pass => !pass.renderTarget)!;
};
const sprite = () => createSprite({ width: 16, height: 16, transform: { x: 8, y: 8 } });

describe('2D lighting', () => {
    it('leaves a box out of the lights with useUnlit2d, through the scene camera without them', () => {
        const { store } = level(() => {
            useCamera2d({ zoom: 2 });
            useAmbientLight2d({ intensity: 0.1 }); useLight2d(); sprite();
            useSpawn(() => { useUnlit2d(); useSpawn(() => { sprite(); })(); })();
            useSpawn(() => { useScreenSpace(); sprite(); })();
        });
        const pass = frame(store);
        // The world, the box left out (and what is under it), the HUD.
        expect(pass.cameraIndex).toEqual([0, 1, -1]);
        expect(pass.cameras![0]!.lighting2d).toBeDefined();
        expect(pass.cameras![1]!.lighting2d).toBeUndefined();
        expect(pass.cameras![1]!.zoom).toBe(2);
        expect(pass.cameras![1]!.transform).toBe(pass.cameras![0]!.transform);
    });

    it('draws what is left out of a lit world with no camera through the screen view, and changes nothing unlit', () => {
        const { store } = level(() => {
            useLight2d(); sprite();
            useSpawn(() => { useUnlit2d(); sprite(); })();
        });
        expect(frame(store).cameraIndex).toEqual([0, -1]);
        const plain = level(() => { useSpawn(() => { useUnlit2d(); sprite(); })(); });
        expect(frame(plain.store).cameraIndex).toEqual([-1]);
        expect(frame(plain.store).cameras ?? []).toHaveLength(0);
    });

    it('keeps a world dark once lit, even after its last lamp goes', () => {
        const { store, root } = level(() => {
            useSpawn(() => { useLight2d(); })();
            sprite();
        });
        expect(frame(store).cameras![0]!.lighting2d!.lights).toHaveLength(1);
        destroy(root.children[0]!, { immediate: true });
        expect(frame(store).cameras![0]!.lighting2d).toEqual({ lights: [], ambient: { r: 0, g: 0, b: 0, a: 1 } });
    });

    it('requires a box and leaves worlds without 2D lights unchanged', () => {
        expect(() => useLight2d()).toThrow('useLight2d');
        expect(() => useAmbientLight2d()).toThrow('useAmbientLight2d');
        const { root } = level(() => { usePointLight(); useAmbientLight(); });
        expect(collectLighting2d(root)).toBeUndefined();
    });

    it('follows parent translation, turn and scale, while keeping its own radius', () => {
        const { root } = level(() => {
            useSpawn(() => {
                useTransform({ x: 100, y: 50, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 });
                useLight2d({ transform: { x: 10 }, radius: 40 });
            })();
        });
        const light = collectLighting2d(root)!.lights[0]!;
        expect(light.transform.x).toBeCloseTo(100);
        expect(light.transform.y).toBeCloseTo(70);
        expect(light.radius).toBe(40);
        expect(collectLighting2d(root)!.ambient.r).toBe(0);
        expect(collectLighting(root).lights[0]!.type).toBe('directional');
        // Its only lamp hidden, the world stays dark rather than turning to daylight.
        root.children[0]!.visible = false;
        expect(collectLighting2d(root)).toEqual({ lights: [], ambient: { r: 0, g: 0, b: 0, a: 1 } });
    });

    it('places a lamp two boxes down where a sprite there would be, the turns and scales above added up', () => {
        const { root } = level(() => {
            useSpawn(() => {
                useTransform({ x: 100, y: 50, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 });
                useSpawn(() => {
                    useTransform({ x: 20 });
                    useLight2d({ transform: { x: 10 } });
                    usePointLight({ transform: { x: 10 } });
                })();
            })();
        });
        // The turret is 40 down the turned, doubled ship; its lamp 20 further.
        const lamp = collectLighting2d(root)!.lights[0]!;
        expect(lamp.transform.x).toBeCloseTo(100);
        expect(lamp.transform.y).toBeCloseTo(110);
        const point = collectLighting(root).lights[0]!;
        expect(point.transform.x).toBeCloseTo(100);
        expect(point.transform.y).toBeCloseTo(110);
    });

    it('keeps lights in nested pictures and HUD branches out of the world', () => {
        const { root } = level(() => {
            useLight2d({ radius: 20 });
            createSpriteTexture({ width: 16, height: 16 }, () => {
                useLight2d({ radius: 80 });
            });
            useSpawn(() => { useScreenSpace(); useLight2d({ radius: 100 }); })();
        });
        expect(collectLighting2d(root)!.lights.map(light => light.radius)).toEqual([20]);
        const picture = root.children.find(box => box.spriteTexture !== null)!;
        expect(collectLighting2d(picture)!.lights.map(light => light.radius)).toEqual([80]);
    });

    it('uses the last 2D ambient, keeps 3D separate, and limits lamps with one warning', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { root } = level(() => {
                useAmbientLight({ intensity: 0.8 });
                useAmbientLight2d({ intensity: 0.1 });
                useAmbientLight2d({ color: '#ff0000', intensity: 0.3 });
                for (let i = 0; i < 10; i++) useLight2d({ transform: { x: i } });
            });
            expect(collectLighting2d(root)!.lights).toHaveLength(8);
            expect(collectLighting2d(root)!.ambient).toEqual({ r: 0.3, g: 0, b: 0, a: 1 });
            expect(collectLighting(root).ambient.r).toBeCloseTo(0.8);
            expect(warn.mock.calls).toHaveLength(2);
        } finally { warn.mockRestore(); }
    });

    it('lights each view with the eight lamps on nearest what it shows, wherever they are in the tree', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { store } = level(() => {
                useCamera2d({ transform: { x: 1000 } });
                // First in the tree, and still none of the eight: one switched off, one far away.
                useLight2d({ transform: { x: 1160, y: 112 }, intensity: 0 });
                useLight2d({ transform: { x: 5000, y: 112 } });
                for (let i = 0; i < 20; i++) useLight2d({ transform: { x: 800 + i * 40, y: 112 }, radius: 30 });
                sprite();
            });
            // The view shows 999 to 1321 across (320 wide, a pixel more each side): nine reach it, and
            // of the two furthest from its middle, the one first in the tree stays.
            const lights = frame(store).cameras![0]!.lighting2d!.lights;
            expect(lights.map(light => light.transform.x)).toEqual([1000, 1040, 1080, 1120, 1160, 1200, 1240, 1280]);
            expect(warn.mock.calls.map(call => String(call[0]))).toEqual([expect.stringContaining('9 lamps reach what a view shows')]);
        } finally { warn.mockRestore(); }
    });

    it('keeps a big lamp that covers the view before the torches inside it, and none that never ends', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { store } = level(() => {
                for (let i = 0; i < 9; i++) useLight2d({ transform: { x: 120 + i * 10, y: 112 }, radius: 30 });
                useLight2d({ transform: { x: 160, y: -400 }, radius: 1000 });
                useLight2d({ transform: { x: 160, y: 112 }, radius: Infinity });
                sprite();
            });
            const lights = frame(store).cameras![0]!.lighting2d!.lights;
            expect(lights).toHaveLength(8);
            expect(lights.map(light => light.radius)).toContain(1000);
            expect(lights.map(light => light.radius)).not.toContain(Infinity);
        } finally { warn.mockRestore(); }
    });

    it('keeps a world lit by a lamp out of sight, dark where nothing reaches', () => {
        const { store } = level(() => {
            useLight2d({ transform: { x: 5000, y: 0 } });
            sprite();
        });
        expect(frame(store).cameras![0]!.lighting2d).toEqual({ lights: [], ambient: { r: 0, g: 0, b: 0, a: 1 } });
    });

    it('lights flat particles on both cards, by the view they are drawn through, and not those in space', () => {
        expect(PARTICLES_SHADER).toContain('illuminate2d(textureSample(particleTexture');
        expect(PARTICLES_SHADER).toContain('out.lightView = u32(inst.view) % MAX_VIEWS;');
        expect(PARTICLES_FRAGMENT_SHADER).toContain('illuminate2d(texture(particleTexture');
        expect(PARTICLES_VERTEX_SHADER).toContain('Lighting2d lighting2d[16];');
        expect(PARTICLES_FRAGMENT_SHADER).toContain('Lighting2d lighting2d[16];');
        expect(PARTICLES_3D_SHADER).not.toContain('illuminate2d');
        expect(PARTICLES_3D_FRAGMENT_SHADER).not.toContain('illuminate2d');
    });

    it('lights a world with no authored camera and leaves the HUD on the unlit screen view', () => {
        const { store } = level(() => {
            useAmbientLight2d({ intensity: 0.1 }); useLight2d(); sprite();
            useSpawn(() => { useScreenSpace(); sprite(); })();
        });
        const pass = frame(store);
        expect(pass.cameraIndex).toEqual([0, -1]);
        expect(pass.cameras![0]!.zoom).toBe(1);
        expect(pass.cameras![0]!.lighting2d!.ambient.r).toBe(0.1);
    });

    it('keeps stacked scenes separate and reads light and camera changes on the next frame', () => {
        let light!: ReturnType<typeof useLight2d>;
        let camera!: ReturnType<typeof useCamera2d>;
        const { store } = level(() => {
            camera = useCamera2d({ zoom: 2 });
            light = useLight2d({ radius: 20 }); sprite();
        });
        startTestScene(store, 'Other', () => { useAmbientLight2d({ intensity: 0.7 }); sprite(); return createScene(); });
        let pass = frame(store);
        expect(pass.cameras).toHaveLength(2);
        expect(pass.cameras![0]!.lighting2d!.ambient.r).toBe(0);
        expect(pass.cameras![1]!.lighting2d!.ambient.r).toBe(0.7);
        camera.transform.x = 40; light.transform.x = 50; light.radius = 60;
        pass = frame(store);
        expect(pass.cameras![0]!.transform.x).toBe(40);
        expect(pass.cameras![0]!.lighting2d!.lights[0]!.transform.x).toBe(50);
        expect(pass.cameras![0]!.lighting2d!.lights[0]!.radius).toBe(60);
    });

    it('packs the shared block with an unlit slot zero, and sends only the views drawn through', () => {
        const { root } = level(() => { useAmbientLight2d({ intensity: 0.25 }); useLight2d({ radius: -10 }); });
        // A lamp that gives no light takes none of the eight; one handed over all the same is packed
        // with nothing, rather than a reach below zero.
        const gathered = collectLighting2d(root)!;
        expect(gathered.lights).toHaveLength(0);
        const lamp = { color: { r: 1, g: 1, b: 1, a: 1 }, intensity: 1, transform: { x: 0, y: 0 }, radius: -10, falloff: 1 };
        const data = new Float32Array(FRAME_FLOATS_2D);
        const lit = { transform: { x: 0, y: 0, rotation: 0 }, zoom: 1, lighting2d: { ...gathered, lights: [lamp] } };
        expect(fillLighting2d(data, [lit])).toBe(LIGHTING_2D_START + 2 * LIGHTING_2D_FLOATS);
        expect([...data.slice(LIGHTING_2D_START, LIGHTING_2D_START + 4)]).toEqual([1, 1, 1, 0]);
        const at = LIGHTING_2D_START + LIGHTING_2D_FLOATS;
        expect([...data.slice(at, at + 4)]).toEqual([0.25, 0.25, 0.25, 1]);
        expect(data[at + 6]).toBe(0);
        // The scene left: its slot is past what is sent, so no sprite can read its lights.
        expect(fillLighting2d(data, [])).toBe(LIGHTING_2D_START + LIGHTING_2D_FLOATS);
        // Another view takes the slot without lights: it is written white, with no lamps.
        fillLighting2d(data, [{ transform: { x: 0, y: 0, rotation: 0 }, zoom: 1 }]);
        expect([...data.slice(at, at + 4)]).toEqual([1, 1, 1, 0]);
    });

    it('does not walk the scenes of a game that never made a 2D light, or that has none left', () => {
        const { store, root } = level(() => { sprite(); });
        expect(mayHaveLights2d(root)).toBe(false);
        expect(frame(store).cameras ?? []).toHaveLength(0);

        const holder = startTestScene(store, 'Lit', () => {
            useSpawn(() => { useLight2d(); })();
            return createScene();
        });
        expect(mayHaveLights2d(root)).toBe(true);
        destroy(holder.children[0]!, { immediate: true });
        expect(mayHaveLights2d(root)).toBe(false);
    });

    it('saves and rebuilds both 2D light kinds with their identities and settings, and what is left out', () => {
        const { root } = level(() => {
            useSpawn(() => { useUnlit2d(); sprite(); })();
            useAmbientLight2d({ intensity: 0.12, color: '#112244' });
            useLight2d({ transform: { x: 20, y: 30 }, radius: 85, falloff: 2, color: '#ff9933', intensity: 1.4 });
        });
        const doc = parseSceneDoc(JSON.parse(JSON.stringify(serializeScene(root))), "/lighting.scene");
        const { store } = createTestGame();
        const rebuilt = startTestScene(store, 'Copy', sceneFromDoc(doc));
        expect(rebuilt.lights.map(light => light.id)).toEqual(root.lights.map(light => light.id));
        expect(collectLighting2d(rebuilt)).toEqual(collectLighting2d(root));
        expect(rebuilt.children.map(box => box.unlit2d)).toEqual(root.children.map(box => box.unlit2d));
        expect(rebuilt.children.some(box => box.unlit2d)).toBe(true);
    });
});
