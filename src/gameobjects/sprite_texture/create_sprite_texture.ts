import { spawnBox } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { nanoId } from '../../utils';
import type { TTexture } from '../../loaders';
import type { TRuntimeStore } from '../../store';
import type { TSpriteTexture, TSpriteTextureOptions } from './types';

/**
 * Tells the pictures made here from images somebody loaded, which a key must never quietly take over.
 */
const pictures = new WeakSet<TTexture>();

/**
 * Whether a texture is a picture drawn inside the game rather than an image loaded from a file.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isSpriteTexture = (texture: TTexture): boolean => pictures.has(texture);

/**
 * The record for a picture, with the picture itself made and listed in the game's textures.
 *
 * Asked for a name it already made at the same size, it gives that picture back rather than a new
 * one: a scene that restarts asks for the same name every time, and a new one per restart would pile
 * up for as long as the game runs.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newSpriteTexture = (store: TRuntimeStore, options: TSpriteTextureOptions, id: string = nanoId()): TSpriteTexture => {
    const width = Math.max(1, Math.floor(options.width));
    const height = Math.max(1, Math.floor(options.height));
    // Random rather than counted: a counted name written into a scene would be handed out again to
    // the next picture made without one, and the two would draw into each other.
    const key = options.key ?? `sprite-texture-${nanoId(10)}`;
    const textures = store.get('assets').textures;

    const existing = textures.get(key);
    if (existing !== undefined && !pictures.has(existing)) {
        throw new Error(`[NacatamalOn] createSpriteTexture: '${key}' is already the name of a loaded image. Give the picture another key.`);
    }

    let texture = existing;
    if (texture === undefined || texture.width !== width || texture.height !== height) {
        texture = {
            type: 'texture',
            key,
            src: '',
            width,
            height,
            // Ready at once: there is nothing to fetch, and a model showing it can be drawn from the
            // first frame.
            status: 'ready',
            gpu: store.get('screen').renderer.createRenderTexture(width, height),
        };
        pictures.add(texture);
        textures.set(key, texture);
    }

    return {
        type: 'sprite-texture',
        id,
        width,
        height,
        sees: options.sees ?? 'inside',
        background: { ...(options.background ?? { r: 0, g: 0, b: 0, a: 1 }) },
        texture,
    };
};

/**
 * Lets a picture go: out of the game's textures, and off the graphics card. Its `gpu` is emptied
 * first-hand, so anything still showing it draws nothing instead of reading a texture that is gone.
 */
const releasePicture = (store: TRuntimeStore, texture: TTexture): void => {
    const textures = store.get('assets').textures;
    if (textures.get(texture.key) === texture) {
        textures.delete(texture.key);
    }
    if (texture.gpu !== null) {
        store.get('screen').renderer.destroyTexture(texture.gpu);
        texture.gpu = null;
    }
};

/**
 * Makes a picture and fills it with a component: whatever `component` draws, and whatever it
 * creates with `useSpawn`, ends up in the picture instead of on the screen, every frame. A model
 * then shows the picture the way it shows any image, so the 2D moves with the model and is seen in
 * its perspective: a handheld's screen, a monitor, a sign.
 *
 * The component is a full part of the scene: it updates, it runs its scripts, it pauses with the
 * scene and `destroy` takes it away. What it draws is measured in the picture's pixels, from its
 * top-left corner, the way a scene without a camera is. A camera it asks for is the picture's own
 * and leaves the scene's alone, and a lamp it holds lights only the picture.
 *
 * With `sees: 'scene'` the picture also shows the models of the world around it, from the
 * component's own 3D camera: a security camera, and the monitor is whatever shows the picture.
 *
 * Whatever you pass after the component reaches it as its arguments, as with `useSpawn`.
 *
 * @param options How big the picture is, what is behind it and what it sees.
 * @param component What is drawn into it. Left out, the picture shows only its background, or the
 * scene when it `sees` it.
 * @returns The picture, to hand to `createMesh({ texture })`.
 *
 * @example
 * ```ts
 * const Screen = () => {
 *     const pet = createSprite({ key: 'pet', transform: { x: 40, y: 40 } });
 *     useUpdate((delta) => {
 *         pet.transform.x += delta * 10;
 *     });
 * };
 *
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', z: 3 });
 *     const screen = createSpriteTexture({ width: 128, height: 128 }, Screen);
 *     createMesh({ geometry: useCubeGeometry(), texture: screen });
 *     return createScene();
 * };
 * ```
 *
 * @param args - What `component` is called with, the way a maker from `useSpawn` passes them on.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createSpriteTexture = <TArgs extends unknown[]>(
    options: TSpriteTextureOptions,
    component?: (...args: TArgs) => unknown,
    ...args: TArgs
): TTexture => {
    const store = getActiveGame();
    const parent = getActiveBox();
    if (store === null || parent === null) {
        throw new Error('[NacatamalOn] createSpriteTexture: call it inside a scene body.');
    }

    const record = newSpriteTexture(store, options);
    const name = component !== undefined && component.name.length > 0 ? component.name : 'sprite-texture';

    // The picture is put on the box before the component runs, so a camera the component asks for
    // already finds where it belongs.
    spawnBox(store, parent, name, (...given: TArgs) => {
        const box = getActiveBox()!;
        box.spriteTexture = record;
        // A picture with no name is this box's alone: nobody can ask for it again, so it leaves with
        // the box instead of staying on the graphics card for every restart. One with a name is kept
        // for whoever asks for that name next, which is what `newSpriteTexture` is for.
        if (options.key === undefined) {
            box.cleanups.push(() => releasePicture(store, record.texture));
        }
        component?.(...given);
    }, args);

    return record.texture;
};
