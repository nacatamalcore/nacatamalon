import type { TRuntimeStore } from '../store';

/**
 * What a game on the network does in each step, at three moments the loop chose: as the step starts
 * (`deliver`, handing its scenes what arrived), once the actions have been read (`step`, moving what
 * the network moves) and as it ends (`finish`, telling the other end where things were left).
 */
type TNetSteps = {
    deliver(): void;
    step(dt: number): void;
    finish(): void;
};

/**
 * Set by `nacatamalon/net` on the games that use it; a game that never does has none, and the loop
 * asks a `WeakMap` and goes on.
 */
const inboxes = new WeakMap<TRuntimeStore, TNetSteps>();

/**
 * Gives a game the work the loop runs for it in each step.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setNetInbox = (store: TRuntimeStore, steps: TNetSteps): void => {
    inboxes.set(store, steps);
};

/**
 * Hands a game's scenes what arrived from the network since the last step: at a moment the game
 * chose, as the clicks are, and never while a frame is half run. Nothing in a game that is not on
 * the network.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const deliverNet = (store: TRuntimeStore): void => {
    inboxes.get(store)?.deliver();
};

/**
 * Moves what the network moves, once the step's actions have been read and before any update: the
 * objects shared by the server, where they were, and a player's own, where its actions take it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepNet = (store: TRuntimeStore, dt: number): void => {
    inboxes.get(store)?.step(dt);
};

/**
 * Tells the other end how the step left things, once every update has run and what was destroyed
 * has gone.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const finishNet = (store: TRuntimeStore): void => {
    inboxes.get(store)?.finish();
};
