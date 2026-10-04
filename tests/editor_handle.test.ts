import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { loadHostScene } from '../src/scene/load_host_scene';
import { editorHandleOf } from '../src/game/handle';
import { parseSceneDoc, sceneFromDoc } from '../src/scene';
import { useSceneUnmount } from '../src/hooks/scene/use_scene_unmount';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { createTestGame } from './helpers/test_game';
import type { TSceneDoc } from '../src/scene';

/**
 * A tool replacing the running scene from outside, every time the document it edits changes.
 *
 * The two claims worth pinning are the two that failed silently when this was first worked out on
 * paper. A tool hands over a NEW body under the same name on every edit, and registering a second
 * body under a taken name is refused inside a game. And a scene built from a document takes its
 * root's name from the document, so stopping it by the name it was registered under finds nothing:
 * the old scene would keep running under the new one, one more per edit, and nothing would say so.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

/**
 * A document whose root is called something other than the name it will be loaded under.
 */
const room = (tintR: number): TSceneDoc => parseSceneDoc({
    format: 'nacatamalon-scene', version: 1, name: 'room-a', assets: [],
    root: {
        id: 'room-root', name: 'RoomA', transform: null,
        components: [],
        children: [{
            id: 'crate', name: 'Crate', transform: null,
            components: [{ type: 'sprite', id: 'crate-art', texture: null, tint: { r: tintR, g: 0, b: 0, a: 1 }, width: 8, height: 8, transform: at(10, 10) }],
            children: [],
        }],
    },
}, 'scenes/room-a.scene');

describe('a tool loading a scene from outside', () => {
    it('replaces what is running instead of stacking another copy on top', () => {
        const { store } = createTestGame();

        loadHostScene(store, 'room-a', sceneFromDoc(room(1), 'room-a', { scripts: 'attach' }));
        loadHostScene(store, 'room-a', sceneFromDoc(room(0.5), 'room-a', { scripts: 'attach' }));
        loadHostScene(store, 'room-a', sceneFromDoc(room(0.25), 'room-a', { scripts: 'attach' }));

        // One, and it is the last one. The root is called 'RoomA' and not 'room-a', which is
        // exactly why stopping it by the name it was loaded under would have found nothing.
        const running = store.get('world').scenes;
        expect(running).toHaveLength(1);
        expect(running[0].name).toBe('RoomA');
        const crate = running[0].children[0];
        expect(crate.drawables[0]).toMatchObject({ type: 'sprite' });
        expect((crate.drawables[0] as { tint: { r: number } }).tint.r).toBe(0.25);
    });

    it('accepts a new body under the same name, which inside a game is refused', () => {
        const { store } = createTestGame();
        const first = sceneFromDoc(room(1), 'room-a');
        const second = sceneFromDoc(room(0.5), 'room-a');

        loadHostScene(store, 'room-a', first);
        expect(() => loadHostScene(store, 'room-a', second)).not.toThrow();
        expect(store.get('world').names.get('room-a')).toBe(second);
    });

    it('hands back the root, built, with the identity the document gave it', () => {
        const { store } = createTestGame();

        const root = loadHostScene(store, 'room-a', sceneFromDoc(room(1), 'room-a'));

        // What a tool will match its selection against, so it cannot be a fresh id.
        expect(root.id).toBe('room-root');
        expect(root.children[0].id).toBe('crate');
    });

    it('tears the old scene down, so what it held is let go', () => {
        const { store } = createTestGame();
        let released = 0;
        const Scene = () => {
            useSpawn(function Thing() {
                createSprite({ width: 8, height: 8, tint, transform: at(0, 0) });
                useSceneUnmount(() => { released += 1; });
            })();
            return createScene();
        };

        loadHostScene(store, 'level', Scene);
        loadHostScene(store, 'level', () => createScene());

        expect(released).toBe(1);
    });

    it('works with nothing running yet, which is how a tool starts', () => {
        const { store } = createTestGame();
        expect(store.get('world').scenes).toHaveLength(0);

        loadHostScene(store, 'room-a', sceneFromDoc(room(1), 'room-a'));

        expect(store.get('world').scenes).toHaveLength(1);
    });
});

describe('the way in for a tool', () => {
    it('refuses anything that is not a game made with createGame', async () => {
        // Rather than waiting for ever on something that will never start.
        await expect(editorHandleOf({ destroy: () => {}, on: () => () => {} })).rejects.toThrow('not a game made with createGame');
    });
});
