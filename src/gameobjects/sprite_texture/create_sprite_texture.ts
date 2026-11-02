import { VIEW_KINDS } from './view_kinds';
import { getColor } from '../../color';
import { gameOfBox, spawnBox } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { nanoId } from '../../utils';
import { markMadeTexture } from '../../loaders';
import type { TTexture } from '../../loaders';
import type { TRuntimeStore } from '../../store';
import type { TSpriteTexture, TSpriteTextureOptions, TViewFilter } from './types';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import type { TBox } from '../../box';
import { freeTexture } from '../../loaders/texture/free_texture';

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
 * The object each picture is drawn from, found from the picture: what `setViewFilter`,
 * `resizeSpriteTexture` and the view's coordinates are handed.
 */
const owners = new WeakMap<TTexture, TBox>();

/**
 * The order the pictures were made in, which is the order a ring of views watching one another is
 * broken in: see `orderPicturePasses`.
 */
const madeIn = new WeakMap<TSpriteTexture, number>();
let made = 0;

/**
 * When a picture was made, against the others: lower is earlier.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pictureMadeAt = (record: TSpriteTexture): number => madeIn.get(record) ?? 0;

/**
 * Puts a picture on the object it is drawn from, and notes the object against the picture.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const attachPicture = (box: TBox, record: TSpriteTexture): void => {
    box.spriteTexture = record;
    owners.set(record.texture, box);
};

/**
 * The object a picture is drawn from, or `null` for a texture that is not one, or one whose object
 * has gone.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pictureOwner = (texture: TTexture): TBox | null => {
    const box = owners.get(texture);
    return box === undefined || box.destroyed || box.spriteTexture?.texture !== texture ? null : box;
};

/**
 * A view's filter as it is kept: its lists copied, so changing the array it was given changes nothing,
 * and every kind and tag checked, since one misspelt would quietly let everything through.
 */
const filterOf = (filter: TViewFilter | null | undefined, who: string, which: string): TViewFilter | null => {
    if (filter === null || filter === undefined) {
        return null;
    }
    const tags = filter.tags ?? [];
    for (const tag of tags) {
        if (typeof tag !== 'string' || tag === '') {
            throw new Error(`[NacatamalOn] ${who}: ${which}.tags holds ${JSON.stringify(tag)}, which is not a tag. Give the tags as words.`);
        }
    }
    const kinds = filter.kinds ?? [];
    for (const kind of kinds) {
        if (!VIEW_KINDS.has(kind)) {
            throw new Error(`[NacatamalOn] ${who}: ${which}.kinds holds '${String(kind)}', which is not a kind of drawing. Use ${[...VIEW_KINDS].map((k) => `'${k}'`).join(', ')}.`);
        }
    }
    return {
        ...(tags.length > 0 ? { tags: [...tags] } : {}),
        ...(kinds.length > 0 ? { kinds: [...kinds] } : {}),
        ...(filter.objects !== undefined && filter.objects.length > 0 ? { objects: [...filter.objects] } : {}),
    };
};

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
    const sees = options.sees ?? 'inside';
    // Said rather than taken as 'inside': a picture that should show the room and shows nothing
    // gives no clue why.
    if (sees !== 'inside' && sees !== '3d' && sees !== 'world') {
        const was = (sees as string) === 'scene' ? " What was 'scene' is '3d' now." : '';
        throw new Error(`[NacatamalOn] createSpriteTexture: it sees 'inside', '3d' or 'world', not '${String(sees)}'.${was} Give it one of those.`);
    }
    if (sees !== 'world' && (options.hide !== undefined || options.only !== undefined)) {
        throw new Error("[NacatamalOn] createSpriteTexture: hide and only choose what a view of the world takes in, and this picture does not see the world. Give it sees: 'world', or leave them out.");
    }
    const hide = filterOf(options.hide, 'createSpriteTexture', 'hide');
    const only = filterOf(options.only, 'createSpriteTexture', 'only');
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
        markMadeTexture(texture);
        textures.set(key, texture);
    }

    const record: TSpriteTexture = {
        type: 'sprite-texture',
        id,
        width,
        height,
        sees,
        hide,
        only,
        background: { ...getColor(options.background ?? { r: 0, g: 0, b: 0, a: 1 }) },
        texture,
    };
    madeIn.set(record, ++made);
    return record;
};

/**
 * Changes what a view of the world (`createSpriteTexture({ sees: 'world' })`) takes in, while the game
 * runs: a minimap that starts showing the rooms already visited, a mirror that stops showing the
 * player's own car. What is given replaces what it had; `null` or left out, none.
 *
 * @param picture The view, as `createSpriteTexture` gave it back.
 * @param filter What it leaves out (`hide`) and what alone it takes in (`only`). `hide` wins.
 *
 * @example
 * ```ts
 * declare const minimap: TTexture;
 * setViewFilter(minimap, { hide: { tags: ['secret'] } });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setViewFilter = (picture: TTexture, filter: { hide?: TViewFilter | null; only?: TViewFilter | null }): void => {
    const record = pictureOwner(picture)?.spriteTexture ?? null;
    if (record === null || record.sees !== 'world') {
        throw new Error("[NacatamalOn] setViewFilter: this texture is not a view of the world. Give it one made with createSpriteTexture({ sees: 'world' }).");
    }
    record.hide = filterOf(filter.hide, 'setViewFilter', 'hide');
    record.only = filterOf(filter.only, 'setViewFilter', 'only');
};

/**
 * Makes a picture from `createSpriteTexture` another size: half of a split screen when the window
 * grows, a monitor that opens wider. It stays the same picture, so whatever shows it goes on showing
 * it; only the texture on the graphics card behind it is made again, and the old one let go of. A
 * view sees more or less of the world, as the screen does when the game is resized.
 *
 * @param picture The picture, as `createSpriteTexture` gave it back.
 * @param width In pixels, rounded down and at least 1.
 * @param height In pixels, rounded down and at least 1.
 *
 * @example
 * ```ts
 * declare const left: TTexture;
 * declare const right: TTexture;
 * useGame().onResized(({ width, height }) => {
 *     resizeSpriteTexture(left, width / 2, height);
 *     resizeSpriteTexture(right, width / 2, height);
 * });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resizeSpriteTexture = (picture: TTexture, width: number, height: number): void => {
    // From the picture's own object: this is called from a frame's code, where no scene is being built.
    const owner = pictureOwner(picture);
    const store = owner === null ? undefined : gameOfBox(owner);
    const record = owner?.spriteTexture ?? null;
    if (record === null || store === undefined || picture.status === 'released') {
        throw new Error('[NacatamalOn] resizeSpriteTexture: this texture is not a picture made with createSpriteTexture, or it has been let go of. Give it one that is still in the game.');
    }
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
        throw new Error(`[NacatamalOn] resizeSpriteTexture: a picture needs a width and height in pixels, and was asked for ${width} by ${height}. Give it two numbers; under 1 is taken as 1.`);
    }
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === picture.width && h === picture.height) {
        return;
    }
    const renderer = store.get('screen').renderer;
    if (picture.gpu !== null) {
        renderer.destroyTexture(picture.gpu);
    }
    picture.gpu = renderer.createRenderTexture(w, h);
    picture.width = w;
    picture.height = h;
    record.width = w;
    record.height = h;
};

/**
 * Lets a picture go: out of the game's textures, and off the graphics card. Its `gpu` is emptied
 * first-hand and it ends `'released'`, so anything still showing it draws nothing, instead of reading
 * a texture that is gone or being drawn as a square of its tint. The one exception is the mask of a
 * transition still covering: that stays on the card until the transition is over.
 */
const releasePicture = (store: TRuntimeStore, texture: TTexture): void => {
    const textures = store.get('assets').textures;
    if (textures.get(texture.key) === texture) {
        textures.delete(texture.key);
    }
    // Kept on the card while a transition is still covering with it: see `freeTexture`.
    freeTexture(store, texture);
    texture.status = 'released';
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
 * With `sees: '3d'` the picture also shows the models of the world around it, from the
 * component's own 3D camera: a security camera, and the monitor is whatever shows the picture.
 *
 * With `sees: 'world'` it is a view of the whole world of its scene, through the component's own
 * cameras: a minimap, a mirror, half of a split screen. See `TSpriteTextureOptions.sees`, and
 * `viewToWorld` for clicks on it.
 *
 * Whatever you pass after the component reaches it as its arguments, as with `useSpawn`.
 *
 * @param options How big the picture is, what is behind it, what it sees and, for a view of the
 * world, what of it.
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
 *     useCamera3d({ projection: 'perspective', transform: { z: 3 } });
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
        throw outsideSceneBody('createSpriteTexture');
    }

    const record = newSpriteTexture(store, options);
    const name = component !== undefined && component.name.length > 0 ? component.name : 'sprite-texture';

    // The picture is put on the box before the component runs, so a camera the component asks for
    // already finds where it belongs.
    spawnBox(store, parent, name, (...given: TArgs) => {
        const box = getActiveBox()!;
        attachPicture(box, record);
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
