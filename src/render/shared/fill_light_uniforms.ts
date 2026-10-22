import { MAX_LIGHTS } from '../../light/types/t_light';
import { transformForward } from './transform_basis';
import type { TColor } from '../../color';
import type { TDrawLight } from '../interface/draw/t_draw_light';
import type { TDrawFog, TDrawView3d } from '../interface/draw/t_draw_view_3d';
import type { TDrawCamera3d } from '../interface/draw/t_draw_camera_3d';

/**
 * What a backend hands over about the shadow it drew, or `null` for a frame that drew none.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShadowUniforms = {
    /**
     * The scene it was drawn for.
     *
     * Kept so that only that scene is told about it. Scenes stack, each numbers its own lights from
     * zero, and a menu drawn over a level would otherwise read "light 1 casts" against a lamp of
     * its own that has nothing to do with the sun outside.
     */
    view: TDrawView3d;
    /**
     * The light's own matrix, the one the map was drawn with.
     */
    matrix: Float32Array;
    /**
     * The light it belongs to, for its bias and how dark it goes.
     */
    light: TDrawLight;
    /**
     * Which of this scene's lights that is.
     */
    lightIndex: number;
    /**
     * How many steps across the map is, so the shader knows how far one step is.
     */
    mapSize: number;
};

/**
 * Four numbers of heading (the ambient colour and how many lights there are), then sixteen per
 * light: four groups of four, which is what a graphics card wants a list in a uniform to be.
 *
 * Sixteen rather than twelve because a cone needs both its angles, and because the stride has to be
 * a multiple of four numbers anyway: packing tighter would buy nothing at all.
 *
 * @internal
 */
export const LIGHT_FLOATS_PER_ITEM = 16;

/**
 * The shadow's share of the block: the light's matrix, then four numbers about reading it.
 *
 * It sits with the lights and not with the model, and that is the decision this whole step turns
 * on. A shadow is a property of **how this view is lit**: one map, one light, one point of view,
 * the same for every model in the scene. Putting it on the model would be the same twenty numbers
 * written again for every crate in the room.
 *
 * It is also why nothing here needed a binding group of its own. Group 3 is already shared between
 * a material of your own and a skeleton's bones: a material on a model that bends carries the bones
 * inside its own group, since WebGPU promises no more than four. A third claimant would have broken
 * that.
 *
 * @internal
 */
export const SHADOW_FLOATS = 20;

/**
 * The fog's share: what it fades into and whether it is on, then where it starts and ends.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const FOG_FLOATS = 8;

/**
 * The way the view looks, for the shine and the fresnel: the way back towards the viewer, then `1`
 * for a view that is orthographic, where that way is the same for every point.
 *
 * From the camera's place to the point is right for a perspective camera, whose rays all leave one
 * eye. An orthographic one has no such eye, its rays are parallel, and measuring from its place
 * (the corner of the screen, for one that measures in pixels) lit one side of every edge more than
 * the other.
 *
 * @internal
 */
export const VIEW_FLOATS = 4;

export const LIGHT_UNIFORM_FLOATS = 4 + MAX_LIGHTS * LIGHT_FLOATS_PER_ITEM + SHADOW_FLOATS + FOG_FLOATS + VIEW_FLOATS;

/**
 * Where the shadow's share starts, just past the lights.
 */
const SHADOW_AT = 4 + MAX_LIGHTS * LIGHT_FLOATS_PER_ITEM;

/**
 * Where the fog's share starts, just past the shadow's.
 */
const FOG_AT = SHADOW_AT + SHADOW_FLOATS;

/**
 * Where the way the view looks starts, just past the fog's.
 */
const VIEW_AT = FOG_AT + FOG_FLOATS;

/**
 * What `castShadow` on a light is worth when it does not say how far off the surface to test.
 */
const DEFAULT_SHADOW_BIAS = 0.002;

/**
 * What the shader branches on.
 */
const LIGHT_KIND: Record<TDrawLight['type'], number> = { directional: 0, point: 1, spot: 2, rect: 3 };

/**
 * A panel's own X and Y, turned the way it is and as long as half of each side.
 *
 * The same turns `transformForward` reads, so the panel's front is the way it shines: X by the turn
 * about Y, Y by the turn about X and then about Y, both turned by the roll.
 */
const rectHalfSides = (
    transform: TDrawLight['transform'],
    halfWidth: number,
    halfHeight: number,
): { right: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } } => {
    const cx = Math.cos(transform.rotationX);
    const sx = Math.sin(transform.rotationX);
    const cy = Math.cos(transform.rotationY);
    const sy = Math.sin(transform.rotationY);
    const right = { x: cy, y: 0, z: -sy };
    const up = { x: sx * sy, y: cx, z: sx * cy };
    const cr = Math.cos(transform.rotation);
    const sr = Math.sin(transform.rotation);
    return {
        right: {
            x: (right.x * cr + up.x * sr) * halfWidth,
            y: (right.y * cr + up.y * sr) * halfWidth,
            z: (right.z * cr + up.z * sr) * halfWidth,
        },
        up: {
            x: (up.x * cr - right.x * sr) * halfHeight,
            y: (up.y * cr - right.y * sr) * halfHeight,
            z: (up.z * cr - right.z * sr) * halfHeight,
        },
    };
};

/**
 * Writes a frame's lights into the block every model reads.
 *
 * **Once per frame, not once per model**: the lights are the same for everything in it, and sending
 * eight of them with every single draw is what this layout exists to avoid.
 *
 * It packs exactly what it is handed and substitutes nothing. A scene with no lights at all is a
 * real state, and deciding what to do about it belongs upstream, where a scene lit only by ambient
 * can be told apart from one that forgot to say anything.
 *
 * Written once here and read by both backends, so the two cannot drift: the same numbers in the
 * same places, whichever card is drawing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillLightUniforms = (
    out: Float32Array,
    lights: readonly TDrawLight[],
    ambient: TColor,
    shadow: TShadowUniforms | null = null,
    fog: TDrawFog | null = null,
    camera: TDrawCamera3d | null = null,
): number => {
    out.fill(0);
    out[0] = ambient.r;
    out[1] = ambient.g;
    out[2] = ambient.b;
    out[3] = lights.length;
    // Seen through the 2D camera, the world's `y` goes down: a light aimed down when it was set up
    // still comes from above on the screen. Where a lamp is, it is in the 2D world like the models.
    const turn = (camera?.flat ?? null) !== null ? -1 : 1;

    lights.forEach((light, index) => {
        const base = 4 + index * LIGHT_FLOATS_PER_ITEM;
        out[base + 3] = LIGHT_KIND[light.type];
        out[base + 4] = light.color.r * light.intensity;
        out[base + 5] = light.color.g * light.intensity;
        out[base + 6] = light.color.b * light.intensity;

        if (light.type === 'directional') {
            // The shader wants the way **towards** the light. A light travels along its own
            // forward, so towards it is the other way.
            const forward = transformForward(light.transform);
            out[base] = -forward.x;
            out[base + 1] = -forward.y * turn;
            out[base + 2] = -forward.z;
            return;
        }

        out[base] = light.transform.x;
        out[base + 1] = light.transform.y;
        out[base + 2] = light.transform.z;
        out[base + 7] = light.range ?? 0;

        if (light.type === 'spot') {
            const forward = transformForward(light.transform);
            out[base + 8] = forward.x;
            out[base + 9] = forward.y * turn;
            out[base + 10] = forward.z;
            const angle = light.angle ?? 0;
            out[base + 11] = Math.cos(angle);
            out[base + 12] = Math.cos(angle * (1 - (light.penumbra ?? 0)));
        }

        if (light.type === 'rect') {
            // Its two half sides, as the ways along them: its own X and Y, turned like it is.
            const half = rectHalfSides(light.transform, (light.width ?? 1) / 2, (light.height ?? 1) / 2);
            out[base + 8] = half.right.x;
            out[base + 9] = half.right.y * turn;
            out[base + 10] = half.right.z;
            out[base + 12] = half.up.x;
            out[base + 13] = half.up.y * turn;
            out[base + 14] = half.up.z;
        }
    });

    // `-1` is how the shader is told there is nothing to read, and it is the ordinary case: every
    // scene in the engine until a light is asked to cast writes it and samples nothing.
    out[SHADOW_AT + 16] = 0;
    out[SHADOW_AT + 17] = 0;
    out[SHADOW_AT + 18] = 0;
    out[SHADOW_AT + 19] = -1;

    if (shadow !== null) {
        out.set(shadow.matrix, SHADOW_AT);
        out[SHADOW_AT + 16] = shadow.light.shadowBias ?? DEFAULT_SHADOW_BIAS;
        out[SHADOW_AT + 17] = shadow.light.shadowStrength ?? 1;
        out[SHADOW_AT + 18] = 1 / shadow.mapSize;
        // Which of the eight it is, so only that one's share of the light is taken away. A thing in
        // the sun's shadow is still lit by the lamp beside it, and that is the difference between a
        // shadow and a dark smudge.
        out[SHADOW_AT + 19] = shadow.lightIndex;
    }

    // Zero is no fog, which is what `fill(0)` above already left: the shader multiplies by it. The
    // fourth number says which kinds are on: 1 by distance, 2 by height, 3 both.
    const kinds = fog === null || !fog.enabled ? 0 : (fog.distance ? 1 : 0) + (fog.height.enabled ? 2 : 0);
    if (fog !== null && kinds > 0) {
        out[FOG_AT] = fog.color.r;
        out[FOG_AT + 1] = fog.color.g;
        out[FOG_AT + 2] = fog.color.b;
        out[FOG_AT + 3] = kinds;
        out[FOG_AT + 4] = fog.near;
        // Never at or before the start: the shader divides by the distance between the two.
        out[FOG_AT + 5] = Math.max(fog.far, fog.near + 0.0001);
        out[FOG_AT + 6] = fog.height.top;
        // Never the same height as the top, for the same reason; either side of it is fine, since
        // which side says which way the fog runs.
        out[FOG_AT + 7] = fog.height.bottom === fog.height.top ? fog.height.top - 0.0001 : fog.height.bottom;
    }

    // Zero, which `fill(0)` already left, is a perspective view. No camera at all is drawn
    // orthographic, looking down -Z like a camera that never turned.
    if (camera === null || camera.projection !== 'perspective') {
        const forward = camera === null || (camera.flat ?? null) !== null
            ? { x: 0, y: 0, z: -1 }
            : transformForward({ ...camera.transform, quaternion: null });
        const length = Math.hypot(forward.x, forward.y, forward.z) || 1;
        out[VIEW_AT] = -forward.x / length;
        out[VIEW_AT + 1] = -forward.y / length;
        out[VIEW_AT + 2] = -forward.z / length;
        out[VIEW_AT + 3] = 1;
    }

    return lights.length;
};
