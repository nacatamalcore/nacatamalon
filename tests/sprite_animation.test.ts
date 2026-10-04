import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteAtlas } from '../src/atlas/create_sprite_atlas';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useSpriteAnimation } from '../src/hooks/animation/use_sprite_animation';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TSpriteAnimation, TSpriteAnimationOptions } from '../src/hooks/animation/types/t_sprite_animation';
import type { TTexture } from '../src/loaders';

const sheet = {
    key: 'walk', src: '/walk.png', status: 'ready', width: 288, height: 48,
    gpu: { resourceType: 'texture' },
} as unknown as TTexture;

/**
 * A scene with one animated sprite, plus the handle and a way to run frames through it.
 */
const animated = (options: TSpriteAnimationOptions) => {
    const { store } = createTestGame();
    const atlas = createSpriteAtlas({ texture: sheet, columns: 6 });
    let sprite!: TSprite;
    let anim!: TSpriteAnimation;

    const root: TBox = startTestScene(store, 'Level', () => {
        sprite = createSprite({ atlas, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
        anim = useSpriteAnimation(sprite, options);
        return createScene();
    });

    /**
     * Which frame the sprite is showing, worked out from the window it is reading.
     */
    const shownFrame = () => Math.round((sprite.uvOffset?.x ?? 0) * 6);
    const tick = (seconds: number) => runHookUpdates(root, seconds);

    return { anim, sprite, shownFrame, tick };
};

const WALK = { frames: [0, 1, 2, 3], fps: 10 };

describe('useSpriteAnimation', () => {
    it('shows the first frame of the clip it starts with', () => {
        const { anim, shownFrame } = animated({ clips: { walk: WALK }, play: 'walk' });

        expect(anim.playing).toBe(true);
        expect(anim.clip).toBe('walk');
        expect(shownFrame()).toBe(0);
    });

    it('advances at the clip pace, not per frame of the game', () => {
        const { shownFrame, tick } = animated({ clips: { walk: WALK }, play: 'walk' });

        // 10 fps: a tenth of a second per picture, so half of it is not enough.
        tick(0.05);
        expect(shownFrame()).toBe(0);

        tick(0.05);
        expect(shownFrame()).toBe(1);
    });

    it('starts again at the end when it loops', () => {
        const { shownFrame, tick } = animated({ clips: { walk: WALK }, play: 'walk' });

        for (let i = 0; i < 4; i++) tick(0.1);
        expect(shownFrame()).toBe(0);
    });

    it('rests on the last picture when it does not, and stops', () => {
        const { anim, shownFrame, tick } = animated({
            clips: { hit: { frames: [4, 5], fps: 10, loop: false } },
            play: 'hit',
        });

        tick(0.1);
        expect(shownFrame()).toBe(5);

        tick(0.5);
        expect(shownFrame()).toBe(5);
        expect(anim.playing).toBe(false);
    });

    it('crosses several pictures in one long frame instead of falling behind', () => {
        const { shownFrame, tick } = animated({ clips: { walk: WALK }, play: 'walk' });

        // A quarter of a second at 10 fps is two and a half pictures.
        tick(0.25);
        expect(shownFrame()).toBe(2);
    });

    it('changes clip, from its first picture', () => {
        const { anim, shownFrame, tick } = animated({
            clips: { walk: WALK, attack: { frames: [4, 5], fps: 10 } },
            play: 'walk',
        });

        tick(0.1);
        anim.play('attack');

        expect(anim.clip).toBe('attack');
        expect(shownFrame()).toBe(4);
    });

    it('goes faster or slower on demand', () => {
        const { anim, shownFrame, tick } = animated({ clips: { walk: WALK }, play: 'walk' });

        anim.setSpeed(2);
        tick(0.05);
        expect(shownFrame()).toBe(1);
    });

    it('stops where it is', () => {
        const { anim, shownFrame, tick } = animated({ clips: { walk: WALK }, play: 'walk' });

        tick(0.1);
        anim.stop();
        tick(1);

        expect(anim.playing).toBe(false);
        expect(shownFrame()).toBe(1);
    });

    it('says so when asked for a clip it does not know, and carries on', () => {
        const warnings: string[] = [];
        const original = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };

        const { anim, shownFrame } = animated({ clips: { walk: WALK }, play: 'walk' });
        anim.play('fly');
        console.warn = original;

        expect(warnings[0]).toMatch(/no clip called 'fly'/);
        expect(anim.clip).toBe('walk');
        expect(shownFrame()).toBe(0);
    });

    it('waits on the frame it was made with when no clip is asked for', () => {
        const { anim, shownFrame, tick } = animated({ clips: { walk: WALK } });

        tick(1);
        expect(anim.playing).toBe(false);
        expect(shownFrame()).toBe(0);
    });
});

describe('clips that arrive late', () => {
    it('waits for a clip that does not exist yet, then plays it', () => {
        // What a sheet read from a file looks like while it is loading: a table with nothing in it.
        const clips: Record<string, { frames: number[]; fps?: number }> = {};
        const { anim, shownFrame, tick } = animated({ clips, play: 'spin' });

        expect(anim.playing).toBe(false);

        // The file lands and fills its own table, as the loader does.
        clips.spin = { frames: [2, 3], fps: 10 };
        tick(0.016);

        expect(anim.clip).toBe('spin');
        expect(shownFrame()).toBe(2);
    });

    it('still says so when the table has clips but not that one', () => {
        const warnings: string[] = [];
        const original = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };

        const { anim } = animated({ clips: { walk: WALK }, play: 'fly' });
        console.warn = original;

        expect(warnings[0]).toMatch(/no clip called 'fly'/);
        expect(anim.playing).toBe(false);
    });

    describe('a run that says what comes next', () => {
        const PUNCH = { frames: [4, 5], fps: 10, loop: false, next: 'idle' };
        const IDLE = { frames: [0], fps: 10 };

        it('plays it when it ends, from its first picture', () => {
            const { anim, shownFrame, tick } = animated({ clips: { punch: PUNCH, idle: IDLE }, play: 'punch' });

            tick(0.1);
            expect(shownFrame()).toBe(5);
            tick(0.1);

            expect(anim.clip).toBe('idle');
            expect(anim.playing).toBe(true);
            expect(shownFrame()).toBe(0);
        });

        it('leaves it to a script that already started something else when it ended', () => {
            const { anim, tick } = animated({ clips: { punch: PUNCH, idle: IDLE, jump: WALK }, play: 'punch' });
            anim.onEnd(() => anim.play('jump'));

            tick(0.2);

            expect(anim.clip).toBe('jump');
        });

        it('says once that the next run is missing, and rests on the last picture', () => {
            const warnings: string[] = [];
            const original = console.warn;
            console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };

            const { anim, shownFrame, tick } = animated({ clips: { punch: { ...PUNCH, next: 'gone' } }, play: 'punch' });
            tick(0.2);
            anim.play('punch');
            tick(0.2);
            console.warn = original;

            expect(warnings.filter((w) => /no clip called 'gone'/.test(w))).toHaveLength(1);
            expect(anim.playing).toBe(false);
            expect(shownFrame()).toBe(5);
        });
    });
});
