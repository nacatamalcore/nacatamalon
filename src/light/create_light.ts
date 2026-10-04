import { getColor } from '../color';
import { createRecord } from '../gameobjects/create_record';
import type { TAmbientLight, TDirectionalLight, TPointLight, TSpotLight } from './types/t_light';
import type { TTransform3d } from '../gameobjects/types/t_transform_3d';

/**
 * Options every light with a place in the world shares.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLightOptionsBase = {
    color?: import('../color').TColor;
    /**
     * How strong it is. Default `1`.
     */
    intensity?: number;
    /**
     * How much of it reaches what it does not shine on. Default `0.35`.
     */
    ambient?: number;
    /**
     * Where it is.
     */
    x?: number;
    y?: number;
    z?: number;
    /**
     * Which way it faces, in radians. A light shines along its own -Z.
     */
    rotationX?: number;
    rotationY?: number;
    /**
     * Whether this is the one light that casts shadows. Default `false`. See `TLight`.
     */
    castShadow?: boolean;
    /**
     * How far the shadow test is pushed off the surface. Default `0.002`.
     */
    shadowBias?: number;
    /**
     * How dark it goes, `0` to `1`. Default `1`.
     */
    shadowStrength?: number;
};

/**
 * The three that every light able to cast shares, left **absent** at their default.
 *
 * Absent rather than filled in, so a scene written down records a decision somebody took instead of
 * one nobody did, and so the next version that changes a default can still tell the two apart.
 */
const shadowing = (options: TLightOptionsBase) => ({
    ...(options.castShadow === true ? { castShadow: true } : {}),
    ...(options.shadowBias !== undefined ? { shadowBias: options.shadowBias } : {}),
    ...(options.shadowStrength !== undefined ? { shadowStrength: options.shadowStrength } : {}),
});

/**
 * Where a light is and which way it faces, filled in from what was asked for.
 */
const placement = (options: TLightOptionsBase): TTransform3d => ({
    x: options.x ?? 0,
    y: options.y ?? 0,
    z: options.z ?? 0,
    rotation: 0,
    rotationX: options.rotationX ?? 0,
    rotationY: options.rotationY ?? 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
});

/**
 * @internal
 */
export const createDirectionalLight = (
    options: TLightOptionsBase & { shadowArea?: number; shadowDistance?: number } = {},
): TDirectionalLight => createRecord('directional', {
    ...shadowing(options),
    ...(options.shadowArea !== undefined ? { shadowArea: options.shadowArea } : {}),
    ...(options.shadowDistance !== undefined ? { shadowDistance: options.shadowDistance } : {}),
    color: options.color ?? getColor('white'),
    intensity: options.intensity ?? 1,
    ambient: options.ambient ?? 0.35,
    // Pointing down and forwards by default, the way afternoon sun does: straight down flattens
    // everything, and along the view leaves no shading at all.
    transform: { ...placement(options), rotationX: options.rotationX ?? -0.9, rotationY: options.rotationY ?? 0.6 },
});

/**
 * @internal
 */
export const createPointLight = (options: TLightOptionsBase & { range?: number } = {}): TPointLight => createRecord('point', {
    // A point light shines every way at once, so casting from it needs a cube of six maps: out of
    // scope. What it was told is kept anyway, so asking costs a warning and not your settings.
    ...shadowing(options),
    color: options.color ?? getColor('white'),
    intensity: options.intensity ?? 1,
    ambient: options.ambient ?? 0.35,
    range: options.range ?? 10,
    transform: placement(options),
});

/**
 * @internal
 */
export const createSpotLight = (options: TLightOptionsBase & { range?: number; angle?: number; penumbra?: number } = {}): TSpotLight => createRecord('spot', {
    ...shadowing(options),
    color: options.color ?? getColor('white'),
    intensity: options.intensity ?? 1,
    ambient: options.ambient ?? 0.35,
    range: options.range ?? 10,
    angle: options.angle ?? Math.PI / 8,
    penumbra: options.penumbra ?? 0.2,
    transform: { ...placement(options), rotationX: options.rotationX ?? -Math.PI / 2 },
});

/**
 * @internal
 */
export const createAmbientLight = (options: { color?: import('../color').TColor; intensity?: number } = {}): TAmbientLight => createRecord('ambient', {
    color: options.color ?? getColor('white'),
    intensity: options.intensity ?? 0.35,
});
