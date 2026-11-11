import { eulerAim } from '../../render/shared/transform_basis';
import { createPixelTexture } from '../../gameobjects/pixel_texture';
import { studioEnvironment } from '../../pixels/studio_environment';
import { useAmbientLight } from './use_ambient_light';
import { useDirectionalLight } from './use_directional_light';
import { useRectLight } from './use_rect_light';
import type { TColorOption } from '../../color';
import type { TTexture } from '../../loaders';
import type { TAmbientLight, TDirectionalLight, TRectLight } from '../../light';

/**
 * What `useStudio` is asked for. Everything has a default.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStudioOptions = {
    /**
     * The colour of the sky, which comes down from above in the light from all around and fills the
     * top of the reflection. Default `'#dce6ff'`.
     */
    top?: TColorOption;
    /**
     * The colour of the floor, which comes up from below and fills the bottom of the reflection.
     * Default `'#4a3328'`.
     */
    ground?: TColorOption;
    /**
     * How many softboxes the reflection shows, from `0` to `4` (see `studioEnvironment`). Default `2`.
     */
    panels?: number;
    /**
     * The surroundings to reflect, in place of the painted studio: a round picture of your own, a
     * matcap, or a panorama or photo made round with `sphereFromPanorama`. Left out, the studio is
     * painted (see `studioEnvironment`), and `panels` and `size` say how.
     */
    environment?: TTexture;
    /**
     * How many pixels across the painted studio is (see `studioEnvironment`). Default `64`, the era's
     * chrome at a console's resolution; `256` for a smooth one in a game drawn at a render's.
     */
    size?: number;
    /**
     * How far from the middle of the scene the lamps stand, in the world's units: as big as what is
     * being shown, or a little bigger. Default `5`.
     */
    distance?: number;
    /**
     * Whether the key light casts the scene's shadows. Default `true`.
     */
    castShadow?: boolean;
};

/**
 * The lights of a studio, each one to read and to change, and the picture of it a reflection reads.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStudio = {
    /**
     * The light from all around, in two colours: the sky above and the floor below.
     */
    ambient: TAmbientLight;
    /**
     * The key light: warm, up to the right, the brightest, and the one that casts. Its `shadowBias` is
     * bigger than a light's usual, to suit the few-faced, smoothly lit models of a product shot.
     */
    key: TDirectionalLight;
    /**
     * The fill light: a cool panel to the left, so the side the key misses is not black.
     */
    fill: TRectLight;
    /**
     * The back light: a panel behind and above, which draws a bright rim round what it lights.
     */
    back: TRectLight;
    /**
     * The studio as a round picture, for a material's `reflection` or the recipes' `environment`.
     */
    environment: TTexture;
};

/**
 * Lights the scene like a photographer's studio in one line, the lighting of the glossy product
 * shots and toys of the era's computer graphics: a warm key light up to the right that casts the
 * shadows, a cool panel filling from the left, a panel behind that draws a bright rim, and the light
 * from all around in two colours, a sky above and a floor below. It also paints the studio as the
 * round picture a `reflection` reads, the same sky, floor and softboxes, so a model reflects a
 * studio like the one lighting it. The picture is what is behind the camera, so it turns with the
 * camera while the lamps stay where they are: the softboxes a model reflects are not the lamps
 * themselves.
 *
 * Every piece comes back, to change like any other light: `studio.key.intensity = 1.6`. The lamps
 * stand round the middle of the scene, at `distance`; they belong to the box the hook is called in,
 * and move with it.
 *
 * @param options The sky, the floor, the softboxes, how far the lamps stand and whether the key casts.
 * @returns The lights and the picture.
 *
 * @example
 * ```ts
 * const Showroom = () => {
 *     useCamera3d({ projection: 'perspective', fov: 40, transform: { y: 1.2, z: 6 } });
 *     useRenderStyle(RENDER.STYLES.cgi);
 *     const studio = useStudio({ ground: '#3a2a22' });
 *
 *     createMesh({ geometry: useSphereGeometry(), material: createMaterial(chrome({ environment: studio.environment })) });
 *     studio.fill.intensity = 0.4;
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useStudio = (options: TStudioOptions = {}): TStudio => {
    const top = options.top ?? '#dce6ff';
    const ground = options.ground ?? '#4a3328';
    const distance = options.distance ?? 5;

    const ambient = useAmbientLight({ color: top, ground, intensity: 0.4 });
    const key = useDirectionalLight({
        color: '#fff1dc',
        intensity: 1.1,
        castShadow: options.castShadow ?? true,
        shadowArea: distance * 3,
        // Further off the surface than a light's usual, by the size of the studio: a product shot is
        // a few big, smoothly lit pieces of few faces, and with the usual the flat faces near the dark
        // edge read as in their own shadow while the smooth light says lit, in steps the shape of the
        // faces. More faces need less; `studio.key.shadowBias` changes it.
        shadowBias: distance * 0.008,
        transform: { rotationX: -0.8, rotationY: 0.6 },
    });

    // Each panel stands at its place and faces the middle.
    const fillAt = { x: -distance * 0.8, y: distance * 0.4, z: distance * 0.6 };
    const fill = useRectLight({
        color: '#9ec4ff',
        intensity: 0.6,
        width: distance * 0.6,
        height: distance * 0.4,
        range: distance * 3,
        transform: { ...fillAt, ...eulerAim({ x: -fillAt.x, y: -fillAt.y, z: -fillAt.z }) },
    });
    const backAt = { x: 0, y: distance * 0.6, z: -distance * 0.8 };
    const back = useRectLight({
        color: '#ffffff',
        intensity: 1.2,
        width: distance * 0.8,
        height: distance * 0.1,
        range: distance * 3,
        transform: { ...backAt, ...eulerAim({ x: -backAt.x, y: -backAt.y, z: -backAt.z }) },
    });

    const environment = options.environment ?? createPixelTexture(studioEnvironment({
        top,
        ground,
        ...(options.panels !== undefined ? { panels: options.panels } : {}),
        ...(options.size !== undefined ? { size: options.size } : {}),
    }));

    return { ambient, key, fill, back, environment };
};
