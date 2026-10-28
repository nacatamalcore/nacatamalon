import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { tick } from '../src/game/loop/tick';
import { useActions } from '../src/hooks/input/use_actions';
import { INPUT } from '../src/CONST';
import { bindingKey, normalizeActionMap } from '../src/input';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import type { TActionMap, TActionPresetName, TActionsHandle } from '../src/input';

/**
 * The input maps a game can start from, `INPUT.ACTION_PRESETS`: each one a map a project file could
 * have written, with no input bound to two of its actions, that a game reads as it is.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const NAMES = Object.keys(INPUT.ACTION_PRESETS) as TActionPresetName[];

describe('INPUT.ACTION_PRESETS', () => {
    it('has the four consoles and the platformer', () => {
        expect(NAMES).toEqual(['nes', 'genesis', 'snes', 'arcade', 'platformer']);
    });

    it.each(NAMES)('%s is a map a project file could have written, unchanged by being read', (name) => {
        const preset = INPUT.ACTION_PRESETS[name];
        expect(normalizeActionMap(JSON.parse(JSON.stringify(preset)))).toEqual(preset as TActionMap);
    });

    it.each(NAMES)('%s binds no input to two of its actions', (name) => {
        const keys = INPUT.ACTION_PRESETS[name].flatMap((action) => action.bindings.map(bindingKey));
        expect(new Set(keys).size).toBe(keys.length);
    });

    it.each(NAMES)('%s has the four directions on the arrows, WASD, the d-pad and the stick', (name) => {
        for (const direction of ['up', 'down', 'left', 'right']) {
            const action = INPUT.ACTION_PRESETS[name].find((candidate) => candidate.name === direction);
            expect(action?.bindings.map((binding) => binding.type)).toEqual(['key', 'key', 'button', 'axis']);
        }
    });

    it('names a console\'s buttons by the console', () => {
        const names = (preset: TActionPresetName) => INPUT.ACTION_PRESETS[preset].map((action) => action.name).slice(4);
        expect(names('nes')).toEqual(['a', 'b', 'select', 'start']);
        expect(names('genesis')).toEqual(['a', 'b', 'c', 'start']);
        expect(names('snes')).toEqual(['a', 'b', 'x', 'y', 'l', 'r', 'select', 'start']);
        expect(names('arcade')).toEqual(['button1', 'button2', 'button3', 'button4', 'button5', 'button6', 'coin', 'start']);
        expect(names('platformer')).toEqual(['jump', 'action', 'pause']);
    });

    it('cannot be changed by a game that took one, so the next one gets it as it was', () => {
        expect(Object.isFrozen(INPUT.ACTION_PRESETS.nes)).toBe(true);
        expect(Object.isFrozen(INPUT.ACTION_PRESETS.nes[0]!.bindings)).toBe(true);
    });
});

describe('a game started from a preset', () => {
    const play = (actions: TActionMap) => {
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({ actions }, canvas);
        const ctx = createFrameContext();
        let now = 0;
        let handle!: TActionsHandle;
        registerScene(store, 'Level', () => {
            handle = useActions();
            return createScene();
        });
        startScene(store, 'Level');
        tick(store, ctx, 0, 0);
        const frame = (): void => {
            const prev = now;
            now += 1000 / 60;
            tick(store, ctx, now, prev);
        };
        const key = (type: 'keydown' | 'keyup', name: string): void => {
            globalThis.dispatchEvent(Object.assign(new Event(type), { key: name }));
        };
        return { frame, key, actions: () => handle };
    };

    it('reads its buttons and directions from the keyboard', () => {
        const { frame, key, actions } = play(INPUT.ACTION_PRESETS.genesis);

        key('keydown', 'c');
        key('keydown', 'a');
        frame();
        expect(actions().isDown('c')).toBe(true);
        expect(actions().isDown('left')).toBe(true);
        expect(actions().isDown('a')).toBe(false);

        key('keyup', 'c');
        key('keyup', 'a');
    });

    it('takes actions of its own after the preset\'s', () => {
        const { frame, key, actions } = play([...INPUT.ACTION_PRESETS.nes, { name: 'dash', bindings: [{ type: 'key', key: 'c' }] }]);

        key('keydown', 'c');
        frame();
        expect(actions().isDown('dash')).toBe(true);
        expect(actions().has('start')).toBe(true);

        key('keyup', 'c');
    });
});
