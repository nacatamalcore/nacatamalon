import type { TCanvasScaling } from './types/t_canvas_scaling';

/**
 * The browser's full-screen API, under the names Safari used before it had the standard ones (an
 * iPad on Safari 16.3 or older still only answers to the prefixed ones).
 */
type TPrefixedElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type TPrefixedDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
};

const fullscreenElement = (): Element | null =>
    document.fullscreenElement ?? (document as TPrefixedDocument).webkitFullscreenElement ?? null;

/**
 * The inline styles taken over while full screen, so leaving puts back exactly what was there.
 */
const BORROWED = ['background', 'display', 'alignItems', 'justifyContent'] as const;

/**
 * Full screen for one canvas: what the game handle's `enterFullscreen` and `exitFullscreen` reach.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCanvasFullscreen = {
    /**
     * Asks the browser for full screen. `false` when it cannot or will not (see `enterFullscreen`).
     */
    enter(background: string): Promise<boolean>;
    exit(): Promise<void>;
    isActive(): boolean;
    /**
     * Lets go of the page: a game being destroyed while full screen leaves it first.
     */
    destroy(): void;
};

/**
 * Puts the canvas's **container** on the whole screen, not the canvas itself.
 *
 * A canvas made full screen is stretched by the browser's own stylesheet, smoothly and with no say
 * in how. The container is the box the engine already measures to fit the canvas, so making it
 * full screen and switching the scaling is enough: the same fit that sizes the game inside a page
 * sizes it on the whole monitor, `'integer'` and its bars included. The container is centred in both
 * directions while it lasts, and painted in the game's background so the bars are the game's colour
 * and not the browser's black.
 *
 * `setOverride` is how it changes the scaling without touching the game's own options: a game made
 * full screen and back has the options it had before, whatever they were.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createCanvasFullscreen = (
    canvas: HTMLCanvasElement,
    scaling: () => TCanvasScaling,
    setOverride: (scaling: TCanvasScaling | null) => void,
): TCanvasFullscreen => {
    // With no container of its own the canvas lives in `<body>`, and the whole document goes full
    // screen: `fitCanvas` measures the window in that case, which is then the screen.
    const container = (): TPrefixedElement => {
        const parent = canvas.parentElement;
        return (parent === null || parent === document.body ? document.documentElement : parent) as TPrefixedElement;
    };

    let saved: Record<(typeof BORROWED)[number], string> | null = null;
    let active: TPrefixedElement | null = null;

    const restore = (): void => {
        if (active === null) return;
        if (saved !== null) {
            for (const key of BORROWED) active.style[key] = saved[key];
        }
        saved = null;
        active = null;
        setOverride(null);
    };

    // The only reliable signal for leaving: Esc, the browser's own button and a tab switch never go
    // through `exit`, they just end it.
    const onChange = (): void => {
        if (active !== null && fullscreenElement() !== active) restore();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);

    const request = (element: TPrefixedElement): Promise<void> | void | null => {
        if (typeof element.requestFullscreen === 'function') return element.requestFullscreen();
        if (typeof element.webkitRequestFullscreen === 'function') return element.webkitRequestFullscreen();
        return null;
    };

    return {
        enter: async (background) => {
            if (active !== null) return true;
            const element = container();

            saved = { background: '', display: '', alignItems: '', justifyContent: '' };
            for (const key of BORROWED) saved[key] = element.style[key];
            element.style.background = background;
            element.style.display = 'flex';
            element.style.alignItems = 'center';
            element.style.justifyContent = 'center';
            active = element;
            setOverride(scaling());

            try {
                const asked = request(element);
                // No API at all: an iPhone, where only a video may go full screen.
                if (asked === null) throw new Error('unsupported');
                await asked;
                return true;
            } catch {
                // Refused (no gesture, an iframe without permission) or unsupported: the page is
                // put back as it was and the answer is `false`, never an exception in the game.
                restore();
                return false;
            }
        },
        exit: async () => {
            if (active === null) return;
            const doc = document as TPrefixedDocument;
            try {
                if (typeof document.exitFullscreen === 'function' && document.fullscreenElement) await document.exitFullscreen();
                else if (typeof doc.webkitExitFullscreen === 'function') await doc.webkitExitFullscreen();
            } finally {
                restore();
            }
        },
        isActive: () => active !== null && fullscreenElement() === active,
        destroy: () => {
            document.removeEventListener('fullscreenchange', onChange);
            document.removeEventListener('webkitfullscreenchange', onChange);
            if (active !== null && fullscreenElement() === active) {
                void (document.exitFullscreen?.() ?? (document as TPrefixedDocument).webkitExitFullscreen?.());
            }
            restore();
        },
    };
};
