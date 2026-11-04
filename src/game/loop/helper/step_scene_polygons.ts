import { uploadPolygon } from '../../../gameobjects/polygon/polygon_state';
import { uploadShapes } from '../../../gameobjects/shapes/shapes_state';
import type { IRenderer } from '../../../render';
import type { TDrawTexture } from '../../../render/interface';
import type { TDrawable } from '../../../gameobjects/types';
import type { TPolygon } from '../../../gameobjects/polygon';
import type { TShapes } from '../../../gameobjects/shapes';
import { recordOf } from './view_walk';

/**
 * Each view copy's own stand-in, kept between frames.
 */
const copies = new WeakMap<object, object>();

/**
 * The stand-in a view's copy of a shape is drawn with: the shape's, refreshed every frame.
 */
const copyFor = <T extends object>(copy: object, shared: T): T => {
    let own = copies.get(copy) as T | undefined;
    if (own === undefined) {
        own = {} as T;
        copies.set(copy, own);
    }
    return Object.assign(own, shared);
};

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
 * place in the list: a polygon's, and the set of shapes a `createShapes` made, whose picture is the
 * palette of its colours.
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
        if (item.type === 'shapes') {
            const shapes = item as TShapes;
            const record = recordOf(shapes);
            const shared = uploadShapes(renderer, record).drawn;
            const drawn = record === shapes ? shared : copyFor(shapes, shared);
            drawn.transform = shapes.transform;
            drawn.worldTransform = shapes.worldTransform;
            drawn.tint = shapes.tint;
            drawables[i] = drawn as unknown as TDrawable;
            continue;
        }
        if (item.type !== 'polygon') {
            continue;
        }
        const polygon = item as TPolygon;
        // A view's copy shares the shape's corners on the card, and has a stand-in of its own to carry
        // where the view draws it.
        const record = recordOf(polygon);
        const shared = uploadPolygon(renderer, record).drawn;
        const drawn = record === polygon ? shared : copyFor(polygon, shared);
        drawn.transform = polygon.transform;
        drawn.worldTransform = polygon.worldTransform;
        drawn.texture = polygon.texture ?? whiteFor(renderer);
        drawn.tint = polygon.tint;
        drawn.smooth = polygon.smooth;
        drawables[i] = drawn as unknown as TDrawable;
    }
};
