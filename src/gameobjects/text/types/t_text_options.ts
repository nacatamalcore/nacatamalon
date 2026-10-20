import type { T2dOptions } from '../../types/t_2d_options';
import type { TBitmapFont, TFont } from '../../../loaders';
import type { TTextStyle } from './t_text_style';

/**
 * What `createText` is asked for.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTextOptions = T2dOptions & {
    /**
     * What it says. `\n` starts a new line.
     */
    text: string;
    /**
     * A font from `useLoadFont` (a `.ttf` or `.woff`, sharp at any size) or `useLoadBitmapFont` (a
     * picture of the letters, crisp at whole multiples of its height), or the key it was loaded under
     * in this scene or any earlier one: one scene loads the game's fonts and the others name them,
     * `font: 'title'`. A key nothing was loaded under throws, naming it. Left out, the engine's own: Nacatamal Arcade, an 8 px arcade font
     * with lowercase, accents and the Spanish ñ, ¿ and ¡, carried inside the engine so nothing has to
     * be loaded. `'nacatamalon:square'` and `'nacatamalon:thin'` name the other two it carries.
     */
    font?: TBitmapFont | TFont | string;
    /**
     * Size, alignment and spacing. Kept as given, not copied: pass the same object to several texts
     * and changing it changes all of them. For one text of its own, spread it: `{ ...heading, fontSize: 24 }`.
     */
    style?: TTextStyle;
};

