import { getActiveBox, getActiveGame } from '../../store';
import { resolveLayers } from '../../physics/layer_names';
import type { TPhysicsLayerOptions } from '../../physics/layer_names';
import { isShowingOnly } from './is_showing_only';
import { watchContacts } from '../../physics/contacts';
import { placementOf } from '../../box';
import { getPhysicsProviders, createRetroBody2d, warnMissingPhysicsProvider } from '../../physics';
import { nanoId } from '../../utils';
import type { TPhysicsBodyType, TRetroBody2d, TRetroCollider2d, TRetroWorld2d } from '../../physics';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * What a retro body is made from: how it moves, its shape, and how it behaves when stopped. `id`
 * and `name` are only for keeping the identity a scene document gave it.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroBody2dOptions = {
    id?: string;
    name?: string;
    body: TPhysicsBodyType;
    collider: TRetroCollider2d;
} & Partial<Omit<TRetroBody2d, '_type' | 'id' | 'name' | 'body' | 'collider' | 'layer' | 'collidesWith' | 'solidSides'>>
    & { solidSides?: Partial<TRetroBody2d['solidSides']> } & TPhysicsLayerOptions;

/** The names the game gave its physics layers, for a body that says its layers by name. */
const layerNames = (): readonly string[] => getActiveGame()?.get('config').physicsLayers ?? [];

/**
 * Gives this object a retro body: one that never turns, moved in pixels a fixed step at a time and
 * stopped against the others axis by axis, the way the old games did.
 *
 * It does what `usePhysicsBody2d` does for the full simulation, and nothing else: it writes down
 * what the object is, so a scene saved from code says it and comes back with it, and hands it to
 * whatever is installed to move it (`installRetroPhysics2d()` from `nacatamalon/retro-physics2d`).
 * An object has one body, so this replaces a collider of the full simulation on the same object.
 *
 * With nothing installed, the body is still recorded and the scene opens and saves with it; it sits
 * still.
 *
 * @example
 * ```ts
 * const Ball = (x: number, y: number) => {
 *     createSprite({ key: 'ball', transform: { x, y } });
 *     useRetroBody2d({ body: 'dynamic', collider: { shape: 'circle', radius: 4 }, bounce: 1, gravityScale: 0 });
 * };
 * ```
 *
 * @param options - What it is (`'dynamic'`, `'static'` or `'kinematic'`), its shape, and how it
 *   moves.
 * @returns The body as the scene keeps it. It moves once the retro physics is installed.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useRetroBody2d = (options: TRetroBody2dOptions): TRetroBody2d => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useRetroBody2d');
    }

    const { layer, collidesWith, ...rest } = options;
    const record = createRetroBody2d({ name: box.name, ...rest, ...resolveLayers({ layer, collidesWith }, layerNames()) });
    // Written on the object before anything can decline to move it, so a scene with nothing
    // installed still saves every body it declares.
    box.physics = record;

    if (placementOf(box) === null) {
        console.warn(`[NacatamalOn] useRetroBody2d: '${box.name}' is not anywhere, so its body was written down and not moved. Place it with useTransform, or give it something to draw.`);
        return record;
    }

    // Shown, not played: written down and not moved.
    if (isShowingOnly()) {
        return record;
    }
    const installed = getPhysicsProviders();
    if (installed.length === 0) {
        warnMissingPhysicsProvider();
        return record;
    }
    // Every one of them, because each takes only its own kind of body.
    for (const provider of installed) {
        provider.createBody(box, record);
    }
    watchContacts(box);
    return record;
};

/**
 * Opens the retro simulation for this scene, and says how hard things fall: in pixels per second
 * squared with **+y down**, like the full flat simulation's.
 *
 * Called in the **scene's body**, because gravity belongs to the scene. A scene has one world, of
 * whichever kind, and its bodies are the ones that world moves.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     useRetroWorld2d({ gravity: { x: 0, y: 900 } });
 *     // ...then objects with useRetroBody2d, which fall in it.
 *     return createScene();
 * };
 * ```
 *
 * @param options - How hard things fall (`gravity`), where its edges are (`bounds`, the screen when
 *   left out), how fast its time goes (`timeScale`), and an `id` to keep a document's.
 * @returns The world's settings as the scene keeps them.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useRetroWorld2d = (options: Partial<Omit<TRetroWorld2d, '_type'>> = {}): TRetroWorld2d => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useRetroWorld2d');
    }
    if (box.parent !== null) {
        console.warn(`[NacatamalOn] useRetroWorld2d: '${box.name}' is not a scene, and only a scene's simulation is read. Call it in the scene's own body.`);
    }

    const world: TRetroWorld2d = {
        _type: 'retro-world-2d',
        id: options.id ?? nanoId(),
        gravity: options.gravity ?? { x: 0, y: 900 },
        bounds: options.bounds === undefined || options.bounds === null ? null : { ...options.bounds },
        timeScale: options.timeScale ?? 1,
    };
    box.physicsWorld = world;

    // Shown, not played: written down and not moved.
    if (isShowingOnly()) {
        return world;
    }
    const installed = getPhysicsProviders();
    if (installed.length === 0) {
        warnMissingPhysicsProvider();
        return world;
    }
    for (const provider of installed) {
        provider.createWorld(world);
    }
    return world;
};
