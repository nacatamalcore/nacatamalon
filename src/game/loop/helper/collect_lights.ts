import { composeTransform2d } from '../../../render/shared/compose_transform_2d';
import { isPunctualLight, MAX_SCENE_LIGHTS } from '../../../light';
import type { TBox } from '../../../box';
import type { TColor } from '../../../color';
import type { TLight, TPunctualLight } from '../../../light';
import type { TTransform3d } from '../../../gameobjects/types/t_transform_3d';

/**
 * What a scene's lighting comes out as: the ones that shine, and the level under them.
 */
export type TSceneLighting = { lights: TPunctualLight[]; ambient: TColor };

/**
 * A sun when a scene said nothing at all, so a model is never a silhouette by accident.
 */
const DEFAULT_LIGHT: TPunctualLight = {
    type: 'directional',
    id: 'default-light',
    color: { r: 1, g: 1, b: 1, a: 1 },
    intensity: 1,
    ambient: 0.35,
    transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: -0.9, rotationY: 0.6, scaleX: 1, scaleY: 1, scaleZ: 1 },
};

let warnedBudget = false;
let warnedSecondCaster = false;
let warnedSecondAmbient = false;

/**
 * Forgets that the warnings below were already given. For the tests, like `resetShadowWarnings`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resetLightWarnings = (): void => {
    warnedBudget = false;
    warnedSecondCaster = false;
    warnedSecondAmbient = false;
};

/**
 * Puts one placement inside another: the same rule drawables follow, with `z` added.
 *
 * Only the flat half turns and scales, for the same reason and with the same limits as a sprite.
 * Which way a light faces stays its own, so a light is aimed by turning the light and not the thing
 * carrying it: a lantern held by someone who spins should not sweep the room.
 */
const compose = (parent: TTransform3d, local: TTransform3d): TTransform3d => {
    const moved = composeTransform2d(parent, local, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    return { ...local, x: moved.x, y: moved.y, z: parent.z + local.z };
};

/**
 * Walks the tree gathering lights, skipping whole branches that are not drawn, and the ones drawn
 * into a picture: a lamp inside a screen lights the screen's world, not the room the screen is in.
 */
const gather = (box: TBox, out: TLight[], parent: TTransform3d | null, top = true): void => {
    if (!box.visible || (!top && box.spriteTexture !== null)) {
        return;
    }

    // Where this box ended up, which is what its own light is placed by: a light is part of the
    // thing holding it, exactly as its sprites are.
    let world = parent;
    if (box.transform !== null) {
        world = parent === null ? box.transform : compose(parent, box.transform);
    }

    for (const light of box.lights) {
        out.push(isPunctualLight(light) && world !== null ? { ...light, transform: compose(world, light.transform) } : light);
    }
    for (const child of box.children) {
        gather(child, out, world, false);
    }
};

/**
 * What lights a scene, worked out once a frame.
 *
 * Three rules, and each one is a decision rather than an implementation detail:
 *
 * - **A scene with no lights is lit anyway**, by a sun of the engine's own. A new scene that draws
 *   a black silhouette is a scene that looks broken, and the first thing anyone does is start
 *   turning things off to find out why.
 * - **Thirty-two at a time** (`MAX_SCENE_LIGHTS`), from which each model is lit by the eight that
 *   reach it most, as the hardware of this era lit each thing it drew. Past the thirty-second they
 *   are dropped in the order they were made, once, with a warning.
 * - **The level of the dark side** is whatever the last `useAmbientLight` says when a scene says it, and
 *   otherwise the brightest that any single light asks for. Summing instead would mean that adding
 *   a fourth lamp washed the whole scene flat.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const collectLighting = (scene: TBox): TSceneLighting => {
    const found: TLight[] = [];
    gather(scene, found, null);

    const punctual = found.filter(isPunctualLight);
    if (punctual.length > MAX_SCENE_LIGHTS && !warnedBudget) {
        warnedBudget = true;
        console.warn(`[NacatamalOn] a scene has ${punctual.length} lights and holds ${MAX_SCENE_LIGHTS} at a time. The rest are ignored, in the order they were made.`);
    }
    const lights = punctual.slice(0, MAX_SCENE_LIGHTS);

    // Said out loud, once, because the alternative is a light that was asked to cast and silently
    // does not. There is one shadow map, so there is one point of view to spend, and it goes to
    // whoever asked first. Core keeps the first one too and says nothing, which leaves an author
    // turning `castShadow` on and off on a light that was never going to be the one.
    const casters = lights.filter((light) => light.castShadow === true && light.type !== 'point' && light.type !== 'rect');
    if (casters.length > 1 && !warnedSecondCaster) {
        warnedSecondCaster = true;
        console.warn(`[NacatamalOn] ${casters.length} lights in a scene ask to cast shadows and one can. The first is used, the rest light the scene without casting.`);
    }

    // One level for the scene: the last one asked for, so a part of it can set its own over the
    // rest. Said once when there are more, since summing them is what anyone would guess.
    const declared = found.filter((light) => light.type === 'ambient');
    if (declared.length > 0) {
        if (declared.length > 1 && !warnedSecondAmbient) {
            warnedSecondAmbient = true;
            console.warn(`[NacatamalOn] a scene has ${declared.length} ambient lights and one sets how dark its shade is: the last one made.`);
        }
        const last = declared[declared.length - 1]!;
        const ambient = { r: last.color.r * last.intensity, g: last.color.g * last.intensity, b: last.color.b * last.intensity, a: 1 };
        return { lights: lights.length > 0 ? lights : [], ambient };
    }

    const source = lights.length > 0 ? lights : [DEFAULT_LIGHT];
    const ambient = source.reduce(
        (max, light) => ({
            r: Math.max(max.r, light.color.r * light.intensity * light.ambient),
            g: Math.max(max.g, light.color.g * light.intensity * light.ambient),
            b: Math.max(max.b, light.color.b * light.intensity * light.ambient),
            a: 1,
        }),
        { r: 0, g: 0, b: 0, a: 1 },
    );

    return { lights: source, ambient };
};
