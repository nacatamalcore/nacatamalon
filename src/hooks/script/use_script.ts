import { getActiveBox, getActiveGame } from '../../store';
import { defaultScriptProps, getScript, isToolScript, warnUnregisteredScript } from '../../scripts/script_registry';
import { nanoId } from '../../utils';
import type { TScriptProps } from '../../scripts';

/**
 * Attaches a behaviour by name to the object being built, and runs it.
 *
 * Two things happen. The object records that it carries this behaviour, so the attachment is
 * **saved with the scene** and comes back when the scene is opened. And the behaviour runs right
 * here, inside this object's turn, receiving the object as its first argument, so whatever it
 * registers (per-frame work, a watch, a listener) belongs to this object and goes away with it.
 *
 * Call it after the object has what it is made of: a behaviour reaches for the object's sprite or
 * its placement, which is the natural order in a scene body anyway. A scene opened from a file
 * gets this for free, because behaviours are always built last there.
 *
 * **The attachment is kept whether or not the behaviour runs**, and the two reasons it might not
 * are the same reason: a saved scene outlives the code it names. A name nothing registered (its
 * file was renamed, or this project simply has not loaded it) says so and is kept, so opening a
 * scene shows you the problem instead of failing on it, and saving again does not delete somebody
 * else's work. A host showing a scene rather than playing it skips the call on purpose, so the
 * object carries its behaviour without performing it.
 *
 * @param ref The behaviour's name, as `registerScript` was given it.
 * @param id Pass one only to keep an attachment's identity across saving and opening. Left out, it
 *   gets a fresh one.
 * @param props The authored settings. What the behaviour actually receives is its declared
 *   defaults with these laid over them, key by key.
 *
 * @example
 * ```ts
 * const Guard = () => {
 *     const texture = useLoadTexture({ src: '/assets/guard.png' });
 *     createSprite({ texture, transform: { x: 40, y: 112 } });
 *     useScript('patrol', undefined, { speed: 80 });
 * };
 * ```
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useScript = (ref: string, id?: string, props?: TScriptProps): void => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw new Error('[NacatamalOn] useScript: call it inside a scene body, not from a timer or a callback.');
    }

    // Declared defaults first, authored values over them. That order is what lets a behaviour gain
    // a setting without invalidating every scene saved before it: what was saved has nothing to say
    // about the new key and the default fills it. The other way round would hand the behaviour
    // nothing at all for a setting it declared.
    const resolved: TScriptProps = { ...defaultScriptProps(ref), ...props };

    // Recorded before anything can decline to run it, so the attachment survives either way.
    box.scripts.push({ id: id ?? nanoId(), ref, props: resolved });

    const fn = getScript(ref);
    if (fn === undefined) {
        warnUnregisteredScript(ref);
        return;
    }

    // A scene being shown rather than played records its behaviours without performing them. One
    // that asked to be seen while building is the exception, which is what it asked for.
    if (store.get('world').buildScripts === 'attach' && !isToolScript(ref)) {
        return;
    }

    fn(box, resolved);
};
