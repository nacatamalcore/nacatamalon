import * as mat from '../../math/mat4';
import { transformForward } from './transform_basis';
import type { Mat4 } from '../../math/mat4';
import type { TDrawCamera3d } from '../interface/draw/t_draw_camera_3d';
import type { TDrawLight } from '../interface/draw/t_draw_light';
import type { TDrawMesh } from '../interface/draw/t_draw_mesh';
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
 * once and unaffordable per light. That is also why there is only ever one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_MAP_SIZE = 2048;

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
        const view = mat.lookAt(eye, target, up);
        out.set(mat.multiply(mat.perspective(opening, 1, SPOT_NEAR, range), view));
        return out;
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

    const view = mat.lookAt(eye, centre, up);
    // Twice the standing distance, so a caster as far behind the middle as the light is in front of
    // it is still in the picture.
    out.set(mat.multiply(mat.ortho(-half, half, -half, half, 0, distance * 2), view));
    return out;
};

/**
 * The one light a frame draws its shadows from, with everything the pass needs to draw them.
 *
 * `null` is the ordinary answer and the important one: a frame whose scenes never asked for a
 * shadow gets no map, no pass and no extra work anywhere, and that is what keeps this feature free
 * for the games that do not use it.
 *
 * A frame can hold several passes and each pass several scenes, so the search is ordered: the first
 * scene, of the last pass (the screen's), that has a light asking to cast. A menu stacked over a
 * level does not take the level's shadows away by being drawn second.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findShadowSource = (ctx: TFrameContext): TShadowSource | null => {
    // From the last pass back, which is the screen: there is one shadow map, and a picture drawn
    // inside the game must not take it from the world a person is looking at.
    for (let p = ctx.passes.length - 1; p >= 0; p--) {
        const pass = ctx.passes[p];
        const views = pass.views3d ?? [];
        for (let view = 0; view < views.length; view++) {
            const index = shadowCasterIndex(views[view].lights);
            if (index === -1) {
                continue;
            }

            const drawables = pass.drawables ?? [];
            const viewIndex = pass.viewIndex ?? [];
            const casters: TDrawMesh[] = [];
            for (let i = 0; i < drawables.length; i++) {
                const item = drawables[i];
                // Its own scene's, and only the ones that asked to be in it. A floor left out here
                // still receives: being drawn into the map is about casting, never about receiving.
                if (item.type === 'mesh' && (viewIndex[i] ?? -1) === view && item.castShadow !== false) {
                    casters.push(item);
                }
            }

            return { view: views[view], light: views[view].lights[index], lightIndex: index, camera: views[view].camera, casters };
        }
    }
    return null;
};

/**
 * Said once for the life of the game, because it is one mistake and not one per frame.
 */
let warnedOutside = false;

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
export const resetShadowWarnings = (): void => { warnedOutside = false; };

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
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const reportCastersOutside = (casters: readonly TDrawMesh[], light: TDrawLight, matrix: Mat4): void => {
    if (warnedOutside || light.type !== 'directional') {
        return;
    }

    for (const caster of casters) {
        const place = caster.worldMatrix;
        const x = place !== undefined ? place[12] : caster.transform.x;
        const y = place !== undefined ? place[13] : caster.transform.y;
        const z = place !== undefined ? place[14] : caster.transform.z;

        // Where its middle lands in the light's picture. Its middle and not its corners, because
        // this is a warning and not a clipping test: something half out is still mostly working,
        // while something whose middle is outside is a shadow nobody is going to see.
        const cx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const cy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        const cz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];

        if (Math.abs(cx) > 1 || Math.abs(cy) > 1 || cz < 0 || cz > 1) {
            warnedOutside = true;
            console.warn(
                '[NacatamalOn] something that casts a shadow is outside the square the light covers, so it casts nothing. ' +
                `Raise 'shadowArea' on that light (it is ${light.shadowArea ?? DEFAULT_SHADOW_AREA} now): it is how far the shadows reach in front of the camera.`,
            );
            return;
        }
    }
};
