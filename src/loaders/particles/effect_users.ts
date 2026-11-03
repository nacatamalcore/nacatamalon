import type { TParticlesFile } from './types/t_particles_file';

/**
 * Which effects set off each effect, from the moment they name it.
 *
 * Kept here rather than found by looking through the game's cache when one of them goes, because an
 * effect written in code is in no cache and sets off files like any other. The same shape as who uses
 * a sheet, and for the same reasons: see `sheet_users`.
 */
const users = new WeakMap<TParticlesFile, Set<TParticlesFile>>();

/**
 * Effects that count only while something draws them: those written in code. Nothing lets one of
 * those go, so what ends its hold on what it sets off is its last emitter going.
 */
const whileDrawn = new WeakSet<TParticlesFile>();

/**
 * Effects something let go of while another still set them off, with what finishes letting them go:
 * when the last effect written in code that sets one off stops being drawn, nothing else would.
 */
const waiting = new WeakMap<TParticlesFile, () => void>();

/**
 * Notes that the particles of `by` set off `child`. `drawn` for one that counts only while it has
 * emitters.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const noteEffectUser = (child: TParticlesFile, by: TParticlesFile, drawn = false): void => {
    let held = users.get(child);
    if (held === undefined) {
        held = new Set();
        users.set(child, held);
    }
    held.add(by);
    if (drawn) {
        whileDrawn.add(by);
    }
};

/**
 * Whether `user` still wants what it sets off: not let go of, and, for one that counts only while
 * drawn, with an emitter.
 */
const wants = (user: TParticlesFile): boolean =>
    user.status !== 'released' && (!whileDrawn.has(user) || user.bound.length > 0);

/**
 * Takes `by` off `child` once it no longer wants it: an effect written in code whose last emitter has
 * gone. A child that was let go of while it was set off goes now, if nothing else wants it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dropIdleEffectUser = (child: TParticlesFile, by: TParticlesFile): void => {
    if (!wants(by)) {
        users.get(child)?.delete(by);
        const finish = waiting.get(child);
        if (finish !== undefined) {
            waiting.delete(child);
            // Asked again from the start: what else may want it is decided there, not here.
            finish();
        }
    }
};

/**
 * Takes `by` off `child` for good: an effect edited so it no longer names it. A child that was let go
 * of while that one set it off goes now, if nothing else wants it, since `by` will not come back to it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopSettingOff = (child: TParticlesFile, by: TParticlesFile): void => {
    users.get(child)?.delete(by);
    const finish = waiting.get(child);
    if (finish !== undefined) {
        waiting.delete(child);
        finish();
    }
};

/**
 * Notes that letting go of `child` waits on something still setting it off, and what to do to try
 * again once an effect written in code stops being drawn.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseWhenUnset = (child: TParticlesFile, finish: () => void): void => {
    waiting.set(child, finish);
};

/**
 * Takes `by` off `child`: an effect let go of, which no longer sets it off.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const leaveEffect = (child: TParticlesFile, by: TParticlesFile): void => {
    users.get(child)?.delete(by);
};

/**
 * Whether anything still wanting `child` sets it off. Those that no longer want it are taken off on
 * the way.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stillSetOff = (child: TParticlesFile): boolean => {
    const held = users.get(child);
    if (held === undefined) {
        return false;
    }
    for (const user of held) {
        if (!wants(user)) {
            held.delete(user);
        }
    }
    return held.size > 0;
};
