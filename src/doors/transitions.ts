// How one scene gives way to another: `useScene().change('Level', { transition: fade(0.6) })`.
export {
    fade, wipe, iris, pixelate, dissolve, crossfade, push, crossWipe, crossIris, crossDissolve,
} from '../transition';
export type { TTransition, TWipeDirection, TDissolveOptions, TCrossDissolveOptions } from '../transition';
