import { expect, it, afterEach } from 'bun:test';
import { parseSceneDoc, sceneFromDoc } from '../src/scene/document';
import { registerPhysicsProvider } from '../src/physics';
import type { TPhysicsProvider } from '../src/physics';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createTestGame } from './helpers/test_game';
afterEach(() => registerPhysicsProvider(null));
it('a shape written before the body on the same box still joins it', () => {
    const calls: string[] = [];
    const provider: TPhysicsProvider = {
        createWorld: () => { calls.push('world'); },
        createBody: () => { calls.push('body'); },
        addShape: () => { calls.push('shape'); },
    } as unknown as TPhysicsProvider;
    registerPhysicsProvider(provider);
    const doc = parseSceneDoc({
        format: 'nacatamalon-scene', version: 1, name: 'Level', assets: [],
        root: { id: 'r', name: 'Level', transform: null, components: [{ type: 'physics-world-3d', id: 'w' }], children: [{
            id: 'b', name: 'Chair', transform: null, children: [],
            components: [
                { type: 'collision-shape-3d', id: 'c2', collider: { shape: 'sphere', radius: 0.2 } },
                { type: 'physics-body-3d', id: 'c1', body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } },
            ],
        }] },
    }, 'level.scene');
    const { store } = createTestGame();
    registerScene(store, doc.name, sceneFromDoc(doc));
    startScene(store, doc.name);
    expect(calls).toContain('shape');
});
