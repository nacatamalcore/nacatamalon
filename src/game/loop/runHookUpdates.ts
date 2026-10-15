import type { TBox } from "../../box";

/**
 * Runs and register the hook useUpdate
 * 
 * `late` collects, in the order they were reached, the boxes that also registered a
 * `useLateUpdate`, for `runLateUpdates` to call once this walk is over.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runHookUpdates = (box: TBox, dt: number, time?: number, late?: TBox[], touching?: TBox[]) => {

    // Destroyed this frame and not swept yet: it stops now, so a bullet cannot report a second
    // hit after the one that killed it.
    if (box.destroyed) {
        return;
    }

    // Called without a time, this box is where the walk starts: a scene root, and the clock is its
    // own. Everything beneath it reads that same clock, so a box spawned a minute in and one placed
    // at the start agree on what time it is, and a scene spawned inside another keeps its host's.
    if (time === undefined) {
        box.time += dt;
        time = box.time;
    }

    // The children as they were when this frame reached them, taken BEFORE the callbacks below
    // run. That is what decides that something born this frame starts moving on the next one:
    // a bullet does not travel on the frame it was fired, and a thing that spawns another
    // cannot chain them all inside a single frame.
    const children = [...box.children];

    // Noted here, while the walk passes, rather than found by walking the tree a second time: the
    // late pass then reaches exactly the boxes this one did, in the same order, so something born
    // during the updates waits for the next frame in both.
    if (late !== undefined && box.lateCallbacks.length > 0) {
        late.push(box);
    }
    // And the boxes with something to compare once the updates are over: see `useOverlap`.
    if (touching !== undefined && (box.hitboxes.length > 0 || box.overlapCallbacks.length > 0)) {
        touching.push(box);
    }

    for (const callback of box.updateCallbacks) {
        callback(dt, time);
    }

    for (const child of children) {
        runHookUpdates(child, dt, time, late, touching);
    }
    // Implementation for running hook updates goes here
};

/**
 * Whether the box, or anything it hangs from, was destroyed since the walk noted it. A child is
 * only marked when its parent is swept, so asking the box alone would let the child of something
 * killed in this frame's updates follow it one last time.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isGone = (box: TBox): boolean => {
    for (let at: TBox | null = box; at !== null; at = at.parent) {
        if (at.destroyed) {
            return true;
        }
    }
    return false;
};

/**
 * Runs the `useLateUpdate` callbacks of a scene, once every `useUpdate` of it has run.
 *
 * Its own pass and not the tail of the first, because the point of it is to read where things
 * ended up: a camera in the scene root is reached before the player it follows, so in the first
 * pass it would read the player where it was before it moved this frame.
 *
 * @param late The boxes `runHookUpdates` noted, in the order it reached them.
 * @param time The scene's clock, already moved on by this frame.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runLateUpdates = (late: readonly TBox[], dt: number, time: number) => {
    for (const box of late) {
        if (isGone(box)) {
            continue;
        }
        for (const callback of box.lateCallbacks) {
            callback(dt, time);
        }
    }
};
