import type { TFog } from '../../fog/types/t_fog';
import type { TDrawable } from '../../gameobjects/types';
import { screenSizeOf } from '../../DOM/screen_size';
import { collectDrawables } from './helper/collect_drawables';
import { sightOf } from '../../render/shared/sight_2d';
import { MAX_VIEWS } from '../../render/webgpu/sprite/write_sprite_instance';
import { lookAgainAtParticles, stepSceneParticles } from './helper/step_scene_particles';
import { stepSceneTilemaps } from './helper/step_scene_tilemaps';
import type { IRenderer } from '../../render';
import { stepScenePolygons, whiteFor } from './helper/step_scene_polygons';
import { anyMasks } from '../../mask/create_mask';
import { applyMasks } from '../../mask/apply_masks';
import { beginSoftTargets, endSoftTargets } from '../../mask/soft_targets';
import { rememberMaskedPass } from '../../mask/masked_pick';
import type { TMaskLevel, TMaskWalk } from '../../mask/mask_walk';
import type { TMaskTarget } from '../../mask/apply_masks';
import type { TDrawItem } from '../../render/interface';
import { stepSceneLines } from './helper/step_scene_lines';
import type { TFrameContext } from '../../render';
import type { TDrawSprite } from '../../render/interface';
import { expandText, startTextFrame } from '../../gameobjects/text/expand_text';
import { expandNineSlice } from '../../gameobjects/nine_slice/expand_nine_slice';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TRuntimeStore } from '../../store';
import type { TRuntimeState } from '../../store/types/t_runtime_state';
import { collectLighting } from './helper/collect_lights';
import { computeJointMatrices } from '../../math/skinning';
import { buildPostChain } from '../../post/build_post_chain';
import type { TCamera2d } from '../../camera';
import { cameraAsDrawn } from '../../camera/camera_as_drawn';
import type { TPixelSnap } from '../types/t_game_options';
import type { TDrawView3d } from '../../render/interface/draw/t_draw_view_3d';
import type { TDrawCamera3d } from '../../render/interface/draw/t_draw_camera_3d';
import type { TSceneColliders } from '../../gameobjects/particles/collide';
import type { TSceneLighting } from './helper/collect_lights';
import type { TCamera3d } from '../../camera/types/t_camera_3d';
import type { TRenderPass } from '../../render/interface';
import type { TTexture } from '../../loaders';
import { rootOf } from '../../box';
import type { TBox } from '../../box';
import { ownerOfDrawable } from '../../box/drawable_owner';
import type { TColor } from '../../color';
import { isTransparentMesh } from '../../render/shared/is_transparent_mesh';
import { computeView } from '../../render/shared/compute_mvp_3d';
import * as mat from '../../math/mat4';

/**
 * Whether a drawable is seen through its scene's camera in depth: a model, particles or lines in space.
 */
const inDepth = (drawable: TDrawable | TDrawSprite): boolean =>
    drawable.type === 'mesh' || drawable.type === 'particles-3d' || drawable.type === 'lines';

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

/**
 * What a sort works with, kept between frames: a scene of thousands sorted every frame made five
 * lists of that size each time, only to throw them away.
 */
let sortZ = new Float64Array(256);
let sortRank = new Uint8Array(256);
let sortDepth = new Float64Array(256);
const sortOrder: number[] = [];
const sortDrawables: TDrawable[] = [];
const sortCameras: number[] = [];

/**
 * Sorts by `zIndex` the drawables from `start` to the end, in place, and only if one of them asks
 * for it. A scene where nobody says `zIndex` is already in the order it was built in, and a
 * benchmark of many thousands of sprites should not pay for a sort it does not use. Nor does one
 * that is already in order, which is nearly every frame of nearly every scene.
 *
 * `cameraIndex` is reordered with them: each entry belongs to its drawable, and sorting one list
 * without the other would draw a HUD through the world's camera.
 *
 * **See-through models go after the solid ones at their number, furthest first.** They blend over
 * what is already drawn, so what is behind them has to be there first, and among themselves the
 * nearest has to be last. `zIndex` still wins over all of it, so a scene that ordered its glass by
 * hand keeps that order.
 */
const sortSceneByZIndex = (drawables: TDrawable[], cameraIndex: number[], start: number, camera: TCamera3d | null, levels: Array<TMaskLevel | null> | null): void => {
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
    if (sortZ.length < count) {
        let room = sortZ.length;
        while (room < count) room *= 2;
        sortZ = new Float64Array(room);
        sortRank = new Uint8Array(room);
        sortDepth = new Float64Array(room);
    }
    // Each drawable read once, into numbers: its `zIndex`, then which half of the engine it is in and
    // whether it is see-through, in one rank. A comparison then only compares numbers, where reading
    // the fields of thousands of drawables of every kind, twice for each comparison, was what a big
    // scene spent its sort on.
    const z = sortZ;
    const rank = sortRank;
    const depth = sortDepth;
    let seeThrough = false;
    for (let i = 0; i < count; i++) {
        const drawable = drawables[start + i];
        const glass = drawable.type === 'mesh' && isTransparentMesh(drawable);
        z[i] = drawable.zIndex ?? 0;
        rank[i] = layerRank(drawable) * 2 + (glass ? 1 : 0);
        depth[i] = 0;
        seeThrough = seeThrough || glass;
    }
    if (seeThrough) {
        computeView(camera, sortView);
        for (let i = 0; i < count; i++) {
            depth[i] = (rank[i] & 1) === 1 ? viewDepth(drawables[start + i], sortView) : 0;
        }
    }
    // Two of the same rank are both see-through or both not, so the depth only ever parts glass.
    const before = (a: number, b: number): number => z[a] - z[b] || rank[a] - rank[b] || depth[a] - depth[b];

    // A game usually builds in the order its things are drawn, the level and then the HUD over it,
    // so the tree often lists them in the order of their numbers already. Seeing that is one pass,
    // and then nothing is copied or written back. One built otherwise (a HUD made first, a map's
    // `'under'` layer added after the sprites on it) is sorted every frame, as it always was.
    let inOrder = true;
    for (let i = 1; i < count && inOrder; i++) {
        inOrder = before(i - 1, i) <= 0;
    }
    if (inOrder) {
        return;
    }

    const order = sortOrder;
    order.length = count;
    for (let i = 0; i < count; i++) {
        order[i] = i;
    }
    order.sort(before);
    // Copied out before any is written back, since the order reads the lists as they were.
    const sortedDrawables = sortDrawables;
    const sortedCameras = sortCameras;
    sortedDrawables.length = count;
    sortedCameras.length = count;
    for (let i = 0; i < count; i++) {
        sortedDrawables[i] = drawables[start + order[i]];
        sortedCameras[i] = cameraIndex[start + order[i]];
    }
    // A drawable's masks go with it, like its camera.
    const sortedLevels = levels === null ? null : order.map((i) => levels[start + i] ?? null);
    for (let i = 0; i < count; i++) {
        drawables[start + i] = sortedDrawables[i];
        cameraIndex[start + i] = sortedCameras[i];
        if (sortedLevels !== null) {
            levels![start + i] = sortedLevels[i]!;
        }
    }
    // Let go of what was sorted, so a scene that is gone is not kept alive by the last frame's copy.
    sortedDrawables.length = 0;
};

/**
 * Replaces every text and every nine-slice from `start` to the end with the sprites that draw it,
 * each one drawn through the camera of what it came from. Only rebuilds the stretch when it holds
 * one, so a scene of sprites alone pays one pass over it and nothing else.
 */
const expandSceneIntoSprites = (drawables: Array<TDrawable | TDrawSprite>, cameraIndex: number[], start: number, viewIndex: number[], levels: Array<TMaskLevel | null> | null = null): void => {
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
    // And the masks, which each part keeps from what it is part of.
    const tailLevels = levels?.splice(start) ?? null;
    for (let i = 0; i < tailDrawables.length; i++) {
        const drawable = tailDrawables[i];
        const level = tailLevels?.[i] ?? null;
        if (drawable.type === 'nine-slice') {
            for (const piece of expandNineSlice(drawable)) {
                drawables.push(piece);
                cameraIndex.push(tailCameras[i]);
                viewIndex.push(-1);
                levels?.push(level);
            }
            continue;
        }
        if (drawable.type !== 'text') {
            drawables.push(drawable);
            cameraIndex.push(tailCameras[i]);
            viewIndex.push(tailViews[i]);
            levels?.push(level);
            continue;
        }
        for (const glyph of expandText(drawable as TText)) {
            drawables.push(glyph);
            cameraIndex.push(tailCameras[i]);
            // A character is a sprite, so it belongs to no 3D view.
            viewIndex.push(-1);
            levels?.push(level);
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
    /**
     * Each drawable's innermost mask and each mask's shape, or `null` when nothing anywhere is
     * masked: a game with no masks keeps no list for them.
     */
    masks: TMaskWalk | null;
};

const newLists = (): TPassLists => ({ drawables: [], cameraIndex: [], cameras: [], views3d: [], viewIndex: [], masks: anyMasks() ? { levels: [], shapes: new Map(), found: new Map() } : null });

/**
 * The passes each pass needs drawn before it: what its soft masks draw into. Kept per pass and
 * written over every frame.
 */
const passesBefore = new WeakMap<TRenderPass, TRenderPass[]>();

/**
 * Puts a pass in the frame, after the passes it needs drawn first.
 */
const pushPass = (passes: TRenderPass[], pass: TRenderPass): void => {
    for (const first of passesBefore.get(pass) ?? []) {
        passes.push(first);
    }
    passes.push(pass);
};

/**
 * Hands a pass its lists, with its masks worked in when anything in it is masked.
 *
 * Each mask's shape is made into what a backend draws, as the scene's own drawables were (a text
 * into its letters, a shape into its triangles), and then everything is handed to `applyMasks`.
 * What the lists were before that is noted for the pointer, which has to find what is masked where
 * it is drawn, a soft mask's included, and ask the masks whether it is seen there.
 *
 * @param target What the pass draws on, which is what a soft mask's pictures are made to match.
 */
const finishPass = (pass: TRenderPass, lists: TPassLists, target: TMaskTarget): void => {
    pass.drawables = lists.drawables as TDrawSprite[];
    pass.cameras = lists.cameras;
    pass.cameraIndex = lists.cameraIndex;
    pass.views3d = lists.views3d;
    pass.viewIndex = lists.viewIndex;
    if (pass.stencil !== undefined) {
        delete pass.stencil;
    }
    passesBefore.delete(pass);
    rememberMaskedPass(pass, null);
    const masks = lists.masks;
    if (masks === null) {
        return;
    }
    // Noted before anything is drawn, so the pointer keeps to the masks with no renderer at all.
    const sources = new Map<unknown, { drawables: TDrawable[]; cameraIndex: number[] }>();
    for (const [mask, shape] of masks.shapes) {
        sources.set(mask, { drawables: [...shape.drawables], cameraIndex: [...shape.cameraIndex] });
    }
    rememberMaskedPass(pass, { drawables: lists.drawables, cameraIndex: lists.cameraIndex, levels: masks.levels, shapes: sources as never });
    if (drawingWith === null) {
        return;
    }
    for (const shape of masks.shapes.values()) {
        stepSceneTilemaps(shape.drawables, 0);
        stepScenePolygons(shape.drawables, 0, drawingWith);
        expandSceneIntoSprites(shape.drawables, shape.cameraIndex, 0, shape.drawables.map(() => -1));
    }
    const masked = applyMasks({
        drawables: lists.drawables,
        cameraIndex: lists.cameraIndex,
        viewIndex: lists.viewIndex,
        levels: masks.levels,
        shapes: masks.shapes,
        cameras: lists.cameras,
        views3d: lists.views3d,
    }, target, drawingWith, whiteFor(drawingWith));
    if (masked === null) {
        return;
    }
    pass.drawables = masked.drawables as unknown as TDrawItem[];
    pass.cameraIndex = masked.cameraIndex;
    pass.viewIndex = masked.viewIndex;
    pass.stencil = masked.stencil;
    passesBefore.set(pass, masked.before);
};

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
/**
 * A 3D camera as it is drawn when it follows the 2D one, kept between frames per 3D camera and per
 * 2D camera it follows. Per pair because one camera can be seen in two passes of a frame through
 * two 2D cameras (the screen's and a picture's, the game's and a tool's), drawn through or skipped
 * by, and the lists of every pass are read after all of them are made: one kept per 3D camera would
 * leave all of them showing the last.
 */
type TFollowing = { -readonly [K in keyof TDrawCamera3d]: TDrawCamera3d[K] } & { flat: { x: number; y: number; rotation: number; zoom: number } };
const following = new WeakMap<TCamera3d, WeakMap<object, TFollowing>>();
/** What stands for no 2D camera among the keys above, where the screen's pixels are followed. */
const NO_FLAT = {};

/**
 * The camera a scene's models are drawn through: its 3D camera, or, for one that follows the 2D
 * camera (`TCamera3d.follow2d`), that camera seen as the 2D one the sprites are drawn through, a
 * tool's included, so a tool panning the flat world pans the models with it. With no 2D camera, the
 * screen's pixels, as the sprites have them.
 */
const drawnThrough = (camera3d: TCamera3d | null, camera2d: TCamera2d | null): TDrawCamera3d | null => {
    if (camera3d === null || !followsFlat(camera3d)) {
        return camera3d;
    }
    let kept = following.get(camera3d);
    if (kept === undefined) {
        kept = new WeakMap();
        following.set(camera3d, kept);
    }
    let drawn = kept.get(camera2d ?? NO_FLAT);
    if (drawn === undefined) {
        drawn = { ...camera3d, flat: { x: 0, y: 0, rotation: 0, zoom: 1 } };
        kept.set(camera2d ?? NO_FLAT, drawn);
    }
    drawn.projection = camera3d.projection;
    drawn.transform = camera3d.transform;
    drawn.fov = camera3d.fov;
    drawn.near = camera3d.near;
    drawn.far = camera3d.far;
    drawn.zoom = camera3d.zoom;
    drawn.flat.x = camera2d?.transform.x ?? 0;
    drawn.flat.y = camera2d?.transform.y ?? 0;
    drawn.flat.rotation = camera2d?.transform.rotation ?? 0;
    drawn.flat.zoom = camera2d?.zoom || 1;
    return drawn;
};

/** Whether a 3D camera places its models in the 2D world, `y` down. */
const followsFlat = (camera3d: TCamera3d): boolean => camera3d.follow2d === true && camera3d.projection === 'orthographic';

/** The cameras already told they cannot skip by the one they were given. */
const warnedSkipping = new WeakSet<TCamera3d>();

/**
 * The camera a view skips by, when its own was given another (`TCamera3d.cullingCamera`), seen as it
 * would be drawn: through the same 2D camera, if it follows one.
 *
 * Only between cameras of one kind. A camera in the 2D world, `y` down, and one in a world of its own,
 * `y` up, do not look at the same places, so one cannot say what the other leaves out: said once, and
 * the view skips by its own.
 */
const skippedBy = (camera3d: TCamera3d | null, camera2d: TCamera2d | null): TDrawCamera3d | null => {
    const other = camera3d?.cullingCamera ?? null;
    if (camera3d === null || other === null) {
        return null;
    }
    if (followsFlat(other) !== followsFlat(camera3d)) {
        if (!warnedSkipping.has(camera3d)) {
            warnedSkipping.add(camera3d);
            console.warn('[NacatamalOn] cullingCamera: one camera follows the 2D one and the other does not, so they do not see the same world. Give it a camera of the same kind; until then it skips by its own.');
        }
        return null;
    }
    return drawnThrough(other, camera2d);
};

type TSeenThrough = Pick<TRuntimeState['viewport'], 'camera3d' | 'camera2d' | 'layers'> & {
    screen2d?: TCamera2d | null;
    /** Boxes and drawables a capture leaves out, and the only ones it keeps (`TCaptureRequest`). */
    hide?: ReadonlySet<TBox | TDrawable> | null;
    only?: ReadonlySet<TBox | TDrawable> | null;
};

/**
 * Whether a capture that leaves out `hide` and keeps only `only` draws `drawable`: by itself, by the
 * box it is in, or by any box above that one.
 */
const keptByBoxes = (drawable: TDrawable, hide: ReadonlySet<TBox | TDrawable> | null, only: ReadonlySet<TBox | TDrawable> | null): boolean => {
    if (hide?.has(drawable)) {
        return false;
    }
    let kept = only === null || only.has(drawable);
    for (let box: TBox | null = ownerOfDrawable(drawable)?.box ?? null; box !== null; box = box.parent) {
        if (hide?.has(box)) {
            return false;
        }
        if (only?.has(box)) {
            kept = true;
        }
    }
    return kept;
};

/**
 * Which pixels this frame draws flat things on: the game's `pixelSnap`, read once a frame.
 */
let snapping: TPixelSnap = 'off';

/**
 * The renderer of the game being filled in, for the shapes whose corners go up every frame.
 */
let drawingWith: IRenderer | null = null;

const gatherTree = (
    root: TBox,
    lists: TPassLists,
    delta: number,
    colliders: TSceneColliders,
    pictures: TBox[],
    viewport: TSeenThrough | null = null,
    again = false,
    size: { width: number; height: number } | null = null,
): TWorldSeen => {
    const { drawables, cameraIndex, cameras, views3d, viewIndex } = lists;
    const levels = lists.masks?.levels ?? null;

    // The camera itself goes over, not a copy: moving it between two frames needs nothing
    // rebuilt. A scene without one draws in screen pixels, which is `-1`. A tool looking at the
    // screen through a camera of its own wins over the scene's.
    //
    // The scene's own camera is drawn on the same pixels as everything else under `pixelSnap`; a
    // tool's is not, since it is zoomed in to look and would pan in steps of its zoom. Models that
    // follow it are drawn through this same one, or they would slide against the sprites by however
    // much it was rounded.
    const camera2d = viewport?.camera2d == null ? cameraAsDrawn(root.camera2d, snapping) : viewport.camera2d;
    let sceneCamera = -1;
    if (camera2d !== null) {
        sceneCamera = cameras.length;
        cameras.push(camera2d);
    }

    // What is pinned to the screen goes through the tool's camera for it, when it has one.
    let screenCamera = -1;
    const screen2d = viewport?.screen2d ?? null;
    if (screen2d !== null) {
        screenCamera = cameras.length;
        cameras.push(screen2d);
    }

    const start = drawables.length;
    colliders.flat.length = 0;
    colliders.deep.length = 0;
    // What each of its cameras shows, in the size this pass is drawn: a flat drawable outside it is
    // left out as it is collected. Not known, as for a canvas with no size yet, nothing is. A camera
    // past what the shader holds draws through the screen, so it is judged by the screen too.
    const drawnBy = (index: number) => (index >= 0 && index < MAX_VIEWS - 1 ? cameras[index] : null);
    const sights = size !== null && size.width > 0 && size.height > 0
        ? {
            scene: sightOf(drawnBy(sceneCamera), size.width, size.height),
            pinned: sightOf(drawnBy(screenCamera), size.width, size.height),
        }
        : null;
    // Parallax is measured against the scene's own camera, where the game has it, even when a tool
    // looks through one of its own: a far layer is where the game would draw it, and panning the
    // tool's view moves it with everything else rather than sliding it away by most of the pan.
    collectDrawables(root, drawables as TDrawable[], cameraIndex, sceneCamera, false, null, 0, colliders, pictures, screenCamera, root.camera2d, null, snapping, lists.masks, null, null, sights);
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
                if (drawable.type === 'particles' || drawable.type === 'particles-3d') {
                    hidden.push(drawable);
                    hiddenCameras.push(cameraIndex[i]!);
                }
                continue;
            }
            drawables[kept] = drawables[i];
            cameraIndex[kept] = cameraIndex[i];
            if (levels !== null) levels[kept] = levels[i] ?? null;
            kept++;
        }
        drawables.length = kept;
        cameraIndex.length = kept;
        if (levels !== null) levels.length = kept;
        // A kind the screen does not show is still going on in the game, so its particles still move:
        // a capture of the game has to find them where they got to, and they must not all start
        // again the moment the screen shows them. A second look moves nothing (see below).
        if (hidden.length > 0 && !again) {
            stepSceneParticles(hidden, hiddenCameras, 0, rootOf(root).paused ? 0 : delta, colliders);
        }
    }
    // A capture leaving some boxes out, or keeping some alone: only on its own pass, never the screen's.
    const hide = viewport?.hide ?? null;
    const only = viewport?.only ?? null;
    if (hide !== null || only !== null) {
        let kept = start;
        for (let i = start; i < drawables.length; i++) {
            if (!keptByBoxes(drawables[i] as TDrawable, hide, only)) {
                continue;
            }
            drawables[kept] = drawables[i];
            cameraIndex[kept] = cameraIndex[i];
            if (levels !== null) levels[kept] = levels[i] ?? null;
            kept++;
        }
        drawables.length = kept;
        cameraIndex.length = kept;
        if (levels !== null) levels.length = kept;
    }
    sortSceneByZIndex(drawables as TDrawable[], cameraIndex, start, viewport?.camera3d ?? root.camera3d, levels);

    // The scene's own way of seeing and lighting its models, worked out only when it has any:
    // a 2D game never pays for a walk looking for lamps it does not have.
    const view = drawables.slice(start).some(inDepth) ? views3d.length : -1;
    let lighting: TSceneLighting | null = null;
    if (view >= 0) {
        lighting = collectLighting(root);
        const seenThrough = viewport?.camera3d ?? root.camera3d;
        views3d.push({ camera: drawnThrough(seenThrough, camera2d), cullingCamera: skippedBy(seenThrough, camera2d), lights: lighting.lights, ambient: lighting.ambient, fog: root.fog });
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
    // And a shape, drawn as a map layer of its own triangles, rebuilt as its corners are now.
    stepScenePolygons(drawables as TDrawable[], start, drawingWith!);

    // After the walk as well: a set of lines follows its object, and is placed in the world here.
    stepSceneLines(drawables as TDrawable[], start);

    // After the sort, so a text or a nine-slice moves as one block and its parts stay together.
    expandSceneIntoSprites(drawables, cameraIndex, start, viewIndex, levels);

    return { models: drawables.slice(start).filter(inDepth), camera: root.camera3d, lighting, fog: root.fog };
};

/**
 * Whether a model shows `texture`, as its picture, its glow's, its occlusion's or one of its maps,
 * which it must not while that texture is being drawn into.
 */
const shows = (item: TDrawable | TDrawSprite, texture: TTexture): boolean => {
    if (item.type !== 'mesh') {
        return false;
    }
    if (item.material.texture === texture || item.material.emissiveTexture === texture || item.material.occlusion?.texture === texture) {
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
    if (picture.sees === '3d' && seen.models.length > 0) {
        const view = lists.views3d.length;
        const lighting = seen.lighting ?? collectLighting(rootOf(box));
        // The world's fog, unless the picture asked for one of its own: it is looking at that world.
        const seenThrough = box.camera3d ?? seen.camera;
        // Through its 2D camera as the picture draws its own sprites with it, rounded the same.
        const flat = cameraAsDrawn(box.camera2d, snapping);
        lists.views3d.push({ camera: drawnThrough(seenThrough, flat), cullingCamera: skippedBy(seenThrough, flat), lights: lighting.lights, ambient: lighting.ambient, fog: box.fog ?? seen.fog });
        for (const model of seen.models) {
            if (shows(model, picture.texture)) {
                continue;
            }
            lists.drawables.push(model);
            lists.cameraIndex.push(-1);
            lists.viewIndex.push(view);
            lists.masks?.levels.push(null);
        }
    }

    let colliders = pictureColliders.get(box);
    if (colliders === undefined) {
        colliders = { flat: [], deep: [] };
        pictureColliders.set(box, colliders);
    }
    const found: TBox[] = [];
    const own = gatherTree(box, lists, delta, colliders, found, null, false, { width: picture.texture.width, height: picture.texture.height });

    let pass = picturePasses.get(box);
    if (pass === undefined) {
        pass = {};
        picturePasses.set(box, pass);
    }
    pass.clearColor = picture.background;
    pass.renderTarget = picture.texture.gpu;
    pass.postProcess = false;
    finishPass(pass, lists, { width: picture.texture.width, height: picture.texture.height, pixelRatio: 1 });
    (picture.sees === '3d' ? watching : inside).push(pass);

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
const secondPass = (store: TRuntimeStore, seenThrough: TSeenThrough, clearColor: TColor, target: TMaskTarget, effects = true): TRenderPass => {
    const lists = newLists();
    for (const scene of store.get('world').scenes) {
        if (!scene.held) {
            gatherTree(scene, lists, 0, { flat: [], deep: [] }, [], seenThrough, true, { width: target.width / target.pixelRatio, height: target.height / target.pixelRatio });
        }
    }
    const pass: TRenderPass = {
        clearColor,
        // A picture of the game stands in for looking at the screen, so it wants the screen's look,
        // unless the game asked for it without (`useCapture`'s `effects: false`).
        postProcess: effects,
    };
    finishPass(pass, lists, target);
    return pass;
};

export const fillFrameContext = (store: TRuntimeStore, ctx: TFrameContext, delta = 0): void => {
    pass++;
    startTextFrame();
    snapping = store.get('config').pixelSnap;
    drawingWith = store.get('screen').renderer;
    if (drawingWith !== null) {
        beginSoftTargets(drawingWith);
    }

    // Game objects while collecting and sorting; only sprites once texts are expanded.
    const lists = newLists();
    const scenes = store.get('world').scenes;
    // The game's pixels the screen is drawn in, which is what its cameras show.
    const shown = store.get('screen').canvas;
    const ratio = shown === null || shown === undefined ? 1 : screenSizeOf(shown).pixelRatio;
    const screenSize = shown === null || shown === undefined ? null : { width: shown.width / ratio, height: shown.height / ratio };
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
        const seen = gatherTree(scene, lists, delta, sceneColliders[sceneIndex], found, store.get('viewport'), false, screenSize);
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
        pushPass(ctx.passes, inside[i]);
    }
    for (let i = watching.length - 1; i >= 0; i--) {
        pushPass(ctx.passes, watching[i]);
    }
    // After the pictures, like the screen, so they show them as they are this frame.
    const capture = store.get('capture').request;
    if (capture !== null) {
        const pass = secondPass(store, capture, capture.background, { width: capture.width, height: capture.height, pixelRatio: 1 }, capture.effects);
        pass.renderTarget = capture.target;
        pushPass(ctx.passes, pass);
    }
    const preview = store.get('viewport').preview;
    if (preview !== null) {
        const pass = secondPass(store, preview, store.get('config').background, { width: preview.canvas.width, height: preview.canvas.height, pixelRatio: 1 });
        pass.targetCanvas = preview.canvas;
        pushPass(ctx.passes, pass);
    }

    screen.clearColor = store.get('config').background;
    const canvas = store.get('screen').canvas;
    finishPass(screen, lists, { width: canvas.width, height: canvas.height, pixelRatio: screenSizeOf(canvas).pixelRatio });
    // This is the pass a person is looking at, whether or not anything is laid over it.
    screen.postProcess = true;
    pushPass(ctx.passes, screen);
    if (drawingWith !== null) {
        endSoftTargets(drawingWith);
    }

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
