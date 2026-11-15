import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TNineSlice } from '../../gameobjects/nine_slice/types/t_nine_slice';
import type { TShapes } from '../../gameobjects/shapes/types/t_shapes';

/**
 * What the pointer can find under it: a sprite, a text, a nine-slice, or a set of shapes
 * (`createShapes`), each as one whole thing.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerPicture = TSprite | TText | TNineSlice | TShapes;
