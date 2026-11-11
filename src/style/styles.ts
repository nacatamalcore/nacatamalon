import { COLOR_LEVELS } from '../post/builtin/color_levels';
import { CONSOLE_SCREENS } from '../game/console_screens';
import type { TRenderStyle } from './t_render_style';

/**
 * A console's screen as a style takes it: its resolution and the shape of its pixels.
 */
const screenOf = (name: keyof typeof CONSOLE_SCREENS): Pick<TRenderStyle, 'width' | 'height' | 'pixelAspect'> => {
    const { width, height, pixelAspect } = CONSOLE_SCREENS[name];
    return { width, height, pixelAspect };
};

/**
 * The NES: 256 x 224 in pixels a little wider than tall, and every colour the nearest of the
 * fifty-four it had. Its pictures read pixel by pixel.
 */
const nes: TRenderStyle = {
    post: [{ builtin: 'paletteMatch', palette: 'nacatamalon:nes', uniforms: { dither: 0.04 } }],
    ...screenOf('nes'),
    smooth: false,
};

/**
 * The Super Nintendo: the NES's screen, and colours of five bits a channel, dithered down to them.
 */
const snes: TRenderStyle = {
    post: [{ builtin: 'dither', uniforms: { levels: COLOR_LEVELS.snes, amount: 1 } }],
    ...screenOf('snes'),
    smooth: false,
};

/**
 * The Mega Drive (Genesis): 320 x 224 in pixels a little taller than wide, and its three bits a
 * channel, the 512 colours whose dither is half its look.
 */
const genesis: TRenderStyle = {
    post: [{ builtin: 'dither', uniforms: { levels: COLOR_LEVELS.genesis, amount: 1 } }],
    ...screenOf('genesis'),
    smooth: false,
};

/**
 * The Game Boy: 160 x 144 in its four greens.
 */
const gameBoy: TRenderStyle = {
    post: [{ builtin: 'paletteMatch', palette: 'nacatamalon:gameBoy', uniforms: { dither: 0.08 } }],
    ...screenOf('gameBoy'),
    smooth: false,
};

/**
 * The Game Boy Advance: 240 x 160, and five bits a channel.
 */
const gba: TRenderStyle = {
    post: [{ builtin: 'dither', uniforms: { levels: COLOR_LEVELS.snes, amount: 1 } }],
    ...screenOf('gba'),
    smooth: false,
};

/**
 * The computer graphics of the era: every material lit at every pixel, for round, sliding shines,
 * and a soft bloom over what is brightest, at 640 x 480 and smooth, the size a renderer drew at. With
 * `useStudio()` and the material recipes (`plastic()`, `chrome()`) it is the glossy studio look.
 */
const cgi: TRenderStyle = {
    perPixel: true,
    post: [{ builtin: 'bloom', uniforms: { threshold: 0.8, intensity: 0.5, radius: 6 } }],
    width: 640,
    height: 480,
    smooth: true,
};

/**
 * The PlayStation: pictures that swim (`affine`), corners that shiver on a grid of 120 rows
 * (`vertexSnap`), and its colours dithered down to what it could show, at 320 x 240 with its pictures
 * read pixel by pixel, as it had nothing to smooth them.
 */
const ps1: TRenderStyle = {
    affine: true,
    vertexSnap: 120,
    post: [{ builtin: 'dither', uniforms: { levels: COLOR_LEVELS.ps1, amount: 1 } }],
    ...screenOf('ps1'),
    smooth: false,
};

/**
 * The Saturn: 320 x 224, its pictures pixel by pixel and stretched across its shapes without
 * correcting for depth, as it drew them, its corners still, and fifteen-bit colour.
 */
const saturn: TRenderStyle = {
    affine: true,
    post: [{ builtin: 'dither', uniforms: { levels: COLOR_LEVELS.saturn, amount: 1 } }],
    width: 320,
    height: 224,
    pixelAspect: 1,
    smooth: false,
};

/**
 * The Nintendo 64: its pictures read smoothly, the blur it is remembered by, held true to their
 * surfaces and its corners still, at 320 x 240. Its colours dithered to its sixteen-bit frame, then
 * softened a little as the console softened them on the way out. The screen itself is scaled up by
 * whole pixels (`smoothScaling: false`): the blur is the console's, not the page's.
 */
const n64: TRenderStyle = {
    post: [
        { builtin: 'dither', uniforms: { levels: COLOR_LEVELS.n64, amount: 1 } },
        { builtin: 'blur', uniforms: { radius: 1, amount: 0.35 } },
    ],
    ...screenOf('n64'),
    smooth: true,
    smoothScaling: false,
};

/**
 * The Dreamcast: 640 x 480, its pictures smooth and its screen sharp, as its cable to a monitor
 * showed it, and its sixteen-bit frame dithered lightly.
 */
const dreamcast: TRenderStyle = {
    post: [{ builtin: 'dither', uniforms: { levels: COLOR_LEVELS.dreamcast, amount: 0.5 } }],
    width: 640,
    height: 480,
    pixelAspect: 1,
    smooth: true,
    smoothScaling: false,
};

/**
 * The engine's own styles, for `createGame({ style })` and `useRenderStyle`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const RENDER_STYLES = { nes, snes, genesis, gameBoy, gba, ps1, saturn, n64, dreamcast, cgi } as const;
