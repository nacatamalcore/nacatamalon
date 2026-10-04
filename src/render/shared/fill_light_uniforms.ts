import { MAX_LIGHTS } from '../../light/types/t_light';
import { transformForward } from './transform_basis';
import type { TColor } from '../../color';
import type { TDrawLight } from '../interface/draw/t_draw_light';
import type { TDrawFog, TDrawView3d } from '../interface/draw/t_draw_view_3d';

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
 * It is also why nothing here needed a binding group of its own. Group 3 is already contested
 * between a material of your own and a skeleton's bones, and they only coexist because a model that
 * bends never takes the material path. A third claimant would have broken that.
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

export const LIGHT_UNIFORM_FLOATS = 4 + MAX_LIGHTS * LIGHT_FLOATS_PER_ITEM + SHADOW_FLOATS + FOG_FLOATS;

/**
 * Where the shadow's share starts, just past the lights.
 */
const SHADOW_AT = 4 + MAX_LIGHTS * LIGHT_FLOATS_PER_ITEM;

/**
 * Where the fog's share starts, just past the shadow's.
 */
const FOG_AT = SHADOW_AT + SHADOW_FLOATS;

/**
 * What `castShadow` on a light is worth when it does not say how far off the surface to test.
 */
const DEFAULT_SHADOW_BIAS = 0.002;

/**
 * What the shader branches on.
 */
const LIGHT_KIND: Record<TDrawLight['type'], number> = { directional: 0, point: 1, spot: 2 };

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
): number => {
    out.fill(0);
    out[0] = ambient.r;
    out[1] = ambient.g;
    out[2] = ambient.b;
    out[3] = lights.length;

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
            out[base + 1] = -forward.y;
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
            out[base + 9] = forward.y;
            out[base + 10] = forward.z;
            const angle = light.angle ?? 0;
            out[base + 11] = Math.cos(angle);
            out[base + 12] = Math.cos(angle * (1 - (light.penumbra ?? 0)));
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

    // Zero is no fog, which is what `fill(0)` above already left: the shader multiplies by it.
    if (fog !== null && fog.enabled) {
        out[FOG_AT] = fog.color.r;
        out[FOG_AT + 1] = fog.color.g;
        out[FOG_AT + 2] = fog.color.b;
        out[FOG_AT + 3] = 1;
        out[FOG_AT + 4] = fog.near;
        // Never at or before the start: the shader divides by the distance between the two.
        out[FOG_AT + 5] = Math.max(fog.far, fog.near + 0.0001);
    }

    return lights.length;
};
