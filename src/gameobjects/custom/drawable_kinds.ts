import type { TDrawableKind } from '../../extend/gpu/drawable_types';

/**
 * Every kind registered, by name.
 */
const kinds = new Map<string, TDrawableKind>();

/**
 * Teaches the engine a kind of drawing, what a plugin does once before it makes the first of its
 * drawings with `createDrawable`. See `TDrawableKind`.
 *
 * A kind is the same for every game on the page: what each game keeps for it (its pipelines, its
 * buffers) is made per game, the first frame that game draws one.
 *
 * Registering the same kind again does nothing, so a plugin can do it every time one of its drawings
 * is made. Registering another kind under a name already taken throws: two plugins drawing under one
 * name would each draw the other's drawings.
 *
 * @param kind Its name, how one of its drawings is got ready each frame, and what draws it.
 *
 * @example
 * ```ts
 * const BLOBS: TDrawableKind<TBlobPayload> = {
 *     name: 'nacatamalon-blobs',
 *     prepare: (drawable, world) => blobPayload(drawable, world),
 *     webgpu: (context) => createBlobPipeline(context),
 * };
 *
 * export const useBlob = (options: TBlobOptions) => {
 *     registerDrawableKind(BLOBS);
 *     return createDrawable(BLOBS.name, options, { radius: options.radius });
 * };
 * ```
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const registerDrawableKind = <TPayload>(kind: TDrawableKind<TPayload>): void => {
    const known = kinds.get(kind.name);
    if (known === kind) {
        return;
    }
    if (known !== undefined) {
        throw new Error(`[NacatamalOn] registerDrawableKind: the kind '${kind.name}' is already registered, by another plugin or another copy of this one. Give each kind a name of its own, starting with its plugin's name.`);
    }
    kinds.set(kind.name, kind as TDrawableKind);
};

/**
 * The kind registered under `name`, or `undefined`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawableKindOf = (name: string): TDrawableKind | undefined => kinds.get(name);
