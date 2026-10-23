import { DEFAULT_ACTION_PRESS, DEFAULT_DEADZONE, MAX_LIGHTS, MAX_PALETTE_COLORS, PHYSICS_LAYERS } from './CONFIG';
import { GAMEPAD_AXES, GAMEPAD_AXIS_LABELS, GAMEPAD_BUTTONS, GAMEPAD_BUTTON_LABELS } from './input/gamepad/gamepad_standard';
import { POINTER_BUTTONS } from './input/pointer_buttons';
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
import type { TRendererType } from './render';
import type { TGamepadAxisName, TGamepadButtonName } from './input/gamepad/gamepad_standard';
import type { TPointerButtonName } from './input/pointer_buttons';
import type { TSfxPreset } from './audio/synth/types/t_song';
import type { TSongBuiltinInfo } from './audio/synth/builtin/song_library';
import type { TSongInstrumentInfo } from './audio/synth/builtin/song_instruments';
import type { TSongSampleInfo } from './audio/synth/builtin/song_samples';

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
 * How the engine draws: the renderers `createGame` can be asked for, and how many numbers one corner
 * of a line takes.
 *
 * `TYPE.WEBGL2` is the same as writing `'WEBGL2'` in `createGame({ renderer })`. `LINE_VERTEX_FLOATS`
 * is seven, where a corner is (`x`, `y`, `z`) and its colour (`r`, `g`, `b`, `a`), for a game that
 * writes the corners of its lines itself.
 *
 * @example
 * createGame({ renderer: RENDER.TYPE.WEBGL2 });
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
    LINE_VERTEX_FLOATS,
});

/**
 * The names input is read by, and the numbers it starts from.
 *
 * - `GAMEPAD_BUTTONS` and `GAMEPAD_AXES`: what a standard pad's buttons and sticks are called, in
 *   order, and `GAMEPAD_BUTTON_LABELS` / `GAMEPAD_AXIS_LABELS` how a controls screen shows them.
 * - `POINTER_BUTTONS`: `main`, `middle`, `right`, `back` and `forward`.
 * - `DEADZONE`: how far a stick or a trigger moves before it counts, the pad's and an action's,
 *   when nothing says. `ACTION_PRESS`: how far it moves before an action counts as pressed.
 *
 * @example
 * for (const button of INPUT.GAMEPAD_BUTTONS) {
 *     if (pad.pressed(button)) console.log(INPUT.GAMEPAD_BUTTON_LABELS[button]);
 * }
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
    DEADZONE: DEFAULT_DEADZONE,
    ACTION_PRESS: DEFAULT_ACTION_PRESS,
});

/**
 * How far the engine goes, fixed by what it draws and simulates with: a game cannot raise them.
 *
 * - `LIGHTS`: how many lights shine on one frame, eight, as the consoles of the era had. Past
 *   them they are dropped with a warning; an ambient light does not count.
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
 * Starting points for the post effects.
 *
 * - `CRT_PRESETS`: four tubes for `crt()`. `consumer` is the television in the living room, `pvm` a
 *   studio monitor, `arcade` a cabinet, `composite` a cheap cable.
 * - `COLOR_LEVELS`: how many steps a channel had on each machine, for `dither()` and `posterize()`.
 *
 * @example
 * usePostProcess(crt(POST.CRT_PRESETS.pvm));
 * usePostProcess(crt({ ...POST.CRT_PRESETS.consumer, noise: 0 }));
 * usePostProcess(posterize({ levels: POST.COLOR_LEVELS.genesis }));
 *
 * @category Constants
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const POST = /* @__PURE__ */ frozen({
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
 * - `POST`: the post effects a project names in its `post` list.
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
    POST: POST_KEYS,
    LOOKS: LOOK_KEYS,
});
