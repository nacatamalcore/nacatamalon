import type { TDrawTexture } from './t_draw_texture';

/**
 * What a backend needs to draw one emitter's particles: a run of numbers and how to lay them down.
 *
 * **Not the emitter's own record.** A sprite fits the renderer by shape and is passed straight
 * through, because everything drawing reads is already on it. An emitter is the other way round:
 * what the card wants is a packed run of numbers, and a record here is plain JSON and cannot hold
 * one. So the numbers live beside the record and this is what stands in front of them for a frame,
 * the same way a text is replaced by its letters before it reaches a backend.
 *
 * What that buys is a rule worth keeping: nothing under `render/` knows that emitters, documents or
 * pools exist.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawParticles = {
    readonly type: 'particles';
    /**
     * `PARTICLE_FLOATS` per particle, reused between frames: drawing a still cloud allocates nothing.
     */
    readonly instances: Float32Array;
    /**
     * How many of them are real. The rest of the run is whatever was there last frame.
     */
    readonly count: number;
    /**
     * The picture each one shows, or `null` for a plain square of its colour.
     */
    readonly texture: TDrawTexture | null;
    /**
     * Covering, or adding light. Fire and sparks are only bright under the second.
     */
    readonly blend: 'alpha' | 'additive';
    /**
     * Crisp or blended. Omitted, whatever the game asked for at boot.
     */
    readonly smooth?: boolean;
    /**
     * The effects its particles set off, drawn after it and so over it. Each is an emitter of its
     * own, with its own picture and blend, which is why they are separate draws and not more numbers
     * in this run.
     */
    readonly children?: readonly TDrawParticles[];
};
