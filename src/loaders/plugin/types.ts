import type { TLoadStatus } from '../types/t_load_status';
import type { TTexture } from '../texture/types/t_texture';
import type { TAudioClip } from '../audio/types/t_audio_clip';

/**
 * A file of a kind a plugin taught the engine to load (`registerAssetType`), on its way in or
 * already here: what the plugin's loading hook hands back. Kept, counted, waited on and let go of
 * like the engine's own files.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPluginAsset<TData = unknown> = {
    readonly type: 'plugin-asset';
    /**
     * The kind of file, as its plugin registered it.
     */
    readonly kind: string;
    /**
     * What it is kept under in this game. The `src` unless a `key` was given.
     */
    key: string;
    src: string;
    status: TLoadStatus;
    /**
     * What the kind's `parse` made of it, once it is `'ready'`; `null` before, and after an error.
     */
    data: TData | null;
};

/**
 * What `parse` is handed besides the file: where the file is, and a way to ask for what it names.
 * Each one asked for is loaded by the engine next to the file (a path is read from where the file
 * is), counted with it, kept for as long as the file is, and waited for before the file is
 * `'ready'`. What is handed back is the record at once, still loading: read it once the file is ready.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAssetTypeHelp = {
    /**
     * Where the file was loaded from, as the page reads it.
     */
    readonly src: string;
    /**
     * A picture the file names, shared with anything else in the game that loads the same one.
     */
    texture(path: string): TTexture;
    /**
     * A sound the file names, shared the same way.
     */
    audio(path: string): TAudioClip;
    /**
     * A file of another kind a plugin registered (or of this one), shared the same way.
     */
    asset<T = unknown>(kind: string, path: string): TPluginAsset<T>;
};

/**
 * How a plugin teaches the engine a kind of file: what it is called, how the engine reads it, and
 * what the plugin makes of it.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAssetTypeDefinition<TData = unknown> = {
    /**
     * Its name, which a scene document lists it by. Start it with the plugin's own
     * (`'nacatamalon-ellipsoids-rig'`), so two plugins never pick the same.
     */
    readonly kind: string;
    /**
     * How the engine reads the file before `parse` has it: as JSON, as text, or as its bytes.
     */
    readonly read: 'json' | 'text' | 'bytes';
    /**
     * Makes what the game uses out of the file: `content` is the parsed JSON, the text, or an
     * `ArrayBuffer`. May be `async`. Throwing (a file that is not one of these) leaves the record in
     * `'error'`, said once in the plugin's name.
     */
    parse(content: unknown, help: TAssetTypeHelp): TData | Promise<TData>;
    /**
     * Lets go of what `parse` made, when the game lets go of the file (`releaseAsset`). What `parse`
     * asked for through `help` goes on its own. Left out, there is nothing to let go of.
     */
    release?(data: TData): void;
};

/**
 * What `registerAssetType` hands back: the kind's name, and its loading hook, which the plugin
 * exports under its own name (`export const useLoadRig = rigs.useLoad`).
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAssetType<TData = unknown> = {
    readonly kind: string;
    /**
     * Loads a file of this kind, as the engine's `useLoad…` hooks do: called in a scene body or a
     * component, it hands back the record at once, counted by `useLoadProgress`, kept under `key`
     * (default `src`, as the page resolves it), and shared with any other place that asks for the
     * same one.
     */
    useLoad(options: { src: string; key?: string }): TPluginAsset<TData>;
};
