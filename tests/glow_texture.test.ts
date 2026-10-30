import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createPixels } from '../src/pixels';
import { useCubeGeometry } from '../src/hooks';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TMesh } from '../src/gameobjects/mesh/types/t_mesh';
import type { TMeshMaterial } from '../src/materials';
import type { TTexture } from '../src/loaders';

/**
 * A glow picture given in code: on a material, on a mesh, kept by a scene document, and never shown
 * by a model while it is being drawn into.
 */

const texture = (key: string): TTexture => ({ type: 'texture', key, src: '', width: 1, height: 1, status: 'ready', gpu: null });

describe('a material with a glow picture', () => {
    it('keeps the one it was given', () => {
        const { store } = createTestGame();
        const windows = texture('windows');
        let material!: TMeshMaterial;
        startTestScene(store, 'S', () => {
            material = createMaterial({ shader: 'mesh3d', emissive: 'white', emissiveTexture: windows }) as TMeshMaterial;
            return createScene();
        });

        expect(material.emissiveTexture).toBe(windows);
    });

    it('has none at all when it asked for none, so it saves as before', () => {
        const { store } = createTestGame();
        let material!: TMeshMaterial;
        startTestScene(store, 'S', () => {
            material = createMaterial({ shader: 'mesh3d', emissive: 'white' }) as TMeshMaterial;
            return createScene();
        });

        expect('emissiveTexture' in material).toBe(false);
    });

    it('is what createMesh builds when given one', () => {
        const { store } = createTestGame();
        const screen = texture('screen');
        let mesh!: TMesh;
        startTestScene(store, 'S', () => {
            mesh = createMesh({ geometry: useCubeGeometry(), emissive: 'white', emissiveTexture: screen });
            return createScene();
        });

        expect(mesh.material.emissiveTexture).toBe(screen);
    });
});

describe('a picture being drawn into', () => {
    it('is not shown by a model that glows through it, in its own pass', () => {
        const { store } = createTestGame();
        let monitor!: TMesh;
        let feed!: TTexture;
        startTestScene(store, 'S', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            feed = createSpriteTexture({ width: 8, height: 8, sees: '3d' });
            monitor = createMesh({ geometry: useCubeGeometry(), emissive: 'white', emissiveTexture: feed });
            return createScene();
        });

        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 1 / 60);
        const pass = ctx.passes.find((candidate: TRenderPass) => candidate.renderTarget === feed.gpu)!;

        expect(pass.drawables).not.toContain(monitor);
    });
});

describe('a scene document', () => {
    it('writes the glow picture by key, lists a loaded one, and builds it back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({
                geometry: useCubeGeometry(),
                emissive: 'white',
                emissiveTexture: useLoadTexture({ src: '/windows.png', key: 'windows' }),
            });
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const mesh = doc.root.components.find((c: { type: string }) => c.type === 'mesh');

        expect(mesh.material.emissiveTexture).toBe('windows');
        expect(doc.assets.filter((a: { type: string }) => a.type === 'texture').map((a: { key: string }) => a.key)).toEqual(['windows']);

        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const again = startScene(store, 'Again');
        const built = (again.drawables.find((d) => d.type === 'mesh') as TMesh).material;

        expect(built.emissiveTexture).toBe(store.get('assets').textures.get('windows')!);
    });

    it('does not list a painted one to be fetched, and still builds it back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({
                geometry: useCubeGeometry(),
                emissive: 'white',
                emissiveTexture: createPixelTexture(createPixels(4, 4), { key: 'painted-glow' }),
            });
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        expect(doc.root.components.find((c: { type: string }) => c.type === 'mesh').material.emissiveTexture).toBe('painted-glow');
        expect(doc.assets.filter((a: { type: string }) => a.type === 'texture')).toEqual([]);

        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const built = (startScene(store, 'Again').drawables.find((d) => d.type === 'mesh') as TMesh).material;
        expect(built.emissiveTexture).toBe(store.get('assets').textures.get('painted-glow')!);
    });

    it('writes nothing about it for a mesh with none, so a document saves as before', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry(), emissive: 'white' });
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        expect('emissiveTexture' in doc.root.components.find((c: { type: string }) => c.type === 'mesh').material).toBe(false);
    });
});
