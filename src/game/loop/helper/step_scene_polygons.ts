import { uploadPolygon } from '../../../gameobjects/polygon/polygon_state';
import type { IRenderer } from '../../../render';
import type { TDrawTexture } from '../../../render/interface';
import type { TDrawable } from '../../../gameobjects/types';
import type { TPolygon } from '../../../gameobjects/polygon';

/**
 * A plain white picture, one per renderer, for shapes with no picture of their own: their colour is
 * their tint, multiplied into it.
 */
const whites = new WeakMap<IRenderer, TDrawTexture>();

export const whiteFor = (renderer: IRenderer): TDrawTexture => {
    let white = whites.get(renderer);
    if (white === undefined) {
        white = { status: 'ready', gpu: renderer.createDataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), width: 1, height: 1 };
        whites.set(renderer, white);
    }
    return white;
};

/**
 * Sends each shape's corners up as they are this frame, and puts the map layer that draws them in its
 * place in the list.
 *
 * A shape is drawn as a map layer of its own triangles, which both backends already draw in the
 * game's pixels through the scene's camera: the swap happens here, after the tree has been walked and
 * sorted, as it does for a map's layers.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepScenePolygons = (drawables: TDrawable[], start: number, renderer: IRenderer): void => {
    for (let i = start; i < drawables.length; i++) {
        const item = drawables[i];
        if (item.type !== 'polygon') {
            continue;
        }
        const polygon = item as TPolygon;
        const drawn = uploadPolygon(renderer, polygon).drawn;
        drawn.transform = polygon.transform;
        drawn.worldTransform = polygon.worldTransform;
        drawn.texture = polygon.texture ?? whiteFor(renderer);
        drawn.tint = polygon.tint;
        drawn.smooth = polygon.smooth;
        drawables[i] = drawn as unknown as TDrawable;
    }
};
