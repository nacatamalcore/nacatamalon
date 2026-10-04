import type { TCanvasFullscreen } from '../../DOM/fullscreen';
import type { TGameConfig } from '../../game/types/t_game_config';
import type { IRenderer } from '../../render';
import type { TRuntimeSectionName, TRuntimeState } from './t_runtime_state';

/**
 * What `createRuntimeStore` needs to exist: what booting produced (canvas, renderer, config).
 * `world` and `loop` start empty.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuntimeStoreInit = {
    canvas: HTMLCanvasElement;
    /**
     * Full screen for that canvas. Absent where there is no page to fill (a test, a capture).
     */
    fullscreen?: TCanvasFullscreen;
    renderer: IRenderer;
    config: TGameConfig;
};

/**
 * One running game's source of truth, and the only legal way to change it.
 *
 * Reactive in the Zustand sense: state is read through `get`, written through `setState`, and a
 * write notifies whoever subscribed to *that section*. Nothing polls. The renderer subscribes
 * to `config` once at boot, and a later `setState('config', { background })` from anywhere reaches
 * it without either side knowing about the other.
 *
 * **Sections are replaced, not mutated.** `setState` builds a new section object from the old one
 * plus the patch, so the identity of `get('config')` changes exactly when its contents do,
 * which is what lets a listener compare cheaply and what makes `version` meaningful. Reaching
 * into a section and assigning a field bypasses every listener; the one place the engine does
 * that on purpose is `world.boxStack`.
 *
 * Nothing about it is module-level, so two games on one page cannot overwrite each other.
 * The single shared pointer, which game is *currently running*, lives in `active_game.ts`.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuntimeStore = {
    /**
     * Unique per instance. What tells two games apart on the same page.
     */
    readonly id: string;

    /**
     * Reads one section. Cheap enough to call every frame (a property lookup, not a
     * copy), which is what the loop does with `config`.
     */
    get<K extends TRuntimeSectionName>(section: K): Readonly<TRuntimeState[K]>;

    /**
     * Reads the whole state at once. For the places that genuinely need all of it (a
     * debugger, a devtools panel), not for the loop.
     */
    getState(): Readonly<TRuntimeState>;

    /**
     * Merges `patch` into one section and notifies that section's listeners.
     *
     * A no-op when every field in `patch` is already `Object.is`-equal to what is there, so
     * writing the same background sixty times a second wakes nobody.
     */
    setState<K extends TRuntimeSectionName>(section: K, patch: Partial<TRuntimeState[K]>): void;

    /**
     * Listens to one section, or to one thing inside it, and returns the function that stops
     * listening.
     *
     * Two forms. With a listener alone it fires on every change to the section. With a
     * **selector** in between it fires only when what the selector picks actually changes,
     * compared with `Object.is`:
     *
     * ```ts
     * store.subscribe('config', (config) => …);                       // any config change
     * store.subscribe('config', (c) => c.width, (width, prev) => …);  // only the width
     * ```
     *
     * The selector runs on every `setState` to that section: it must be pure and cheap, a field
     * read and nothing more. What it saves is not the read, it is the work in the listener.
     *
     * It does **not** fire on subscribe: the value at that moment is the baseline, and the
     * first call is the first real change. Read it with `get` if you also need it now.
     *
     * A caveat that bites with `background`: `Object.is` compares references, and `TColor` is an
     * object, so `getColor('red')` twice is two different values. Select a number
     * (`(c) => c.background.r`) when that matters.
     *
     * Delivery is **synchronous**, inside the `setState` that caused it. A listener that re-renders
     * something should coalesce; a listener must not `setState` the section it was notified about.
     */
    subscribe<K extends TRuntimeSectionName>(
        section: K,
        listener: (value: Readonly<TRuntimeState[K]>) => void,
    ): () => void;
    subscribe<K extends TRuntimeSectionName, S>(
        section: K,
        selector: (value: Readonly<TRuntimeState[K]>) => S,
        listener: (value: S, previous: S) => void,
    ): () => void;

    /**
     * How many times a section has changed. Exists for `useSyncExternalStore`, which demands a
     * snapshot it can compare with `Object.is`: a number always can be, an object holding a
     * `GPUDevice` cannot.
     */
    version(section: TRuntimeSectionName): number;

    /**
     * Drops every listener. Called by the game's own `destroy`, so a torn-down game cannot
     * keep a React component or an editor panel subscribed to a canvas that is gone.
     */
    destroy(): void;
};
