import RAPIER from '@dimforge/rapier2d-compat';

/**
 * Type of the initialized Rapier2D module.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRapierModule = typeof RAPIER;

let modulePromise: Promise<TRapierModule> | null = null;

/**
 * Load and initialize the Rapier2D WebAssembly module.
 *
 * Memoizes the promise globally, so multiple calls return the same promise.
 * The WASM is loaded once per page, shared across all scenes and worlds.
 *
 * **`-compat` and not the plain package, and this is a portability decision rather than a
 * preference.** `@dimforge/rapier2d` reaches its WebAssembly through an ESM import of the `.wasm`
 * file itself (`import * as wasm from './rapier_wasm2d_bg.wasm'`), which only works under a
 * bundler that implements WASM-ESM integration. Vite does, with `vite-plugin-wasm`, and that is
 * why this worked for as long as the editor was the only thing that ran it. An exported build is
 * bundled by something else, and there the import yields a namespace with no functions on it: the
 * failure is `rawintegrationparameters_new is not a function`, thrown from generated glue, at
 * which point nothing points back at how the module was loaded.
 *
 * `-compat` is the same bindings with the WebAssembly carried inline and instantiated by an
 * explicit `init()`. It costs a larger JavaScript payload and buys one loading path that holds
 * under every bundler (including whatever a desktop shell uses), which matters more, because the
 * alternative is physics that works in the editor and is inert in the shipped game.
 *
 * The `await` this adds is free: every caller already went through this promise.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadRapier2D = (): Promise<TRapierModule> => {
    if (!modulePromise) {
        modulePromise = RAPIER.init().then(() => RAPIER);
    }
    return modulePromise;
};
