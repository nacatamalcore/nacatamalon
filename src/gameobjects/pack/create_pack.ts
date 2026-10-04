import { spawnBox } from '../../box/spawn_box';
import { whenLoaded } from '../../loaders/track_load';
import { sceneFromDoc } from '../../scene/document/scene_from_doc';
import { listScripts } from '../../scripts/script_registry';
import { getActiveBox, getActiveGame } from '../../store';
import { useTransform } from '../../hooks/transform/use_transform';
import { nanoId } from '../../utils';
import { connectObjectEvent } from '../../events/object_events';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TBoxNode, TSceneDoc } from '../../scene/document/types/t_scene_doc';
import type { TPackOptions } from './types/t_pack_options';

/**
 * Said once per pack and thing, never per copy.
 */
const warned = new Set<string>();
const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(message);
};

/**
 * The document this copy is made of: the one asked for, or the pack's only offer when nothing was
 * named. `null`, said once, when the name is not one the pack offers or the choice is not clear.
 */
const chosenDoc = (options: TPackOptions): { name: string; doc: TSceneDoc } | null => {
    const { pack } = options;
    if (options.box !== undefined || options.scene !== undefined) {
        const [kind, name, docs] = options.box !== undefined ? ['box', options.box, pack.boxes] as const : ['scene', options.scene!, pack.scenes] as const;
        const doc = docs[name];
        if (doc === undefined) {
            const offered = [...pack.exports.boxes.map((b) => `box "${b}"`), ...pack.exports.scenes.map((s) => `scene "${s}"`)];
            warnOnce(`${pack.key}:${kind}:${name}`, `[NacatamalOn] createPack: the pack '${pack.name || pack.src}' offers no ${kind} "${name}". It offers ${offered.join(', ') || 'nothing to place (only assets)'}.`);
            return null;
        }
        return { name, doc };
    }
    const all = [...pack.exports.boxes.map((name) => ({ name, doc: pack.boxes[name]! })), ...pack.exports.scenes.map((name) => ({ name, doc: pack.scenes[name]! }))];
    if (all.length !== 1) {
        warnOnce(`${pack.key}:choice`, `[NacatamalOn] createPack: the pack '${pack.name || pack.src}' offers ${all.length === 0 ? 'nothing to place (only assets)' : `${all.length} things (${all.map((o) => o.name).join(', ')}); say which with box or scene`}.`);
        return null;
    }
    return all[0]!;
};

/**
 * A copy of the document for this one placement: its boxes get ids of their own, since two copies
 * are two objects, and the settings given are laid over the scripts on the thing itself.
 */
const copyFor = (doc: TSceneDoc, props: TPackOptions['props']): TSceneDoc => {
    const copy = structuredClone(doc);
    const renumber = (box: TBoxNode): void => {
        box.id = `${box.id}-${nanoId(8)}`;
        box.children.forEach(renumber);
    };
    renumber(copy.root);
    if (props !== undefined) {
        for (const component of copy.root.components) {
            if (component.type === 'script') component.props = { ...component.props, ...props };
        }
    }
    return copy;
};

/**
 * Every script a document attaches that nothing has registered.
 */
const unregisteredIn = (doc: TSceneDoc): string[] => {
    const known = new Set(listScripts());
    const missing = new Set<string>();
    const walk = (box: TBoxNode): void => {
        for (const component of box.components) {
            if (component.type === 'script' && !known.has(component.ref)) missing.add(component.ref);
        }
        box.children.forEach(walk);
    };
    walk(doc.root);
    return [...missing];
};

/**
 * Places one thing a pack offers: a box, or a scene as one part of the scene that creates it.
 *
 * **It appears when the pack does**, the way `createModel` fills in when its file arrives: what comes
 * back is the object at once, empty on the frame you call this, and the pack's box is built inside it
 * the moment the pack has landed. Nothing has to be waited for.
 *
 * Each call is its own copy, with its own place (`transform`) and its own settings (`props`), and what
 * comes back is an ordinary object: move it, hide it, destroy it like any other. The pack's box sits
 * inside it at the place it was made at, so a script that moves its own box keeps doing so relative to
 * wherever you put the copy.
 *
 * A script the pack's box attaches has to be registered, which is what importing the pack's
 * `<name>.pack.ts` does. One that is not is named in a warning, and the box is built without it.
 *
 * @param options Which thing of which pack, where, and with which settings.
 * @returns The object the copy is built inside.
 *
 * @example
 * ```ts
 * const Menu: TSceneFn = () => {
 *     const ui = useLoadPack({ src: '/packs/ui-kit' });
 *     createPack({ pack: ui, box: 'Button', transform: { x: 160, y: 120 } });
 *     createPack({ pack: ui, box: 'Button', transform: { x: 160, y: 160 }, props: { label: 'QUIT' } });
 *     return createScene();
 * };
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPack = (options: TPackOptions): TGameObject => {
    const store = getActiveGame();
    const active = getActiveBox();
    if (store === null || active === null) {
        throw new Error('[NacatamalOn] createPack: call it inside a scene body, or inside something created with useSpawn.');
    }

    const { pack } = options;
    const holder = spawnBox(store, active, options.box ?? options.scene ?? 'pack', () => {
        useTransform(options.transform ?? {});
    }, []);
    // Connected now, before anything inside exists: an event sent from the pack's box, once it is built,
    // travels up to this copy and is heard here.
    for (const [name, handler] of Object.entries(options.on ?? {})) {
        connectObjectEvent(holder, name, handler);
    }

    const build = (): void => {
        const chosen = chosenDoc(options);
        if (chosen === null) return;
        const missing = unregisteredIn(chosen.doc);
        if (missing.length > 0) {
            warnOnce(`${pack.key}:scripts:${missing.join(',')}`, `[NacatamalOn] createPack: the pack '${pack.name}' uses ${missing.map((m) => `"${m}"`).join(', ')}, which nothing has registered, so it is built without ${missing.length === 1 ? 'it' : 'them'}. Import the pack's ${pack.name}.pack.ts once in your game.`);
        }
        spawnBox(store, holder, chosen.name, sceneFromDoc(copyFor(chosen.doc, options.props), `${pack.src}${chosen.name}`), []);
    };

    if (pack.status === 'ready') {
        build();
        return holder;
    }
    void whenLoaded(pack).then(() => {
        if (store.get('loop').destroyed || holder.destroyed || pack.status !== 'ready') {
            return;
        }
        build();
    });
    return holder;
};
