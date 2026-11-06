import type { TFog } from '../../fog/types/t_fog';
import type { TDrawable } from '../../gameobjects/types';
import { screenSizeOf } from '../../DOM/screen_size';
import { collectDrawables, notePinnedInto } from './helper/collect_drawables';
import { drawingPicture, showsPicture, viewWalk, walkingView } from './helper/view_walk';
import type { TViewWalk } from './helper/view_walk';
import { pictureMadeAt } from '../../gameobjects/sprite_texture/create_sprite_texture';
import type { TSpriteTexture } from '../../gameobjects/sprite_texture/types';
import { sightOf } from '../../render/shared/sight_2d';
import { MAX_VIEWS } from '../../render/webgpu/sprite/write_sprite_instance';
import { emitterDrawnBy, lookAgainAtParticles, stepSceneParticles } from './helper/step_scene_particles';
import { stepSceneTilemaps } from './helper/step_scene_tilemaps';
import type { IRenderer } from '../../render';
import { stepScenePolygons, whiteFor } from './helper/step_scene_polygons';
import { anyMasks } from '../../mask/create_mask';
import { anyFilters } from '../../filter/create_filter';
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
import { collectLighting, holdsLights, ownAmbientOf, viewLighting } from './helper/collect_lights';
import { computeJointMatrices } from '../../math/skinning';
import { buildPostChain } from '../../post/build_post_chain';
import type { TCamera2d } from '../../camera';
import { cameraAsDrawn, pixelsPerUnit } from '../../camera/camera_as_drawn';
import type { TPixelSnap } from '../types/t_game_options';
import type { TDrawView3d } from '../../render/interface/draw/t_draw_view_3d';
import type { TDrawCamera3d } from '../../render/interface/draw/t_draw_camera_3d';
import type { TSceneColliders } from '../../gameobjects/particles/collide';
import type { TSceneLighting } from './helper/collect_lights';
import type { TCamera3d } from '../../camera/types/t_camera_3d';
import type { TRenderPass } from '../../render/interface';
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
 * Which half of the engine a drawable belongs to: what is in depth first (models, particles and lines
 * in space), everything 2D over them.
 */
const layerRank = (drawable: TDrawable): number => (inDepth(drawable) ? 0 : 1);

/**
 * Whether a drawable blends over what is behind it in depth, and so is drawn after the solid models,
 * furthest first: a see-through model, or particles in space, which are always blended.
 */
const blendsOver = (drawable: TDrawable): boolean =>
    (drawable.type === 'mesh' && isTransparentMesh(drawable)) || drawable.type === 'particles-3d';

/**
 * The camera's view, kept between frames so sorting glass allocates nothing.
 */
const sortView = mat.create();

/**
 * What a drawable is sorted as: itself, or, for a cloud already swapped for its stand-in (the models
 * a monitor shows), its emitter, which has the place and the `zIndex` the stand-in does not.
 */
const sortedAs = (drawable: TDrawable): TDrawable =>
    drawable.type === 'particles-3d' ? (emitterDrawnBy(drawable) as TDrawable | undefined) ?? drawable : drawable;

/**
 * How far in front of the camera a see-through model or a cloud of particles is, along the way the
 * camera looks: the more negative, the further. Along the view rather than a straight distance, so an
 * orthographic camera sorts as correctly as a perspective one. Measured from the model's or the
 * emitter's own place, so two that cross each other can still come out the wrong way round, as they
 * do in most engines, and a cloud is as far as its emitter even when its particles have drifted.
 */
const viewDepth = (drawable: TDrawable, view: Float32Array): number => {
    const placed = sortedAs(drawable);
    if (placed.type !== 'mesh' && placed.type !== 'particles-3d') {
        return 0;
    }
    const world = placed.worldMatrix;
    // A stand-in nobody knows the emitter of has no place to be measured from.
    if (world === undefined && placed.transform === undefined) {
        return 0;
    }
    const x = world !== undefined ? world[12] : placed.transform.x;
    const y = world !== undefined ? world[13] : placed.transform.y;
    const z = world !== undefined ? world[14] : placed.transform.z;
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
const sortLevels: Array<TMaskLevel | null> = [];

/**
 * Sorts by `zIndex` the drawables from `start` to the end, in place, and only if one of them asks
 * for it. A scene where nobody says `zIndex` is already in the order it was built in, and a
 * benchmark of many thousands of sprites should not pay for a sort it does not use. Nor does one
 * that is already in order, which is nearly every frame of nearly every scene.
 *
 * `cameraIndex` is reordered with them: each entry belongs to its drawable, and sorting one list
 * without the other would draw a HUD through the world's camera.
 *
 * **See-through models and particles in space go after the solid ones at their number, furthest
 * first.** They blend over what is already drawn, so what is behind them has to be there first, and
 * among themselves the nearest has to be last. `zIndex` still wins over all of it, so a scene that
 * ordered its glass by hand keeps that order.
 */
const sortSceneByZIndex = (drawables: TDrawable[], cameraIndex: number[], start: number, camera: TCamera3d | null, levels: Array<TMaskLevel | null> | null): void => {
    let needed = false;
    let models = false;
    for (let i = start; i < drawables.length; i++) {
        if (sortedAs(drawables[i]).zIndex !== undefined) {
            needed = true;
            break;
        }
        // A scene that mixes models and sprites has to be sorted even when nobody named a number,
        // or which one is on top would depend on the order they were made in.
        models = models || inDepth(drawables[i]);
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
        const glass = blendsOver(drawable);
        z[i] = sortedAs(drawable).zIndex ?? 0;
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
    if (levels !== null) {
        sortLevels.length = count;
        for (let i = 0; i < count; i++) {
            sortLevels[i] = levels[start + order[i]] ?? null;
        }
    }
    for (let i = 0; i < count; i++) {
        drawables[start + i] = sortedDrawables[i];
        cameraIndex[start + i] = sortedCameras[i];
        if (levels !== null) {
            levels[start + i] = sortLevels[i]!;
        }
    }
    // Let go of what was sorted, so a scene that is gone is not kept alive by the last frame's copy.
    sortedDrawables.length = 0;
    sortLevels.length = 0;
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

const newLists = (): TPassLists => ({ drawables: [], cameraIndex: [], cameras: [], views3d: [], viewIndex: [], masks: anyMasks() || anyFilters() ? { levels: [], shapes: new Map(), found: new Map(), filtered: new Map() } : null });

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
    /**
     * A view's own 2D camera, as it is and not as it is drawn: what parallax, the pixels things are
     * put on and what is skipped (its `cullingCamera`) are measured by. Left out, the scene's.
     */
    ownCamera2d?: TCamera2d | null;
    /** Boxes and drawables a capture leaves out, and the only ones it keeps (`TCaptureRequest`). */
    hide?: ReadonlySet<TBox | TDrawable> | null;
    only?: ReadonlySet<TBox | TDrawable> | null;
    /**
     * The scene a view of the world looks at. What the view makes itself is in that world: its models
     * are lit by the scene's lamps and stand in its fog, unless the view has lamps or fog of its own.
     */
    worldOf?: TBox;
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
 * The game's screen, in its pixels, this frame: what a 2D camera skipping for another is measured
 * over. `null` before there is one.
 */
let screenNow: { width: number; height: number } | null = null;

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
    // What parallax, pixel steps and skipping are measured by: the scene's camera, or a view's own.
    const measuredBy = viewport?.ownCamera2d !== undefined ? viewport.ownCamera2d : root.camera2d;
    // Skipped as another camera would skip, over the screen it draws: see `TCamera2d.cullingCamera`.
    const culling = measuredBy?.cullingCamera ?? null;
    const sights = size !== null && size.width > 0 && size.height > 0
        ? {
            scene: culling !== null
                ? sightOf(cameraAsDrawn(culling, snapping), screenNow?.width ?? size.width, screenNow?.height ?? size.height)
                : sightOf(drawnBy(sceneCamera), size.width, size.height),
            pinned: sightOf(drawnBy(screenCamera), size.width, size.height),
        }
        : null;
    // Parallax is measured against the scene's own camera, where the game has it, even when a tool
    // looks through one of its own: a far layer is where the game would draw it, and panning the
    // tool's view moves it with everything else rather than sliding it away by most of the pan.
    // A scene whose world is seen only through views keeps on the screen what is pinned to it, and
    // nothing else: noted as it is collected, since only the walk knows what is pinned. On the screen
    // and in a capture of it, while they look through the game's own cameras; a tool looking through
    // one of its own (the editor's edit mode, a camera's preview) or a capture asked for through
    // another camera wants the world itself. A view's own walk always does.
    const ownSight = viewport === null || (viewport.camera2d == null && viewport.camera3d == null);
    const pinnedOnly = root.worldOffScreen && root.parent === null && viewWalk() === null && ownSight ? [] as boolean[] : null;
    notePinnedInto(pinnedOnly);
    try {
        collectDrawables(root, drawables as TDrawable[], cameraIndex, sceneCamera, false, null, 0, colliders, pictures, screenCamera, measuredBy, null, snapping, lists.masks, null, null, sights);
    } finally {
        notePinnedInto(null);
    }
    // The models the screen leaves out with its world, which a picture watching the world around it
    // still sees (see the end of the walk).
    let modelsOffScreen: Array<TDrawable | TDrawSprite> | null = null;
    if (pinnedOnly !== null) {
        let kept = start;
        const unseen: TDrawable[] = [];
        const unseenCameras: number[] = [];
        // A second look (a capture) shows no picture, so it keeps no models for one.
        modelsOffScreen = again ? null : [];
        for (let i = start; i < drawables.length; i++) {
            if (!pinnedOnly[i - start]) {
                // Not drawn here, still going on: its particles move, so a view finds them where they
                // got to.
                const drawable = drawables[i] as TDrawable;
                if (drawable.type === 'particles' || drawable.type === 'particles-3d') {
                    unseen.push(drawable);
                    unseenCameras.push(cameraIndex[i]!);
                } else if (inDepth(drawable)) {
                    modelsOffScreen?.push(drawable);
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
        if (unseen.length > 0 && !again) {
            stepSceneParticles(unseen, unseenCameras, 0, rootOf(root).paused ? 0 : delta, colliders);
        }
        // Posed and placed as the screen would have them, and the particles as they were just moved:
        // a monitor in the room (`sees: '3d'`) shows them all the same.
        if (modelsOffScreen !== null) {
            for (const drawn of unseen) {
                if (drawn.type === 'particles-3d') {
                    modelsOffScreen.push(drawn);
                }
            }
            poseSkeletons(modelsOffScreen, 0);
            stepSceneLines(modelsOffScreen as TDrawable[], 0);
        }
    }
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
        const world = viewport?.worldOf;
        lighting = world !== undefined && world !== root ? viewLighting(root, world) : collectLighting(root);
        const fog = root.fog ?? world?.fog ?? null;
        const seenThrough = viewport?.camera3d ?? root.camera3d;
        views3d.push({ camera: drawnThrough(seenThrough, camera2d), cullingCamera: skippedBy(seenThrough, camera2d), lights: lighting.lights, ambient: lighting.ambient, fog });
    }
    for (let i = start; i < drawables.length; i++) {
        viewIndex[i] = inDepth(drawables[i]) ? view : -1;
    }

    poseSkeletons(drawables, start);

    // After the walk, because a particle is born where its emitter **ended up**. A paused scene
    // is frozen rather than skipped: it keeps drawing the cloud it last had.
    //
    // A second look in the same frame (a capture, a preview) shows what this one stepped instead.
    // Flat ones on the pixels the sprites of this pass are on, by the camera they are measured by.
    const particlePixels = { perUnit: pixelsPerUnit(snapping, measuredBy), camera: sceneCamera };
    if (again) {
        lookAgainAtParticles(drawables as TDrawable[], cameraIndex, start, particlePixels);
    } else {
        stepSceneParticles(drawables as TDrawable[], cameraIndex, start, rootOf(root).paused ? 0 : delta, colliders, particlePixels);
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

    const models = drawables.slice(start).filter(inDepth);
    if (modelsOffScreen !== null) {
        models.push(...modelsOffScreen);
    }
    return { models, camera: root.camera3d, lighting, fog: root.fog };
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
 * Every picture drawn this frame, with its pass, in the order found.
 */
const pictureEntries: Array<{ pass: TRenderPass; record: TSpriteTexture }> = [];

/**
 * Each view's walk of the world, kept between frames: its stand-ins live in it.
 */
const viewWalks = new WeakMap<TBox, TViewWalk>();

/**
 * Notes into `into` every picture something a pass draws shows: the picture of a sprite, a letter, a
 * map, a shape or an effect's particles, or one a model wears.
 */
const notePicturesShown = (items: ReadonlyArray<unknown>, into: Set<unknown>): void => {
    for (const item of items) {
        const drawn = item as { type?: string; texture?: unknown; children?: ReadonlyArray<unknown> };
        if (drawn.texture !== undefined) {
            into.add(drawn.texture);
        }
        // A model's maps, and those of the material over a sprite, a letter or a map's layer.
        const maps = (item as { material?: { maps?: Readonly<Record<string, { texture: unknown }>> } }).material?.maps;
        for (const name in maps ?? {}) {
            into.add(maps![name]!.texture);
        }
        if (drawn.type === 'mesh') {
            const material = (item as TDrawable & { type: 'mesh' }).material;
            into.add(material.texture);
            into.add(material.emissiveTexture);
            into.add(material.occlusion?.texture);
        } else if ((drawn.type === 'particles' || drawn.type === 'particles-3d') && 'file' in drawn) {
            const file = (item as TDrawable & { type: 'particles' }).file;
            into.add(file.atlas?.texture ?? file.texture);
        }
        if (drawn.children !== undefined) {
            notePicturesShown(drawn.children, into);
        }
    }
};

/**
 * Every picture a pass shows, its soft masks' passes included: what is under a soft mask is drawn
 * there, not in the pass itself.
 */
const picturesShownIn = (pass: TRenderPass): Set<unknown> => {
    const shown = new Set<unknown>();
    notePicturesShown(pass.drawables ?? [], shown);
    for (const first of passesBefore.get(pass) ?? []) {
        notePicturesShown(first.drawables ?? [], shown);
    }
    return shown;
};

/**
 * The pictures' passes in the order they have to be drawn: each after the pictures it shows, so it
 * shows them as they are this frame.
 *
 * Pictures that watch one another round in a ring cannot all go after each other. The ring is broken
 * where the earliest made of them is: it is drawn first, and shows the others as they were last
 * frame, which is what their textures still hold. Two monitors facing each other are a fair thing
 * to build, and a frame late is all it costs, so nothing is said. A picture that only shows one in a
 * ring waits for it like any other.
 */
const orderPicturePasses = (entries: ReadonlyArray<{ pass: TRenderPass; record: TSpriteTexture }>): TRenderPass[] => {
    // One picture or none has nothing to wait for.
    if (entries.length < 2) {
        return entries.map((entry) => entry.pass);
    }
    const left = [...entries].sort((a, b) => pictureMadeAt(a.record) - pictureMadeAt(b.record));
    const reads = new Map(left.map((entry) => {
        const shown = picturesShownIn(entry.pass);
        return [entry, left.filter((other) => other !== entry && shown.has(other.record.texture))];
    }));
    const done = new Set<object>();
    // Whether `start` is in a ring of pictures still waiting: whether what it waits for waits, some
    // way round, for it.
    const inRing = (start: (typeof left)[number]): boolean => {
        const visited = new Set<object>();
        const stack = [...reads.get(start)!];
        while (stack.length > 0) {
            const at = stack.pop()!;
            if (at === start) {
                return true;
            }
            if (done.has(at) || visited.has(at)) {
                continue;
            }
            visited.add(at);
            stack.push(...reads.get(at)!);
        }
        return false;
    };
    const out: TRenderPass[] = [];
    while (left.length > 0) {
        let next = left.findIndex((entry) => reads.get(entry)!.every((other) => done.has(other)));
        if (next < 0) {
            next = Math.max(0, left.findIndex(inRing));
        }
        const [entry] = left.splice(next, 1);
        done.add(entry!);
        out.push(entry!.pass);
    }
    return out;
};

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
    // The cameras a view looks through, its own or its scene's, which what it draws itself shares:
    // a marker on the hero is where the hero is.
    let lookedThrough: TSeenThrough | null = null;
    if (picture.sees === 'world') {
        // The world of its scene once more, through the view's own cameras: moved by nothing, since
        // the screen's walk has already moved everything this frame, and placed for this view by
        // copies of its own (see `standInFor`).
        const scene = rootOf(box);
        const own2d = box.camera2d ?? scene.camera2d;
        let walk = viewWalks.get(box);
        if (walk === undefined) {
            walk = { standIns: new WeakMap(), own: picture.texture, hide: null, only: null };
            viewWalks.set(box, walk);
        }
        walk.own = picture.texture;
        walk.hide = picture.hide;
        walk.only = picture.only;
        const firstView = lists.views3d.length;
        const through: TSeenThrough = { camera2d: cameraAsDrawn(own2d, snapping), camera3d: box.camera3d ?? scene.camera3d, layers: null, ownCamera2d: own2d, worldOf: scene };
        lookedThrough = through;
        walkingView(walk, () => gatherTree(scene, lists, 0, { flat: [], deep: [] }, [], through, true, { width: picture.texture.width, height: picture.texture.height }));
        // Its own fog and its own shade, when it asked for them: it is looking at that world, and a
        // minimap of a dark dungeon can read in full.
        const ambient = firstView < lists.views3d.length ? ownAmbientOf(box) : null;
        if (box.fog !== null || ambient !== null) {
            for (let i = firstView; i < lists.views3d.length; i++) {
                const view = lists.views3d[i]!;
                lists.views3d[i] = { ...view, fog: box.fog ?? view.fog, ambient: ambient ?? view.ambient };
            }
        }
    }
    if (picture.sees === '3d' && seen.models.length > 0) {
        const view = lists.views3d.length;
        const lighting = seen.lighting ?? collectLighting(rootOf(box));
        // The world's fog, unless the picture asked for one of its own: it is looking at that world.
        const seenThrough = box.camera3d ?? seen.camera;
        // Through its 2D camera as the picture draws its own sprites with it, rounded the same.
        const flat = cameraAsDrawn(box.camera2d, snapping);
        lists.views3d.push({ camera: drawnThrough(seenThrough, flat), cullingCamera: skippedBy(seenThrough, flat), lights: lighting.lights, ambient: ownAmbientOf(box) ?? lighting.ambient, fog: box.fog ?? seen.fog });
        const first = lists.drawables.length;
        for (const model of seen.models) {
            // Whatever wears the picture this pass draws into: a model, or an effect's particles.
            if (showsPicture(model as TDrawable, picture.texture)) {
                continue;
            }
            lists.drawables.push(model);
            lists.cameraIndex.push(-1);
            lists.viewIndex.push(view);
            lists.masks?.levels.push(null);
        }
        // What is see-through again, furthest first, through this picture's own camera: the screen's
        // order is the screen's, and a monitor looking the other way sees it the other way round.
        sortSceneByZIndex(lists.drawables as TDrawable[], lists.cameraIndex, first, seenThrough, lists.masks?.levels ?? null);
    }

    let colliders = pictureColliders.get(box);
    if (colliders === undefined) {
        colliders = { flat: [], deep: [] };
        pictureColliders.set(box, colliders);
    }
    const found: TBox[] = [];
    const own = drawingPicture(picture.texture, () => gatherTree(box, lists, delta, colliders, found, lookedThrough, false, { width: picture.texture.width, height: picture.texture.height }));

    let pass = picturePasses.get(box);
    if (pass === undefined) {
        pass = {};
        picturePasses.set(box, pass);
    }
    pass.clearColor = picture.background;
    pass.renderTarget = picture.texture.gpu;
    pass.postProcess = false;
    finishPass(pass, lists, { width: picture.texture.width, height: picture.texture.height, pixelRatio: 1 });
    pictureEntries.push({ pass, record: picture });

    // A monitor inside a view looks through the cameras the view does, into its fog and by its light.
    const seenHere = lookedThrough === null || found.length === 0 ? own : {
        ...own,
        camera: lookedThrough.camera3d,
        fog: box.fog ?? rootOf(box).fog,
        lighting: own.lighting ?? (holdsLights(box) ? viewLighting(box, rootOf(box)) : null),
    };
    for (const inner of found) {
        gatherPicture(inner, seenHere, delta);
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
    ctx.delta = delta;
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
    screenNow = screenSize;
    pictureEntries.length = 0;

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
    // last one, and each picture after the pictures it shows: the monitor sees the handheld's screen
    // lit, and the minimap the monitor in the room.
    let screen = screenPasses.get(ctx);
    if (screen === undefined) {
        screen = ctx.passes[0];
        screenPasses.set(ctx, screen);
    }
    ctx.passes.length = 0;
    for (const pass of orderPicturePasses(pictureEntries)) {
        pushPass(ctx.passes, pass);
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
