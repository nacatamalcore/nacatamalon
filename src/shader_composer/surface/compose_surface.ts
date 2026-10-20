import { composerSwizzle, composerVec3, composerVec4 } from '../constructors';
import { composerFresnel } from '../effects';
import { composerEmissive, composerLight, composerScreenPos, composerShine, composerSurface, composerUniform } from '../inputs';
import {
    composerAdd, composerClamp, composerDiv, composerDot, composerFloor, composerFract, composerLength, composerMax,
    composerMix, composerMul, composerOneMinus, composerSmoothstep, composerStep, composerSub,
} from '../math';
import type { TComposerNode } from '../types/t_composer_node';
import type { TLightingLook, TLook, TStepLook, TSurfaceState } from './types';

/**
 * Which slot each look goes in, so a step handed as lighting (or the other way) is caught.
 */
const LIGHTING_KEYS: readonly string[] = ['toon', 'unlit'];
const STEP_KEYS: readonly string[] = ['mangaDots', 'rim'];

const brightness = (v: TComposerNode): TComposerNode => composerDot(v, composerVec3(0.299, 0.587, 0.114));

/**
 * The colour of a light with its strength taken out: its strongest channel at 1, so white stays
 * white and a blue light a blue, never brighter than it was. White where there is no light to tell
 * a colour from, so a band in the dark is a grey and not a black.
 */
const HUE_FLOOR = 0.001;
const hueOf = (v: TComposerNode): TComposerNode => {
    const lifted = composerAdd(v, composerVec3(HUE_FLOOR, HUE_FLOOR, HUE_FLOOR));
    const strongest = composerMax(composerMax(composerSwizzle(lifted, 'x'), composerSwizzle(lifted, 'y')), composerSwizzle(lifted, 'z'));
    return composerDiv(lifted, strongest);
};

/**
 * The colour as the engine works it out, exactly its own ending: the surface times the light, plus
 * the shine and what it gives off itself.
 */
const litColor = (s: TSurfaceState): TComposerNode =>
    composerAdd(composerAdd(composerMul(s.base, s.light), s.shine), s.emissive);

/**
 * A knob's name: the look's, then the knob's, so `toon` + `shadow` is `toonShadow`. A step used twice
 * gets a number from the second on (`rim2Color`), so the two can be turned apart.
 */
type TNamer = (knob: string) => string;
const namer = (prefix: string): TNamer => (knob) => `${prefix}${knob[0]!.toUpperCase()}${knob.slice(1)}`;

const lightWith = (look: TLightingLook, s: TSurfaceState, name: TNamer): TSurfaceState => {
    switch (look.look) {
        case 'toon': {
            const amount = composerClamp(brightness(s.light), 0, 1);
            const bands = composerUniform(name('bands'), look.bands);
            // Which band, from 0 (the darkest) to 1 (full light). One band less than asked to divide
            // by, so the brightest is exactly 1; never by nothing, whatever the knob is turned to.
            const band = composerClamp(composerDiv(composerFloor(composerMul(amount, bands)), composerMax(composerSub(bands, 1), 1)), 0, 1);
            const level = composerMix(composerUniform(name('shadow'), look.shadow), 1, band);
            const spot = composerMul(composerStep(composerUniform(name('spot'), look.spot), brightness(s.shine)), 0.6);
            // Only the brightness is cut into bands: each keeps the colour of the light that made it,
            // so a warm lamp gives warm bands and a white one the greys it always gave.
            return { ...s, light: composerMul(hueOf(s.light), level), shine: composerMul(hueOf(s.shine), spot), shade: composerOneMinus(band) };
        }
        case 'unlit':
            return { ...s, light: composerVec3(1, 1, 1), shine: composerVec3(0, 0, 0), shade: null };
    }
};

const stepWith = (look: TStepLook, s: TSurfaceState, name: TNamer): TSurfaceState => {
    const before = s.color ?? litColor(s);
    switch (look.look) {
        case 'mangaDots': {
            // After toon, the dots go where its bands went dark; on the engine's light, they grow
            // into the dark smoothly.
            const shade = s.shade ?? composerOneMinus(composerSmoothstep(0.2, 0.8, brightness(s.light)));
            // Laid out on the screen, so they stay put as the model turns.
            const cell = composerSub(composerFract(composerDiv(composerScreenPos(), composerUniform(name('size'), look.size))), 0.5);
            const radius = composerMul(shade, composerUniform(name('fill'), look.fill));
            const inked = composerOneMinus(composerStep(radius, composerLength(cell)));
            return { ...s, color: composerMix(before, composerUniform(name('ink'), look.ink), inked) };
        }
        case 'rim': {
            const edge = composerMul(composerFresnel(composerUniform(name('power'), look.power)), composerUniform(name('amount'), look.amount));
            return { ...s, color: composerMix(before, composerUniform(name('color'), look.color), edge) };
        }
    }
};

/**
 * The name each look's numbers take as knobs (`toonShadow`, `rim2Color`), with where the number
 * lives in the look: `'lighting'`, or the step's place in the list. Every field of a look but `look`
 * is a knob, named the way the material names it, so a tool that edits a look while the game runs
 * knows which of the material's `uniforms` to turn.
 *
 * @param lighting The material's lighting look, if any.
 * @param steps Its steps, in order.
 * @returns One entry per knob.
 *
 * @example
 * ```ts
 * import { rim, toonLighting } from 'nacatamalon';
 * import { lookKnobs } from 'nacatamalon/authoring';
 *
 * lookKnobs(toonLighting(), [rim(), rim()]);
 * // [{ uniform: 'toonBands', slot: 'lighting', field: 'bands' }, ..., { uniform: 'rim2Color', slot: 1, field: 'color' }, ...]
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lookKnobs = (
    lighting: TLook | null | undefined,
    steps: readonly TLook[] | undefined,
): { uniform: string; slot: 'lighting' | number; field: string }[] => {
    const knobs: { uniform: string; slot: 'lighting' | number; field: string }[] = [];
    const add = (look: TLook, prefix: string, slot: 'lighting' | number): void => {
        const name = namer(prefix);
        for (const field of Object.keys(look)) {
            if (field !== 'look') {
                knobs.push({ uniform: name(field), slot, field });
            }
        }
    };
    if (lighting !== null && lighting !== undefined) {
        add(lighting, lighting.look, 'lighting');
    }
    const seen = new Map<string, number>();
    (steps ?? []).forEach((step, index) => {
        const count = (seen.get(step.look) ?? 0) + 1;
        seen.set(step.look, count);
        add(step, count === 1 ? step.look : `${step.look}${count}`, index);
    });
    return knobs;
};

/**
 * The call that makes a look, by its key, as an error names it: the one a person writes.
 */
const MAKERS: Record<string, string> = { toon: 'toonLighting()', unlit: 'unlitLighting()', mangaDots: 'mangaDots()', rim: 'rim()' };
const maker = (key: string): string => MAKERS[key] ?? `'${key}'`;

/**
 * Checks the looks are in the slots they belong in, naming what is wrong.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const checkLooks = (lighting: TLook | null | undefined, steps: readonly TLook[] | undefined): void => {
    if (lighting !== null && lighting !== undefined && !LIGHTING_KEYS.includes(lighting.look)) {
        throw new Error(
            `[NacatamalOn] '${lighting.look}' is not a lighting look (${LIGHTING_KEYS.map(maker).join(', ')}): ` +
            (STEP_KEYS.includes(lighting.look) ? `${maker(lighting.look)} goes in steps.` : 'the engine has no look by that name.'),
        );
    }
    for (const step of steps ?? []) {
        if (!STEP_KEYS.includes(step.look)) {
            throw new Error(
                `[NacatamalOn] '${step.look}' is not a step (${STEP_KEYS.map(maker).join(', ')}): ` +
                (LIGHTING_KEYS.includes(step.look) ? `it is a lighting look, ${maker(step.look)}, and goes in lighting, alone.` : 'the engine has no look by that name.'),
            );
        }
    }
};

/**
 * The colour a model's surface comes out, from its lighting look and its steps, as a graph for
 * `compileShader`.
 *
 * The surface starts as the engine has it (the picture times the tint and the painted corners, the
 * light that reaches it, the shine and what it gives off); the lighting look, if there is one,
 * replaces how it is lit; then each step works on the colour so far, in order. With neither, it is
 * the engine's own ending, word for word.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composeSurface = (lighting: TLook | null | undefined, steps: readonly TLook[] | undefined): TComposerNode => {
    checkLooks(lighting, steps);
    const surface = composerSurface();
    let state: TSurfaceState = {
        base: composerSwizzle(surface, 'rgb'),
        light: composerLight(),
        shine: composerShine(),
        emissive: composerEmissive(),
        shade: null,
        color: null,
    };
    if (lighting !== null && lighting !== undefined) {
        state = lightWith(lighting as TLightingLook, state, namer(lighting.look));
    }
    const seen = new Map<string, number>();
    for (const step of steps ?? []) {
        const count = (seen.get(step.look) ?? 0) + 1;
        seen.set(step.look, count);
        state = stepWith(step as TStepLook, state, namer(count === 1 ? step.look : `${step.look}${count}`));
    }
    return composerVec4(state.color ?? litColor(state), composerSwizzle(surface, 'a'));
};
