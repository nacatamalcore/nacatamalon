import { computeCanvasLayout } from './canvas_layout';
import { rememberScreenSize, resolvePixelRatio } from './screen_size';
import type { TCanvasOptions } from './types/t_canvas_options';
import type { TCanvasAlign } from './types/t_canvas_align';
import { windowOf } from './window_of';

/**
 * Measures the space the canvas lives in. `<body>` does not count: an unstyled one is as
 * tall as its content, which by now is the canvas, so it would scale against itself.
 */
const measure = (canvas: HTMLCanvasElement): { width: number; height: number } => {
    const parent = canvas.parentElement;
    const view = windowOf(canvas);
    const container = parent === view.document.body ? null : parent;
    if (!container) {
        return { width: view.innerWidth, height: view.innerHeight };
    }
    // Without the canvas in it, for the same reason as `<body>`: a container with no size of its own
    // (a bare `<div id="app">`, or one a centring page shrinks round what it holds) is as big as the
    // canvas, and measured with it the game was scaled against itself, smaller every time, down to a
    // corner of the page. Measured empty, it says it has no room, and the game keeps its own size.
    const shown = canvas.style.display;
    canvas.style.display = 'none';
    // Inside its padding: `clientWidth` counts it, and a container with 40 px of it round the game
    // had the canvas sized and centred for room it does not have, past its edge.
    const style = typeof view.getComputedStyle === 'function' ? view.getComputedStyle(container) : null;
    const padding = (side: 'Left' | 'Right' | 'Top' | 'Bottom'): number => parseFloat(style?.[`padding${side}`] ?? '') || 0;
    const room = {
        width: Math.max(0, container.clientWidth - padding('Left') - padding('Right')),
        height: Math.max(0, container.clientHeight - padding('Top') - padding('Bottom')),
    };
    canvas.style.display = shown;
    return room;
};

/** Where along one side of its space the canvas goes. */
type TPlace = 'start' | 'center' | 'end';

/** What a flexbox's `justify-content` puts a single canvas at. Spaced out, one thing is centred. */
const fromJustify = (value: string): TPlace =>
    value === 'center' || value === 'space-around' || value === 'space-evenly' ? 'center'
        : value === 'flex-end' || value === 'end' || value === 'right' ? 'end' : 'start';

/** What `align-items` or a grid's `justify-items` put it at. Stretched, a sized canvas starts. */
const fromAlign = (value: string): TPlace =>
    value === 'center' ? 'center' : value === 'flex-end' || value === 'end' || value === 'self-end' || value === 'right' ? 'end' : 'start';

const flip = (place: TPlace): TPlace => (place === 'start' ? 'end' : place === 'end' ? 'start' : place);

/** Where an `align` puts it: a side is that edge and the middle of the other, a corner both edges. */
const fromCanvasAlign = (align: TCanvasAlign): { x: TPlace; y: TPlace } => ({
    x: align.endsWith('left') ? 'start' : align.endsWith('right') ? 'end' : 'center',
    y: align.startsWith('top') ? 'start' : align.startsWith('bottom') ? 'end' : 'center',
});

/**
 * Where the page asks for the canvas, across and down. A container that lays its content out itself,
 * a flexbox or a grid, has said where: its own `justify-content` and `align-items` (a grid's
 * `justify-items`), so a page that wants the game in a corner has it there. Any other container has
 * said nothing, and the game is centred: what a game wants, and what full screen does.
 */
const placeAsked = (container: HTMLElement | null, view: Window): { x: TPlace; y: TPlace; laysOut: boolean } => {
    const style = container !== null && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(container) : null;
    const display = style?.display ?? '';
    if (style === null || (!display.endsWith('flex') && !display.endsWith('grid'))) {
        return { x: 'center', y: 'center', laysOut: false };
    }
    if (display.endsWith('grid')) {
        return { x: fromAlign(style.justifyItems), y: fromAlign(style.alignItems), laysOut: true };
    }
    const direction = style.flexDirection;
    const main = direction.endsWith('reverse') ? flip(fromJustify(style.justifyContent)) : fromJustify(style.justifyContent);
    const cross = fromAlign(style.alignItems);
    return direction.startsWith('column') ? { x: cross, y: main, laysOut: true } : { x: main, y: cross, laysOut: true };
};

/**
 * The smallest margin, in CSS pixels, that starts the canvas on a whole pixel of the screen as the
 * browser lays it out: a whole number of the screen's pixels, and a whole number of the 1/64 of a CSS
 * pixel the browser places things in. A margin that is only the first (46.4 at a density of 1.25,
 * 58 of the screen's) is laid out at 46.40625, a hair past the pixel, and Chromium painted a third
 * of the columns a pixel narrower or wider. 1 at a density of 1, 4 at 1.25, 2 at 1.5, half at 2.
 */
const centringStep = (density: number): number => {
    for (let pixels = 1; pixels <= 64; pixels++) {
        const units = pixels * 64 / density;
        if (Math.abs(units - Math.round(units)) < 1e-6) return pixels / density;
    }
    return 1;
};

/**
 * Applies `options` to the canvas: buffer, CSS size, filtering and its place: where the page asks,
 * when it lays its content out itself, and centred both ways when it does not.
 *
 * The layout is worked out in game pixels, and `pixelRatio` only multiplies the drawing buffer at
 * the end: the CSS size, `scaling` and `keep` do not know it exists. The screen's density is
 * another thing: `integer` counts its whole multiple in the screen's pixels. The game's size is
 * remembered beside the canvas (`screenSizeOf`), because the buffer is no longer it.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fitCanvas = (canvas: HTMLCanvasElement, options: TCanvasOptions): void => {
    const view = windowOf(canvas);
    const measured = measure(canvas);
    // A side the container measures nothing along has no size of its own (a bare `<div id="app">`
    // is as wide as the page and as tall as what is in it): the game takes its own size along it,
    // never shrunk to nothing, which it could not grow back from once its container was as big as it.
    const width = measured.width > 0 ? measured.width : options.width;
    const height = measured.height > 0 ? measured.height : options.height;
    const layout = computeCanvasLayout(
        options.width,
        options.height,
        width,
        height,
        options.scaling ?? 'none',
        options.keep ?? 'both',
        resolvePixelRatio('device', view),
        options.pixelAspect ?? 1,
    );

    const pixelRatio = resolvePixelRatio(options.pixelRatio, view);
    const bufferWidth = Math.max(1, Math.round(layout.bufferWidth * pixelRatio));
    const bufferHeight = Math.max(1, Math.round(layout.bufferHeight * pixelRatio));
    rememberScreenSize(canvas, { width: layout.bufferWidth, height: layout.bufferHeight, pixelRatio });

    // Assigning `canvas.width` CLEARS the buffer even when the value is unchanged, so an
    // observer firing every frame would blank the game. Only write when it actually moved.
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;

    canvas.style.display = 'block';
    // Centred by hand: `margin: auto` put it half the leftover in, and with the leftover odd that is
    // part of one of the screen's pixels (46.5 CSS pixels at a density of 1.5 is 69.75 of the
    // screen's), where a game pixel 6 of them wide was painted 5 in some columns and 7 in others,
    // whole multiple and all. See `centringStep` for what it is rounded to.
    //
    // Where it goes is the game's when it says (`align`), the page's when the page says
    // (`placeAsked`), and the middle when neither does.
    // The far sides are `auto`, and that is what lets it sit right in any page. In a plain one they
    // are simply the rest. In one that places it too (`display: flex` with the content centred: the
    // templates, the playgrounds, full screen), an `auto` margin takes the leftover before the page
    // places anything, so there is nothing left for it to add. A margin on the near side alone was
    // centred again by the page: half the leftover more to the right, 80 px on a wide monitor.
    const step = centringStep(resolvePixelRatio('device', view));
    const asked = placeAsked(canvas.parentElement === view.document.body ? null : canvas.parentElement, view);
    const place = options.align === undefined ? asked : { ...fromCanvasAlign(options.align), laysOut: asked.laysOut };
    const near = (leftover: number, at: TPlace): number =>
        leftover <= 0 || at === 'start' ? 0 : Math.floor((at === 'center' ? leftover / 2 : leftover) / step) * step;
    const left = near(width - layout.cssWidth, place.x);
    const top = near(height - layout.cssHeight, place.y);
    if (place.laysOut) {
        canvas.style.margin = `${top}px auto auto ${left}px`;
        canvas.style.position = '';
        canvas.style.top = '';
    } else {
        // Down by `top` rather than a margin on top: in a plain container a first child's top margin
        // goes out through it (margins collapse) and moved the whole container down, the page with it.
        canvas.style.margin = `0px auto 0px ${left}px`;
        canvas.style.position = top > 0 ? 'relative' : '';
        canvas.style.top = top > 0 ? `${top}px` : '';
    }
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;
    // The shape it is painted at, written out too: a page that sets `height: auto` on a canvas, as
    // many style sheets do so it shrinks with its width, would otherwise take the buffer's shape and
    // undo a `pixelAspect` (8:7 drawn 1.143 instead of 1.306). With the ratio said, `auto` follows it.
    canvas.style.aspectRatio = `${layout.cssWidth} / ${layout.cssHeight}`;
    canvas.style.imageRendering = options.smooth ? 'auto' : 'pixelated';
};
