import type { TBox } from "../../box";

/**
 * Runs and register the hook useUpdate
 * 
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runHookUpdates = (box: TBox, dt: number, time?: number) => {

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

    for (const callback of box.updateCallbacks) {
        callback(dt, time);
    }

    for (const child of children) {
        runHookUpdates(child, dt, time);
    }
    // Implementation for running hook updates goes here
};