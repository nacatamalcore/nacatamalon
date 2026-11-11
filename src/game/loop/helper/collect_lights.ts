import { composeTransform2d } from '../../../render/shared/compose_transform_2d';
import { isPunctualLight, MAX_SCENE_LIGHTS } from '../../../light';
import { gameOfBox } from '../../../box/box_game';
import type { TBox } from '../../../box';
import { firstTimeIn, forgetOnPage } from '../../../utils/first_time_in';
import type { TColor } from '../../../color';
import type { TLight, TPunctualLight } from '../../../light';
import type { TTransform3d } from '../../../gameobjects/types/t_transform_3d';

/**
 * What a scene's lighting comes out as: the ones that shine, and the level under them.
 */
export type TSceneLighting = { lights: TPunctualLight[]; ambient: TColor; ground: TColor | null };

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

/**
 * Forgets that the warnings below were already given. For the tests, like `resetShadowWarnings`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resetLightWarnings = (): void => {
    forgetOnPage('lights: over the budget');
    forgetOnPage('lights: a second shadow caster');
    forgetOnPage('lights: a second ambient');
    forgetOnPage('lights2d: budget');
    forgetOnPage('lights2d: ambient');
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
 * Where each box of the walk ended up, one placement per depth, written over as the walk goes:
 * a box is only placed to place what is under it, so the walk makes nothing for the boxes it passes
 * and only copies the lights it finds. A box is placed as a sprite is, with the turns and the scales
 * of every box above it added up: a lamp on a turret of a turned ship is where the turret's sprite
 * is. Only the light itself keeps its own way of facing (`compose`).
 */
const places: TTransform3d[] = [];
const turned = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const placeAt = (depth: number, parent: TTransform3d, local: TTransform3d): TTransform3d => {
    const place = places[depth] ??= { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    composeTransform2d(parent, local, turned);
    place.x = turned.x;
    place.y = turned.y;
    place.z = parent.z + local.z;
    place.rotation = turned.rotation;
    place.scaleX = turned.scaleX;
    place.scaleY = turned.scaleY;
    return place;
};

/**
 * Walks the tree gathering lights, skipping whole branches that are not drawn, and the ones drawn
 * into a picture: a lamp inside a screen lights the screen's world, not the room the screen is in.
 * `world2d` also leaves out the HUD (`useScreenSpace`), which the 2D lights never reach.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gatherLights = (box: TBox, out: TLight[], parent: TTransform3d | null, top = true, world2d = false, depth = 0): void => {
    if (!box.visible || (world2d && box.screenSpace) || (!top && box.spriteTexture !== null)) {
        return;
    }

    // Where this box ended up, which is what its own light is placed by: a light is part of the
    // thing holding it, exactly as its sprites are.
    let world = parent;
    if (box.transform !== null) {
        world = parent === null ? box.transform : placeAt(depth, parent, box.transform);
    }

    for (const light of box.lights) {
        out.push('transform' in light && world !== null ? { ...light, transform: compose(world, light.transform) } : light);
    }
    for (const child of box.children) {
        gatherLights(child, out, world, false, world2d, depth + 1);
    }
};

/**
 * Whether `box` holds any light of its own, itself or anywhere under it (leaving out what is drawn
 * into a picture inside it, as `collectLighting` does).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const holdsLights = (box: TBox): boolean => {
    const found: TLight[] = [];
    gatherLights(box, found, null);
    return found.some(light => light.type === 'ambient' || isPunctualLight(light));
};

/**
 * The level of the dark side that the last of these ambient lights asks for, or `null` with none.
 */
const lastAmbientOf = (found: readonly TLight[]): Extract<TLight, { type: 'ambient' }> | null => {
    let last: Extract<TLight, { type: 'ambient' }> | null = null;
    for (const light of found) {
        if (light.type === 'ambient') last = light;
    }
    return last;
};

const levelOf = (found: readonly TLight[]): TColor | null => {
    const last = lastAmbientOf(found);
    return last === null ? null : { r: last.color.r * last.intensity, g: last.color.g * last.intensity, b: last.color.b * last.intensity, a: 1 };
};

/**
 * The level from below that the same light asks for, at its strength, or `null` when it is one
 * colour (or there is none).
 */
const groundOf = (found: readonly TLight[]): TColor | null => {
    const last = lastAmbientOf(found);
    const ground = last?.ground ?? null;
    return last === null || ground === null ? null : { r: ground.r * last.intensity, g: ground.g * last.intensity, b: ground.b * last.intensity, a: 1 };
};

/**
 * How dark the shade is in what a view shows, when the view says so with a `useAmbientLight` of its
 * own: the world it looks at included, as with its fog. A minimap of a dark dungeon reads in full.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ownAmbientOf = (view: TBox): { ambient: TColor; ground: TColor | null } | null => {
    const found: TLight[] = [];
    gatherLights(view, found, null);
    const ambient = levelOf(found);
    return ambient === null ? null : { ambient, ground: groundOf(found) };
};

/**
 * What lights the models a view makes itself (a minimap's marker).
 *
 * Its own lamps when it brings any, and otherwise the world's, borrowed and never casting: the
 * view's shadow map belongs to how the world itself is seen. An ambient light alone is not a lamp,
 * so a view with only that keeps the world's lamps and sets just how dark its shade is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const viewLighting = (view: TBox, world: TBox): TSceneLighting => {
    const found: TLight[] = [];
    gatherLights(view, found, null);
    if (found.some(isPunctualLight)) {
        return collectLighting(view);
    }
    const borrowed = collectLighting(world);
    return {
        lights: borrowed.lights.map((light) => (light.castShadow === true ? { ...light, castShadow: false } : light)),
        ambient: levelOf(found) ?? borrowed.ambient,
        ground: levelOf(found) !== null ? groundOf(found) : borrowed.ground,
    };
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
    gatherLights(scene, found, null);
    // Each warning below is said once per game, the scene's: they would otherwise repeat every frame.
    const game = gameOfBox(scene);

    const punctual = found.filter(isPunctualLight);
    if (punctual.length > MAX_SCENE_LIGHTS && firstTimeIn(game, 'lights: over the budget')) {
        console.warn(`[NacatamalOn] lights: a scene has ${punctual.length} and holds ${MAX_SCENE_LIGHTS} at a time. The rest are ignored, in the order they were made.`);
    }
    const lights = punctual.slice(0, MAX_SCENE_LIGHTS);

    // Said out loud, once, because the alternative is a light that was asked to cast and silently
    // does not. A scene's view has one shadow map, so there is one point of view to spend, and it
    // goes to whoever asked first. Core keeps the first one too and says nothing, which leaves an author
    // turning `castShadow` on and off on a light that was never going to be the one.
    const casters = lights.filter((light) => light.castShadow === true && light.type !== 'point' && light.type !== 'rect');
    if (casters.length > 1 && firstTimeIn(game, 'lights: a second shadow caster')) {
        console.warn(`[NacatamalOn] lights: ${casters.length} in a scene ask to cast shadows and one can. The first is used, the rest light the scene without casting.`);
    }

    // One level for the scene: the last one asked for, so a part of it can set its own over the
    // rest. Said once when there are more, since summing them is what anyone would guess.
    const declared = found.filter((light) => light.type === 'ambient');
    if (declared.length > 0) {
        if (declared.length > 1 && firstTimeIn(game, 'lights: a second ambient')) {
            console.warn(`[NacatamalOn] lights: a scene has ${declared.length} ambient ones and one sets how dark its shade is: the last one made.`);
        }
        return { lights: lights.length > 0 ? lights : [], ambient: levelOf(declared)!, ground: groundOf(declared) };
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

    return { lights: source, ambient, ground: null };
};
