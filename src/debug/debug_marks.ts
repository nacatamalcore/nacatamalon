/**
 * What the debug mode drew into a scene, which is no part of it: kept apart from the rest of the
 * debug mode so the engine's smallest pieces can ask without bringing in what draws it.
 *
 * @internal
 */
export const debugMarks = new WeakSet<object>();
