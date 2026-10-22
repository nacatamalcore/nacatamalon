import type { TCrtOptions } from './crt';

/**
 * Four tubes to start from, for `crt(POST.CRT_PRESETS.pvm)` or `crt({ ...POST.CRT_PRESETS.consumer, noise: 0 })`.
 *
 * `consumer` is the television in the living room: slot mask, some glow, some noise. `pvm` is a
 * studio monitor: flat, sharp, deep lines. `arcade` is a cabinet: a strong bulge and a dot mask.
 * `composite` is a cheap cable: soft, smeared, the colours not quite on top of each other.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const CRT_PRESETS = {
    consumer: {
        scanlines: 0.45, mask: 0.25, maskType: 'slot', maskScale: 1, curvature: 0.08, vignette: 0.3,
        sharpness: 0.4, beam: 0.7, brightness: 1.25, linearBlend: true, halation: 0.2, convergence: 0.35,
        noise: 0.04, flicker: 0.3, interlace: false, cornerRadius: 0.04,
    },
    pvm: {
        scanlines: 0.6, mask: 0.2, maskType: 'aperture', maskScale: 1, curvature: 0.02, vignette: 0.1,
        sharpness: 0.85, beam: 0.8, brightness: 1.3, linearBlend: true, halation: 0.06, convergence: 0,
        noise: 0, flicker: 0, interlace: false, cornerRadius: 0.01,
    },
    arcade: {
        scanlines: 0.5, mask: 0.35, maskType: 'shadow', maskScale: 1, curvature: 0.12, vignette: 0.35,
        sharpness: 0.6, beam: 0.9, brightness: 1.35, linearBlend: true, halation: 0.25, convergence: 0.2,
        noise: 0.02, flicker: 0.1, interlace: false, cornerRadius: 0.06,
    },
    composite: {
        scanlines: 0.3, mask: 0.1, maskType: 'slot', maskScale: 1, curvature: 0.08, vignette: 0.3,
        sharpness: 0.1, beam: 0.5, brightness: 1.15, linearBlend: true, halation: 0.3, convergence: 0.6,
        noise: 0.06, flicker: 0.2, interlace: false, cornerRadius: 0.04,
    },
} as const satisfies Record<string, TCrtOptions>;
