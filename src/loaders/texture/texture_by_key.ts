import { getActiveGame } from '../../store';
import type { TTexture } from './types/t_texture';

/**
 * The texture this game loaded under `key`, for something that names its picture rather than holds
 * it: `createSprite({ texture: 'hero' })`. One not loaded is a mistake, said with the line to write.
 *
 * @param who Who asked, for the message: `'createSprite'`.
 * @param key The key it was loaded under.
 *
 * @internal
 */
export const textureByKey = (who: string, key: string): TTexture => {
    const found = getActiveGame()?.get('assets').textures.get(key);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] ${who}: no texture loaded under key '${key}'. ` +
            `Did you forget useLoadTexture({ src, key: '${key}' })?`,
        );
    }
    return found;
};
