import * as mat from '../../math/mat4';
import { transformForward } from './transform_basis';
import { computeModelMatrix, fillCameraSpace, newCameraSpace } from './compute_mvp_3d';
import { meshInView } from './mesh_in_view';
import type { Mat4 } from '../../math/mat4';
import type { TDrawCamera3d } from '../interface/draw/t_draw_camera_3d';
import type { TDrawLight } from '../interface/draw/t_draw_light';
import type { TDrawMesh } from '../interface/draw/t_draw_mesh';
import type { TDrawCustom } from '../interface/draw/t_draw_custom';
import type { TDrawView3d } from '../interface/draw/t_draw_view_3d';
import type { TFrameContext } from '../interface/t_frame_context';

/**
 * What a frame's shadows are drawn from: one light, what it is looking at, and what goes in the map.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShadowSource = {
    /**
     * The scene it belongs to, so only that one is told about it.
     */
    view: TDrawView3d;
    /**
     * The light the map is drawn from.
     */
    light: TDrawLight;
    /**
     * Which of the scene's lights it is, so the shader can darken that one's share and no other's.
     */
    lightIndex: number;
    /**
     * The camera of the scene it belongs to, which is what the square follows.
     */
    camera: TDrawCamera3d | null;
    /**
     * The models drawn into the map: this scene's, visible, and not opted out.
     */
    casters: readonly TDrawMesh[];
    /**
     * The drawings of a plugin's kinds in the same scene: each kind decides which of them cast.
     */
    customs: readonly TDrawCustom[];
};

/**
 * How many steps across the shadow map is, on both cards.
 *
 * It lives here, with the arithmetic of the light's point of view, and not with either card's
 * texture, for two reasons. It has to be **one number**: two backends holding their own would draw
 * the same scene at two sharpnesses and nothing on screen would say which was which. And the
 * snapping below needs it, because a step of the map is the unit the area is rounded to.
 *
 * 2048 square is the era's answer, and this engine's: a GameCube did this at 512 or 1024, a square
 * map costs one number instead of two, and the whole thing is 16 MB of depth, which is affordable
 * once and unaffordable per light. That is also why a scene casts from one light only, and why a
 * frame keeps at most `MAX_SHADOW_MAPS` of them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_MAP_SIZE = 2048;

/**
 * How many shadow maps a frame draws at most: one for each view whose scene has a light casting,
 * so each half of a split screen has its shadows around its own camera.
 *
 * Four, which is four players on one screen. Each is 16 MB and a pass over everything that casts,
 * made the first frame a view needs it, so a game with one camera keeps one. A fifth view casting
 * is drawn without shadows, the screen's own views being the first to have theirs.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_SHADOW_MAPS = 4;

/**
 * How many frames in a row a shadow map may go unused before it is let go of: a few seconds, so a
 * number of views going up and down (a capture taken, a preview opened and closed) does not make
 * maps again and again, and a split screen back to one camera gives its 16 MB back.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPARE_SHADOW_FRAMES = 180;

/**
 * How far a surface is pushed away from the light while the map is drawn, so it does not shadow
 * itself.
 *
 * A surface is compared against a depth taken from a different point of view, at a different
 * resolution, and the two never agree exactly: half the steps come out a hair nearer than the
 * surface standing on them, and a floor lit at a slant stripes itself in bands. Pushing what is
 * written slightly further away is the fix, and it is paid for at the other end as a shadow
 * starting a little late.
 *
 * **Both cards take the same two numbers and mean the same thing by them**: a part that grows with
 * how slanted the surface is, and a flat part in the smallest step the depth picture can tell
 * apart. Core sets them on WebGPU and never calls `polygonOffset` at all on WebGL2, so the same
 * scene stripes on one card and not the other with nothing in the game to blame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_DEPTH_BIAS = 2;

/**
 * The half of it that grows with the slant, which is where nearly all of the striping comes from.
 */
export const SHADOW_SLOPE_BIAS = 2;

/**
 * How wide a square of the world a sun's shadows cover when it does not say.
 *
 * Twelve units, which at this engine's usual scale is a courtyard: wide enough that a character and
 * what is around them are all in it, tight enough that 2048 steps across still land several to the
 * centimetre. It is the one number worth raising by hand, and raising it costs sharpness rather
 * than speed.
 */
const DEFAULT_SHADOW_AREA = 12;

/**
 * How far back a sun stands to look at that square, when it does not say.
 */
const DEFAULT_SHADOW_DISTANCE = 20;

/**
 * The near plane of a torch's shadow, kept off zero because a frustum starting at nothing is nothing.
 */
const SPOT_NEAR = 0.1;

/**
 * How far a torch sees when it has no reach of its own.
 */
const DEFAULT_SPOT_RANGE = 20;

type TVec3 = { x: number; y: number; z: number };

const normalise = (v: TVec3): TVec3 => {
    const length = Math.hypot(v.x, v.y, v.z);
    return length === 0 ? { x: 0, y: 0, z: -1 } : { x: v.x / length, y: v.y / length, z: v.z / length };
};

const cross = (a: TVec3, b: TVec3): TVec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});

const dot = (a: TVec3, b: TVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Which light a scene casts its shadows from, or `-1` for a scene that casts none.
 *
 * **The first one that asks, and only the first.** One map means one point of view, and the honest
 * way to spend it is on whoever asked first rather than on whoever happened to be built last.
 *
 * A point light never casts here, however loudly it asks: a bulb shines every way at once, so its
 * shadows need six pictures rather than one. That is the whole of why it is left out, and saying it
 * costs a line.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const shadowCasterIndex = (lights: readonly TDrawLight[]): number =>
    lights.findIndex((light) => light.castShadow === true && (light.type === 'directional' || light.type === 'spot'));

/**
 * Where a light's view and its projection are worked out before they are multiplied into the
 * answer, kept between calls: a light is worked out once per frame, one after another.
 */
const lightView = mat.create();
const lightProjection = mat.create();

/**
 * Where the shadow-casting light looks from, as one matrix taking the world into its picture.
 *
 * Written into `out` and handed back, so a frame that draws a thousand models still holds one of
 * these. Worked out **once a frame**, never per model: what changes per model is its own placement,
 * and that is multiplied in by the shader.
 *
 * The two kinds are aimed differently on purpose:
 *
 * - **A sun** has no position worth using, so the question is only which square of the world it is
 *   worth having shadows in. That square **follows the camera**. Core centres it on the world's
 *   origin, which means a character who walks far enough loses their shadow completely, with
 *   nothing on screen to explain it and nothing in the game that changed.
 * - **A torch** already answers the question by being somewhere and having a reach: its shadow
 *   frustum is its own cone. Giving it an area to cover as well would be two ways of saying one
 *   thing, and the second one would quietly win.
 *
 * ### Why the square is rounded to whole steps
 *
 * Following the camera brings its own fault, and it is worse than the one it fixes: as the camera
 * slides, the same wall is measured at slightly different places in the map every frame, and its
 * shadow **crawls** along its own edge even though nothing in the scene has moved.
 *
 * The fix is to let the square move only in whole steps of the map. The middle is measured along
 * the light's own two sideways directions, each measurement is rounded to a multiple of one step,
 * and the square is rebuilt around the rounded point. Move the camera a centimetre and the map is
 * sampled in exactly the same places as before, so the shadow holds still; move it far enough and
 * the whole square jumps one step, which nobody can see.
 *
 * Without this, following the camera looks worse than not following it, and it is the kind of fault
 * that ships unnoticed because a still screenshot cannot show it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lightSpaceMatrix = (light: TDrawLight, camera: TDrawCamera3d | null, out: Mat4): Mat4 => {
    const forward = normalise(transformForward({ ...light.transform, quaternion: null }));

    // Any two directions across the light will do, as long as the same two come out for the same
    // light: they are what the middle is measured along, and a middle measured along a direction
    // that wobbles would round to a different place every frame. Straight up is the natural
    // reference, swapped near the poles because crossing two parallel directions gives nothing.
    const reference = Math.abs(forward.y) > 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    const right = normalise(cross(reference, forward));
    const up = cross(forward, right);

    if (light.type === 'spot') {
        const range = light.range !== undefined && light.range > 0 ? light.range : DEFAULT_SPOT_RANGE;
        // The whole cone, not half of it: `angle` is the half-width, and a frustum is given its
        // full opening. Half of it would clip the shadows off at the edge of the lit circle.
        const opening = light.angle !== undefined ? Math.min(Math.max(light.angle * 2, 0.05), Math.PI - 0.01) : Math.PI / 3;
        const eye = light.transform;
        const target = { x: eye.x + forward.x, y: eye.y + forward.y, z: eye.z + forward.z };
        mat.lookAt(eye, target, up, lightView);
        return mat.multiply(mat.perspective(opening, 1, SPOT_NEAR, range, lightProjection), lightView, out);
    }

    const area = light.shadowArea !== undefined && light.shadowArea > 0 ? light.shadowArea : DEFAULT_SHADOW_AREA;
    const distance = light.shadowDistance !== undefined && light.shadowDistance > 0 ? light.shadowDistance : DEFAULT_SHADOW_DISTANCE;
    const half = area / 2;
    const step = area / SHADOW_MAP_SIZE;

    // Centred half a square AHEAD of the camera, not on the camera, and that one decision is what
    // `shadowArea` means: **shadows reach from the camera out to `shadowArea` in front of it**.
    // Centred on the camera instead, half the square would cover the empty space behind the player.
    //
    // It also means the number has to be big enough to reach the scene. A camera five hundred units
    // back from what it is watching needs a square of about a thousand, and with a smaller one
    // every shadow in the scene is simply missing: nothing warns, because from the engine's side a
    // scene where nothing is in the light's way looks exactly the same.
    //
    // A scene with no camera is drawn flat on, and then the origin is as good an answer as any.
    const ahead = half;
    const facing = camera === null ? { x: 0, y: 0, z: -1 } : transformForward({ ...camera.transform, quaternion: null });
    const focus = camera === null
        ? { x: 0, y: 0, z: 0 }
        : {
            x: camera.transform.x + facing.x * ahead,
            y: camera.transform.y + facing.y * ahead,
            z: camera.transform.z + facing.z * ahead,
        };

    const alongRight = Math.round(dot(focus, right) / step) * step;
    const alongUp = Math.round(dot(focus, up) / step) * step;
    // Rounded as well, and for a reason that is easy to miss: the two sideways ones are what decide
    // where the map is *sampled*, but this one decides how far away everything in it *is*, and a
    // depth that slides by a fraction every frame moves the whole shadow in and out of its own bias.
    // Left unrounded it is the same crawl, arriving through the other door.
    const alongForward = Math.round(dot(focus, forward) / step) * step;
    const centre = {
        x: right.x * alongRight + up.x * alongUp + forward.x * alongForward,
        y: right.y * alongRight + up.y * alongUp + forward.y * alongForward,
        z: right.z * alongRight + up.z * alongUp + forward.z * alongForward,
    };

    const eye = {
        x: centre.x - forward.x * distance,
        y: centre.y - forward.y * distance,
        z: centre.z - forward.z * distance,
    };

    mat.lookAt(eye, centre, up, lightView);
    // Twice the standing distance, so a caster as far behind the middle as the light is in front of
    // it is still in the picture.
    return mat.multiply(mat.ortho(-half, half, -half, half, 0, distance * 2, lightProjection), lightView, out);
};

/**
 * The drawings of a plugin's kind in a scene that has none, which is nearly every scene: one empty
 * list for all of them.
 */
const NO_CUSTOMS: readonly TDrawCustom[] = [];

/**
 * The lights a frame draws its shadows from, one for each view whose scene has a light asking to
 * cast, with everything each pass needs to draw them.
 *
 * Empty is the ordinary answer and the important one: a frame whose scenes never asked for a shadow
 * gets no map, no pass and no extra work anywhere, and that is what keeps this feature free for the
 * games that do not use it.
 *
 * Each view has its own, around its own camera: two halves of a split screen look at two places in
 * the world, and one map around one of them left the other half without shadows. A frame holds
 * several passes and each pass several views, so the search is ordered: the last pass (the
 * screen's) first, its views in order, then the pictures drawn inside the game, up to
 * `MAX_SHADOW_MAPS`. A menu stacked over a level does not take the level's shadows away by being
 * drawn second. A view found again in another pass (the passes a soft mask draws share the views of
 * the pass they mask) keeps the one it has, so it never spends a second map.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findShadowSources = (ctx: TFrameContext): TShadowSource[] => {
    const sources: TShadowSource[] = [];
    for (let p = ctx.passes.length - 1; p >= 0; p--) {
        const pass = ctx.passes[p];
        const views = pass.views3d ?? [];
        for (let view = 0; view < views.length; view++) {
            const index = shadowCasterIndex(views[view].lights);
            if (index === -1 || sources.some((source) => source.view === views[view])) {
                continue;
            }

            const drawables = pass.drawables ?? [];
            const viewIndex = pass.viewIndex ?? [];
            const casters: TDrawMesh[] = [];
            // Made only for a scene that has a drawing of a plugin's kind: most never do.
            let customs: TDrawCustom[] | null = null;
            for (let i = 0; i < drawables.length; i++) {
                const item = drawables[i];
                if (item.type === 'custom' && (viewIndex[i] ?? -1) === view) {
                    (customs ??= []).push(item);
                }
                // Its own view's, and only the ones that asked to be in it. A floor left out here
                // still receives: being drawn into the map is about casting, never about receiving.
                // One that adds its colour is light, and light blocks none.
                if (item.type === 'mesh' && (viewIndex[i] ?? -1) === view && item.castShadow !== false && item.material.blend !== 'additive') {
                    casters.push(item);
                }
            }

            sources.push({ view: views[view], light: views[view].lights[index], lightIndex: index, camera: views[view].camera, casters, customs: customs ?? NO_CUSTOMS });
            if (sources.length === MAX_SHADOW_MAPS) {
                return sources;
            }
        }
    }
    return sources;
};

/**
 * The renderers that already said so: once for the life of the game, because it is one mistake and
 * not one per frame. A test that calls this with no renderer is the page's.
 */
let warnedOutside = new WeakSet<object>();
const PAGE = {};

/**
 * Where what the camera sees is worked out for the warning. Never handed out.
 */
const sightScratch = newCameraSpace();

/**
 * Forgets that the warning below was already given.
 *
 * It exists for the tests and for nothing else. Said-once is the right behaviour for a game and the
 * wrong one for a test file: the first case to trigger it would silence every case after it, and
 * those would then pass without checking anything at all, which is worse than not having them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resetShadowWarnings = (): void => { warnedOutside = new WeakSet(); };

/**
 * Says so, once, when something that should cast a shadow falls outside the square the light covers.
 *
 * This is the failure this feature keeps having, and it is worth a warning precisely because it
 * does not look like a failure: the frame draws, nothing throws, the console is clean, and a wall
 * that ought to be casting simply is not. There is nothing on screen to tell that apart from a
 * scene where nothing happens to be in the light's way.
 *
 * So the warning names the number to raise rather than describing the problem, because knowing that
 * `shadowArea` exists is the whole of the fix.
 *
 * Only a sun is checked. A torch's frustum is its own cone, and something outside it is not out of
 * range: it is simply not lit by that torch, which is a thing the scene already shows.
 *
 * And only what the camera sees. A square is a poor fit for what a camera sees, narrow near it and
 * wide far off, so there is always something in front of it, off to a side or past its far end, that
 * no square of a sensible size reaches. Its shadow is nowhere on the screen either, and saying so
 * would send whoever reads it to raise the number for nothing, with every shadow coarser for it.
 * What is seen and casts nothing is the failure worth naming, and it is judged by the same test that
 * decides what is drawn, so it is counted whenever that test cannot be sure.
 *
 * Nor anything whose middle is behind the camera: the square starts at the camera, so that middle is
 * outside it however big it is, and raising the number would not help.
 *
 * What it misses is something out of sight whose shadow falls into it, which is rare, and which a
 * bigger square does not always reach either.
 *
 * @param by The renderer drawing it, so each game says it once.
 * @param camera The camera the square follows; `null` checks every caster.
 * @param viewportWidth The size the camera's picture is drawn at, whose shape is what it sees.
 * @param viewportHeight
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const reportCastersOutside = (
    casters: readonly TDrawMesh[],
    light: TDrawLight,
    matrix: Mat4,
    by: object = PAGE,
    camera: TDrawCamera3d | null = null,
    viewportWidth = 1,
    viewportHeight = 1,
): void => {
    if (warnedOutside.has(by) || light.type !== 'directional') {
        return;
    }
    // What the camera sees by, worked out only once something is found outside the square.
    let seen: Mat4 | null = null;

    for (const caster of casters) {
        const place = caster.worldMatrix;
        let x = place !== undefined ? place[12] : caster.transform.x;
        let y = place !== undefined ? place[13] : caster.transform.y;
        let z = place !== undefined ? place[14] : caster.transform.z;
        // One drawn as many is judged by the middle of its instances, which may stand far from the
        // place the group itself is at.
        const many = caster.instances?.bounds ?? null;
        if (many !== null) {
            const mx = (many.min.x + many.max.x) / 2;
            const my = (many.min.y + many.max.y) / 2;
            const mz = (many.min.z + many.max.z) / 2;
            const m = place ?? computeModelMatrix(caster.transform);
            x = m[0] * mx + m[4] * my + m[8] * mz + m[12];
            y = m[1] * mx + m[5] * my + m[9] * mz + m[13];
            z = m[2] * mx + m[6] * my + m[10] * mz + m[14];
        }

        // Its middle behind the camera: outside the square whatever its size (see above).
        if (camera !== null) {
            const facing = transformForward({ ...camera.transform, quaternion: null });
            const ahead = (x - camera.transform.x) * facing.x + (y - camera.transform.y) * facing.y + (z - camera.transform.z) * facing.z;
            if (ahead < 0) {
                continue;
            }
        }

        // Where its middle lands in the light's picture. Its middle and not its corners, because
        // this is a warning and not a clipping test: something half out is still mostly working,
        // while something whose middle is outside is a shadow nobody is going to see.
        const cx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const cy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        const cz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];

        if (Math.abs(cx) > 1 || Math.abs(cy) > 1 || cz < 0 || cz > 1) {
            // Out of the camera's sight: its shadow is not on the screen either (see above).
            if (camera !== null) {
                seen ??= fillCameraSpace(sightScratch, camera, viewportWidth, viewportHeight).viewProjection;
                if (!meshInView(caster, seen)) {
                    continue;
                }
            }
            warnedOutside.add(by);
            console.warn(
                '[NacatamalOn] useDirectionalLight: something that casts a shadow is outside the square the light covers, so it casts nothing. ' +
                `Raise 'shadowArea' on that light (it is ${light.shadowArea ?? DEFAULT_SHADOW_AREA} now): it is how far the shadows reach in front of the camera.`,
            );
            return;
        }
    }
};
