import type { TCanvasFullscreen } from '../../DOM/fullscreen';
import type { TGameConfig } from '../../game/types/t_game_config';
import type { IRenderer } from '../../render';
import type { TBox } from '../../box';
import type { TSceneFn } from '../../scene';
import type { TAudioClip, TLoadedAtlas, TBitmapFont, TTexture, TGltfModel } from '../../loaders';
import type { TShader } from '../../loaders/shader/types/t_shader';
import type { TPalette } from '../../loaders/palette/types/t_palette';
import type { TLut } from '../../loaders/lut/types/t_lut';
import type { TLoadedPixels } from '../../loaders/pixels/types/t_loaded_pixels';
import type { TLoadedPack } from '../../loaders/pack/types/t_loaded_pack';
import type { TPostEffect } from '../../post/types/t_post_effect';
import type { TTransitionState } from '../../transition/types/t_transition_state';
import type { TCamera2d } from '../../camera/types/t_camera_2d';
import type { TCamera3d } from '../../camera/types/t_camera_3d';
import type { TParticlesFile } from '../../loaders/particles/types/t_particles_file';
import type { TTilemap } from '../../gameobjects/tilemap';
import type { TGeometry } from '../../geometry';
import type { TDrawable } from '../../gameobjects/types';
import type { TActionSource, TGamepadSource, TInputMapHandle, TKeyboardSource, TPointerSource } from '../../input';
import type { TRandomHandle } from '../../math/random';
import type { TAudioManager } from '../../audio';
import type { TPreviewRequest } from '../../game/preview/types/t_camera_preview';
import type { TCaptureRequest } from '../../game/capture/types/t_capture_request';

/**
 * Everything one running game owns: canvas, renderer, config, the tree, the loop. **One per
 * `createGame`**, however many boxes the game has, and several can be alive at once on a
 * page, which is why nothing here is a module singleton.
 *
 * Not to be confused with the *game* store a player's data lives in (score, lives,
 * inventory): that one is the user's, there are many per game, and it goes to disk. This one
 * is the engine's own machinery for one running instance.
 *
 * Split into sections because a section is the unit of change: a setter writes one, a
 * listener watches one. The renderer watching `config` is not woken by the loop writing its
 * frame handle.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuntimeState = {
    /**
     * Where the game is drawn, and with what.
     */
    screen: {
        canvas: HTMLCanvasElement;
        renderer: IRenderer;
        /**
         * Full screen for the canvas, or `null` where the game was started without a page to fill.
         */
        fullscreen: TCanvasFullscreen | null;
    };

    /**
     * The boot configuration, defaults already applied.
     *
     * **Four of its fields are the request, not the truth.** `width`/`height` are what was
     * asked for; the real size is `screenSizeOf(screen.canvas)`, which `fitCanvas` and any
     * resize change (not `screen.canvas.width`, which is the drawing buffer and so the game's
     * size times `pixelRatio`). `pixelRatio: 'device'` is a request too, resolved in the same
     * place. `msaa` likewise: ask for 4 and a device may grant 1, and the outcome is
     * `screen.renderer.capabilities.msaa`. Same for `renderer` versus `capabilities.backend`.
     *
     * The rest (`background`, `scaling`, `keep`, `smooth`, `pauseOnBlur`) have no derived
     * form, so here they *are* the truth and are read live every frame.
     */
    config: TGameConfig;

    /**
     * The scene tree. Only the **roots** live here; everything else is reached by walking
     * `children`.
     */
    world: {
        scenes: TBox[];
        /**
         * Every scene the game knows, by name: what can be started. It only grows, through
         * `registerScene`. `createGame` registers the object it receives at boot, so those are
         * listed before any scene runs. Replaced, never mutated, so listeners hear new entries.
         */
        names: ReadonlyMap<string, TSceneFn>;
        /**
         * Which box is currently being built. What `getActiveBox()` reads so a hook
         * called inside a component knows who it belongs to. A stack because a scene's init
         * can nest.
         *
         * The one section field that is **pushed and popped in place** rather than replaced:
         * it changes several times per node during an init pass and nothing subscribes to it,
         * so paying for a new array and a notification each time would buy nothing.
         */
        boxStack: TBox[];
        /**
         * Whether the scene being built right now **runs** the behaviours its objects attach, or
         * only records that they are attached.
         *
         * `'run'` is what a game is and the default everywhere. `'attach'` is for a host showing a
         * scene rather than playing it: the object carries its behaviour, the behaviour serializes,
         * and nothing is called. A behaviour that asked to be seen while building (`tool`) runs in
         * both.
         *
         * It lives here, and not on the options a game is created with, because it is a property of
         * **this scene, being built now**, not of the whole game: one host can show a scene while
         * playing the same one beside it. `sceneFromDoc` is the only thing that moves it, and it
         * puts it back itself, so nothing outside can leave it turned on by accident.
         */
        buildScripts: 'run' | 'attach';
        /**
         * What `destroy` has queued and the frame has not swept yet.
         *
         * Mutated in place like `boxStack`: it is filled and emptied within one frame and
         * nothing subscribes to it.
         */
        pendingDestroy: Array<TDrawable | TBox>;
    };

    /**
     * What **controls** the loop, never what the loop produces.
     *
     * `time`, `delta` and the frame counter deliberately live outside: they change sixty
     * times a second and nothing reacts to them, so putting them here would wake every
     * listener of this section on every frame and make watching `pausedBy` useless. They
     * travel in `TFrameContext` instead.
     *
     * There is no `rafId`. Cancelling the pending frame is not what stops the loop, because
     * `destroy` can be called from inside a tick that is about to reschedule itself, and
     * that reschedule would outlive the cancel. `destroyed` is what closes the door; the one
     * frame already queued fires, reads the flag on line one, and returns.
     */
    loop: {
        /**
         * Once true, `tick` returns on its first line and never reschedules. Set once in the
         * life of a game and never cleared: a destroyed game does not come back.
         */
        destroyed: boolean;

        /**
         * Who is currently holding the loop. Empty means running, and `paused` is simply
         * `pausedBy.length > 0`.
         *
         * A list rather than a boolean because three unrelated things can pause and none of
         * them knows about the others: the browser (`pauseOnBlur` on `visibilitychange`),
         * the game (a pause menu), and the editor (its Play/Pause button). With a boolean the
         * last writer wins, so tabbing back would resume a game the player had paused from a
         * menu. Releasing means removing your own tag, never writing `false`.
         *
         * **Pausing does not stop the loop.** `tick` keeps running and keeps drawing, it only
         * skips the update. A paused game that stopped drawing would have no pause menu to
         * show.
         */
        pausedBy: readonly string[];

        /**
         * Multiplier on the delta the world advances by. `1` is real time, `0.5` is slow
         * motion, `2` is fast forward.
         *
         * It scales **the game, not the engine**: the pause menu, the editor's own clock and
         * any UI interpolation read the unscaled delta, which is why `TFrameContext` has to
         * carry both numbers rather than one.
         */
        timeScale: number;

        /**
         * The first error a scene's update threw, or `null` while none has.
         *
         * **A throw does not stop the loop.** The scene that threw loses the rest of that frame's
         * update, every other scene carries on, and the frame is still drawn. So a broken script
         * costs its own scene, not the picture, and an editor showing the game goes on drawing
         * while somebody fixes it.
         *
         * Only the first one is kept, and it is the only one written to the console: a broken script
         * throws again every frame, and sixty copies a second of the same line would bury whatever
         * else the console had to say. Whoever fixes the cause clears it, and the next error is
         * reported again.
         */
        failure: Error | null;

        /**
         * One frame's worth of game time a host asked a **paused** game to run (`stepFrame`), in
         * seconds, or `null`. The next frame runs the updates by exactly this much, then clears it
         * and the game is paused again.
         *
         * A request the loop picks up, rather than a frame run on the spot, because the loop has
         * already asked for its next frame: running one here as well would leave two in flight,
         * and the game at double speed from then on.
         */
        step: number | null;
    };

    /**
     * What the player is doing right now.
     *
     * A section of its own rather than a corner of `screen`, because it is read every frame by
     * the game and written by the DOM: two flows that have nothing to do with the canvas. Its
     * contents are mutated in place and nothing subscribes to it, so it never notifies.
     */
    input: {
        keyboard: TKeyboardSource;
        /**
         * The pads. Asked how they are once a frame, by the loop, because a pad sends no events.
         */
        gamepads: TGamepadSource;
        /**
         * The game's named actions, worked out from the keyboard and the pads right after they are
         * read, so everything in a frame sees the same answer.
         */
        actions: TActionSource;
        /**
         * Changing what the actions listen to: what a controls screen uses, and where the player's
         * own choices are kept.
         */
        inputMap: TInputMapHandle;
        pointer: TPointerSource;
    };

    /**
     * This game's random generator, seeded from `config.seed` when there is one.
     *
     * Per game so two games on one page do not draw from the same sequence, and so a seeded game
     * replays the same way however many other games are running. Mutated by every draw; nothing
     * subscribes to it.
     */
    random: {
        rng: TRandomHandle;
    };

    /**
     * What this game has loaded, by key.
     *
     * Per game and not per page: an uploaded texture belongs to one renderer's device, and a
     * second game on the same page could not draw with it.
     *
     * The maps are **mutated in place**, like `world.boxStack`: a cache gains an entry on every
     * first load and nothing subscribes to it, so a new map and a notification each time would buy
     * nothing. Anyone who needs to know when an asset is ready watches the asset's own `status`.
     */
    assets: {
        textures: Map<string, TTexture>;
        atlases: Map<string, TLoadedAtlas>;
        bitmapFonts: Map<string, TBitmapFont>;
        sounds: Map<string, TAudioClip>;
        tilemaps: Map<string, TTilemap>;
        /**
         * Shapes, built or loaded once and shared by every model that shows one.
         */
        geometries: Map<string, TGeometry>;
        /**
         * Models read from a file, kept whole so two of the same one are read once.
         */
        gltf: Map<string, TGltfModel>;
        /**
         * Shaders read from a file, so every material built on one shares a single fetch.
         */
        shaders: Map<string, TShader>;
        /**
         * Effects read from a file, so three torches share one document and one picture.
         */
        particles: Map<string, TParticlesFile>;
        /**
         * Palettes, so two effects reducing to the same one fetch and upload it once.
         */
        palettes: Map<string, TPalette>;
        /**
         * Grading tables, the same way.
         */
        luts: Map<string, TLut>;
        /**
         * Packs, so two scenes placing the same one read its manifest and documents once.
         */
        packs: Map<string, TLoadedPack>;
        /**
         * Picture files loaded as pixels, so two scenes processing the same one fetch and decode it once.
         */
        pixels: Map<string, TLoadedPixels>;
    };
    /**
     * The full-screen effects, in the order they run.
     *
     * **Owned by the game and not by a scene**, because the chain describes *the screen*, and a
     * screen does not change its look because a pause menu was opened over the level. A scene still
     * owns its own entry: the effect it installed leaves when it does.
     *
     * Order is the order they were installed, and it is the picture: each one reads what the one
     * before it produced.
     *
     * Mutated in place like the asset caches, and for the same reason: the renderer reads the list
     * every frame and nothing subscribes to it.
     */
    post: {
        effects: TPostEffect[];
        /**
         * The single switch for the lot, for a host showing the game as a viewport.
         *
         * Off is exactly as cheap as an empty chain, which is what makes it usable as a toggle
         * somebody flicks while working.
         *
         * **It does not reach a transition.** This switch means "show me the game without the look
         * I put on it", and a transition is not a look the game put on anything: it is the engine
         * covering the screen while it swaps what is behind it. Turning the chain off to inspect a
         * scene must not turn a change into a scene that is invisible for a third of a second and
         * then appears all at once.
         */
        enabled: boolean;
    };
    /**
     * The scene change being covered right now, or `null` between changes, which is almost always.
     *
     * **One at a time, and it belongs to the screen rather than to a scene.** Covering happens to
     * the picture, so a HUD launched alongside the level is covered with it; and neither of the two
     * scenes involved could own it, because one of them is about to stop.
     *
     * Mutated in place like the asset caches: the loop moves it on every frame and nothing
     * subscribes to it. The section is replaced only when a transition starts or ends.
     */
    transition: {
        active: TTransitionState | null;
    };
    /**
     * The cameras a tool looks at the game through, in place of each scene's own. `null` is the
     * scene's own, which is what a game always has: only a tool sets these, through its handle.
     *
     * **Only the screen is looked at through them.** A picture a scene draws into keeps its own
     * camera, because what a monitor in the level shows is part of the level, and an editor flying
     * round it must not change it.
     */
    viewport: {
        camera3d: TCamera3d | null;
        camera2d: TCamera2d | null;
        /**
         * The kinds of drawing the screen shows, or `null` for all of them. An editor working on the
         * flat half of a level hides the models and the other way round, without taking anything
         * out of the scene. Pictures drawn inside the level keep everything, like the cameras.
         */
        layers: ReadonlyArray<TDrawable['type']> | null;
        /**
         * A second view drawn every frame onto another canvas, or `null`, which is what a game
         * always has. See `TEditorHandle.setCameraPreview`.
         */
        preview: TPreviewRequest | null;
    };
    /**
     * The picture a tool asked for and the next frame will draw, or `null`, which is almost always.
     *
     * One at a time and gone once its frame is over: a capture is a one-off, and the next one is
     * sized and framed by its own options. See `TEditorHandle.capture`.
     */
    capture: {
        request: TCaptureRequest | null;
    };
    /**
     * What the loop measures about itself, for a panel or a HUD to show. Nothing in the game
     * depends on it.
     *
     * A section of its own, and not part of `loop`, because it changes every frame: written there,
     * it would wake whoever listens to the loop's settings sixty times a second. Here nobody
     * listens, and a write to a section with no listeners costs one lookup.
     */
    stats: {
        /**
         * Frames per second, averaged. `0` until two frames have been drawn.
         */
        fps: number;
    };
    /**
     * The game's sound, or `null` while it has none.
     *
     * Null on purpose and not built with the game: opening the browser's audio engine costs a real
     * resource (browsers count them, phones spend battery on them), so a game that never plays a
     * sound never opens one. The first `useLoadAudio` or `useSound` fills this in.
     */
    audio: {
        manager: TAudioManager | null;
    };
};

/**
 * The **name** of one section of the runtime state: what `get`, `setState`, `subscribe` and
 * `version` are keyed by. Not the section's contents: those are `TRuntimeState[K]`.
 *
 * Derived with `keyof` rather than written out, so adding a section to `TRuntimeState` widens
 * it on its own and renaming one is a rename the compiler can follow.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuntimeSectionName = keyof TRuntimeState;
