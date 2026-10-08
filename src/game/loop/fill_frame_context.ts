import type { TFog } from '../../fog/types/t_fog';
import type { TDrawable } from '../../gameobjects/types';
import { screenSizeOf } from '../../DOM/screen_size';
import { collectDrawables } from './helper/collect_drawables';
import { lookAgainAtParticles, stepSceneParticles } from './helper/step_scene_particles';
import { stepSceneTilemaps } from './helper/step_scene_tilemaps';
import { stepSceneLines } from './helper/step_scene_lines';
import type { TFrameContext } from '../../render';
import type { TDrawSprite } from '../../render/interface';
import { expandText } from '../../gameobjects/text/expand_text';
import { expandNineSlice } from '../../gameobjects/nine_slice/expand_nine_slice';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TRuntimeStore } from '../../store';
import type { TRuntimeState } from '../../store/types/t_runtime_state';
import { collectLighting } from './helper/collect_lights';
import { computeJointMatrices } from '../../math/skinning';
import { buildPostChain } from '../../post/build_post_chain';
import type { TCamera2d } from '../../camera';
import type { TDrawView3d } from '../../render/interface/draw/t_draw_view_3d';
import type { TSceneColliders } from '../../gameobjects/particles/collide';
import type { TSceneLighting } from './helper/collect_lights';
import type { TCamera3d } from '../../camera/types/t_camera_3d';
import type { TRenderPass } from '../../render/interface';
import type { TTexture } from '../../loaders';
import { rootOf } from '../../box';
import type { TBox } from '../../box';
import type { TColor } from '../../color';
import { isTransparentMesh } from '../../render/shared/is_transparent_mesh';
import { computeView } from '../../render/shared/compute_mvp_3d';
import * as mat from '../../math/mat4';

/**
 * Sorts by `zIndex` the drawables from `start` to the end, in place, and only if one of them asks
 * for it. A scene where nobody says `zIndex` is already in the order it was built in, and a
 * benchmark of many thousands of sprites should not pay for a sort it does not use.
 *
 * `cameraIndex` is reordered with them: each entry belongs to its drawable, and sorting one list
 * without the other would draw a HUD through the world's camera.
 *
 * **See-through models go after the solid ones at their number, furthest first.** They blend over
 * what is already drawn, so what is behind them has to be there first, and among themselves the
 * nearest has to be last. `zIndex` still wins over all of it, so a scene that ordered its glass by
 * hand keeps that order.
 */
/**
 * Whether a drawable is seen through its scene's camera in depth: a model, particles or lines in space.
 */
const inDepth = (drawable: TDrawable | TDrawSprite): boolean =>
    drawable.type === 'mesh' || drawable.type === 'particles3d' || drawable.type === 'lines';

/**
 * Which half of the engine a drawable belongs to: models and lines first, everything 2D over them.
 */
const layerRank = (drawable: TDrawable): number => (drawable.type === 'mesh' || drawable.type === 'lines' ? 0 : 1);

/**
 * The camera's view, kept between frames so sorting glass allocates nothing.
 */
const sortView = mat.create();

/**
 * How far in front of the camera a see-through model is, along the way the camera looks: the more
 * negative, the further. Along the view rather than a straight distance, so an orthographic camera
 * sorts as correctly as a perspective one. Measured from the model's own place, so two see-through
 * models that cross each other can still come out the wrong way round, as they do in most engines.
 */
const viewDepth = (drawable: TDrawable, view: Float32Array): number => {
    if (drawable.type !== 'mesh') {
        return 0;
    }
    const world = drawable.worldMatrix;
    const x = world !== undefined ? world[12] : drawable.transform.x;
    const y = world !== undefined ? world[13] : drawable.transform.y;
    const z = world !== undefined ? world[14] : drawable.transform.z;
    return view[2] * x + view[6] * y + view[10] * z + view[14];
};

const sortSceneByZIndex = (drawables: TDrawable[], cameraIndex: number[], start: number, camera: TCamera3d | null): void => {
    let needed = false;
    let models = false;
    for (let i = start; i < drawables.length; i++) {
        if (drawables[i].zIndex !== undefined) {
            needed = true;
            break;
        }
        // A scene that mixes models and sprites has to be sorted even when nobody named a number,
        // or which one is on top would depend on the order they were made in.
        models = models || drawables[i].type === 'mesh' || drawables[i].type === 'lines';
    }
    needed = needed || (models && drawables.length - start > 1);
    if (!needed) {
        return;
    }

    // Positions sorted, not the drawables themselves, so both lists can be rewritten from them.
    // `sort` is stable, so equal numbers keep the order they were created in.
    //
    // On a tie a model is drawn first and the 2D paints over it, which is the useful way round: a
    // HUD and a name over someone's head are meant to be seen, and a model at the same number would
    // otherwise hide them depending on which was made first.
    //
    // Worked out once per model rather than inside the comparison, which asks about each one many
    // times. A solid model gets no depth at all: among themselves they keep the order they were made
    // in, since depth already sorts them out wherever they are drawn.
    const count = drawables.length - start;
    const glass = new Array<boolean>(count);
    const depth = new Array<number>(count);
    let seeThrough = false;
    for (let i = 0; i < count; i++) {
        const drawable = drawables[start + i];
        glass[i] = drawable.type === 'mesh' && isTransparentMesh(drawable);
        seeThrough = seeThrough || glass[i];
    }
    if (seeThrough) {
        computeView(camera, sortView);
        for (let i = 0; i < count; i++) {
            depth[i] = glass[i] ? viewDepth(drawables[start + i], sortView) : 0;
        }
    }
    const order = Array.from({ length: count }, (_, i) => start + i)
        .sort((a, b) => (drawables[a].zIndex ?? 0) - (drawables[b].zIndex ?? 0)
            || layerRank(drawables[a]) - layerRank(drawables[b])
            || Number(glass[a - start]) - Number(glass[b - start])
            || (glass[a - start] ? depth[a - start] - depth[b - start] : 0));
    const sortedDrawables = order.map((i) => drawables[i]);
    const sortedCameras = order.map((i) => cameraIndex[i]);
    for (let i = 0; i < order.length; i++) {
        drawables[start + i] = sortedDrawables[i];
        cameraIndex[start + i] = sortedCameras[i];
    }
};

/**
 * Replaces every text and every nine-slice from `start` to the end with the sprites that draw it,
 * each one drawn through the camera of what it came from. Only rebuilds the stretch when it holds
 * one, so a scene of sprites alone pays one pass over it and nothing else.
 */
const expandSceneIntoSprites = (drawables: Array<TDrawable | TDrawSprite>, cameraIndex: number[], start: number, viewIndex: number[]): void => {
    let found = false;
    for (let i = start; i < drawables.length; i++) {
        if (drawables[i].type === 'text' || drawables[i].type === 'nine-slice') {
            found = true;
            break;
        }
    }
    if (!found) {
        return;
    }

    const tailDrawables = drawables.splice(start);
    const tailCameras = cameraIndex.splice(start);
    // Cut alongside the others: every list here is one entry per drawable, and one growing while
    // another does not is how a HUD ends up drawn through the world's camera.
    const tailViews = viewIndex.splice(start);
    for (let i = 0; i < tailDrawables.length; i++) {
        const drawable = tailDrawables[i];
        if (drawable.type === 'nine-slice') {
            for (const piece of expandNineSlice(drawable)) {
                drawables.push(piece);
                cameraIndex.push(tailCameras[i]);
                viewIndex.push(-1);
            }
            continue;
        }
        if (drawable.type !== 'text') {
            drawables.push(drawable);
            cameraIndex.push(tailCameras[i]);
            viewIndex.push(tailViews[i]);
            continue;
        }
        for (const glyph of expandText(drawable as TText)) {
            drawables.push(glyph);
            cameraIndex.push(tailCameras[i]);
            // A character is a sprite, so it belongs to no 3D view.
            viewIndex.push(-1);
        }
    }
};

/**
 * Helps to cross the data between the game and render layers.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
let pass = 0;

/**
 * Works out what the graphics card reads for every set of bones about to be drawn.
 *
 * **Here rather than in the animation player**, because a model can have bones and no movement at
 * all: a rig bought without animations still has to be drawn standing, and if only the player did
 * this it would collapse to the origin. And here rather than at draw time, because the same bones
 * may be worn by several models and drawn in several passes, and posing them is the same answer
 * every time.
 */
const poseSkeletons = (drawables: Array<TDrawable | TDrawSprite>, start: number): void => {
    for (let i = start; i < drawables.length; i++) {
        const item = drawables[i];
        if (item.type === 'mesh' && item.skeleton !== null && item.skeleton !== undefined) {
            computeJointMatrices(item.skeleton, pass);
        }
    }
};

/**
 * What is solid in each scene, one per scene in the order they are drawn, kept between frames and
 * emptied at the start of each. A scene's particles only run into its own.
 */
const sceneColliders: TSceneColliders[] = [];

/**
 * The same for each picture: particles drawn into a screen run into what is in that screen.
 */
const pictureColliders = new WeakMap<TBox, TSceneColliders>();

/**
 * Everything one pass is made of, one entry per drawable in each list but `cameras` and `views3d`.
 */
type TPassLists = {
    drawables: Array<TDrawable | TDrawSprite>;
    cameraIndex: number[];
    cameras: TCamera2d[];
    views3d: TDrawView3d[];
    viewIndex: number[];
};

const newLists = (): TPassLists => ({ drawables: [], cameraIndex: [], cameras: [], views3d: [], viewIndex: [] });

/**
 * What a picture that watches the world around it is shown of that world: its models and particles
 * in depth, the camera it would be seen through without one of its own, and its lamps.
 */
type TWorldSeen = { models: Array<TDrawable | TDrawSprite>; camera: TCamera3d | null; lighting: TSceneLighting | null; fog: TFog | null };

/**
 * Collects one world into `lists`: a scene into the screen's, or a picture into its own. Everything
 * the frame does to what it collects is done here, once, whichever of the two it is.
 *
 * Returns what a security camera inside it would see, and notes in `pictures` every box below that
 * is drawn into a picture of its own.
 */
/**
 * What a tool asks the world to be seen through: the screen's cameras and kinds, or a capture's, or
 * a preview's. `null` in each is the scene's own.
 */
type TSeenThrough = Pick<TRuntimeState['viewport'], 'camera3d' | 'camera2d' | 'layers'>;

const gatherTree = (
    root: TBox,
    lists: TPassLists,
    delta: number,
    colliders: TSceneColliders,
    pictures: TBox[],
    viewport: TSeenThrough | null = null,
    again = false,
): TWorldSeen => {
    const { drawables, cameraIndex, cameras, views3d, viewIndex } = lists;

    // The camera itself goes over, not a copy: moving it between two frames needs nothing
    // rebuilt. A scene without one draws in screen pixels, which is `-1`. A tool looking at the
    // screen through a camera of its own wins over the scene's.
    const camera2d = viewport?.camera2d ?? root.camera2d;
    let sceneCamera = -1;
    if (camera2d !== null) {
        sceneCamera = cameras.length;
        cameras.push(camera2d);
    }

    const start = drawables.length;
    colliders.flat.length = 0;
    colliders.deep.length = 0;
    collectDrawables(root, drawables as TDrawable[], cameraIndex, sceneCamera, false, null, 0, colliders, pictures);
    // A tool showing only some kinds: dropped before anything else is worked out for them, so a kind
    // nobody is looking at costs no sorting, no lamps and no particles stepped.
    const layers = viewport?.layers ?? null;
    if (layers !== null) {
        let kept = start;
        const hidden: TDrawable[] = [];
        const hiddenCameras: number[] = [];
        for (let i = start; i < drawables.length; i++) {
            const drawable = drawables[i] as TDrawable;
            if (!layers.includes(drawable.type)) {
                if (drawable.type === 'particles' || drawable.type === 'particles3d') {
                    hidden.push(drawable);
                    hiddenCameras.push(cameraIndex[i]!);
                }
                continue;
            }
            drawables[kept] = drawables[i];
            cameraIndex[kept] = cameraIndex[i];
            kept++;
        }
        drawables.length = kept;
        cameraIndex.length = kept;
        // A kind the screen does not show is still going on in the game, so its particles still move:
        // a capture of the game has to find them where they got to, and they must not all start
        // again the moment the screen shows them. A second look moves nothing (see below).
        if (hidden.length > 0 && !again) {
            stepSceneParticles(hidden, hiddenCameras, 0, rootOf(root).paused ? 0 : delta, colliders);
        }
    }
    sortSceneByZIndex(drawables as TDrawable[], cameraIndex, start, viewport?.camera3d ?? root.camera3d);

    // The scene's own way of seeing and lighting its models, worked out only when it has any:
    // a 2D game never pays for a walk looking for lamps it does not have.
    const view = drawables.slice(start).some(inDepth) ? views3d.length : -1;
    let lighting: TSceneLighting | null = null;
    if (view >= 0) {
        lighting = collectLighting(root);
        views3d.push({ camera: viewport?.camera3d ?? root.camera3d, lights: lighting.lights, ambient: lighting.ambient, fog: root.fog });
    }
    for (let i = start; i < drawables.length; i++) {
        viewIndex[i] = inDepth(drawables[i]) ? view : -1;
    }

    poseSkeletons(drawables, start);

    // After the walk, because a particle is born where its emitter **ended up**. A paused scene
    // is frozen rather than skipped: it keeps drawing the cloud it last had.
    //
    // A second look in the same frame (a capture, a preview) shows what this one stepped instead.
    if (again) {
        lookAgainAtParticles(drawables as TDrawable[], cameraIndex, start);
    } else {
        stepSceneParticles(drawables as TDrawable[], cameraIndex, start, rootOf(root).paused ? 0 : delta, colliders);
    }

    // After the walk too, and for the same reason an emitter needs it: a layer's corners live
    // beside the record, so something has to hand the backend both halves at once.
    stepSceneTilemaps(drawables as TDrawable[], start);

    // After the walk as well: a set of lines follows its object, and is placed in the world here.
    stepSceneLines(drawables as TDrawable[], start);

    // After the sort, so a text or a nine-slice moves as one block and its parts stay together.
    expandSceneIntoSprites(drawables, cameraIndex, start, viewIndex);

    return { models: drawables.slice(start).filter(inDepth), camera: root.camera3d, lighting, fog: root.fog };
};

/**
 * Whether a model shows `texture`, as its picture or as one of its maps, which it must not while
 * that texture is being drawn into.
 */
const shows = (item: TDrawable | TDrawSprite, texture: TTexture): boolean => {
    if (item.type !== 'mesh') {
        return false;
    }
    if (item.material.texture === texture) {
        return true;
    }
    const maps = item.material.maps;
    if (maps === undefined) {
        return false;
    }
    for (const name in maps) {
        if (maps[name]!.texture === texture) {
            return true;
        }
    }
    return false;
};

/**
 * The pass each picture is drawn in, kept between frames like the screen's.
 */
const picturePasses = new WeakMap<TBox, TRenderPass>();

/**
 * The pass the screen is drawn in, which is whichever one the context started with.
 */
const screenPasses = new WeakMap<TFrameContext, TRenderPass>();

/**
 * Pictures with a world of their own, and pictures watching the one around them, in the order found.
 */
const inside: TRenderPass[] = [];
const watching: TRenderPass[] = [];

/**
 * Collects one picture into its own pass, and then every picture found inside it.
 *
 * A picture watching the world around it gets that world's models first, seen from its own camera,
 * and what it draws itself on top. What shows this same picture is left out, since a picture cannot
 * be read while it is being drawn.
 */
const gatherPicture = (box: TBox, seen: TWorldSeen, delta: number): void => {
    const picture = box.spriteTexture!;
    if (picture.texture.gpu === null) {
        return;
    }

    const lists = newLists();
    if (picture.sees === 'scene' && seen.models.length > 0) {
        const view = lists.views3d.length;
        const lighting = seen.lighting ?? collectLighting(rootOf(box));
        // The world's fog, unless the picture asked for one of its own: it is looking at that world.
        lists.views3d.push({ camera: box.camera3d ?? seen.camera, lights: lighting.lights, ambient: lighting.ambient, fog: box.fog ?? seen.fog });
        for (const model of seen.models) {
            if (shows(model, picture.texture)) {
                continue;
            }
            lists.drawables.push(model);
            lists.cameraIndex.push(-1);
            lists.viewIndex.push(view);
        }
    }

    let colliders = pictureColliders.get(box);
    if (colliders === undefined) {
        colliders = { flat: [], deep: [] };
        pictureColliders.set(box, colliders);
    }
    const found: TBox[] = [];
    const own = gatherTree(box, lists, delta, colliders, found);

    let pass = picturePasses.get(box);
    if (pass === undefined) {
        pass = {};
        picturePasses.set(box, pass);
    }
    pass.clearColor = picture.background;
    pass.renderTarget = picture.texture.gpu;
    pass.postProcess = false;
    pass.drawables = lists.drawables as TDrawSprite[];
    pass.cameras = lists.cameras;
    pass.cameraIndex = lists.cameraIndex;
    pass.views3d = lists.views3d;
    pass.viewIndex = lists.viewIndex;
    (picture.sees === 'scene' ? watching : inside).push(pass);

    for (const inner of found) {
        gatherPicture(inner, own, delta);
    }
};

/**
 * The scenes once more for a capture or a preview, through the cameras and kinds it asked for. The
 * caller says where it goes.
 *
 * Moved by nothing, since the screen's pass already moved everything this frame, and without the
 * pictures inside the scenes, which were drawn before it this frame and are shown as they are.
 *
 * Walking the tree a second time leaves the screen's pass as it was. Particles are not stepped
 * again: see `lookAgainAtParticles` for why that matters.
 */
const secondPass = (store: TRuntimeStore, seenThrough: TSeenThrough, clearColor: TColor): TRenderPass => {
    const lists = newLists();
    for (const scene of store.get('world').scenes) {
        if (!scene.held) {
            gatherTree(scene, lists, 0, { flat: [], deep: [] }, [], seenThrough, true);
        }
    }
    return {
        clearColor,
        // A picture of the game stands in for looking at the screen, so it wants the screen's look.
        postProcess: true,
        drawables: lists.drawables as TDrawSprite[],
        cameras: lists.cameras,
        cameraIndex: lists.cameraIndex,
        views3d: lists.views3d,
        viewIndex: lists.viewIndex,
    };
};

export const fillFrameContext = (store: TRuntimeStore, ctx: TFrameContext, delta = 0): void => {
    pass++;

    // Game objects while collecting and sorting; only sprites once texts are expanded.
    const lists = newLists();
    const { drawables, cameraIndex, cameras, views3d, viewIndex } = lists;
    const scenes = store.get('world').scenes;
    inside.length = 0;
    watching.length = 0;

    // Sorted one scene at a time, never across them: scenes stay stacked in the order they
    // started, so nothing in a level can climb over the HUD launched on top of it.
    scenes.forEach((scene, sceneIndex) => {
        // Waiting behind a transition. It is running and its assets are arriving, but what is on
        // screen is still the scene it replaces, so drawing it now would put the new room
        // underneath the old one for the whole cover.
        if (scene.held) {
            return;
        }

        sceneColliders[sceneIndex] ??= { flat: [], deep: [] };
        const found: TBox[] = [];
        // The screen is the one pass a tool's own cameras reach; see `TRuntimeState.viewport`.
        const seen = gatherTree(scene, lists, delta, sceneColliders[sceneIndex], found, store.get('viewport'));
        for (const box of found) {
            gatherPicture(box, seen, delta);
        }
    });

    // The screen last and the pictures before it, so a model shows this frame's picture and not the
    // last one. A picture found inside another is drawn before it, which is why the order found is
    // turned round. The ones watching a world go after the ones with a world of their own, because
    // what they watch can be showing one of those: the monitor sees the handheld's screen lit.
    let screen = screenPasses.get(ctx);
    if (screen === undefined) {
        screen = ctx.passes[0];
        screenPasses.set(ctx, screen);
    }
    ctx.passes.length = 0;
    for (let i = inside.length - 1; i >= 0; i--) {
        ctx.passes.push(inside[i]);
    }
    for (let i = watching.length - 1; i >= 0; i--) {
        ctx.passes.push(watching[i]);
    }
    // After the pictures, like the screen, so they show them as they are this frame.
    const capture = store.get('capture').request;
    if (capture !== null) {
        const pass = secondPass(store, capture, capture.background);
        pass.renderTarget = capture.target;
        ctx.passes.push(pass);
    }
    const preview = store.get('viewport').preview;
    if (preview !== null) {
        const pass = secondPass(store, preview, store.get('config').background);
        pass.targetCanvas = preview.canvas;
        ctx.passes.push(pass);
    }
    ctx.passes.push(screen);

    screen.clearColor = store.get('config').background;
    screen.drawables = drawables as TDrawSprite[];
    screen.cameras = cameras;
    screen.cameraIndex = cameraIndex;
    screen.views3d = views3d;
    screen.viewIndex = viewIndex;
    // This is the pass a person is looking at, whether or not anything is laid over it.
    screen.postProcess = true;

    // How far through its half the scene change is, and which half. Zero and zero when there is no
    // change, which is the right answer to "nothing is covering the screen" and is what every
    // full-screen effect has been handed since they existed.
    const transition = store.get('transition').active;
    // How many real pixels a game pixel is drawn with on the canvas. The backend applies it to the
    // screen's pass only.
    ctx.pixelRatio = screenSizeOf(store.get('screen').canvas).pixelRatio;
    ctx.progress = transition === null ? 0 : transition.progress;
    ctx.phase = transition === null || transition.phase === 'cover' ? 0 : 1;

    // A list only when something will run. Undefined is the whole of the promise that a game with
    // no effects draws exactly as it did before they existed: see `TFrameContext.post`.
    const post = buildPostChain(store);
    if (post === null) {
        delete ctx.post;
    } else {
        ctx.post = post;
    }
};
