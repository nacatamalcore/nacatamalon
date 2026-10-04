import { createMaterial } from '../../gameobjects/material';
import { createMesh } from '../../gameobjects/mesh';
import { useCircleGeometry } from '../geometry/use_circle_geometry';
import { useUpdate } from '../loop/use_update';
import { BLOB_SHADOW_WGSL, BLOB_SHADOW_GLSL } from '../../render/shared/blob_shadow_shader';
import type { TColor } from '../../color';
import type { TMesh } from '../../gameobjects/mesh';
import type { TMeshMaterial } from '../../materials';

/**
 * The disc every blob shares, one across. A size is a scale on the placement and never a shape of
 * its own, so fifty of these are one shape and fifty placements.
 */
const UNIT_RADIUS = 0.5;

/**
 * How far above the ground the disc sits. Enough to win against the floor at the same height, small
 * enough that no camera in this era's range can tell it is floating.
 */
const SURFACE_OFFSET = 0.001;

/**
 * How much wider the disc gets per unit of height, when it is told to follow one.
 *
 * A thing one unit up casts a blob half again as wide at two thirds the strength, which is the shape
 * of the cue rather than a measurement of anything: a real shadow widens by how far the light is,
 * and this one has no light. It was chosen to read as a jump at the heights a character jumps.
 */
const SPREAD_PER_UNIT = 0.5;

/**
 * What `useBlobShadow` can be asked for. Only the thing it goes under is needed.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBlobShadowOptions = {
    /**
     * What it goes under. Every frame it moves to wherever that is.
     */
    target: TMesh;
    /**
     * The height of the ground it lies on. Default `0`.
     */
    groundY?: number;
    /**
     * How wide it is, in the same units as everything else in the scene. Default `0.5`.
     */
    radius?: number;
    /**
     * What colour it is. Default black: a shadow is darkness, faded by `opacity` and not tinted.
     */
    color?: TColor;
    /**
     * How dark it is in the middle, `0` to `1`. Default `0.5`.
     */
    opacity?: number;
    /**
     * How soft the rim is, from a cut edge at `0` to a fade that starts at the centre at `1`. Default `0.4`.
     */
    softness?: number;
    /**
     * Whether it grows and fades as the thing above it rises. Default `false`, which is a shadow of
     * a fixed size.
     *
     * It is the oldest way of telling a player that a character has left the ground, and it works
     * because the two readings of a sprite going up (jumping, or walking away from the camera) are
     * told apart by what happens underneath.
     */
    followHeight?: boolean;
    /**
     * Draw order within the scene. Default `0`.
     */
    zIndex?: number;
};

/**
 * Puts a soft dark disc on the ground under something and keeps it there.
 *
 * This is the cheap shadow, the one the consoles this engine is aimed at actually used: not a
 * shadow of the shape, a smudge under it. A game can afford fifty on hardware that could not afford
 * one real one, because **it is not a feature of the renderer at all**. It is a disc wearing a
 * shader that fades from the middle, drawn down the ordinary path with everything else: no extra
 * pass, no texture, nothing reserved.
 *
 * It takes nothing from the lamps in the scene, on purpose. A shadow that took the light would
 * brighten as a lamp moved towards it, which is the opposite of what a shadow does.
 *
 * It does not cast a real shadow of its own either, which matters the moment a scene has a light
 * that casts one: a flat disc lying on the floor would otherwise be drawn into the shadow map and
 * come back as a shadow of a shadow, a dark ring that nothing in the scene explains.
 *
 * Call it in the scene body, next to the thing it goes under, and then forget it: it follows on its
 * own. It reads that thing's own placement, so the two belong together (either both loose in the
 * scene, or both inside the same group), which is what writing them next to each other already
 * gives you.
 *
 * @param options What it goes under, and how it looks.
 * @returns The disc, to move, retune or hide like any other model.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', y: 3, z: 6, rotationX: -0.5 });
 *     createMesh({ geometry: usePlaneGeometry({ width: 12, depth: 12 }) });
 *
 *     const hero = createMesh({ geometry: useCubeGeometry(), transform: { y: 0.5 } });
 *     useBlobShadow({ target: hero, radius: 0.75, followHeight: true });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useBlobShadow = (options: TBlobShadowOptions): TMesh => {
    const {
        target,
        groundY = 0,
        radius = 0.5,
        color = { r: 0, g: 0, b: 0, a: 1 },
        opacity = 0.5,
        softness = 0.4,
        followHeight = false,
        zIndex = 0,
    } = options;

    const disc = useCircleGeometry({ radius: UNIT_RADIUS, key: 'blob-shadow-disc' });

    const material = createMaterial({
        name:         'blob-shadow',
        shader:       'mesh3d',
        tint:         color,
        alpha:        opacity,
        fragment:     BLOB_SHADOW_WGSL,
        fragmentGlsl: BLOB_SHADOW_GLSL,
        uniforms:     { softness },
    }) as TMeshMaterial;

    const baseScale = radius / UNIT_RADIUS;

    const shadow = createMesh({
        geometry:  disc,
        material,
        transform: {
            x:      target.transform.x,
            y:      groundY + SURFACE_OFFSET,
            z:      target.transform.z,
            scaleX: baseScale,
            scaleZ: baseScale,
        },
        zIndex,
        // The one line that is not in the drawing: a shadow of a shadow is a bug nobody can read.
        castShadow: false,
    });

    useUpdate(() => {
        shadow.transform.x = target.transform.x;
        shadow.transform.z = target.transform.z;

        if (followHeight) {
            const height = Math.max(target.transform.y - groundY, 0);
            const spread = 1 + height * SPREAD_PER_UNIT;
            shadow.transform.scaleX = baseScale * spread;
            shadow.transform.scaleZ = baseScale * spread;
            // Wider and fainter by the same number, so the disc loses no darkness overall as it
            // grows: it spreads the darkness it had.
            material.alpha = opacity / spread;
        }
    });

    return shadow;
};
