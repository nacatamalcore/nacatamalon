import type { TGameObject } from '../hooks/spawn/use_spawn';
import type { TScriptField, TScriptFn, TScriptOptions, TScriptProps, TScriptRequirement } from './types/t_script';

/**
 * Every registered behaviour, by name.
 *
 * Shared by the whole page rather than held per game, and on purpose: a script is a reusable
 * definition, like a library of functions, so the same `chase` is attachable from any scene of any
 * game. What a saved scene stores is the **name**, which points here; the function itself is code
 * and is never written to a file, which is why the format keeps a name and not a source.
 *
 * Kept private and reached through the doors below.
 */
const registry = new Map<string, {
    fn: TScriptFn;
    fields: TScriptField[];
    tool: boolean;
    requires: TScriptRequirement[];
}>();

/**
 * Names already reported as missing, so an object rebuilt many times says it once.
 *
 * A tool redraws a scene on every edit, and a scene that restarts rebuilds its objects: with a line
 * per build, one misspelt name buries every other message, and the hundredth line says nothing the
 * first did not. The same rule the physics warning keeps.
 */
const reportedMissing = new Set<string>();

/**
 * Registers a behaviour under `name`, so an object can attach it by that name: from scene code
 * with `useScript('chase')`, or from a saved scene that names it.
 *
 * Registering the same name again replaces it. **Not a hook**: call it at the top level of the
 * file, next to where the behaviour is written.
 *
 * The third argument declares the settings, which is what makes the behaviour configurable rather
 * than fixed: an editor builds a form from that list and hands the values back as the second
 * argument. Leave it out for a behaviour with nothing to tune. Declaring a setting is what makes
 * it editable; a script may of course read keys it never declared, but nothing will ever offer to
 * fill them.
 *
 * It takes either the list of settings directly or an options object, for a script that also has
 * something to say about **when** it runs. Both shapes exist because settings are what almost
 * every script has and the rest is rare: making the ordinary case reach one level deeper to say
 * the ordinary thing would be the worse door.
 *
 * @param name What the behaviour is called. A saved scene stores this word.
 * @param fn The behaviour itself.
 * @param fields Its settings, or the full options object.
 *
 * @example
 * ```ts
 * registerScript('patrol', (self, props) => {
 *     const [sprite] = self.drawables;
 *     if (sprite === undefined) return;
 *
 *     const start = sprite.transform.x;
 *     let dir = 1;
 *     useUpdate((delta) => {
 *         sprite.transform.x += Number(props.speed) * dir * delta;
 *         if (Math.abs(sprite.transform.x - start) > Number(props.range)) dir = -dir;
 *     });
 * }, [
 *     { key: 'speed', label: 'Speed', type: 'number', default: 40, min: 0 },
 *     { key: 'range', label: 'How far', type: 'number', default: 60, min: 0 },
 * ]);
 * ```
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const registerScript = <TProps extends TScriptProps = TScriptProps>(
    name: string,
    fn: (self: TGameObject, props: TProps) => void,
    fields: TScriptField[] | TScriptOptions = [],
): void => {
    const options = Array.isArray(fields) ? { fields } : fields;
    registry.set(name, {
        // Kept at the one shape every script is called with. A script that writes its settings as a
        // type (`props: { speed: number }`, the shape the pack and the editor read) is stating what
        // it expects to be attached with, which the loose shape could never check either.
        fn: fn as TScriptFn,
        fields: options.fields ?? [],
        tool: options.tool ?? false,
        requires: options.requires ?? [],
    });
};

/**
 * Forgets every registered behaviour.
 *
 * For a tool that loads a project's scripts from disk and needs this list to **mirror** what is
 * there: registering only ever adds, so without this a behaviour whose file was deleted or renamed
 * would stay attachable for ever.
 *
 * A game never calls it. Its behaviours are registered by the imports that make up the program,
 * and clearing them would be clearing part of the program.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const clearScripts = (): void => {
    registry.clear();
    reportedMissing.clear();
};

/**
 * Every registered name, in the order they were registered.
 *
 * A window for tools and not for game code: an editor can only offer to attach a behaviour it
 * knows exists, and this list is otherwise private. When you are attaching one by hand you already
 * know its name.
 * @returns Every registered name.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const listScripts = (): string[] => [...registry.keys()];

/**
 * The settings `name` declares, or an empty list.
 *
 * The other half of `registerScript`'s third argument, in the same read-only role as
 * `listScripts`. An editor calls it to build the form; game code never needs it, because it
 * receives the resolved values.
 * @param name - The behaviour's name.
 * @returns Its settings, or an empty list.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getScriptFields = (name: string): TScriptField[] => registry.get(name)?.fields ?? [];

/**
 * What `name` says it needs on its object, or an empty list.
 *
 * Read by whoever reports problems, never by the engine: a requirement diagnoses an object rather
 * than gating it. A name nobody registered answers with an empty list, which is the same answer as
 * "declares nothing" and rightly so, because a dead name is already its own louder finding and
 * listing its requirements too would bury it.
 * @param name - The behaviour's name.
 * @returns What it needs on its object, or an empty list.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getScriptRequires = (name: string): TScriptRequirement[] => registry.get(name)?.requires ?? [];

/**
 * What a freshly attached `name` starts with: every declared setting at its default.
 *
 * The one place defaults become values, and both callers need it to be. An editor, so attaching a
 * behaviour gives a filled-in form; and `useScript`, so a scene saved before the behaviour grew a
 * setting still runs with something in it rather than nothing.
 * @param name - The behaviour's name.
 * @returns Every setting at its default.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const defaultScriptProps = (name: string): TScriptProps => {
    const props: TScriptProps = {};
    for (const field of getScriptFields(name)) {
        props[field.key] = field.default;
    }
    return props;
};

/**
 * The behaviour itself, or nothing if no such name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getScript = (name: string): TScriptFn | undefined => registry.get(name)?.fn;

/**
 * Whether `name` is one of the behaviours meant to be seen while a scene is being built.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isToolScript = (name: string): boolean => registry.get(name)?.tool ?? false;

/**
 * Says once per name that an object asked for a behaviour nothing registered.
 *
 * Once per name and not once in all: two different missing names are two different problems.
 * Clearing the registry makes it worth saying again, since that is the only way a behaviour that
 * was there stops being there.
 *
 * @internal
 */
export const warnUnregisteredScript = (ref: string): void => {
    if (reportedMissing.has(ref)) {
        return;
    }
    reportedMissing.add(ref);
    console.warn(
        `[NacatamalOn] useScript: nothing is registered under '${ref}', so the object keeps the ` +
        `attachment and nothing runs. Call registerScript('${ref}', ...) before attaching it.`,
    );
};
