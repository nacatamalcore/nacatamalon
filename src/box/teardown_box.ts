import type { TBox } from './types/t_box';

/**
 * Runs every cleanup registered on `box` and on everything under it, children first, and empties
 * the lists so a second teardown does nothing.
 *
 * Children first because a child may depend on its parent: a sword's cleanup can still reach the
 * player it hung from. Each cleanup is guarded, so one that throws does not stop the rest: a
 * handler left connected is worse than a teardown error that was reported and swallowed.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const teardownBox = (box: TBox): void => {
    for (const child of box.children) {
        teardownBox(child);
    }

    for (const cleanup of box.cleanups) {
        try {
            cleanup();
        } catch (error) {
            console.warn(`[NacatamalOn] A cleanup of '${box.name}' threw while it was leaving:`, error);
        }
    }
    box.cleanups.length = 0;
};
