import { getActiveBox } from '../../store';

/**
 * Runs your code once per frame, for as long as the scene is on screen.
 *
 * The function you pass receives `delta`: how many **seconds** the last frame took, about
 * `0.016` on a 60 Hz screen and about `0.008` on a 120 Hz one. Multiply by it whenever
 * something moves or counts down, and the game runs at the same speed on every machine.
 * Ignore it, and the same game is twice as fast on a better screen.
 *
 * It also receives `time`: the seconds the scene has been running. It is what a sine wave, a
 * blink or a pulse wants, so nothing needs its own counter. It is game time, like `delta`: it
 * stops while the scene is paused, follows `timeScale`, and starts again from zero when the
 * scene does. Every object in the scene reads the same clock, so two things that pulse together
 * stay together, whenever each one was spawned.
 *
 * Call it in the scene body, next to the sprites. It only registers the function, it does not
 * run it: from then on the game loop calls it every frame, and stops when the scene does.
 *
 * @param callback What to run each frame. `delta` is the seconds since the previous frame, and
 *     `time` the seconds since the scene started.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const hero = createSprite({ key: 'hero', transform: { x: 40, y: 112 } });
 *
 *     useUpdate((delta) => {
 *         // 100 pixels per second, whatever the screen does
 *         hero.transform.x += 100 * delta;
 *     });
 *
 *     const coin = createSprite({ key: 'coin', transform: { x: 200, y: 100 } });
 *     useUpdate((delta, time) => {
 *         // bobs up and down once a second
 *         coin.transform.y = 100 + Math.sin(time * Math.PI * 2) * 4;
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useUpdate = (callback: (delta: number, time: number) => void): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useUpdate: call it inside a scene body, not from a timer or a callback.');
    }
    box.updateCallbacks.push(callback);
};
