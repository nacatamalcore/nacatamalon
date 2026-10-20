import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { useScene } from '../src/hooks/scene/use_scene';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';

/**
 * A scene takes props, like a component: how it is opened. By name or by its function, and with its
 * defaults when nobody gives any.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const game = () => {
    const { store } = createTestGame({}, createFakeCanvas());
    const opened: string[] = [];
    let handle!: TSceneHandle;
    const Menu = () => {
        handle = useScene();
        return createScene();
    };
    const Level = ({ level = 1, door = 'start' }: { level?: number; door?: string }) => {
        opened.push(`${level} ${door}`);
        handle = useScene();
        return createScene();
    };
    const Hud = ({ player = 1 }: { player?: number }) => {
        opened.push(`hud ${player}`);
        return createScene();
    };
    registerScene(store, 'Menu', Menu);
    registerScene(store, 'Level', Level);
    registerScene(store, 'Hud', Hud);
    startScene(store, 'Menu');
    return { store, opened, Level, Hud, scene: () => handle };
};

describe('a scene with props', () => {
    it('gets them by its function, typed', () => {
        const { opened, Level, scene } = game();
        scene().change(Level, { props: { level: 3, door: 'north' } });
        expect(opened).toEqual(['3 north']);
        // Never run: what TypeScript says about a prop written wrong.
        const typo = () => {
            // @ts-expect-error 'levle' is not one of Level's props.
            scene().change(Level, { props: { levle: 3 } });
        };
        expect(typo).toBeFunction();
    });

    it('gets them by its name too', () => {
        const { opened, scene } = game();
        scene().change('Level', { props: { level: 2 } });
        expect(opened).toEqual(['2 start']);
    });

    it('starts with its defaults when nobody gives any, and a restart remembers nothing', () => {
        const { opened, Level, scene } = game();
        scene().change(Level, { props: { level: 3 } });
        scene().change('Level');
        expect(opened).toEqual(['3 start', '1 start']);
    });

    it('is launched with them alongside', () => {
        const { opened, Hud, scene } = game();
        scene().launch(Hud, { props: { player: 2 } });
        expect(opened).toEqual(['hud 2']);
    });

    it('is refused by a function nobody registered, and says how to fix it', () => {
        const { scene } = game();
        const Stray = () => createScene();
        expect(() => scene().change(Stray)).toThrow('not one of the game\'s scenes');
    });
});
