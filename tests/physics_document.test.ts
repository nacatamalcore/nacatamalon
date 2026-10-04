import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerPhysicsProvider, ALL_LAYERS } from '../src/physics';
import { registerScene } from '../src/scene/register_scene';
import { registerScript, clearScripts } from '../src/scripts';
import { startScene } from '../src/scene/start_scene';
import { usePhysicsBody2d, usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d } from '../src/hooks/physics';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useScript } from '../src/hooks/script/use_script';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TPhysicsProvider } from '../src/physics';
import type { TSceneDoc } from '../src/scene/document';

/**
 * Physics through the file and back.
 *
 * A collider is the one component the engine can hold and cannot use, so the round trip is the only
 * thing that can prove it survived: nothing on screen would look different if it did not.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const rect = { shape: 'rect', width: 24, height: 24 } as const;

let warn: ReturnType<typeof spyOn> | null = null;
const silence = () => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    return warn;
};

afterEach(() => {
    warn?.mockRestore();
    warn = null;
    registerPhysicsProvider(null);
    clearScripts();
});

const written = (body: () => void): { root: TBox; doc: TSceneDoc } => {
    const { store } = createTestGame();
    const root = startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    return { root, doc: serializeScene(root) };
};

const rebuilt = (doc: TSceneDoc): TSceneDoc => {
    const { store } = createTestGame();
    registerScene(store, doc.name, sceneFromDoc(doc));
    return serializeScene(startScene(store, doc.name));
};

describe('a scene with physics, written and read', () => {
    it('comes back the same, flat', () => {
        silence();
        const { doc } = written(() => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 900 } });
            useSpawn(function Crate() {
                createSprite({ width: 24, height: 24, tint, transform: at(10, 10) });
                usePhysicsBody2d({ body: 'dynamic', collider: rect, restitution: 0.4, layer: 2, collidesWith: 0b101 });
            })();
            useSpawn(function Ball() {
                createSprite({ width: 16, height: 16, tint, transform: at(60, 10) });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'circle', radius: 8 }, sensor: true });
            })();
            useSpawn(function Ramp() {
                usePhysicsBody2d({ body: 'static', collider: { shape: 'polygon', vertices: [[0, 0], [40, 0], [40, 20]] } });
            })();
            return createScene();
        });

        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(rebuilt(doc)).toEqual(doc);
        expect(rebuilt(rebuilt(doc))).toEqual(doc);
    });

    it('comes back the same in three dimensions', () => {
        silence();
        const { doc } = written(() => {
            usePhysicsWorld3d({ gravity: { x: 0, y: -9.81, z: 0 } });
            useSpawn(function Player() {
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'capsule', radius: 0.3, height: 1.8 }, offset: [0, 0.9, 0] });
            })();
            useSpawn(function Level() {
                useCubeGeometry({ key: 'ground', width: 10 });
                usePhysicsBody3d({ body: 'static', collider: { shape: 'mesh', geometry: 'ground' } });
            })();
            return createScene();
        });

        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(rebuilt(doc)).toEqual(doc);
    });

    it('says how it falls before it says what is in it', () => {
        silence();
        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(1, 2) });
            usePhysicsWorld2d();
        });

        // Whatever order it was asked for in: a file read from the top should answer the big
        // question first.
        expect(doc.root.components.map((component) => component.type)).toEqual(['physics-world-2d', 'sprite']);
    });

    it('puts the collider on before the behaviours', () => {
        const seen: Array<string | undefined> = [];
        registerScript('probe', (self) => { seen.push(self.physics?.body); });
        silence();

        const { doc } = written(() => {
            useSpawn(function Crate() {
                createSprite({ width: 24, height: 24, tint, transform: at(10, 10) });
                usePhysicsBody2d({ body: 'dynamic', collider: rect });
                useScript('probe', 'one');
            })();
        });

        expect(doc.root.children[0].components.map((component) => component.type)).toEqual(['sprite', 'physics2d', 'script']);

        // And on the way back in: a behaviour asking the world for its object's body has to find
        // it already there.
        seen.length = 0;
        rebuilt(doc);
        expect(seen).toEqual(['dynamic']);
    });

    it('opens the world before any body, through the document too', () => {
        const calls: string[] = [];
        const provider: TPhysicsProvider = {
            createWorld: () => { calls.push('world'); },
            createBody: () => { calls.push('body'); },
        };
        silence();
        const { doc } = written(() => {
            usePhysicsWorld2d();
            useSpawn(function Crate() {
                // Placed, because an object that is nowhere is recorded and deliberately not
                // simulated: there would be nothing to write a simulated position back onto.
                createSprite({ width: 24, height: 24, tint, transform: at(10, 10) });
                usePhysicsBody2d({ body: 'dynamic', collider: rect });
            })();
        });

        registerPhysicsProvider(provider);
        const { store } = createTestGame();
        registerScene(store, doc.name, sceneFromDoc(doc));
        startScene(store, doc.name);

        expect(calls).toEqual(['world', 'body']);
    });

    it('hands nothing to what simulates when the scene is only being shown', () => {
        // An editor's viewport builds with `scripts: 'attach'`, and what simulates is installed for
        // the whole page: a play window beside it must not make the scene being edited fall.
        const calls: string[] = [];
        const provider: TPhysicsProvider = {
            createWorld: () => { calls.push('world'); },
            createBody: () => { calls.push('body'); },
        };
        silence();
        const { doc } = written(() => {
            usePhysicsWorld2d();
            useSpawn(function Crate() {
                createSprite({ width: 24, height: 24, tint, transform: at(10, 10) });
                usePhysicsBody2d({ body: 'dynamic', collider: rect });
            })();
        });

        registerPhysicsProvider(provider);
        const shown = createTestGame().store;
        registerScene(shown, doc.name, sceneFromDoc(doc, doc.name, { scripts: 'attach' }));
        startScene(shown, doc.name);
        expect(calls).toEqual([]);
        // Still written down, so the scene saves with its colliders.
        expect(shown.get('world').scenes[0]?.physicsWorld?._type).toBe('physics-world-2d');

        const played = createTestGame().store;
        registerScene(played, doc.name, sceneFromDoc(doc));
        startScene(played, doc.name);
        expect(calls).toEqual(['world', 'body']);
    });
});

describe('what a file can say wrongly', () => {
    const level = (component: unknown) => ({
        format: 'nacatamalon-scene',
        version: 1,
        name: 'Level',
        assets: [],
        root: {
            id: 'root', name: 'Level', transform: null, children: [],
            components: [component, { type: 'sprite', id: 'art', texture: null, tint, width: 4, height: 4 }],
        },
    });

    it('fills in what it leaves out rather than leaving it undecided', () => {
        const doc = parseSceneDoc(level({ type: 'physics2d', id: 'b1', collider: { shape: 'rect', width: 10, height: 10 } }), 'test');

        // No `body` and no surface at all: the defaults are the format's, not each adapter's.
        expect(doc.root.components[0]).toEqual({
            type: 'physics2d', id: 'b1', name: 'Body', body: 'static',
            collider: { shape: 'rect', width: 10, height: 10 },
            restitution: 0, friction: 0.5, density: 1, sensor: false, layer: 0, collidesWith: ALL_LAYERS,
        });
    });

    it('keeps a shape it cannot make instead of dropping or guessing it', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = parseSceneDoc(level({ type: 'physics2d', id: 'b1', collider: { shape: 'triangle-mesh-thing' } }), 'test');

        // Out of the components and into the hole for what this version cannot read, so writing the
        // file out again gives it back untouched rather than quietly deleting somebody's work.
        expect(doc.root.components.map((component) => component.type)).toEqual(['sprite']);

        const { store } = createTestGame();
        registerScene(store, 'Level', sceneFromDoc(doc, 'test'));
        const root = startScene(store, 'Level');
        expect(root.physics).toBeNull();
        expect(root.drawables).toHaveLength(1);
        expect(JSON.stringify(serializeScene(root))).toContain('triangle-mesh-thing');
    });

    it('refuses a polygon with fewer than three corners', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = parseSceneDoc(level({ type: 'physics2d', id: 'b1', collider: { shape: 'polygon', vertices: [[0, 0], [10, 0]] } }), 'test');

        // Two points are a line, and a backend handed one either refuses or makes something nobody
        // asked for.
        expect(doc.root.components.map((component) => component.type)).toEqual(['sprite']);
    });
});
