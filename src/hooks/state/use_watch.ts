import { getActiveBox, getVersion, isWatchable } from '../../store';

/**
 * Something `useWatch` can be given to watch: state from `useData`, or an asset from one of the
 * `useLoad…` hooks.
 *
 * Not a number or a string. Those are read once, where the list is written, and can never change
 * afterwards, so watching one is always a mistake and is refused rather than accepted quietly.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWatchDep = object;

/**
 * Runs your code on the first frame, and again whenever one of the things you listed changes.
 *
 * What goes in the list is the thing itself (`[lives, texture]`), not a reading of it: those
 * objects are changed in place and never swap identity, so there would be nothing to compare. The
 * engine keeps a count of how many times it has announced a change on each one, and this compares
 * those counts once a frame.
 *
 * The other side of that: **a change the engine was not told about does not count**. `setLives(2)`
 * is announced and `lives.value = 2` is not, exactly like React's rule about not assigning to
 * state. Anything a game moves by hand, a transform above all, is changed in place all the time and
 * is never announced, so it cannot be watched. Passing one is refused when the scene starts rather
 * than accepted into a callback that would never run again.
 *
 * The first run happens whether or not anything changed, so a scene does not need to write its
 * starting state twice: once in the body and once in the watch.
 *
 * It runs in the same pass as `useUpdate` and in the order written, so a scene **in pause does not
 * watch**, the same way it does not update. A change made while it was paused is seen on the first
 * frame after it resumes. If something has to be heard even in pause, that is what `useStore` and
 * `useSignal` are for.
 *
 * Two changes to the same thing in one frame are one run: what is compared is where things ended
 * up, once a frame, not every step they took.
 *
 * @param fn What to run. It takes nothing: read the things you listed.
 * @param deps What to watch. Changing what is in this list later has no effect: it is read once.
 *
 * @example
 * ```ts
 * declare const counter: TText;
 * declare const hero: TSprite;
 *
 * export const Level: TSceneFn = () => {
 *     const texture = useLoadTexture({ src: '/assets/hero.png' });
 *     const [lives, setLives] = useData(3);
 *
 *     useWatch(() => {
 *         counter.text = `LIVES ${lives.value}`;
 *         hero.visible = texture.status === 'ready';
 *     }, [lives, texture]);
 *
 *     return createScene();
 * };
 * ```
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useWatch = (fn: () => void, deps: readonly TWatchDep[]): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useWatch: call it inside a scene body, not from a timer or a callback.');
    }

    for (const dep of deps) {
        if (dep === null || typeof dep !== 'object') {
            throw new Error(
                '[NacatamalOn] useWatch: watch the thing itself, not a reading of it. ' +
                `Got ${dep === null ? 'null' : typeof dep}, which is read once here and can never change afterwards.`,
            );
        }
        if (!isWatchable(dep)) {
            throw new Error(
                '[NacatamalOn] useWatch: nothing announces changes on this, so the watch would run once and never again. ' +
                'It can watch state from useData and assets from useLoadTexture, useLoadBitmapFont, useLoadAtlas and the rest. ' +
                'Something the game moves by hand, a transform for instance, is changed in place and is never announced: ' +
                'do that work in useUpdate.',
            );
        }
    }

    // Below any version a dep can hold, so the first frame always counts as a change and the
    // callback does not need a separate "have I run yet" flag.
    const seen = deps.map(() => -1);

    box.updateCallbacks.push(() => {
        let changed = false;
        for (let i = 0; i < deps.length; i++) {
            const version = getVersion(deps[i]);
            if (version !== seen[i]) {
                seen[i] = version;
                changed = true;
            }
        }
        if (changed) {
            fn();
        }
    });
};
