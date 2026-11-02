import type { TRuntimeStore } from '../../store';
import type { TTransitionState } from '../../transition/types/t_transition_state';
import type { TTexture } from './types/t_texture';

/**
 * What is left to take off the card once a transition is over: the masks let go of while it was
 * still drawing them.
 */
const afterwards = new WeakMap<TTransitionState, Array<() => void>>();

/**
 * Takes a texture off the graphics card, unless the transition in flight is reading it as its mask.
 *
 * Then only the record is let go of, by whoever called this, and the picture stays on the card
 * until the transition is over. The usual case is a mask painted by the scene going out: that scene
 * stops at the swap, its unnamed pictures go with it, and the uncover still has the whole second
 * half to draw. Taken off at once, the shape would vanish at the swap and the screen jump open.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const freeTexture = (store: TRuntimeStore, texture: TTexture): void => {
    const gpu = texture.gpu;
    if (gpu === null) {
        return;
    }
    const renderer = store.get('screen').renderer;
    const transition = store.get('transition').active;
    if (transition === null || transition.effect.mask !== texture) {
        renderer.destroyTexture(gpu);
        texture.gpu = null;
        return;
    }

    let later = afterwards.get(transition);
    if (later === undefined) {
        later = [];
        afterwards.set(transition, later);
    }
    later.push(() => {
        renderer.destroyTexture(gpu);
        if (texture.gpu === gpu) {
            texture.gpu = null;
        }
    });
};

/**
 * Takes off the card what `freeTexture` kept for this transition, now that it is over.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const freeTexturesKeptBy = (state: TTransitionState): void => {
    const later = afterwards.get(state);
    afterwards.delete(state);
    later?.forEach((free) => free());
};
