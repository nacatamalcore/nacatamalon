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
const grey = (v: TComposerNode): TComposerNode => composerMul(composerVec3(1, 1, 1), v);

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
            return { ...s, light: grey(level), shine: grey(spot), shade: composerOneMinus(band) };
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
            const cell = composerSub(composerFract(composerDiv(composerScreenPos(), composerUniform(name('spacing'), look.spacing))), 0.5);
            const radius = composerMul(shade, composerUniform(name('size'), look.size));
            const inked = composerOneMinus(composerStep(radius, composerLength(cell)));
            return { ...s, color: composerMix(before, composerUniform(name('ink'), look.ink), inked) };
        }
        case 'rim': {
            const edge = composerMul(composerFresnel(composerUniform(name('power'), look.power)), composerUniform(name('strength'), look.strength));
            return { ...s, color: composerMix(before, composerUniform(name('color'), look.color), edge) };
        }
    }
};

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
            `[NacatamalOn] '${lighting.look}' is not a lighting look (${LIGHTING_KEYS.join(', ')}): ` +
            (STEP_KEYS.includes(lighting.look) ? 'it goes in steps.' : 'the engine has no look by that name.'),
        );
    }
    for (const step of steps ?? []) {
        if (!STEP_KEYS.includes(step.look)) {
            throw new Error(
                `[NacatamalOn] '${step.look}' is not a step (${STEP_KEYS.join(', ')}): ` +
                (LIGHTING_KEYS.includes(step.look) ? 'it is a lighting look, and goes in lighting, alone.' : 'the engine has no look by that name.'),
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
