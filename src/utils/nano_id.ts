/**
 * Generates a short unique ID using a URL-safe alphabet.
 * Default size of 21 characters gives the same collision probability as UUID v4.
 * @param size - Number of characters. Defaults to 21.
 * @returns A random string of the given size.
 *
 * @category Utils
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const nanoId = (size = 21): string => {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const bytes = new Uint8Array(size);
    // WARNING: This crypto API may be unsupported in some environments, use with caution.
    crypto.getRandomValues(bytes);
    return Array.from( bytes, (b) => ALPHABET[b & 63]).join('');
}