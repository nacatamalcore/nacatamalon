import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { useCamera3d, useCubeGeometry } from '../src/hooks';
import { useDirectionalLight } from '../src/hooks/light';
import { useWorldOffScreen } from '../src/hooks/camera/use_world_off_screen';
import { useMask } from '../src/hooks/mask/use_mask';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { findShadowSources } from '../src/render/shared/light_space';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext } from '../src/render';
import type { TTexture } from '../src/loaders';

/**
 * A split screen in 3D: two views of one world, each through its own camera, far apart. There used
 * to be one shadow map, around one camera, and the other half was drawn without shadows.
 */
describe('a split screen in 3D', () => {
    it('has a shadow for each half, around each half\'s own camera', () => {
        const { store } = createTestGame();
        let left!: TTexture;
        let right!: TTexture;
        startTestScene(store, 'Level', () => {
            useWorldOffScreen();
            useDirectionalLight({ castShadow: true, transform: { rotationX: -0.9 } });
            createMesh({ geometry: useCubeGeometry(), transform: { x: -40 } });
            createMesh({ geometry: useCubeGeometry(), transform: { x: 40 } });
            left = createSpriteTexture({ width: 160, height: 240, sees: 'world' }, () => {
                useCamera3d({ projection: 'perspective', transform: { x: -40, z: 10 } });
            });
            right = createSpriteTexture({ width: 160, height: 240, sees: 'world' }, () => {
                useCamera3d({ projection: 'perspective', transform: { x: 40, z: 10 } });
            });
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 1 / 60);
        const passOf = (texture: TTexture) => ctx.passes.find((pass) => pass.renderTarget === texture.gpu)!;

        const sources = findShadowSources(ctx);
        const views = sources.map((source) => source.view);

        expect(sources).toHaveLength(2);
        expect(views).toContain(passOf(left).views3d![0]!);
        expect(views).toContain(passOf(right).views3d![0]!);
        // Each square follows its own half's camera.
        expect(sources.map((source) => source.camera?.transform.x).sort((a, b) => a! - b!)).toEqual([-40, 40]);
    });

    it('keeps one for each half however many soft masks one of them draws', () => {
        const { store } = createTestGame();
        let left!: TTexture;
        let right!: TTexture;
        startTestScene(store, 'Level', () => {
            useWorldOffScreen();
            useDirectionalLight({ castShadow: true, transform: { rotationX: -0.9 } });
            createMesh({ geometry: useCubeGeometry(), transform: { x: -40 } });
            createMesh({ geometry: useCubeGeometry(), transform: { x: 40 } });
            left = createSpriteTexture({ width: 160, height: 240, sees: 'world' }, () => {
                useCamera3d({ projection: 'perspective', transform: { x: -40, z: 10 } });
            });
            right = createSpriteTexture({ width: 160, height: 240, sees: 'world' }, () => {
                useCamera3d({ projection: 'perspective', transform: { x: 40, z: 10 } });
                // Each soft mask is drawn in passes of its own that share this half's views.
                for (let k = 0; k < 2; k++) {
                    const shown = useSpawn(() => { useTransform({ x: 0, y: 0 }); createSprite({ width: 4, height: 4 }); })();
                    const shape = useSpawn(() => { useTransform({ x: 0, y: 0 }); createSprite({ width: 100, height: 100 }); })();
                    useMask({ by: shape, soft: true }).add(shown);
                }
            });
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 1 / 60);
        const passOf = (texture: TTexture) => ctx.passes.find((pass) => pass.renderTarget === texture.gpu)!;

        const views = findShadowSources(ctx).map((source) => source.view);

        expect(views).toHaveLength(2);
        expect(views).toContain(passOf(left).views3d![0]!);
        expect(views).toContain(passOf(right).views3d![0]!);
    });
});
