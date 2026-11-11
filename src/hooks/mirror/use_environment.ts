import { rootOf, spawnBox } from '../../box';
import { createSprite } from '../../gameobjects/sprite/create_sprite';
import { createSpriteTexture } from '../../gameobjects/sprite_texture';
import { prepareInPicture, skipInPicture } from '../../gameobjects/sprite_texture/picture_skips';
import { getActiveBox, getActiveGame } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { useCamera3d } from '../camera/use_camera_3d';
import { useLateUpdate } from '../loop';
import type { TBox } from '../../box';
import type { TCamera3d } from '../../camera';
import type { TMesh } from '../../gameobjects/mesh';
import type { TModel } from '../../gameobjects/model';
import type { TTexture } from '../../loaders';

/**
 * What `useEnvironment` is asked for. Everything is optional.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEnvironmentOptions = {
    /**
     * Where the surroundings are seen from: the model that reflects them (a mesh or a model from a
     * file), followed as it moves and left out of its own surroundings, or a fixed point. Default the
     * origin.
     */
    around?: TMesh | TModel | { x: number; y: number; z: number };
    /**
     * How far above `around` to see them from, so a character reflects the room from its chest and not
     * its feet. Default `0`.
     */
    height?: number;
    /**
     * Drawn again every frame (`true`), so what moves round it is in its reflection, at the cost of
     * drawing the scene six more times a frame; or once, when the scene has finished loading, and
     * kept (`false`, the default), for a room that stays as it is. `capture()` draws it again.
     */
    live?: boolean;
    /**
     * How many pixels across each of the six faces is. Default `128`; `256` for a big, sharp mirror.
     */
    size?: number;
};

/**
 * What `useEnvironment` gives back: the surroundings for a material's `reflection` (or a recipe's
 * `environment`), and a way to draw them again.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEnvironment = {
    /**
     * The six faces of a cube of the surroundings, three across and two down.
     */
    readonly texture: TTexture;
    /**
     * How a reflection reads them: as a cube.
     */
    readonly read: 'cube';
    /**
     * Draws them again, once, on the next frames: for surroundings captured once (`live: false`) that
     * have changed, a light switched on, a door opened.
     */
    capture(): void;
    /**
     * Where they are seen from, as `around` in the options: changed at any time, for a model made after
     * them, whose material needed them to be made.
     */
    around: TEnvironmentOptions['around'];
};

/**
 * The six faces of the cube, each as a camera turned to see it, in the order the picture lays them
 * out: +x, -x, +y on top; -y, +z, -z below. The shader that reads them back (`envCubeUv`) knows this
 * order and these turns.
 */
const FACES: readonly { rotationX: number; rotationY: number }[] = [
    { rotationX: 0, rotationY: -Math.PI / 2 },
    { rotationX: 0, rotationY: Math.PI / 2 },
    { rotationX: Math.PI / 2, rotationY: 0 },
    { rotationX: -Math.PI / 2, rotationY: 0 },
    { rotationX: 0, rotationY: Math.PI },
    { rotationX: 0, rotationY: 0 },
];

/**
 * How many frames surroundings captured once go on being drawn after the scene has loaded: what the
 * last pictures to land changed reaches them, and models that are placed in their first frame are.
 */
const SETTLE_FRAMES = 3;

const isModel = (around: TEnvironmentOptions['around']): around is TModel =>
    typeof around === 'object' && around !== null && (around as { type?: unknown }).type === 'model';
const isMesh = (around: TEnvironmentOptions['around']): around is TMesh =>
    typeof around === 'object' && around !== null && (around as { type?: unknown }).type === 'mesh';

/**
 * Where `around` is now: where a mesh ended up the last frame it was drawn, a model's first piece, or
 * the point itself.
 */
const whereIs = (around: TEnvironmentOptions['around']): { x: number; y: number; z: number } => {
    if (around === undefined) {
        return { x: 0, y: 0, z: 0 };
    }
    const piece = isMesh(around) ? around : isModel(around) ? around.parts[0] : undefined;
    if (piece?.worldMatrix !== undefined) {
        return { x: piece.worldMatrix[12]!, y: piece.worldMatrix[13]!, z: piece.worldMatrix[14]! };
    }
    const at = isMesh(around) || isModel(around) ? around.transform : around;
    return { x: at.x, y: at.y, z: at.z };
};

/**
 * The surroundings of a place, captured: the scene drawn round it as the six faces of a cube, for a
 * model of chrome to reflect the room it is really in, the columns and the torches and the floor,
 * rather than a picture of somewhere else. Give it to a material's `reflection` or to a recipe's
 * `environment`: `createMaterial(chrome({ environment: useEnvironment({ around: hero }) }))`.
 *
 * Seen from `around` (the model that reflects, which is left out of its own surroundings, so it does
 * not see the inside of itself), and followed as it moves. Captured once when the scene has loaded,
 * the way the games of the era baked their reflections, or every frame with `live: true`, so a torch
 * that flickers or someone walking past is in the reflection too. Live, it draws the scene six more
 * times a frame, with its shadows: one or two in a scene, not one per coin.
 *
 * In the world's own axes, so one capture is right from wherever the camera looks. Its pictures are
 * drawn by code, so a scene document does not keep them.
 *
 * @param options Where it is seen from, how often, and how sharp.
 * @returns The surroundings, and `capture()` to draw them again.
 *
 * @example
 * ```ts
 * import { chrome, createMaterial, createModel, useEnvironment, useLoadModel } from 'nacatamalon';
 *
 * const hero = createModel({ model: useLoadModel({ src: '/models/hero.glb' }) });
 * const room = useEnvironment({ around: hero, height: 1, live: true });
 * for (const part of hero.parts) part.material = createMaterial(chrome({ environment: room }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useEnvironment = (options: TEnvironmentOptions = {}): TEnvironment => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw outsideSceneBody('useEnvironment');
    }
    const size = Math.max(8, Math.round(options.size ?? 128));
    let around = options.around;
    const leavesOut = (model: unknown): boolean =>
        around !== undefined && (model === around || (isModel(around) && around.parts.includes(model as TMesh)));

    let holder!: TBox;
    let atlas!: TTexture;
    const cameras: TCamera3d[] = [];
    // One box holding them all: hidden, none of them is drawn, and each keeps what it last drew.
    spawnBox(store, box, 'environment', () => {
        holder = getActiveBox()!;
        // The faces beside the picture that lays them out, not in it: a picture inside another sees
        // that one's world, and these see the scene's.
        const faces = FACES.map((turn) => {
            const face = createSpriteTexture({
                width: size,
                height: size,
                sees: '3d',
                background: store.get('config').background,
            }, () => {
                cameras.push(useCamera3d({ projection: 'perspective', fov: 90, near: 0.05, transform: { ...turn } }));
            });
            const camera = cameras[cameras.length - 1]!;
            skipInPicture(face, leavesOut);
            // Placed just before it is drawn, where `around` was placed this frame, so a capture round
            // something that moves is never a frame behind it.
            prepareInPicture(face, () => {
                const at = whereIs(around);
                camera.transform.x = at.x;
                camera.transform.y = at.y + (options.height ?? 0);
                camera.transform.z = at.z;
                camera.far = rootOf(box).camera3d?.far ?? 1000;
            });
            return face;
        });
        atlas = createSpriteTexture({ width: size * 3, height: size * 2 }, () => {
            faces.forEach((face, i) => {
                createSprite({ texture: face, anchor: { x: 0, y: 0 }, transform: { x: (i % 3) * size, y: Math.floor(i / 3) * size } });
            });
        });
    }, []);

    const live = options.live === true;
    // Frames still to draw once the scene has loaded, for a capture made once.
    let settling = SETTLE_FRAMES;
    useLateUpdate(() => {
        if (live) {
            return;
        }
        if (rootOf(box).loads.some((asset) => asset.status === 'loading')) {
            settling = SETTLE_FRAMES;
            holder.visible = true;
            return;
        }
        if (settling > 0) {
            settling -= 1;
            holder.visible = true;
            return;
        }
        holder.visible = false;
    });

    return {
        texture: atlas,
        read: 'cube',
        capture: () => {
            settling = SETTLE_FRAMES;
            holder.visible = true;
        },
        get around() {
            return around;
        },
        set around(next) {
            around = next;
        },
    };
};
