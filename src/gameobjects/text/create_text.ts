import { getColor } from '../../color';
import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { createRecord } from '../create_record';
import { listen } from '../../events/listen';
import { defaultFontOf } from './default_font';
import type { TText } from './types/t_text';
import type { TTextOptions } from './types/t_text_options';

/**
 * Writes something on screen with a bitmap font: a score, a title, a menu, "PRESS START".
 *
 * You get the text back and change it by changing its fields: `score.text = 'SCORE ' + points`
 * shows on the next frame. It draws nothing until its font has loaded, and appears on its own then.
 *
 * The font is optional: left out, the text uses the one the engine carries (Nacatamal Arcade, 8 px,
 * with lowercase, accents and ñ), which is there from the start. Pass `font` from `useLoadFont` for
 * a font of your own.
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
 *     const font = useLoadFont({ json: '/fonts/arcade/arcade.json', atlas: '/fonts/arcade/arcade.png' });
 *     createText({ text: 'HI SCORE', font, transform: { x: 8, y: 28 } });
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
        font: options.font ?? defaultFontOf(store, box),
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
