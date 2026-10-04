import { afterEach, describe, expect, it } from 'bun:test';
import { createCanvasFullscreen } from '../src/DOM/fullscreen';
import type { TCanvasScaling } from '../src/DOM';

/**
 * Full screen without a browser: a page whose `fullscreenElement` the test moves by hand, and a
 * container that either grants the request, refuses it, or has no API at all (an iPhone).
 */
type TPage = EventTarget & { body: object; documentElement: object; fullscreenElement: object | null; exitFullscreen: () => Promise<void> };

const page = (): TPage => {
    const doc = Object.assign(new EventTarget(), {
        body: {},
        documentElement: {},
        fullscreenElement: null as object | null,
        exitFullscreen: async () => {
            doc.fullscreenElement = null;
            doc.dispatchEvent(new Event('fullscreenchange'));
        },
    });
    (globalThis as Record<string, unknown>).document = doc;
    return doc;
};

afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
});

const container = (doc: TPage, answer: 'grant' | 'refuse' | 'none') => {
    const element: Record<string, unknown> = { style: { background: 'red', display: 'block', alignItems: '', justifyContent: '' } };
    if (answer === 'grant') {
        element.requestFullscreen = async () => {
            doc.fullscreenElement = element;
            doc.dispatchEvent(new Event('fullscreenchange'));
        };
    } else if (answer === 'refuse') {
        element.requestFullscreen = async () => { throw new Error('no gesture'); };
    }
    return element;
};

const setup = (answer: 'grant' | 'refuse' | 'none') => {
    const doc = page();
    const parent = container(doc, answer);
    const canvas = { parentElement: parent } as unknown as HTMLCanvasElement;
    const overrides: (TCanvasScaling | null)[] = [];
    const fullscreen = createCanvasFullscreen(canvas, () => 'integer', (next) => overrides.push(next));
    return { doc, parent: parent as { style: Record<string, string> }, fullscreen, overrides };
};

describe('full screen', () => {
    it('fills the screen with the full-screen scaling, centred, in the game colour', async () => {
        const { parent, fullscreen, overrides } = setup('grant');

        expect(await fullscreen.enter('rgba(0, 0, 0, 1)')).toBe(true);
        expect(fullscreen.isActive()).toBe(true);
        expect(overrides).toEqual(['integer']);
        expect(parent.style).toMatchObject({ background: 'rgba(0, 0, 0, 1)', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    });

    it('puts everything back when the player leaves with Esc, which never goes through exit', async () => {
        const { doc, parent, fullscreen, overrides } = setup('grant');
        await fullscreen.enter('black');

        doc.fullscreenElement = null;
        doc.dispatchEvent(new Event('fullscreenchange'));

        expect(fullscreen.isActive()).toBe(false);
        expect(overrides).toEqual(['integer', null]);
        // The host's own inline styles, exactly as they were.
        expect(parent.style).toMatchObject({ background: 'red', display: 'block', alignItems: '', justifyContent: '' });
    });

    it('puts everything back on exit', async () => {
        const { parent, fullscreen, overrides } = setup('grant');
        await fullscreen.enter('black');
        await fullscreen.exit();

        expect(fullscreen.isActive()).toBe(false);
        expect(overrides.at(-1)).toBeNull();
        expect(parent.style.background).toBe('red');
    });

    it('answers false and changes nothing when the browser refuses', async () => {
        const { parent, fullscreen, overrides } = setup('refuse');

        expect(await fullscreen.enter('black')).toBe(false);
        expect(fullscreen.isActive()).toBe(false);
        expect(overrides).toEqual(['integer', null]);
        expect(parent.style).toMatchObject({ background: 'red', display: 'block' });
    });

    it('answers false where there is no full screen to have, as on an iPhone', async () => {
        const { fullscreen } = setup('none');

        expect(await fullscreen.enter('black')).toBe(false);
        expect(fullscreen.isActive()).toBe(false);
    });

    it('asking twice while full screen is one request, not two', async () => {
        const { fullscreen, overrides } = setup('grant');
        await fullscreen.enter('black');

        expect(await fullscreen.enter('black')).toBe(true);
        expect(overrides).toEqual(['integer']);
    });
});
