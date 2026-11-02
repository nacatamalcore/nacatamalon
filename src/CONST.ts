import { DEFAULT_ACTION_PRESS, DEFAULT_DEADZONE, MAX_LIGHTS, MAX_PALETTE_COLORS, MAX_SCENE_LIGHTS, PHYSICS_LAYERS } from './DEFAULTS';
import { GAMEPAD_AXES, GAMEPAD_AXIS_LABELS, GAMEPAD_BUTTONS, GAMEPAD_BUTTON_LABELS } from './input/gamepad/gamepad_standard';
import { POINTER_BUTTONS } from './input/pointer_buttons';
import { ACTION_PRESETS } from './input/actions/action_presets';
import { CONSOLE_SCREENS } from './game/console_screens';
import { ALL_LAYERS } from './physics/layers';
import { LINE_VERTEX_FLOATS } from './render/shared/line_vertex';
import { CRT_PRESETS } from './post/builtin/crt_presets';
import { COLOR_LEVELS } from './post/builtin/color_levels';
import { POST_KEYS } from './post/builtin/post_keys';
import { LOOK_KEYS } from './shader_composer/surface/look_keys';
import { FONT_KEYS } from './gameobjects/text/fonts/font_keys';
import { SFX_PRESETS } from './audio/synth/sfx_presets';
import { SONG_BUILTINS } from './audio/synth/builtin/song_library';
import { SONG_INSTRUMENTS } from './audio/synth/builtin/song_instruments';
import { SONG_SAMPLES } from './audio/synth/builtin/song_samples';
import { SCENE_FORMAT, SCENE_VERSION } from './scene/document/types/t_scene_doc';
import { TILEMAP_FORMAT } from './loaders/tilemap/types/t_tilemap_doc';
import { PALETTE_FORMAT } from './loaders/palette/palette_document';
import { ATLAS_FORMAT } from './atlas/document/atlas_format';
import { PARTICLES_FORMAT } from './loaders/particles/types/t_particles_doc';
import { SONG_FORMAT } from './audio/synth/parse_song_doc';
import { MOTION_FORMAT, MOTION_VERSION } from './motion/types/t_motion_doc';
import { SHADER_GRAPH_FORMAT } from './shader_composer/document';
import { STORE_FORMAT, STORE_VERSION } from './game_store/document/t_store_doc';
import type { TRendererType } from './render';
import type { TPixelSnap } from './game/types/t_game_options';
import type { TGamepadAxisName, TGamepadButtonName } from './input/gamepad/gamepad_standard';
import type { TPointerButtonName } from './input/pointer_buttons';
import type { TSfxPreset } from './audio/synth/types/t_song';
import type { TSongBuiltinInfo } from './audio/synth/builtin/song_library';
import type { TSongInstrumentInfo } from './audio/synth/builtin/song_instruments';
import type { TSongSampleInfo } from './audio/synth/builtin/song_samples';
import type { TCanvasAlign } from './DOM/types/t_canvas_align';
import type { TCanvasScaling } from './DOM/types/t_canvas_scaling';
import type { TCanvasKeep } from './DOM/types/t_canvas_keep';

/**
 * The engine's constants: what a game reads and never changes. They live on the root, in groups,
 * `import { LIMITS, BUILTIN } from 'nacatamalon'`, and each group stands alone, so a game carries
 * only the ones it reads.
 *
 * Everything in them is frozen all the way down: they are the same lists the engine reads, and a
 * game that wrote into one would change it for every game on the page.
 */

/**
 * Freezes a value and everything in it, and hands it back.
 */
const frozen = <T>(value: T): T => {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const inner of Object.values(value)) frozen(inner);
    }
    return value;
};

/**
 * How the engine draws: the renderers `createGame` can be asked for, which pixels it draws on, and
 * how many numbers one corner of a line takes.
 *
 * `TYPE.WEBGL2` is the same as writing `'WEBGL2'` in `createGame({ renderer })`. `PIXEL_SNAP.SCREEN`,
 * `GAME` and `OFF` are what `createGame({ pixelSnap })` and `useGame().setPixelSnap` take.
 * `LINE_VERTEX_FLOATS` is seven, where a corner is (`x`, `y`, `z`) and its colour (`r`, `g`, `b`,
 * `a`), for a game that writes the corners of its lines itself.
 *
 * @example
 * createGame({ renderer: RENDER.TYPE.WEBGL2, pixelSnap: RENDER.PIXEL_SNAP.GAME });
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const RENDER = /* @__PURE__ */ frozen({
    TYPE: {
        AUTO: 'AUTO',
        WEBGPU: 'WEBGPU',
        WEBGL2: 'WEBGL2',
    } as const satisfies Record<string, TRendererType>,
    PIXEL_SNAP: {
        SCREEN: 'screen',
        GAME: 'game',
        OFF: 'off',
    } as const satisfies Record<string, TPixelSnap>,
    LINE_VERTEX_FLOATS,
});

/**
 * The game's screen: what shape it is, and how it sits in its page.
 *
 * - `CONSOLES`: each console's screen, its size, the shape of its pixels (`pixelAspect`) and its
 *   pictures a second, to spread into `createGame`: `nes`, `snes`, `genesis`, `gameBoy`, `gba`,
 *   `ps1` and `n64`.
 * - `SCALING`: how big it is painted in its page, what `createGame({ scaling })`,
 *   `fullscreenScaling` and `useGame().setScaling` take: `NONE`, `INTEGER`, `CONTAIN` or `FILL`.
 * - `KEEP`: which sides keep the game's size when the page is another shape,
 *   `createGame({ keep })`: `BOTH`, `WIDTH`, `HEIGHT` or `NONE`.
 * - `ALIGN`: where `createGame({ align })` puts it in its container: `CENTER`, a side (`TOP`,
 *   `BOTTOM`, `LEFT`, `RIGHT`) or a corner (`TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT`).
 *
 * @example
 * createGame('#app', { ...SCREEN.CONSOLES.snes, scaling: SCREEN.SCALING.INTEGER });
 * createGame('#app', { width: 320, height: 180, align: SCREEN.ALIGN.TOP });
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SCREEN = /* @__PURE__ */ frozen({
    CONSOLES: CONSOLE_SCREENS,
    SCALING: {
        NONE: 'none',
        INTEGER: 'integer',
        CONTAIN: 'contain',
        FILL: 'fill',
    } as const satisfies Record<string, TCanvasScaling>,
    KEEP: {
        BOTH: 'both',
        WIDTH: 'width',
        HEIGHT: 'height',
        NONE: 'none',
    } as const satisfies Record<string, TCanvasKeep>,
    ALIGN: {
        CENTER: 'center',
        TOP: 'top',
        BOTTOM: 'bottom',
        LEFT: 'left',
        RIGHT: 'right',
        TOP_LEFT: 'top-left',
        TOP_RIGHT: 'top-right',
        BOTTOM_LEFT: 'bottom-left',
        BOTTOM_RIGHT: 'bottom-right',
    } as const satisfies Record<string, TCanvasAlign>,
});

/**
 * The names input is read by, and the numbers it starts from.
 *
 * - `GAMEPAD_BUTTONS` and `GAMEPAD_AXES`: what a standard pad's buttons and sticks are called, in
 *   order, and `GAMEPAD_BUTTON_LABELS` / `GAMEPAD_AXIS_LABELS` how a controls screen shows them.
 * - `POINTER_BUTTONS`: `main`, `middle`, `right`, `back` and `forward`.
 * - `DEADZONE`: how far a stick or a trigger moves before it counts, the pad's and an action's,
 *   when nothing says. `ACTION_PRESS`: how far it moves before an action counts as pressed.
 * - `ACTION_PRESETS`: input maps ready to use, so a game does not write its sixteen bindings by
 *   hand. By console, `nes`, `genesis`, `snes` and `arcade`, whose actions are its buttons (`a`, `b`,
 *   `start`; `button1` to `button6` and `coin` on an arcade), and by kind of game, `platformer`
 *   (`jump`, `action`, `pause`). Every one has `up`, `down`, `left` and `right` on the arrows, WASD, the
 *   d-pad and the left stick; a console's buttons sit on the pad where they sat on its own.
 *
 * @example
 * for (const button of INPUT.GAMEPAD_BUTTONS) {
 *     if (pad.pressed(button)) console.log(INPUT.GAMEPAD_BUTTON_LABELS[button]);
 * }
 *
 * createGame('#app', { actions: INPUT.ACTION_PRESETS.genesis });
 * // and actions of its own, after:
 * createGame('#app', { actions: [...INPUT.ACTION_PRESETS.nes, { name: 'dash', bindings: [{ type: 'key', key: 'c' }] }] });
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const INPUT = /* @__PURE__ */ frozen({
    GAMEPAD_BUTTONS: GAMEPAD_BUTTONS as readonly TGamepadButtonName[],
    GAMEPAD_AXES: GAMEPAD_AXES as readonly TGamepadAxisName[],
    GAMEPAD_BUTTON_LABELS,
    GAMEPAD_AXIS_LABELS,
    POINTER_BUTTONS: POINTER_BUTTONS as readonly TPointerButtonName[],
    ACTION_PRESETS,
    DEADZONE: DEFAULT_DEADZONE,
    ACTION_PRESS: DEFAULT_ACTION_PRESS,
});

/**
 * How far the engine goes, fixed by what it draws and simulates with: a game cannot raise them.
 *
 * - `LIGHTS`: how many lights shine on one thing drawn, eight, as the consoles of the era had:
 *   each model is lit by the eight that reach it most. An ambient light does not count.
 * - `SCENE_LIGHTS`: how many a scene holds at a time, thirty-two, which each model takes its eight
 *   from. Past them they are dropped with a warning.
 * - `PHYSICS_LAYERS`: how many collision layers a scene has, sixteen, the most both physics
 *   backends can tell apart.
 * - `PALETTE_COLORS`: as many colours as a palette may hold, 256.
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIMITS = /* @__PURE__ */ frozen({
    LIGHTS: MAX_LIGHTS,
    SCENE_LIGHTS: MAX_SCENE_LIGHTS,
    PHYSICS_LAYERS,
    PALETTE_COLORS: MAX_PALETTE_COLORS,
});

/**
 * Values physics is written with. `ALL_LAYERS` is every layer at once, what a collider hits unless
 * it says otherwise.
 *
 * @example
 * usePhysicsBody2d({ body: 'dynamic', collider, collidesWith: PHYSICS.ALL_LAYERS });
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PHYSICS = /* @__PURE__ */ frozen({
    ALL_LAYERS,
});

/**
 * The post effects: the ones the engine carries, and starting points for them.
 *
 * - `NAMES`: the post effects a project names in its `post` list.
 * - `CRT_PRESETS`: four tubes for `crt()`. `consumer` is the television in the living room, `pvm` a
 *   studio monitor, `arcade` a cabinet, `composite` a cheap cable.
 * - `COLOR_LEVELS`: how many steps a channel had on each machine, for `dither()` and `posterize()`.
 *
 * @example
 * usePostProcess(crt(POST_EFFECTS.CRT_PRESETS.pvm));
 * usePostProcess(crt({ ...POST_EFFECTS.CRT_PRESETS.consumer, noise: 0 }));
 * usePostProcess(posterize({ levels: POST_EFFECTS.COLOR_LEVELS.genesis }));
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const POST_EFFECTS = /* @__PURE__ */ frozen({
    NAMES: POST_KEYS,
    CRT_PRESETS,
    COLOR_LEVELS,
});

/**
 * What the engine carries, asked for by name, by kind.
 *
 * - `FONTS`: the fonts a text can name, `'nacatamalon:arcade'` first, the one it uses when it
 *   names none.
 * - `MUSIC.SONGS`: the songs, `useLoadSong({ src: 'nacatamalon:' + key })`. `MUSIC.INSTRUMENTS`
 *   and `MUSIC.SAMPLES`: what a song's notes play with `@name`, and what its sample voices play.
 * - `SOUNDS`: the kinds of sound effect `renderSfx` makes.
 * - `LOOKS`: the looks a material can take.
 *
 * @example
 * const song = useLoadSong({ src: `nacatamalon:${BUILTIN.MUSIC.SONGS[0].key}` });
 * createText({ text: 'READY', font: BUILTIN.FONTS[2] });
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const BUILTIN = /* @__PURE__ */ frozen({
    FONTS: FONT_KEYS,
    MUSIC: {
        SONGS: SONG_BUILTINS as readonly TSongBuiltinInfo[],
        INSTRUMENTS: SONG_INSTRUMENTS as readonly TSongInstrumentInfo[],
        SAMPLES: SONG_SAMPLES as readonly TSongSampleInfo[],
    },
    SOUNDS: SFX_PRESETS as readonly TSfxPreset[],
    LOOKS: LOOK_KEYS,
});

/**
 * What the engine's documents say they are, field by field: `FORMAT` is what a file's `format`
 * holds and `VERSION` its `version`, for a tool or a game that writes one by hand. The engine's own
 * `serialize…` and the editor write them already.
 *
 * Some documents name themselves and count their versions apart (a scene is
 * `format: 'nacatamalon-scene'`, `version: 1`); the rest have only `format`, and it is the version.
 * A version goes up when a document written today would be misread by an older engine. A scene
 * claiming a higher one than this engine's is loaded anyway and warned about once.
 *
 * @example
 * const palette = { format: DOCUMENTS.PALETTE.FORMAT, kind: 'palette', name: 'Dusk', colors: ['#102030'] };
 * const isScene = (file: { format?: unknown }) => file.format === DOCUMENTS.SCENE.FORMAT;
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DOCUMENTS = /* @__PURE__ */ frozen({
    SCENE: { FORMAT: SCENE_FORMAT, VERSION: SCENE_VERSION },
    MOTION: { FORMAT: MOTION_FORMAT, VERSION: MOTION_VERSION },
    STORE: { FORMAT: STORE_FORMAT, VERSION: STORE_VERSION },
    TILEMAP: { FORMAT: TILEMAP_FORMAT },
    PALETTE: { FORMAT: PALETTE_FORMAT },
    ATLAS: { FORMAT: ATLAS_FORMAT },
    PARTICLES: { FORMAT: PARTICLES_FORMAT },
    SONG: { FORMAT: SONG_FORMAT },
    SHADER_GRAPH: { FORMAT: SHADER_GRAPH_FORMAT },
} as const);
