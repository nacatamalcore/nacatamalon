import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { fade } from '../src/transition';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { findScene } from '../src/scene/find_scene';
import { parseSceneDoc, sceneFromDoc, SCENE_FORMAT } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { useScene } from '../src/hooks/scene/use_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';

/**
 * A scene that came out of a file is a scene, and nothing else in the engine knows the difference.
 *
 * **That is the design, and it is the whole reason this is the shape it is.** The document is turned
 * into an ordinary scene function and registered like any other, so starting it, changing to it,
 * covering that change with a transition, pausing it and destroying it are not features this had to
 * add: they are features it inherited by not being special. The draft this replaces builds records
 * by hand instead, which is a second path, and a second path is free to drift from the first.
 *
 * The body it returns calls the same `createSprite` a person would have written, so the format
 * **cannot express anything the engine's own API cannot build**.
 */

let warn: ReturnType<typeof spyOn> | null = null;

afterEach(() => {
    warn?.mockRestore();
    warn = null;
});

const tint = { r: 1, g: 1, b: 1, a: 1 };

const doc = (name: string, colour = tint) => parseSceneDoc({
    format: SCENE_FORMAT,
    version: 1,
    name,
    assets: [],
    root: {
        id: `${name}-root`,
        name,
        transform: null,
        components: [],
        children: [{
            id: `${name}-thing`,
            name: 'Thing',
            transform: { x: 10, y: 20 },
            components: [{ type: 'sprite', id: `${name}-art`, texture: null, tint: colour, width: 8, height: 8 }],
            children: [],
        }],
    },
}, `/scenes/${name}.scene`);

describe('a scene built from a document', () => {
    it('starts like any other, and draws what the file said', () => {
        const { store } = createTestGame();
        registerScene(store, 'Level', sceneFromDoc(doc('Level')));
        const root = startScene(store, 'Level');

        expect(root.name).toBe('Level');
        expect(root.id).toBe('Level-root');
        expect(root.children).toHaveLength(1);
        expect(root.children[0].transform).toMatchObject({ x: 10, y: 20 });

        const ctx = createFrameContext();
        fillFrameContext(store, ctx);
        expect(ctx.passes[0].drawables).toHaveLength(1);
    });

    it('can be changed to, and the change can be covered by a transition', () => {
        const { store } = createTestGame();
        registerScene(store, 'Room', sceneFromDoc(doc('Room')));

        let scene!: TSceneHandle;
        startTestScene(store, 'Menu', () => {
            scene = useScene();
            return createScene();
        });

        // Nothing here knows the scene came out of a file, which is the point.
        scene.change('Room', { transition: fade(300) });

        const incoming = findScene(store, 'Room');
        expect(incoming).toBeDefined();
        expect(incoming!.held).toBe(true);
        expect(store.get('transition').active).not.toBeNull();
    });

    it('can be paused, and a paused one keeps drawing', () => {
        const { store } = createTestGame();
        registerScene(store, 'Level', sceneFromDoc(doc('Level')));
        const root = startScene(store, 'Level');

        let scene!: TSceneHandle;
        startTestScene(store, 'Hud', () => {
            scene = useScene();
            return createScene();
        });

        expect(scene.pause('Level')).toBe(true);
        expect(root.paused).toBe(true);

        const ctx = createFrameContext();
        fillFrameContext(store, ctx);
        // A paused scene freezes and goes on being drawn, which is what makes a pause menu possible.
        expect(ctx.passes[0].drawables).toHaveLength(1);
    });

    it('asks for what the manifest names before anything that wants it exists', () => {
        const { store } = createTestGame();
        const withAsset = parseSceneDoc({
            format: SCENE_FORMAT,
            version: 1,
            name: 'Level',
            assets: [{ type: 'geometry', key: 'cube:1:1:1', source: { kind: 'cube' } }],
            root: { id: 'r', name: 'Level', transform: null, components: [], children: [] },
        }, '/scenes/level.scene');

        registerScene(store, 'Level', sceneFromDoc(withAsset));
        startScene(store, 'Level');

        // The slot exists the moment the scene starts, so anything below it finds it waiting.
        expect(store.get('assets').geometries.get('cube:1:1:1')).toBeDefined();
    });

    it('costs you the asset and not the scene when the manifest is missing one', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        const broken = parseSceneDoc({
            format: SCENE_FORMAT,
            version: 1,
            name: 'Level',
            assets: [],
            root: {
                id: 'r', name: 'Level', transform: null, children: [],
                components: [{ type: 'mesh', id: 'm', geometry: 'a-shape-nobody-declared' }],
            },
        }, '/scenes/level.scene');

        registerScene(store, 'Level', sceneFromDoc(broken));
        // A level that refused to open over one broken path is a level nobody can fix.
        expect(() => startScene(store, 'Level')).not.toThrow();
        expect(String(warn.mock.calls[0][0])).toContain('a-shape-nobody-declared');
    });
});
