import { afterEach, describe, expect, it } from 'bun:test';
import { computeCanvasLayout } from '../src/DOM/canvas_layout';
import { fitCanvas } from '../src/DOM/fit_canvas';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { createScene } from '../src/scene/create_scene';
import { usePointer } from '../src/hooks/input/use_pointer';
import { gameOptionsFromProject } from '../src/project/game_options_from_project';
import { parseProject } from '../src/project/parse_project';
import { RENDER } from '../src/CONST';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TPointerInfo } from '../src/input';

/**
 * `pixelAspect`: a game pixel painted wider than tall, as the NES and the SNES drew 256 across a 4:3
 * television (8:7). Only the size on screen changes; the game draws the same pixels.
 */

const SNES = 8 / 7;

const placedCanvas = (space: { width: number; height: number }): HTMLCanvasElement => {
    const style = {} as CSSStyleDeclaration;
    const canvas = Object.assign(new EventTarget(), {
        width: 300,
        height: 150,
        style,
        parentElement: { clientWidth: space.width, clientHeight: space.height },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: parseFloat(style.width), height: parseFloat(style.height) }),
    });
    return canvas as unknown as HTMLCanvasElement;
};

const withPage = (devicePixelRatio = 1): void => {
    (globalThis as Record<string, unknown>).document = { body: {} };
    (globalThis as Record<string, unknown>).window = { devicePixelRatio, innerWidth: 1920, innerHeight: 1080 };
};

afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).window;
});

describe('the pixelAspect option', () => {
    it('is square unless the game says', () => {
        expect(cleanGameOptions({ width: 256, height: 224 }).pixelAspect).toBe(1);
        expect(cleanGameOptions({ width: 256, height: 224, pixelAspect: SNES }).pixelAspect).toBe(SNES);
    });

    it('refuses anything but a number above 0', () => {
        for (const bad of [0, -1, Number.NaN, Infinity, '8/7']) {
            expect(() => cleanGameOptions({ width: 256, height: 224, pixelAspect: bad as never })).toThrow(/pixelAspect must be a number above 0/);
        }
    });
});

describe('the canvas with wider pixels', () => {
    it('keeps the rows a whole multiple and gives the columns that times 8/7, the television\'s shape', () => {
        // A SNES on a 1080 screen: 4 rows a game row, 4.57 columns a game column.
        const layout = computeCanvasLayout(256, 224, 1920, 1080, 'integer', 'both', 1, SNES);
        expect(layout.scale).toBe(4);
        expect(layout.scaleX).toBeCloseTo(4 * SNES, 9);
        expect([layout.cssWidth, layout.cssHeight]).toEqual([1170, 896]);
        expect(layout.cssWidth / layout.cssHeight).toBeCloseTo(256 * SNES / 224, 2);
    });

    it('takes the shape into account when it fits the width', () => {
        // 1000 wide: 3.9 square, but only 3.4 at 8/7, so the rows go to 3.
        const layout = computeCanvasLayout(256, 224, 1000, 1080, 'integer', 'both', 1, SNES);
        expect(layout.scale).toBe(3);
        expect(layout.cssWidth).toBeLessThanOrEqual(1000);
    });

    it('works out a free side in its own pixels', () => {
        const layout = computeCanvasLayout(256, 224, 1920, 1080, 'integer', 'height', 1, SNES);
        expect(layout.bufferHeight).toBe(224);
        expect(layout.bufferWidth).toBe(Math.floor(1920 / (4 * SNES)));
        expect(layout.cssWidth).toBeLessThanOrEqual(1920);
    });

    it('paints 1× tall and 8/7 wide with no scaling, and as large as fits with contain', () => {
        const none = computeCanvasLayout(256, 224, 1920, 1080, 'none', 'both', 1, SNES);
        expect([none.cssWidth, none.cssHeight]).toEqual([293, 224]);
        const contain = computeCanvasLayout(256, 224, 1920, 1080, 'contain', 'both', 1, SNES);
        expect(contain.cssHeight).toBeCloseTo(1080, 0);
        expect(contain.cssWidth / contain.cssHeight).toBeCloseTo(256 * SNES / 224, 2);
    });

    it('is left out of fill, which stretches the picture anyway', () => {
        const layout = computeCanvasLayout(256, 224, 1920, 1080, 'fill', 'both', 1, SNES);
        expect([layout.cssWidth, layout.cssHeight, layout.scaleX]).toEqual([1920, 1080, 1]);
    });

    it('changes only the size on screen, not the buffer', () => {
        withPage();
        const canvas = placedCanvas({ width: 1920, height: 1080 });
        fitCanvas(canvas, { width: 256, height: 224, scaling: 'integer', pixelAspect: SNES });
        expect([canvas.width, canvas.height]).toEqual([256, 224]);
        expect([canvas.style.width, canvas.style.height]).toEqual(['1170px', '896px']);
        // Said as a ratio too, so a page's `height: auto` keeps the shape rather than the buffer's.
        expect(canvas.style.aspectRatio).toBe('1170 / 896');
    });
});

describe('a game with wider pixels', () => {
    const snes = () => {
        withPage();
        const canvas = placedCanvas({ width: 1920, height: 1080 });
        fitCanvas(canvas, { width: 256, height: 224, scaling: 'integer', pixelAspect: SNES });
        return { canvas, ...createTestGame({ width: 256, height: 224, pixelAspect: SNES }, canvas) };
    };

    it('reads the pointer in game pixels, each axis by its own', () => {
        const { store, canvas } = snes();
        const seen: TPointerInfo[] = [];
        startTestScene(store, 'Level', () => {
            usePointer().onDown((info) => { seen.push(info); });
            return createScene();
        });

        // Halfway across and halfway down the painted picture is halfway across and down the game.
        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 585, clientY: 448, button: 0, pointerId: 1 }));
        store.get('input').pointer.dispatch(store);

        expect(seen[0]!.screenX).toBeCloseTo(128, 6);
        expect(seen[0]!.screenY).toBeCloseTo(112, 6);
    });

    it('is changed while the game runs, refitting the canvas and moving nothing', () => {
        const { store } = snes();
        const asked: number[] = [];
        store.setState('screen', { setPixelAspect: (aspect) => asked.push(aspect) });
        const game = createGameHandle(store);

        expect(game.getPixelAspect()).toBe(SNES);
        game.setPixelAspect(1);
        expect(game.getPixelAspect()).toBe(1);
        expect(asked).toEqual([1]);
        expect([game.getWidth(), game.getHeight()]).toEqual([256, 224]);
        expect(() => game.setPixelAspect(0)).toThrow(/setPixelAspect/);
        expect(game.getPixelAspect()).toBe(1);
    });
});

describe('RENDER.CONSOLE_SCREENS', () => {
    it('has each console\'s screen, spread into createGame as it is', () => {
        expect(Object.keys(RENDER.CONSOLE_SCREENS)).toEqual(['nes', 'snes', 'genesis', 'gameBoy', 'gba', 'ps1', 'n64']);
        const options = cleanGameOptions({ ...RENDER.CONSOLE_SCREENS.snes });
        expect([options.width, options.height, options.pixelAspect, options.step]).toEqual([256, 224, SNES, 60]);
        expect(RENDER.CONSOLE_SCREENS.genesis.pixelAspect).toBe(32 / 35);
        expect(RENDER.CONSOLE_SCREENS.gameBoy).toEqual({ width: 160, height: 144, pixelAspect: 1, step: 60 });
    });

    it('lets what comes after it win', () => {
        const options = cleanGameOptions({ ...RENDER.CONSOLE_SCREENS.nes, pixelAspect: 1 });
        expect(options.pixelAspect).toBe(1);
    });

    it('cannot be changed by a game that took one', () => {
        expect(Object.isFrozen(RENDER.CONSOLE_SCREENS.snes)).toBe(true);
    });
});

describe('pixelAspect in project.json', () => {
    it('is read when it is a number above 0, and left out otherwise', () => {
        expect(parseProject({ pixelAspect: SNES }).pixelAspect).toBe(SNES);
        expect(parseProject({}).pixelAspect).toBeUndefined();
        expect(parseProject({ pixelAspect: -2 }).pixelAspect).toBeUndefined();
        expect(gameOptionsFromProject(parseProject({ pixelAspect: SNES })).pixelAspect).toBe(SNES);
        expect('pixelAspect' in gameOptionsFromProject(parseProject({}))).toBe(false);
    });
});
