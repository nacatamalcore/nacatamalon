import type { TBox } from '../../box';
import type { TSceneFn } from '../../scene/types/t_scene_fn';
import type { TGameHandle } from './t_game_handle';
import type { TCamera2d } from '../../camera/types/t_camera_2d';
import type { TCamera3d } from '../../camera/types/t_camera_3d';
import type { TDrawable } from '../../gameobjects/types';
import type { TCaptureResult } from '../../render/interface';
import type { TCaptureOptions } from '../capture/types/t_capture_options';
import type { TPostChain, TPostEffect } from '../../post';
import type { TCameraPreview } from '../preview/types/t_camera_preview';
import type { TActionsHandle } from '../../input';

/**
 * What a tool may do with a running game on top of what the game may do with itself.
 *
 * The line between the two is the one question the whole public surface is cut by: **would a
 * published game ever call this?** A game changes scene by name, from inside, through the scenes it
 * declared at the start. A tool replaces the scene from outside every time the document it is
 * editing changes, which no game does. So this is reached through the tools' door
 * (`nacatamalon/authoring`) and never appears on what a game holds.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEditorHandle = TGameHandle & {
    /**
     * Stops everything running and starts this scene in its place, under this name, and hands back
     * its root.
     *
     * The same name can be given a new body as often as a tool likes, which is what happens on every
     * edit: inside a game that would be refused, because two bodies under one name is a mistake
     * there. The root comes back at once, built, so there is nothing to wait for.
     */
    loadScene(name: string, scene: TSceneFn): TBox;
    /**
     * Looks at the screen through `camera` instead of each scene's own 3D camera, or through the
     * scenes' own again with `null`. How an editor flies round a level without moving the camera the
     * level was written with.
     *
     * The camera is read every frame and not copied, so moving it in place is enough. Only the
     * screen is looked at through it: a picture a scene draws into keeps its own camera.
     */
    setViewportCamera(camera: TCamera3d | null): void;
    /**
     * The camera set with `setViewportCamera`, or `null` when each scene uses its own.
     */
    getViewportCamera(): TCamera3d | null;
    /**
     * The same for the flat half: `camera` pans and zooms every scene's 2D, in the game's pixels, in
     * place of the scene's own 2D camera (or of none). `null` gives the scenes back their own.
     */
    setViewportCamera2d(camera: TCamera2d | null): void;
    /**
     * The camera set with `setViewportCamera2d`, or `null`.
     */
    getViewportCamera2d(): TCamera2d | null;
    /**
     * Shows only these kinds of drawing on the screen, or all of them again with `null`. Nothing
     * leaves the scene: a hidden kind is simply not drawn, and comes back as it was. Like the
     * viewport cameras, it reaches the screen and not the pictures a scene draws into.
     */
    setViewportLayers(layers: ReadonlyArray<TDrawable['type']> | null): void;
    /**
     * The kinds set with `setViewportLayers`, or `null` for all.
     */
    getViewportLayers(): ReadonlyArray<TDrawable['type']> | null;
    /**
     * Takes a picture of the game, and hands back its pixels.
     *
     * The only way to see what was drawn: the screen of a WebGPU game cannot be read back, so the
     * next frame draws the scenes once more into a picture that can. With no options it is a picture
     * of the screen; with options it is something else without touching the screen: the game as a
     * player sees it, say, with `null` cameras (each scene's own) at the project's size.
     *
     * Raw `RGBA8`, not a file: making a PNG needs the page, and whoever wants one makes it. Works while
     * the game is paused. One at a time, and it fails, rather than waiting for ever, if the frame that
     * draws it throws or the game is destroyed first.
     *
     * ```ts
     * const { width, height, data } = await editor.capture();
     * const image = new ImageData(new Uint8ClampedArray(data), width, height);
     * ```
     */
    capture(options?: TCaptureOptions): Promise<TCaptureResult>;
    /**
     * Swaps the project's screen effects for `chain`, leaving the ones a scene installed alone.
     *
     * What an editor calls when the project's look is edited: a game sets its chain once, from its
     * options, and never changes whose screen it is being shown on.
     */
    setPostChain(chain: TPostChain): void;
    /**
     * Turns every screen effect on or off at once, without forgetting any of them. Off costs what no
     * effects cost, so it can be flicked while working. A scene change is still covered either way.
     */
    setPostProcessEnabled(enabled: boolean): void;
    /**
     * The screen effects as they stand, in the order they run: the project's, then each scene's.
     * The live list, so whether an effect's shader or palette has arrived can be seen on it.
     */
    getPostEffects(): readonly TPostEffect[];
    /**
     * Forgets whatever was loaded under this key, so the next load reads the file again, and says
     * whether anything was. For a file that changed on disk: a game's files never change, so a game
     * never needs it. What is already on screen keeps what it had until its scene is built again.
     */
    evictAsset(key: string): boolean;
    /**
     * The first error a scene's update threw, or `null`. The game goes on running after one, so this
     * is how a tool finds out that a scene has been skipping its update since.
     */
    getFrameError(): Error | null;
    /**
     * Draws the game once more on every frame onto another canvas, or stops with `null`: what an
     * editor shows in a corner so a shot can be watched while its own camera is somewhere else.
     *
     * It costs one more pass over the scenes per frame while it is on, and nothing when it is off,
     * which is how a game always has it. See `TCameraPreview` for what each field chooses.
     */
    setCameraPreview(preview: TCameraPreview | null): void;
    /**
     * The canvas a preview is being drawn on, or `null` when there is none.
     */
    getCameraPreview(): HTMLCanvasElement | null;
    /**
     * Forgets the error `getFrameError` holds, so the next one is reported again, and says whether
     * there was one. What a tool calls once it has replaced what threw.
     */
    clearFrameError(): boolean;
    /**
     * Runs exactly one frame of a paused game on the next frame the page draws, then leaves it
     * paused again.
     *
     * A shipped game never steps a frame: it is the debugger's move. What it buys is watching a bug
     * happen one frame at a time, and reproducing it, because the step advances by the `dt` it was
     * **told** rather than by whatever the clock says: a step taken after ten seconds of staring
     * at the frozen frame is still one sixtieth of a second of game.
     *
     * Returns `false` and does nothing if the game is not paused or is destroyed. `dt` is clamped
     * like an ordinary frame's, so a step cannot smuggle in a jump the loop itself would refuse.
     */
    stepFrame(dt?: number): boolean;
    /**
     * The game's named actions as the game reads them this frame: what a host shows live while
     * somebody plays, like a controls panel lighting up an action as it fires.
     */
    getActions(): TActionsHandle;
    /**
     * The scenes running right now, oldest first: the running trees themselves, for a host that
     * answers "what is actually on screen". A shipped game asks `useScene` instead.
     */
    getScenes(): readonly TBox[];
};
