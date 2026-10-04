import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteAtlas } from '../src/atlas/create_sprite_atlas';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { getTilemap } from '../src/gameobjects/tilemap/get_tilemap';
import { useSpriteAnimation } from '../src/hooks/animation/use_sprite_animation';
import { getSpriteAnimation } from '../src/hooks/animation/get_sprite_animation';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { getActiveBox } from '../src/store';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { serveTilemap, TEST_MAP } from './helpers/test_tilemap';
import type { TBox } from '../src/box';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTilemap } from '../src/gameobjects/tilemap';
import type { TTexture } from '../src/loaders';

/**
 * What a behaviour reaches on the object it runs in, when something else set it up first.
 *
 * A scene file builds an object's pictures, starts its animation and asks for its map before any
 * behaviour on it runs. These two are how a behaviour gets hold of those same things rather than
 * making second copies of them.
 */

const sheet = {
    key: 'walk', src: '/walk.png', status: 'ready', width: 288, height: 48,
    gpu: { resourceType: 'texture' },
} as unknown as TTexture;

const PLACE = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

describe('the animator a sprite already has', () => {
    it('is the one that was started on it, so changing the run changes what is shown', () => {
        const { store } = createTestGame();
        const atlas = createSpriteAtlas({ texture: sheet, columns: 6 });
        let sprite!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            sprite = createSprite({ atlas, transform: PLACE });
            // What a scene file does for a sprite that starts on a run.
            useSpriteAnimation(sprite, { clips: { idle: { frames: [0, 1] }, punch: { frames: [4, 5], loop: false } }, play: 'idle' });
            return createScene();
        });

        const anim = getSpriteAnimation(sprite)!;
        expect(anim.clip).toBe('idle');

        anim.play('punch');
        runHookUpdates(root, 1 / 60);
        expect(sprite.frame).toBe(4);
    });

    it('is nothing for a sprite nothing animates', () => {
        const { store } = createTestGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ transform: PLACE });
            return createScene();
        });

        expect(getSpriteAnimation(sprite)).toBeNull();
    });
});

describe('the map an object carries', () => {
    let served: ReturnType<typeof serveTilemap> | null = null;
    afterEach(() => {
        served?.restore();
        served = null;
    });

    it('is there while the scene is being built, still loading, and is the one that gets drawn', async () => {
        served = serveTilemap(TEST_MAP);
        const { store } = createTestGame();
        let made!: TTilemap;
        let foundWhileBuilding: TTilemap | null = null;
        const root = startTestScene(store, 'Level', () => {
            made = createTilemap({ src: '/maps/level.tilemap' });
            // Where a behaviour on the same object runs: after what the file put on it.
            foundWhileBuilding = getTilemap(getActiveBox()!);
            return createScene();
        });

        expect(foundWhileBuilding!).toBe(made);
        expect(made.status).not.toBe('ready');

        await whenLoaded(made);
        runHookUpdates(root, 1 / 60);
        expect(root.drawables.filter((drawable) => drawable.type === 'tilemap').every((layer) => layer.type === 'tilemap' && layer.map === made)).toBe(true);
    });

    it('is nothing for an object without one', () => {
        const { store } = createTestGame();
        let box!: TBox;
        startTestScene(store, 'Level', () => {
            box = getActiveBox()!;
            return createScene();
        });

        expect(getTilemap(box)).toBeNull();
    });
});
