import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { provide, useApi } from '../src/hooks/script/use_api';
import { registerScript, clearScripts, listScripts, getScriptFields, getScriptRequires, defaultScriptProps } from '../src/scripts';
import { registerScene } from '../src/scene/register_scene';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { startScene } from '../src/scene/start_scene';
import { useScript } from '../src/hooks/script/use_script';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TSceneDoc } from '../src/scene/document';

/**
 * A behaviour with a name, attached to an object.
 *
 * The two things worth pinning are both about a document outliving the code it names. A name
 * nothing registered must not take the scene down, because renaming one file would otherwise break
 * every scene that mentions it. And a behaviour that **gains** a setting must keep working on
 * scenes saved before it existed, which is what the order of the merge buys.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number) => ({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

let warn: ReturnType<typeof spyOn> | null = null;
const silence = () => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    return warn;
};

afterEach(() => {
    warn?.mockRestore();
    warn = null;
    clearScripts();
});

describe('registerScript', () => {
    it('runs the behaviour with the object it was attached to', () => {
        const seen: string[] = [];
        registerScript('look', (self) => { seen.push(self.name); });

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useScript('look');
            return createScene();
        });

        expect(seen).toEqual(['Level']);
    });

    it('hangs the behaviour per-frame work on that object', () => {
        let ticks = 0;
        registerScript('count', () => { useUpdate(() => { ticks++; }); });

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useScript('count');
            return createScene();
        });

        runHookUpdates(root, 0.016);
        runHookUpdates(root, 0.016);
        expect(ticks).toBe(2);
    });

    it('takes the settings list or the full options object', () => {
        registerScript('a', () => {}, [{ key: 'speed', type: 'number', default: 4 }]);
        registerScript('b', () => {}, { fields: [{ key: 'speed', type: 'number', default: 9 }], requires: ['drawable'] });

        expect(defaultScriptProps('a')).toEqual({ speed: 4 });
        expect(defaultScriptProps('b')).toEqual({ speed: 9 });
        expect(getScriptRequires('b')).toEqual(['drawable']);
        expect(getScriptRequires('a')).toEqual([]);
    });

    it('lists what is registered and forgets it all on demand', () => {
        registerScript('one', () => {});
        registerScript('two', () => {});
        expect(listScripts()).toEqual(['one', 'two']);

        clearScripts();
        expect(listScripts()).toEqual([]);
        expect(getScriptFields('one')).toEqual([]);
    });
});

describe('the settings an attachment runs with', () => {
    it('fills in the declared defaults when nothing was authored', () => {
        let got: unknown = null;
        registerScript('patrol', (_self, props) => { got = props; }, [
            { key: 'speed', type: 'number', default: 40 },
            { key: 'loud', type: 'boolean', default: false },
        ]);

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useScript('patrol');
            return createScene();
        });

        expect(got).toEqual({ speed: 40, loud: false });
    });

    it('lays the authored values over the defaults, key by key', () => {
        let got: unknown = null;
        registerScript('patrol', (_self, props) => { got = props; }, [
            { key: 'speed', type: 'number', default: 40 },
            { key: 'range', type: 'number', default: 60 },
        ]);

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useScript('patrol', undefined, { speed: 120 });
            return createScene();
        });

        // The one that was set, and the one that was not, both present.
        expect(got).toEqual({ speed: 120, range: 60 });
    });

    it('fills a setting the behaviour gained after the scene was saved', () => {
        // What a scene written yesterday holds: only the setting that existed then.
        const saved = { speed: 120 };
        let got: unknown = null;
        registerScript('patrol', (_self, props) => { got = props; }, [
            { key: 'speed', type: 'number', default: 40 },
            { key: 'range', type: 'number', default: 60 },
        ]);

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useScript('patrol', undefined, saved);
            return createScene();
        });

        expect(got).toEqual({ speed: 120, range: 60 });
    });

    it('keeps on the object what the behaviour actually ran with', () => {
        registerScript('patrol', () => {}, [{ key: 'speed', type: 'number', default: 40 }]);

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useScript('patrol', 'attachment-1', { speed: 7 });
            return createScene();
        });

        expect(root.scripts).toEqual([{ id: 'attachment-1', ref: 'patrol', props: { speed: 7 } }]);
    });
});

describe('a name nothing registered', () => {
    it('warns, keeps the attachment and does not throw', () => {
        const said = silence();

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useScript('gone', 'attachment-1', { speed: 3 });
            return createScene();
        });

        expect(root.scripts).toEqual([{ id: 'attachment-1', ref: 'gone', props: { speed: 3 } }]);
        expect(String(said.mock.calls[0][0])).toContain("'gone'");
    });

    it('keeps what was authored, so saving again does not delete it', () => {
        silence();

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useScript('gone', 'attachment-1', { speed: 3 });
            return createScene();
        });

        const written = serializeScene(root).root.components[0];
        expect(written).toEqual({ type: 'script', id: 'attachment-1', ref: 'gone', props: { speed: 3 } });
    });
});

describe("a scene built to be shown rather than played", () => {
    const doc = (): TSceneDoc => parseSceneDoc({
        format: 'nacatamalon-scene',
        version: 1,
        name: 'Level',
        assets: [],
        root: {
            id: 'root', name: 'Level', transform: null, children: [],
            components: [{ type: 'script', id: 's1', ref: 'walk' }],
        },
    }, 'test');

    const built = (mode: 'run' | 'attach'): TBox => {
        const { store } = createTestGame();
        registerScene(store, 'Level', sceneFromDoc(doc(), 'test', { scripts: mode }));
        return startScene(store, 'Level');
    };

    it('records the attachment without running it', () => {
        let ran = 0;
        registerScript('walk', () => { ran++; });

        const root = built('attach');

        expect(ran).toBe(0);
        expect(root.scripts.map((s) => s.ref)).toEqual(['walk']);
    });

    it('still runs a behaviour that asked to be seen while building', () => {
        let ran = 0;
        registerScript('walk', () => { ran++; }, { tool: true });

        built('attach');

        expect(ran).toBe(1);
    });

    it('does not leave the mode turned on for whatever is built next', () => {
        let ran = 0;
        registerScript('walk', () => { ran++; });

        built('attach');
        expect(ran).toBe(0);

        // A second scene, in the ordinary way, in a game of its own.
        built('run');
        expect(ran).toBe(1);
    });

    it('puts the mode back even when building throws', () => {
        registerScript('walk', () => { throw new Error('boom'); });

        const { store } = createTestGame();
        registerScene(store, 'Level', sceneFromDoc(doc(), 'test', { scripts: 'run' }));
        expect(() => startScene(store, 'Level')).toThrow('boom');
        expect(store.get('world').buildScripts).toBe('run');
    });
});

describe('behaviours on one object talking to each other', () => {
    it('reaches a provider listed after the consumer', () => {
        const seen: (string | null)[] = [];

        registerScript('toggle', () => {
            // Asked for here, used later: the order of the two attachments must not matter.
            const spin = useApi<{ name(): string }>('spin');
            useUpdate(() => { seen.push(spin()?.name() ?? null); });
        }, { requires: ['spin'] });

        registerScript('spin', () => {
            provide('spin', { name: () => 'the spinner' });
        });

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            // The consumer FIRST, which is the case that breaks if the value were caught at init.
            useScript('toggle');
            useScript('spin');
            return createScene();
        });

        runHookUpdates(root, 0.016);
        expect(seen).toEqual(['the spinner']);
    });

    it('answers nothing when nobody published that key', () => {
        const seen: unknown[] = [];
        registerScript('lonely', () => {
            const missing = useApi('nobody');
            useUpdate(() => { seen.push(missing()); });
        });

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useScript('lonely');
            return createScene();
        });

        runHookUpdates(root, 0.016);
        expect(seen).toEqual([null]);
    });

    it('is the object, not the scene: a child does not see its parent', () => {
        const seen: unknown[] = [];
        registerScript('publish', () => { provide('thing', 1); });
        registerScript('read', () => {
            const thing = useApi('thing');
            useUpdate(() => { seen.push(thing()); });
        });

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useScript('publish');
            createSprite({ width: 4, height: 4, tint, transform: at(0) });
            return createScene();
        });

        // A second object of its own, built under the scene, asking for the same key.
        const { store: other } = createTestGame();
        const otherRoot = startTestScene(other, 'Other', () => {
            useScript('read');
            return createScene();
        });

        runHookUpdates(root, 0.016);
        runHookUpdates(otherRoot, 0.016);
        expect(seen).toEqual([null]);
    });
});

describe('outside a scene body', () => {
    it('useScript throws', () => {
        expect(() => useScript('anything')).toThrow('useScript');
    });

    it('provide throws', () => {
        expect(() => provide('key', 1)).toThrow('provide');
    });

    it('useApi throws', () => {
        expect(() => useApi('key')).toThrow('useApi');
    });
});

describe('a behaviour nothing registered', () => {
    /**
     * A scene whose one object asks for these behaviours, built in a game of its own.
     */
    const build = (...refs: string[]) => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            for (const ref of refs) useScript(ref);
            return createScene();
        });
    };
    const lines = (said: ReturnType<typeof spyOn>, ref: string) =>
        said.mock.calls.filter((call: unknown[]) => String(call[0]).includes(`'${ref}'`)).length;

    it('is said once however many times the object is rebuilt', () => {
        const said = silence();

        // What a tool does on every edit, and a game on every restart of the scene.
        build('ghost');
        build('ghost');
        build('ghost');

        expect(lines(said, 'ghost')).toBe(1);
    });

    it('is said once for each name that is missing, since each one is its own problem', () => {
        const said = silence();

        build('ghost', 'phantom');
        build('ghost', 'phantom');

        expect(lines(said, 'ghost')).toBe(1);
        expect(lines(said, 'phantom')).toBe(1);
    });

    it('is said again once the registry has been cleared, which is how one goes missing again', () => {
        const said = silence();
        build('ghost');

        registerScript('ghost', () => {});
        build('ghost');
        expect(lines(said, 'ghost')).toBe(1);

        clearScripts();
        build('ghost');

        expect(lines(said, 'ghost')).toBe(2);
    });

    it('still keeps the attachment on the object, which is the point of not failing', () => {
        silence();
        const { store } = createTestGame();

        const root = startTestScene(store, 'Level', () => {
            useScript('ghost');
            useScript('ghost');
            return createScene();
        });

        expect(root.scripts.map((attachment) => attachment.ref)).toEqual(['ghost', 'ghost']);
    });
});
