import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { parseSceneDoc, SCENE_FORMAT, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { createParticles3d } from '../src/gameobjects/particles';
import { useLoadParticles } from '../src/hooks/loaders/use_load_particles';
import { useData } from '../src/hooks/state/use_data';
import { useScript } from '../src/hooks/script/use_script';
import { registerScript, clearScripts } from '../src/scripts';
import { clearGameStores, createGameStore, storeOf } from '../src/game_store';
import { useStoreLink } from '../src/hooks/store/use_store_link';
import { useLight } from '../src/hooks/light/use_light';
import { usePointLight } from '../src/hooks/light/use_point_light';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { usePhysicsBody2d, usePhysicsWorld2d } from '../src/hooks/physics';
import { createTestFont } from './helpers/test_font';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TComponentDoc, TSceneDoc } from '../src/scene/document';

/**
 * Writing a scene down and reading it back.
 *
 * **This is the test the whole format exists to pass.** There are no golden files anywhere in this
 * repo and there should not be: a hand-written expected document proves that a writer and a reader
 * agree with whoever typed the file, which is a weaker claim than it looks. What is checked here is
 * that the document survives the reader untouched, so a field the writer emits and the reader
 * quietly changes shows up immediately, as drift.
 *
 * And the whole loop: **written, read, built into a running scene in a second game, and written
 * again**. The second writing is the one that proves it, because it is the *engine* that had to hold
 * on to everything rather than the writer and the reader agreeing on a shape between themselves.
 */

let warn: ReturnType<typeof spyOn> | null = null;

afterEach(() => {
    warn?.mockRestore();
    warn = null;
});

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

/**
 * Builds a scene, writes it down, and hands back both halves.
 */
const written = (body: () => void): { root: TBox; doc: TSceneDoc } => {
    const { store } = createTestGame();
    const root = startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    return { root, doc: serializeScene(root) };
};

describe('a document the writer produced', () => {
    it('survives the reader with nothing changed', () => {
        const { doc } = written(() => {
            useCamera2d({ x: 10, y: 20, zoom: 2 });
            useCamera3d({ fov: 55, near: 0.2, far: 120 });
            usePointLight({ intensity: 0.8, range: 12 });
            createSprite({ width: 32, height: 32, tint, anchor: { x: 0, y: 1 }, zIndex: 3, transform: at(40, 60) });
            createText({ text: 'ABC', font: createTestFont(), tint, transform: at(8, 8) });
            createMesh({ geometry: useCubeGeometry({ width: 2 }), transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } });
        });

        // A field the writer emits and the reader changes shows up right here, as drift.
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
    });

    it('says what it is, and what the scene is called', () => {
        const { doc } = written(() => {});

        expect(doc.format).toBe(SCENE_FORMAT);
        expect(doc.version).toBe(1);
        // A scene is named by the key it was registered under, and a document has to be able to
        // say so on its own.
        expect(doc.name).toBe('Level');
    });

    it('keeps the tree, the identities and the places', () => {
        const Turret = () => {
            useTransform({ x: 100, y: 50 });
            createSprite({ width: 8, height: 8, tint });
        };
        const { doc } = written(() => {
            useSpawn(Turret)();
        });

        expect(doc.root.children).toHaveLength(1);
        const turret = doc.root.children[0];
        expect(turret.name).toBe('Turret');
        expect(turret.transform).toMatchObject({ x: 100, y: 50, z: 0, scaleX: 1 });
        expect(turret.components[0].type).toBe('sprite');
    });
});

describe('what the writer leaves out', () => {
    it('never writes what the frame worked out', () => {
        const { root, doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(1, 2) });
        });
        // The frame leaves this on the record every time it walks the tree.
        (root.drawables[0] as { worldTransform?: unknown }).worldTransform = at(999, 999);

        const again = serializeScene(root);
        expect(JSON.stringify(again)).not.toContain('worldTransform');
        expect(JSON.stringify(again)).not.toContain('999');
        expect(again).toEqual(doc);
    });

    it('never writes a field that is already at its default', () => {
        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint });
        });

        expect(doc.root).not.toHaveProperty('visible');
        expect(doc.root).not.toHaveProperty('screenSpace');
        expect(doc.root.components[0]).not.toHaveProperty('flipX');
        expect(doc.root.components[0]).not.toHaveProperty('zIndex');
    });

    it('writes a departure from the default, and only that', () => {
        const Hud = () => {
            useScreenSpace();
            createSprite({ width: 8, height: 8, tint, flipX: true, zIndex: 9 });
        };
        const { doc } = written(() => { useSpawn(Hud)(); });

        const hud = doc.root.children[0];
        expect(hud.screenSpace).toBe(true);
        expect(hud).not.toHaveProperty('visible');
        expect(hud.components[0]).toMatchObject({ flipX: true, zIndex: 9 });
    });

    it('leaves out a box born after its scene was built, and keeps one built with it', () => {
        const { store } = createTestGame();
        const Brick = () => { createSprite({ width: 8, height: 8, tint }); };
        const Bullet = () => { createSprite({ width: 2, height: 2, tint }); };

        let fire!: () => unknown;
        const root = startTestScene(store, 'Level', () => {
            const addBrick = useSpawn(Brick);
            for (let i = 0; i < 3; i++) addBrick();
            fire = useSpawn(Bullet);
            return createScene();
        });

        // The level, built out of the same call, while its body was running.
        expect(serializeScene(root).root.children).toHaveLength(3);

        // And three seconds into playing it.
        fire();
        fire();
        expect(root.children).toHaveLength(5);
        // Saving a level mid-play must not write every bullet still in flight into it.
        const doc = serializeScene(root);
        expect(doc.root.children).toHaveLength(3);
        expect(doc.root.children.every((child) => child.name === 'Brick')).toBe(true);
    });
});

describe('the manifest', () => {
    it('names a shape once however many things show it, with the recipe that makes it', () => {
        const { doc } = written(() => {
            const cube = useCubeGeometry({ width: 2 });
            const place = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
            createMesh({ geometry: cube, transform: place });
            createMesh({ geometry: cube, transform: place });
        });

        const shapes = doc.assets.filter((asset) => asset.type === 'geometry');
        expect(shapes).toHaveLength(1);
        // The recipe, not the corners: eleven numbers against a few hundred, and this one survives
        // the engine changing how it builds a cube.
        expect(shapes[0]).toMatchObject({ source: { kind: 'cube', width: 2, height: 1, depth: 1 } });
    });

    it('names a font by both its files', () => {
        const { doc } = written(() => {
            createText({ text: 'AB', font: createTestFont(), tint });
        });

        const fonts = doc.assets.filter((asset) => asset.type === 'bitmapFont');
        expect(fonts).toHaveLength(1);
        // A font is its metrics and its sheet. One entry, two paths, and its sheet is not also
        // registered as a texture of its own.
        expect(fonts[0]).toHaveProperty('json');
        expect(fonts[0]).toHaveProperty('atlas');
        expect(doc.assets.filter((asset) => asset.type === 'texture')).toHaveLength(0);
    });

    it('leaves out a mesh whose shape nothing could build again, and says so', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { root } = written(() => {
            createMesh({
                geometry: useCubeGeometry({ key: 'hand-made' }),
                transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
            });
        });
        // A shape with no recipe: pretend it came from raw vertex data.
        (root.drawables[0] as { geometry: { source: unknown } }).geometry.source = null;

        const doc = serializeScene(root);
        expect(doc.root.components).toHaveLength(0);
        expect(String(warn.mock.calls[0][0])).toContain('hand-made');
    });
});

/**
 * Builds the document into a scene in a game of its own, and writes that one down again.
 */
const rebuilt = (doc: TSceneDoc): TSceneDoc => {
    const { store } = createTestGame();
    registerScene(store, doc.name, sceneFromDoc(doc));
    return serializeScene(startScene(store, doc.name));
};

describe('where a drawable is', () => {
    it('writes the place it sits at on its box', () => {
        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(40, 60) });
        });

        // The two numbers `createSprite` was given, which is how nearly every scene in this engine
        // is written. Without a field for them they are in no part of the file at all, and the room
        // comes back with everything piled at the origin having failed at nothing.
        expect(doc.root.components[0]).toMatchObject({ type: 'sprite', transform: { x: 40, y: 60 } });
        // On the drawable and not moved onto the box: the box was never placed and still is not.
        expect(doc.root.transform).toBeNull();
    });

    it('puts it back where it was, and holds still after that', () => {
        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(40, 60) });
        });

        const { store } = createTestGame();
        registerScene(store, doc.name, sceneFromDoc(doc));
        const root = startScene(store, doc.name);
        expect(root.transform).toBeNull();
        expect(root.drawables[0].transform).toMatchObject({ x: 40, y: 60 });

        // And written out again it says the same thing. A placement that moved from the drawable to
        // the box on the way in would still draw right, and would walk one box further out on every
        // save: right twice and wrong on the third.
        expect(rebuilt(doc)).toEqual(doc);
        expect(rebuilt(rebuilt(doc))).toEqual(doc);
    });

    it('keeps one for each drawable, not one for the box', () => {
        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(40, 60) });
            createSprite({ width: 4, height: 4, tint, transform: at(44, 70) });
        });

        // A box carrying a picture and the shadow under it: two offsets, and the second one is not
        // a copy of the first.
        expect(doc.root.components[0]).toMatchObject({ transform: { x: 40, y: 60 } });
        expect(doc.root.components[1]).toMatchObject({ transform: { x: 44, y: 70 } });
    });

    it('is not confused with where the box is, on a box that is both', () => {
        const Turret = () => {
            useTransform({ x: 5, y: 6 });
            createSprite({ width: 8, height: 8, tint });
        };
        const { doc } = written(() => {
            createSprite({ width: 64, height: 64, tint, transform: at(20, 40) });
            useSpawn(Turret)();
        });

        // The floor is drawn at 20, 40 and the room is still not anywhere in particular. Reading the
        // floor's corner as the room's would carry the turret under it there too, so a room saved
        // twice would walk across the screen.
        expect(doc.root.components[0]).toMatchObject({ transform: { x: 20, y: 40 } });
        expect(doc.root.transform).toBeNull();
        expect(doc.root.children[0].transform).toMatchObject({ x: 5, y: 6 });
        expect(rebuilt(doc)).toEqual(doc);
    });

    it('keeps all three dimensions of a model', () => {
        const { doc } = written(() => {
            createMesh({
                geometry: useCubeGeometry({ width: 2 }),
                transform: { x: 1, y: 2, z: 3, rotation: 0, rotationX: 0.5, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 2 },
            });
        });

        expect(doc.root.components[0]).toMatchObject({ type: 'mesh', transform: { x: 1, y: 2, z: 3, rotationX: 0.5, scaleZ: 2 } });
    });

    it('keeps an emitter in three dimensions one, in its place in space, through a second game', () => {
        // Its file cannot be fetched here, and that is said and not the point: the emitter is in the
        // scene the moment it is made, whether or not its effect has landed.
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { doc } = written(() => {
            createParticles3d({
                effect: useLoadParticles({ src: '/fx/geyser.particles' }),
                transform: { x: 1, y: 2, z: 3, rotation: 0, rotationX: 0, rotationY: 0.5, scaleX: 1, scaleY: 1, scaleZ: 2 },
                seed: 4,
            });
        });

        expect(doc.root.components[0]).toMatchObject({
            type: 'particles3d', effect: '/fx/geyser.particles', seed: 4, transform: { z: 3, rotationY: 0.5, scaleZ: 2 },
        });
        expect(Object.keys(doc.root.components[0]!).slice(0, 3)).toEqual(['type', 'id', 'transform']);
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(rebuilt(doc)).toEqual(doc);
    });

    it('says nothing about a drawable sitting at its box\'s corner', () => {
        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(0, 0) });
        });

        // An absent field is its default, which is the rule the whole format keeps. Writing the
        // identity out would put nine numbers into every file to say nothing.
        expect(doc.root.components[0]).not.toHaveProperty('transform');
    });
});

describe('the state a box owns', () => {
    it('is written in the order it was asked for, and nowhere when there is none', () => {
        const { doc } = written(() => {
            useData(3);
            useData({ coins: 10, keys: ['red'] });
            useSpawn(function Empty() {
                createSprite({ width: 4, height: 4, tint, transform: at(0, 0) });
            })();
        });

        expect(doc.root.data).toEqual([{ value: 3 }, { value: { coins: 10, keys: ['red'] } }]);
        // A box with no state does not carry an empty list around.
        expect(doc.root.children[0].data).toBeUndefined();
    });

    it('comes back through a second game that never saw the first', () => {
        const { doc } = written(() => {
            useData(3);
            useData('alive');
        });

        expect(rebuilt(doc)).toEqual(doc);
    });

    it('is handed back to the body in the same order', () => {
        const { doc } = written(() => {
            useData(1);
            useData(2);
        });

        const { store } = createTestGame();
        registerScene(store, doc.name, sceneFromDoc(doc));
        const root = startScene(store, doc.name);

        expect(root.data.map((record) => record.value)).toEqual([1, 2]);
    });
});

describe('the state an object is wired to', () => {
    it('writes the link, and puts it back before the behaviours', () => {
        const seen: (string | null)[] = [];
        registerScript('feed', (self) => {
            // The behaviour asks the object, which is the whole reason the link is a component.
            seen.push(storeOf(self)?.key ?? null);
        });

        createGameStore({ key: 'pet', state: { hunger: 70 } });
        const { doc } = written(() => {
            // The link first, because in a scene written by hand the order is the order you wrote:
            // a behaviour asked for before it would find nothing, and say so. Only a scene built
            // from a document is reordered, which is what the second half of this checks.
            useStoreLink('pet');
            createSprite({ width: 8, height: 8, tint, transform: at(3, 4) });
            useScript('feed', 'one');
        });

        // Written before the behaviours and after what the object is, because that is the order it
        // has to be read back in.
        expect(doc.root.components.map((component) => component.type)).toEqual(['sprite', 'store', 'script']);
        expect(doc.root.components[1]).toMatchObject({ type: 'store', ref: 'pet' });
        expect(seen).toEqual(['pet']);

        // And on the way back in the behaviour finds it, although the file lists the link after the
        // sprite and the behaviour after both.
        seen.length = 0;
        const back = rebuilt(doc);
        expect(seen).toEqual(['pet']);
        expect(back).toEqual(doc);

        clearScripts();
        clearGameStores();
    });

    it('is one link however many times it was named', () => {
        const { doc } = written(() => {
            useStoreLink('pet');
            useStoreLink('pet');
        });

        // A link has exactly one field, so two to the same store are the same link.
        expect(doc.root.components).toHaveLength(1);
    });
});

describe('the behaviours an object carries', () => {
    it('writes a name, and settings only when there are some', () => {
        registerScript('patrol', () => {}, [{ key: 'speed', type: 'number', default: 40 }]);
        registerScript('blink', () => {});

        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(3, 4) });
            useScript('patrol', 'one', { speed: 120 });
            useScript('blink', 'two');
        });
        clearScripts();

        // After the sprite, whatever order they were written in: an object is what it is first.
        expect(doc.root.components.map((component) => component.type)).toEqual(['sprite', 'script', 'script']);
        expect(doc.root.components[1]).toEqual({ type: 'script', id: 'one', ref: 'patrol', props: { speed: 120 } });
        expect(doc.root.components[2]).toEqual({ type: 'script', id: 'two', ref: 'blink' });
    });

    it('comes back the same through a second game that never saw the first', () => {
        registerScript('patrol', () => {}, [{ key: 'speed', type: 'number', default: 40 }]);
        registerScript('blink', () => {});

        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(3, 4) });
            useScript('patrol', 'one', { speed: 120 });
            useScript('blink', 'two');
        });

        const back = rebuilt(doc);
        clearScripts();
        expect(back).toEqual(doc);
    });

    it('runs a behaviour after the rest of its object, whatever the file says first', () => {
        const seen: number[] = [];
        registerScript('count', (self) => { seen.push(self.drawables.length); });

        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(3, 4) });
            useScript('count', 'one');
        });

        // The file now lists the behaviour FIRST, which is what an editor reordering things can do.
        const reordered: TSceneDoc = {
            ...doc,
            root: { ...doc.root, components: [doc.root.components[1], doc.root.components[0]] },
        };

        seen.length = 0;
        rebuilt(reordered);
        clearScripts();

        // One, not zero: the sprite was there by the time the behaviour looked.
        expect(seen).toEqual([1]);
    });
});

describe('the whole loop', () => {
    it('comes back the same, through a second game that never saw the first', () => {
        // Rebuilding asks for everything the manifest names, and there is no server here to
        // answer for the font's sheet. The asset arriving is not what is being checked; neither is
        // the collider being simulated, which nothing here is installed to do.
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { doc } = written(() => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 900 } });
            usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 32, height: 32 }, restitution: 0.3 });
            useCamera2d({ x: 10, y: 20, zoom: 2 });
            useCamera3d({ fov: 55, near: 0.2, far: 120 });
            createSprite({ width: 32, height: 32, tint, anchor: { x: 0, y: 1 }, zIndex: 3, transform: at(40, 60) });
            createText({ text: 'ABC', font: createTestFont(), tint, transform: at(8, 8) });
            createMesh({
                geometry: useCubeGeometry({ width: 2 }),
                transform: { x: 1, y: 2, z: 3, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
            });
        });

        expect(rebuilt(doc)).toEqual(doc);
    });

    it('does not drift on a second pass, which is what a default filled in on read would look like', () => {
        const { doc } = written(() => {
            createSprite({ width: 8, height: 8, tint, transform: at(3, 4) });
            usePointLight({ intensity: 0.8, range: 12, x: 5, rotationY: 0.5 });
        });

        const once = rebuilt(doc);
        const twice = rebuilt(once);
        expect(twice).toEqual(once);
        expect(once).toEqual(doc);
    });

    it('keeps a lamp aimed, which its box could not have said for it', () => {
        const { doc } = written(() => {
            usePointLight({ intensity: 2, range: 7, x: 4, y: 5, z: 6, rotationX: 0.25, rotationY: -0.5 });
        });

        const lamp = rebuilt(doc).root.components[0];
        // A lamp is moved by the tree and never turned by it, so which way it faces has to survive
        // in the component or a lantern comes back pointing somewhere else.
        expect(lamp).toMatchObject({
            kind: 'point',
            range: 7,
            transform: { x: 4, y: 5, z: 6, rotationX: 0.25, rotationY: -0.5 },
        });
    });

    it('keeps a light casting, and everything it was told about how', () => {
        const { doc } = written(() => {
            useLight({
                intensity: 1.2, rotationX: -0.8, rotationY: 0.4,
                castShadow: true, shadowBias: 0.004, shadowStrength: 0.7,
                shadowArea: 420, shadowDistance: 500,
            });
        });

        const sun = rebuilt(doc).root.components[0];
        // Losing any of these is the quietest failure this format has: the level comes back lit
        // exactly as before, and the only thing missing is every shadow in it.
        expect(sun).toMatchObject({
            kind: 'directional',
            castShadow: true,
            shadowBias: 0.004,
            shadowStrength: 0.7,
            shadowArea: 420,
            shadowDistance: 500,
        });
    });

    it('keeps a floor out of the shadow map, which is the only half of that worth writing', () => {
        const { doc } = written(() => {
            createMesh({ geometry: useCubeGeometry({ width: 2 }), castShadow: false });
            createMesh({ geometry: useCubeGeometry({ width: 2 }) });
        });

        const [floor, crate] = rebuilt(doc).root.components as TComponentDoc[];
        expect(floor).toMatchObject({ type: 'mesh', castShadow: false });
        // And the ordinary one says nothing at all, because absent is what casting means: writing
        // `true` would record a decision nobody took.
        expect(crate).not.toHaveProperty('castShadow');
    });

    it('keeps a tree, its identities and what each box is', () => {
        const Turret = () => {
            useTransform({ x: 100, y: 50 });
            createSprite({ width: 8, height: 8, tint });
        };
        const { doc } = written(() => { useSpawn(Turret)(); });

        const back = rebuilt(doc);
        expect(back.root.children[0].id).toBe(doc.root.children[0].id);
        expect(back.root.children[0].transform).toMatchObject({ x: 100, y: 50 });
        expect(back).toEqual(doc);
    });

    it('carries a component it cannot build straight through, in its place', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const mystery = { type: 'physics2d', id: 'body', shape: 'circle', radius: 8 };
        const { doc } = written(() => { createSprite({ width: 8, height: 8, tint }); });
        const withMystery = parseSceneDoc({
            ...doc,
            root: { ...doc.root, components: [...doc.root.components, mystery] },
        }, '/scenes/x.scene');

        // Read, not understood, not drawn, and written back where it was. This is the whole of why
        // a scene opened by an older engine does not come back with somebody's work missing.
        const back = rebuilt(withMystery);
        expect(back.root.components).toContainEqual(mystery as unknown as TComponentDoc);
    });
});
