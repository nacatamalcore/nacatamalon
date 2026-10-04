import { closeParticleState } from '../gameobjects/particles/particle_state';
import { releaseLayer } from '../gameobjects/tilemap/release_layer';
import type { TDrawable } from '../gameobjects/types';
import type { TRuntimeStore } from '../store';

/**
 * Whatever a drawable owns beyond its own record, released once it is out of the tree.
 *
 * A sprite owns nothing: its texture is shared through the game's cache and other sprites may
 * still be drawing it, so destroying one must never free it. Releasing an asset is what an
 * `unload` is for.
 *
 * The exhaustive `switch` is the point of this file. A tilemap owns one drawable per layer plus
 * the meshes it built, and particles own their sub-emitters: adding either without saying here
 * what letting go of it means will not compile.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const disposeDrawable = (store: TRuntimeStore, drawable: TDrawable): void => {
    switch (drawable.type) {
        case 'sprite': {
            // Nothing of its own: the texture belongs to the cache, not to this sprite.
            return;
        }
        case 'text': {
            // Nothing of its own either: the font belongs to the cache, and its character sprites
            // are dropped with it.
            return;
        }
        case 'nine-slice': {
            // Nothing of its own: the picture belongs to the cache, and its parts are dropped with it.
            return;
        }
        case 'tilemap': {
            // A layer **does** own something: the corners it put on the graphics card. The sheet
            // underneath belongs to the cache and is left alone.
            releaseLayer(store.get('screen').renderer, drawable);
            return;
        }
        case 'mesh': {
            // Nothing of its own: its shape belongs to the cache and other models are drawing it,
            // the same way a sprite does not own its picture.
            return;
        }
        case 'particles':
        case 'particles3d': {
            // An emitter **does** own something: its particles and its own stream of chance. Its
            // effect file and the picture in it belong to the cache, so two torches are left burning
            // when the third goes out.
            //
            // Nothing of its own on the card, and that is by construction rather than by luck: every
            // emitter writes into one buffer the pipeline owns, at an offset of its own. There is no
            // per-emitter buffer that could be forgotten here.
            closeParticleState(drawable);
            return;
        }
        case 'lines': {
            // Its corners live beside it in a weak map and go with it. On the card it owns nothing:
            // every set of lines is written into one buffer the pipeline owns.
            return;
        }
        default: {
            // With more than one kind, TypeScript narrows the drawable itself to `never` here, so the
            // check is on it rather than on its `type`.
            const missing: never = drawable;
            throw new Error(`[NacatamalOn] destroy: nobody said how to let go of '${(missing as { type: string }).type}'.`);
        }
    }
};
