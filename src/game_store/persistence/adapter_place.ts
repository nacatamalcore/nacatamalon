const places = new WeakMap<object, string>();

/**
 * Notes where an adapter of the engine's saves, so two of them can be told to be the same place.
 *
 * @internal
 */
export const placeAdapter = <T extends object>(adapter: T, place: string): T => {
    places.set(adapter, place);
    return adapter;
};

/**
 * Where an adapter saves, or `undefined` for one of the game's own.
 *
 * @internal
 */
export const placeOfAdapter = (adapter: object): string | undefined => places.get(adapter);
