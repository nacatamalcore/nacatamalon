import { gameMoment } from '../../../signal/game_moments';
import { screenSizeOf } from '../../../DOM/screen_size';
import type { TRuntimeStore } from '../../../store';
import type { TGameResizeEvent } from '../../handle/t_game_handle';

/**
 * The size each game had the last time a frame looked.
 */
const seen = new WeakMap<TRuntimeStore, TGameResizeEvent>();

/**
 * Tells `onResized` when the game is not the size it was at the last frame.
 *
 * Compared here, at the start of a frame, rather than heard from whatever resized the canvas: a
 * container, the window, full screen and a host each resize it their own way, and a frame sees
 * all of them alike. It also makes the burst of events a window drag sends one change, the size it
 * ended at. The first frame only takes note: nothing has changed yet.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const noticeResize = (store: TRuntimeStore): void => {
    const { width, height } = screenSizeOf(store.get('screen').canvas);
    const last = seen.get(store);
    if (last !== undefined && last.width === width && last.height === height) {
        return;
    }
    seen.set(store, { width, height });
    if (last !== undefined) {
        gameMoment<TGameResizeEvent>(store, 'resized').emit({ width, height });
    }
};
