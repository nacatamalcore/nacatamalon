import { getActiveBox, getActiveGame } from '../../store';
import { pickTargets } from '../../input';
import { rootOf } from '../../box/root_of';
import { unapplyView2d } from '../../render/shared';
import type { TPointerHandle } from '../../input';

/**
 * Listens to the mouse and to touch: presses, releases, movement, and what is under the pointer.
 *
 * Each listener receives where the pointer is and what it is over:
 *
 * - `screenX`/`screenY`: the position on the screen, in the game's pixels, ignoring any camera.
 * - `worldX`/`worldY`: the same point as a place in this scene's world, through its camera. With
 *   no camera they are the same numbers.
 * - `target`: the sprite or text on top under the pointer, or `null` over empty space. `hits` has
 *   all of them, top first. A text is touched anywhere inside its block, gaps and spaces included.
 * - `button`: `'main'` (the left button, or a finger), `'right'`, `'middle'`... (`POINTER_BUTTONS`).
 * - `pointerId` and `pointerType`: which pointer, and whether it is a `'mouse'`, a `'touch'` or a
 *   `'pen'`. Every finger has its own id from touching to lifting, so two thumbs are two pointers.
 *
 * Listeners run at the start of the next frame, not the instant the browser reports the click, so
 * anything they do behaves as it would inside `useUpdate`. Several movements of one pointer in one
 * frame arrive as one, with the latest position. A touch the system takes back (a gesture of the
 * browser's) ends as a release, never as a click, so nothing stays held.
 *
 * It can also be asked, like the keyboard, from an update: `isDown()` while a finger is on the
 * screen or a button is held, `justPressed()` and `justReleased()` for the one frame it went down
 * or came up, `position()` for where it is, `touches()` for every finger, and
 * `isPressing(button)` for whether a finger is on a sprite right now, which is what an on-screen
 * button needs. An action can be bound to one, too: `{ type: 'touch', box: 'Jump' }`.
 *
 * They stop by themselves when the part of the scene that registered them goes away, and they are
 * not called while their scene is paused. Each one returns a function that stops it earlier.
 *
 * `pick(x, y)` asks the same question at any screen point, whenever you like.
 *
 * `onWheel` hears the mouse wheel (or two fingers on a trackpad), with how far it turned in
 * `deltaY`, and `deltaX` for sideways. While anything listens, the wheel over the game stops
 * scrolling the page.
 *
 * `lock()` captures the mouse, for a first-person camera: the cursor disappears and moving the
 * mouse only changes `movementX`/`movementY`, as far as the hand goes, never stopping at the edge of
 * the game. Call it from a click or a key press, which is the only time the browser allows it; Esc
 * gives the mouse back to the player, and `isLocked()` says whether the game has it.
 *
 * @returns The pointer: `onDown`, `onUp`, `onMove`, `onWheel`, `pick`, `isDown`, `justPressed`,
 * `justReleased`, `position`,
 * `touches`, `isPressing`, and `lock`, `unlock` and `isLocked`.
 *
 * @example
 * ```ts
 * export const Board: TSceneFn = () => {
 *     const pointer = usePointer();
 *     const red = getColor('#ff5566');
 *
 *     pointer.onDown((info) => {
 *         if (info.target !== null) {
 *             info.target.tint = red;
 *         }
 *     });
 *
 *     // The wheel zooms the camera: towards you is out, away is in.
 *     const camera = useCamera2d();
 *     pointer.onWheel(({ deltaY }) => {
 *         camera.zoom = Math.min(4, Math.max(0.5, camera.zoom * Math.exp(-deltaY * 0.001)));
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @example
 * ```ts
 * // A first-person camera: click to capture the mouse, move it to look around, Esc to let go.
 * export const Room: TSceneFn = () => {
 *     const camera = useCamera3d({ fov: 70, transform: { y: 1.6 } });
 *     const pointer = usePointer();
 *
 *     pointer.onDown(() => {
 *         void pointer.lock();
 *     });
 *     pointer.onMove(({ movementX, movementY }) => {
 *         if (!pointer.isLocked()) {
 *             return;
 *         }
 *         camera.transform.rotationY -= movementX * 0.003;
 *         camera.transform.rotationX = clamp(camera.transform.rotationX - movementY * 0.003, -1.4, 1.4);
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePointer = (): TPointerHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] usePointer: call it inside a scene body, not from a timer or a callback.');
    }

    const pointer = store.get('input').pointer;

    return {
        onDown: (listener) => pointer.on('down', box, listener),
        onUp: (listener) => pointer.on('up', box, listener),
        onMove: (listener) => pointer.on('move', box, listener),
        onWheel: (listener) => pointer.on('wheel', box, listener),
        pick: (screenX, screenY) => pickTargets(store, screenX, screenY),
        isDown: () => pointer.touches().length > 0,
        justPressed: (button) => pointer.justPressed(button),
        justReleased: (button) => pointer.justReleased(button),
        pressedAt: (button) => pointer.pressedAt(button),
        position: () => {
            const at = pointer.position();
            if (at === null) {
                return null;
            }
            const world = unapplyView2d(rootOf(box).camera2d, at);
            return { screenX: at.x, screenY: at.y, worldX: world.x, worldY: world.y };
        },
        touches: () => pointer.touches().map((finger) => {
            const world = unapplyView2d(rootOf(box).camera2d, { x: finger.screenX, y: finger.screenY });
            return { ...finger, worldX: world.x, worldY: world.y };
        }),
        isPressing: (target) => pointer.isPressing(store, target),
        lock: (options) => pointer.lock(options),
        unlock: () => pointer.unlock(),
        isLocked: () => pointer.isLocked(),
    };
};
