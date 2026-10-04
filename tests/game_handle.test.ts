import { describe, expect, it } from 'bun:test';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { createScene } from '../src/scene/create_scene';
import { useGame } from '../src/hooks/game/use_game';
import { createTestGame, startTestScene } from './helpers/test_game';

describe('useGame', () => {
    it('throws outside a scene body', () => {
        expect(() => useGame()).toThrow(/inside a scene body/);
    });

    it('hands the scene a handle that stays live', () => {
        const { store } = createTestGame();
        let game!: ReturnType<typeof useGame>;

        startTestScene(store, 'Level', () => {
            game = useGame();
            return createScene();
        });

        expect(game.getWidth()).toBe(320);
        expect(game.getHeight()).toBe(224);

        // Changed from elsewhere, long after the handle was taken.
        store.setState('config', { smooth: true });
        expect(game.isSmooth()).toBe(true);
    });
});

describe('the game handle', () => {
    it('paints the background from now on', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);
        const red = { r: 1, g: 0, b: 0, a: 1 };

        game.setBackground(red);

        expect(game.getBackground()).toEqual(red);
        expect(store.get('config').background).toEqual(red);
    });

    it('changes how images are read, which the renderer is listening for', () => {
        const { store, renderer } = createTestGame({ smooth: false });
        store.subscribe('config', (config) => config.smooth, (smooth) => renderer.setSmooth(smooth));
        const game = createGameHandle(store);

        expect(game.isSmooth()).toBe(false);
        game.setSmooth(true);

        expect(game.isSmooth()).toBe(true);
        expect(renderer.smoothCalls).toEqual([true]);
    });

    it('sets the speed of the world', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);

        expect(game.getTimeScale()).toBe(1);
        game.setTimeScale(0.25);
        expect(store.get('loop').timeScale).toBe(0.25);
    });

    it('freezes and lets go, and a second ask is not a second hold', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);

        expect(game.isPaused()).toBe(false);

        game.pause();
        game.pause();
        expect(store.get('loop').pausedBy).toEqual(['game']);

        game.resume();
        expect(game.isPaused()).toBe(false);
    });

    it('runs again only when the last holder lets go', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);

        game.pause('menu');
        game.pause('blur');
        expect(store.get('loop').pausedBy).toEqual(['menu', 'blur']);

        game.resume('menu');
        expect(game.isPaused()).toBe(true);

        game.resume('blur');
        expect(game.isPaused()).toBe(false);
    });

    it('ignores letting go of a hold nobody placed', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);

        game.pause('menu');
        game.resume('nobody');

        expect(store.get('loop').pausedBy).toEqual(['menu']);
    });
});
