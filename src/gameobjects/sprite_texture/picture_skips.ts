import type { TTexture } from '../../loaders';

/**
 * What a picture that sees the 3D around it leaves out of it, beside what wears it, by its texture.
 */
const skips = new WeakMap<TTexture, (model: unknown) => boolean>();

/**
 * Leaves out of a picture that sees the 3D around it (`sees: '3d'`) the models `skip` says yes to,
 * from the next frame: an object's own surroundings drawn from inside it, without it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const skipInPicture = (picture: TTexture, skip: (model: unknown) => boolean): void => {
    skips.set(picture, skip);
};

/**
 * Whether a picture leaves this model out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isSkippedIn = (picture: TTexture, model: unknown): boolean => skips.get(picture)?.(model) === true;

/**
 * What a picture does just before it is drawn, by its texture.
 */
const prepares = new WeakMap<TTexture, () => void>();

/**
 * Has `prepare` run just before the picture is drawn each frame: after every update, and after the
 * screen's models have been placed, so what it reads of them (where the camera ended up, where a
 * model is) is this frame's. A mirror lays its camera here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const prepareInPicture = (picture: TTexture, prepare: () => void): void => {
    prepares.set(picture, prepare);
};

/**
 * Runs what a picture does just before it is drawn, if anything.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const preparePicture = (picture: TTexture): void => {
    prepares.get(picture)?.();
};
