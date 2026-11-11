import { rootOf } from '../../box';
import { createSpriteTexture, resizeSpriteTexture } from '../../gameobjects/sprite_texture';
import { prepareInPicture } from '../../gameobjects/sprite_texture/picture_skips';
import { getActiveBox, getActiveGame } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { useCamera3d } from '../camera/use_camera_3d';
import { useGame } from '../game/use_game';
import type { TBox } from '../../box';
import type { TCamera3d, TMirrorPlane } from '../../camera';
import type { TMesh } from '../../gameobjects/mesh';
import type { TTexture } from '../../loaders';
import type { TMaterialReflection } from '../../materials';

/**
 * What `useMirror` is asked for. Everything is optional.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMirrorOptions = {
    /**
     * How much of the world it shows where it faces the camera, `0` to `1`. Default `0.3`, a polished
     * floor; `0.9` is a mirror on a wall.
     */
    front?: number;
    /**
     * How much it shows where it turns away from the camera, `0` to `1`. Default `1`: a floor seen low
     * is nearly all reflection, as a real one is.
     */
    edge?: number;
    /**
     * How much what it shows takes its own colour, `0` to `1`. Default `0`.
     */
    metal?: number;
    /**
     * How soft what it shows is, in the picture's pixels. Default `0`, sharp; `2` to `4` is polished
     * stone, a wet street.
     */
    blur?: number;
    /**
     * How big its picture is against the game's screen, `0.1` to `1`. Default `1`. Half (`0.5`) costs a
     * quarter and, with a little `blur`, looks the same on a floor.
     */
    scale?: number;
};

/**
 * What `useMirror` gives back: a material's `reflection`, ready to give to the surface that mirrors.
 * Its `texture` is the picture of the world it draws every frame.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMirror = TMaterialReflection & { readonly texture: TTexture; readonly read: 'screen' };

/**
 * The model that shows a picture as its reflection, anywhere in the tree under `box`.
 */
const wearerOf = (box: TBox, picture: TTexture): TMesh | null => {
    for (const drawable of box.drawables) {
        if (drawable.type === 'mesh' && drawable.material.maps?.reflection?.texture === picture) {
            return drawable;
        }
    }
    for (const child of box.children) {
        const found = wearerOf(child, picture);
        if (found !== null) {
            return found;
        }
    }
    return null;
};

/**
 * The plane a flat model lies on, from where it ends up this frame: its own up (the face of a
 * `usePlaneGeometry`), turned towards the eye, so a mirror is one from either side.
 */
const planeOf = (mesh: TMesh, eye: { x: number; y: number; z: number }): TMirrorPlane | null => {
    const m = mesh.worldMatrix;
    if (m === undefined) {
        return null;
    }
    // Its own x and z as they end up: their cross is its up, whatever it was stretched by.
    const ax = [m[0]!, m[1]!, m[2]!];
    const az = [m[8]!, m[9]!, m[10]!];
    let nx = az[1]! * ax[2]! - az[2]! * ax[1]!;
    let ny = az[2]! * ax[0]! - az[0]! * ax[2]!;
    let nz = az[0]! * ax[1]! - az[1]! * ax[0]!;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) {
        return null;
    }
    nx /= length;
    ny /= length;
    nz /= length;
    const px = m[12]!;
    const py = m[13]!;
    const pz = m[14]!;
    if (nx * (eye.x - px) + ny * (eye.y - py) + nz * (eye.z - pz) < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
    }
    return { x: nx, y: ny, z: nz, d: -(nx * px + ny * py + nz * pz) };
};

/**
 * A mirror: the world reflected in a flat surface, a polished floor, a mirror on a wall, a lake.
 * Give what it returns to the surface as its `reflection`, and the surface shows the world as a mirror
 * lying on it would, moving with the camera, and more of it where it is seen low, as a real floor does.
 *
 * Any flat model: a `usePlaneGeometry`, turned and placed as it should be, a floor as it is or a wall
 * stood up. Its plane is read from where it ends up each frame, so it can move. What is behind it is
 * never in it.
 *
 * It draws the scene a second time, from the camera reflected across the plane, into a picture the
 * size of the game's screen (`scale` makes it smaller, for less). One mirror is one more drawing of
 * the scene, its lights and its shadows, every frame, on screen or not: a few in a scene are fine, one
 * per tile is not. A surface that shows its picture is never drawn in it, so it does not reflect
 * itself; two mirrors facing each other show each other once, not for ever.
 *
 * It is the reflection seen through the scene's own 3D camera, on the screen. Anything else that sees
 * the surface (a view of a split screen, a picture, `useEnvironment`'s faces) shows that same picture
 * at its own places on it, which is not its reflection. Not with a camera that follows the 2D one
 * (`follow2d`).
 *
 * Its picture is drawn by code each frame, so a scene document does not keep it: the surface is saved
 * without its mirror. Best with `perPixel: true` on the surface, so its own light is round too.
 *
 * @param options How much it shows in front and at the edge, how much of its colour, how soft, and
 * how big its picture is.
 * @returns The surface's `reflection`.
 *
 * @example
 * ```ts
 * import { createMesh, useMirror, usePlaneGeometry } from 'nacatamalon';
 *
 * // A polished floor, softened a little.
 * createMesh({
 *     geometry: usePlaneGeometry({ width: 20, depth: 20 }),
 *     tint: '#2a2622',
 *     perPixel: true,
 *     reflection: useMirror({ front: 0.25, blur: 2 }),
 * });
 * // A mirror on a wall: the plane stood up, facing the room.
 * createMesh({
 *     geometry: usePlaneGeometry({ width: 2, depth: 3 }),
 *     transform: { z: -5, y: 1.5, rotationX: Math.PI / 2 },
 *     reflection: useMirror({ front: 0.9 }),
 * });
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useMirror = (options: TMirrorOptions = {}): TMirror => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw outsideSceneBody('useMirror');
    }
    const game = useGame();
    const scale = Math.min(Math.max(options.scale ?? 1, 0.1), 1);
    const sized = (side: number): number => Math.max(1, Math.round(side * scale));

    let camera!: TCamera3d;
    const picture = createSpriteTexture({
        width: sized(game.getWidth()),
        height: sized(game.getHeight()),
        sees: '3d',
        background: store.get('config').background,
    }, () => {
        camera = useCamera3d({ projection: 'perspective' });
    });

    // As big as the screen it lies on, whatever resolution the game is at now.
    game.onResized(({ width, height }) => {
        resizeSpriteTexture(picture, sized(width), sized(height));
    });

    let wearer: TMesh | null = null;
    // Just before its picture is drawn: the scene's camera where every update left it, and the
    // surface where it was placed this frame, so the mirror is never a frame behind either.
    prepareInPicture(picture, () => {
        const seen = rootOf(box).camera3d;
        if (seen === null) {
            camera.mirror = null;
            return;
        }
        camera.projection = seen.projection;
        camera.fov = seen.fov;
        camera.near = seen.near;
        camera.far = seen.far;
        camera.zoom = seen.zoom;
        Object.assign(camera.transform, seen.transform);
        if (wearer === null || wearer.destroyed) {
            wearer = wearerOf(rootOf(box), picture);
        }
        camera.mirror = wearer === null ? null : planeOf(wearer, seen.transform);
    });

    return {
        texture: picture,
        read: 'screen',
        front: options.front ?? 0.3,
        edge: options.edge ?? 1,
        metal: options.metal ?? 0,
        blur: options.blur ?? 0,
    };
};
