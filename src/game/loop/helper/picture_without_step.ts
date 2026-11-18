import { stepGameTransition } from './step_game_transition';
import { stepSplash } from './step_splash';
import { flushTransitionEnd } from '../../../scene/flush_transition_end';
import { flushReleased } from '../../../scene/when_released';
import { flushSystemLaunches, followLayout } from '../../../game_systems/game_systems';
import { settleNet } from '../../../net/net_inbox';
import type { TRuntimeStore } from '../../../store';

/**
 * What a picture with no step of the game in it does: nothing reads the input and nothing updates,
 * but the transition is on real time and moves anyway, or a cut would wait for the game. And, in the
 * order a frame with a step does it: the systems in step with how the game is shown (a tool laying it
 * out takes them down, and what they launched), the transition's end heard by the scene it uncovered,
 * the splash, the sounds a swap let go of, what a system launched before the game had a scene, and a
 * scene a transition let go of handed its room by a player moving to another (nothing is started
 * here, with no step).
 *
 * Also what a hidden page does for a player's game crossing to another room, which would otherwise
 * wait for the page to come back (`nacatamalon/net`).
 *
 * @param store The runtime store of the game.
 * @param unscaled Seconds since the last picture, unscaled and not stopped by a pause.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pictureWithoutStep = (store: TRuntimeStore, unscaled: number): void => {
    followLayout(store);
    stepGameTransition(store, unscaled);
    stepSplash(store, unscaled);
    flushTransitionEnd(store);
    flushReleased(store);
    flushSystemLaunches(store);
    settleNet(store, false);
};
