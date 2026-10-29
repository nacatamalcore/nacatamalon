import { afterEach, describe, expect, it } from 'bun:test';
import { fitCanvas } from '../src/DOM/fit_canvas';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { parseProject } from '../src/project/parse_project';
import { gameOptionsFromProject } from '../src/project/game_options_from_project';
import { RENDER } from '../src/CONST';
import type { TCanvasAlign } from '../src/DOM/types/t_canvas_align';

/**
 * Where the canvas sits in the page: where the page asks when it lays its content out itself (a
 * flexbox or a grid), centred both ways when it does not, inside the container's padding, and never
 * shrunk by a container that has no size of its own.
 *
 * A 160 × 120 game at `'integer'` in 733 × 517 is 4× (640 × 480), with 93 across and 37 down left.
 */

type TFakeStyle = Partial<Record<'display' | 'justifyContent' | 'alignItems' | 'justifyItems' | 'flexDirection' | 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom', string>>;

afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).devicePixelRatio;
    delete (globalThis as Record<string, unknown>).getComputedStyle;
});

const fit = (page: TFakeStyle, space = { width: 733, height: 517 }, align?: TCanvasAlign) => {
    (globalThis as Record<string, unknown>).document = { body: {} };
    (globalThis as Record<string, unknown>).devicePixelRatio = 1;
    const parent = { clientWidth: space.width, clientHeight: space.height };
    (globalThis as Record<string, unknown>).getComputedStyle = () => ({
        display: 'block', justifyContent: 'normal', alignItems: 'normal', justifyItems: 'normal', flexDirection: 'row',
        paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px',
        ...page,
    });
    const style = {} as CSSStyleDeclaration;
    const canvas = { width: 300, height: 150, style, parentElement: parent } as unknown as HTMLCanvasElement;
    fitCanvas(canvas, { width: 160, height: 120, scaling: 'integer', align });
    return { margin: style.margin, top: style.top, size: [style.width, style.height] };
};

describe('where the canvas sits', () => {
    it('is centred both ways in a page that says nothing', () => {
        // Down by `top`, not a margin: in a plain container the first child's top margin would go out
        // through it and move the whole container down instead.
        expect(fit({})).toMatchObject({ margin: '0px auto 0px 46px', top: '18px' });
    });

    it('is centred the same in a page that centres it itself, with flex or with grid', () => {
        expect(fit({ display: 'flex', justifyContent: 'center', alignItems: 'center' }).margin).toBe('18px auto auto 46px');
        expect(fit({ display: 'grid', justifyItems: 'center', alignItems: 'center' }).margin).toBe('18px auto auto 46px');
    });

    it('goes where the page asks: a corner, the far side, a column', () => {
        expect(fit({ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start' }).margin).toBe('0px auto auto 0px');
        // A flexbox says nothing: it starts its content at the start.
        expect(fit({ display: 'flex' }).margin).toBe('0px auto auto 0px');
        expect(fit({ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }).margin).toBe('37px auto auto 93px');
        // In a column, justify-content is up and down and align-items across.
        expect(fit({ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }).margin).toBe('37px auto auto 46px');
        // Reversed, the start is the other end.
        expect(fit({ display: 'flex', flexDirection: 'row-reverse', justifyContent: 'flex-start', alignItems: 'flex-start' }).margin).toBe('0px auto auto 93px');
    });

    it('fits inside the container\'s padding, and is centred in it', () => {
        // 733 less 2 × 60 is 613 across: 3× (480 × 360) rather than 4×, which would have run past it.
        const { margin, size } = fit({ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingLeft: '60px', paddingRight: '60px', paddingTop: '60px', paddingBottom: '60px' });
        expect(size).toEqual(['480px', '360px']);
        expect(margin).toBe('18px auto auto 66px');
    });

    it('keeps its own size where the container has none, instead of shrinking', () => {
        // A bare <div id="app">: as wide as the page, and nothing tall until the game is in it.
        expect(fit({}, { width: 733, height: 0 }).size).toEqual(['160px', '120px']);
        expect(fit({}, { width: 733, height: 0 })).toMatchObject({ margin: '0px auto 0px 286px', top: '' });
        // No size either way: its own.
        expect(fit({}, { width: 0, height: 0 }).size).toEqual(['160px', '120px']);
    });

    it('goes where the game says with align, over what the page asks', () => {
        const corner = { display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start' };
        expect(fit(corner, undefined, 'center').margin).toBe('18px auto auto 46px');
        expect(fit(corner, undefined, RENDER.ALIGN.BOTTOM_RIGHT).margin).toBe('37px auto auto 93px');
        // A side: that edge, and the middle of the other.
        expect(fit(corner, undefined, RENDER.ALIGN.TOP).margin).toBe('0px auto auto 46px');
        expect(fit(corner, undefined, RENDER.ALIGN.RIGHT).margin).toBe('18px auto auto 93px');
        // In a plain container too, the way down still a `top`.
        expect(fit({}, undefined, RENDER.ALIGN.BOTTOM)).toMatchObject({ margin: '0px auto 0px 46px', top: '37px' });
        expect(fit({}, undefined, RENDER.ALIGN.TOP_LEFT)).toMatchObject({ margin: '0px auto 0px 0px', top: '' });
    });

    it('never changes the game\'s size, only where what is left over goes', () => {
        for (const align of Object.values(RENDER.ALIGN)) {
            expect(fit({}, undefined, align).size).toEqual(['640px', '480px']);
        }
    });
});

describe('the align option', () => {
    it('is left out unless the game says, and refuses a name it does not know', () => {
        expect(cleanGameOptions({ width: 160, height: 120 }).align).toBeUndefined();
        expect(cleanGameOptions({ width: 160, height: 120, align: 'top' }).align).toBe('top');
        expect(() => cleanGameOptions({ width: 160, height: 120, align: 'middle' as never })).toThrow(/align must be 'center', 'top'/);
    });

    it('is read from project.json when it is one of the names', () => {
        expect(parseProject({ align: 'bottom-left' }).align).toBe('bottom-left');
        expect(parseProject({ align: 'middle' }).align).toBeUndefined();
        expect(gameOptionsFromProject(parseProject({ align: 'top' })).align).toBe('top');
        expect('align' in gameOptionsFromProject(parseProject({}))).toBe(false);
    });
});
