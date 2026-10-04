/**
 * A backend that can actually draw.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRendererBackend = 'WEBGPU' | 'WEBGL2';

/**
 * What a caller may ask `createRenderer` for.
 *
 * - `'AUTO'`: tries WebGPU, and on any failure falls back to WebGL2.
 * - `'WEBGPU'` / `'WEBGL2'`: that backend or nothing. A named backend never falls back:
 *   asking for one explicitly and silently getting the other hides the thing you were testing.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRendererType = 'AUTO' | TRendererBackend;

/**
 * What the backend that won can honour. Fixed at boot, once the device and its limits are
 * known, so nothing upstream ever has to ask which one it is. A field is added only when
 * something reads it.
 *
 * @category Render
 * @since 1.0.0
 */
export type TRendererCapabilities = {
    backend: TRendererBackend;
    /**
     * Sample count actually obtained, which may be lower than the one requested.
     */
    msaa: number;
};
