import { getColor } from '../../color';
import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { createRecord } from '../create_record';
import { listen } from '../../events/listen';
import { defaultFontOf } from './default_font';
import type { TBitmapFont, TFont } from '../../loaders';
import type { TRuntimeStore } from '../../store';
import type { TText } from './types/t_text';
import type { TTextOptions } from './types/t_text_options';

/**
 * Finds a font by the key it was loaded under, in this game's cache of either kind. A key that is not
 * there throws, as it does for a sprite: a key is always a deliberate reference, and a text silently
 * falling back to another font would hide the typo.
 */
const fontByKey = (store: TRuntimeStore, key: string): TBitmapFont | TFont => {
    const assets = store.get('assets');
    const found = assets.fonts.get(key) ?? assets.bitmapFonts.get(key);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] createText: no font loaded under key '${key}'. ` +
            `Did you forget useLoadFont({ src, key: '${key}' }) in an earlier scene?`,
        );
    }
    return found;
};

/**
 * Writes something on screen with a bitmap font: a score, a title, a menu, "PRESS START".
 *
 * You get the text back and change it by changing its fields: `score.text = 'SCORE ' + points`
 * shows on the next frame. It draws nothing until its font has loaded, and appears on its own then.
 *
 * The font is optional: left out, the text uses the one the engine carries (Nacatamal Arcade, 8 px,
 * with lowercase, accents and ñ), which is there from the start. Pass `font` from `useLoadFont` (a
 * `.ttf` or `.woff`) or `useLoadBitmapFont` for a font of your own, or the key one was loaded under,
 * by this scene or an earlier one: a loading scene can load every font once and the rest of the
 * game name them, `font: 'title'`.
 *
 * - `style.fontSize` is how tall a line is, in pixels. A pixel font looks crisp at whole multiples of
 *   its own height and uneven in between; the console says so if that happens.
 * - `\n` starts a new line, and `style.align` lines them up.
 * - `x` and `y` are the top-left corner of the text unless `anchor` says otherwise: `{ x: 0.5, y: 0 }`
 *   centres a title on `x`.
 * - A lowercase letter the font does not have is drawn as its capital, since most arcade fonts only
 *   have capitals.
 *
 * It moves with the camera and obeys `zIndex` and `useScreenSpace` like a sprite, and takes the same
 * pointer events (`onClick`, `onPointerOver`...), which fire anywhere inside the block.
 *
 * @param options What it says, how it looks, and optionally with which font.
 * @returns The text. Change its fields and the screen follows.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     // No font given: the engine's own.
 *     const score = createText({ text: 'SCORE 0', style: { fontSize: 16 }, transform: { x: 8, y: 8 } });
 *     // A font of your own, loaded from its two files.
 *     const font = useLoadBitmapFont({ json: '/fonts/arcade/arcade.json', atlas: '/fonts/arcade/arcade.png' });
 *     createText({ text: 'HI SCORE', font, transform: { x: 8, y: 28 } });
 *     // A font an earlier scene loaded with useLoadFont({ src, key: 'title' }), by its key alone.
 *     createText({ text: 'LEVEL 1', font: 'title', transform: { x: 8, y: 48 } });
 *     let points = 0;
 *
 *     useUpdate(() => {
 *         points += 1;
 *         score.text = 'SCORE ' + points;
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createText = (options: TTextOptions): TText => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (!box || !store) {
        throw new Error('[NacatamalOn] createText: call it inside a scene body, or inside something created with useSpawn.');
    }

    const text = createRecord('text', {
        text: options.text,
        // Given none, the engine's own, so a text shows without a font to load first.
        font: options.font === undefined
            ? defaultFontOf(store, box)
            : typeof options.font === 'string' ? fontByKey(store, options.font) : options.font,
        // As given, not copied: a shared style is shared on purpose.
        style: options.style ?? {},
        tint: options.tint ?? getColor('white'),
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...options.transform },
        anchor: options.anchor,
        zIndex: options.zIndex,
        smooth: options.smooth,
        visible: options.visible,
        material: options.material,
        uniforms: options.uniforms,
        destroyed: false,
    });

    box.drawables.push(text);
    trackDrawableOwner(text, box, store);

    // Its events stay out of the record, as a sprite's do.
    listen(text, options);

    return text;
};
