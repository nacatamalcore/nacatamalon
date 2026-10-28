import { getActiveBox } from '../../store';
import { getActiveGame } from '../../store/active_game';

/**
 * Runs your code once, when the transition this scene came in with is over: the screen uncovered
 * and nothing left over it.
 *
 * A scene that comes in with a transition (`change('Level', { transition: iris(0.6) })`) starts at
 * once, so its loading starts too, and waits behind the cover: its body and its `useReady` have
 * already run, but it is not seen. Its clock does not move while it waits, so a timer or a tween
 * started in `useReady` waits with it. What does not wait is what keeps real time: a song, a sound,
 * a vibration. Started here, they begin when the player can see the scene. So does handing over
 * the controls once nothing covers the level.
 *
 * Without a transition it runs on the scene's first frame, before its first update, so a scene does
 * the same with its transition or without it. In something spawned once the scene is already on
 * screen, it runs at the start of the next frame.
 *
 * It runs with its object as the active one, so hooks called inside it belong to that object. If
 * the scene stops before it is seen, it never runs.
 *
 * @param callback What to do once the scene is in full view. It receives nothing and runs exactly once.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     const song = useSong(useLoadSong({ src: '/music/level.song' }));
 *
 *     // Not in the body: the screen is still covered while the level loads behind it.
 *     useSceneTransitionEnd(() => song.play());
 *     return createScene();
 * };
 *
 * useScene().change('Level', { transition: fade(0.6) });
 * ```
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSceneTransitionEnd = (callback: () => void): void => {
    const box = getActiveBox();
    const game = getActiveGame();
    if (box === null || game === null) {
        throw new Error('[NacatamalOn] useSceneTransitionEnd: call it inside a scene body, a component or a script.');
    }
    game.get('world').transitionEnd.push({ box, run: callback });
};
