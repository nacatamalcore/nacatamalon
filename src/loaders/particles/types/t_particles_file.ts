import type { TLoadStatus } from '../../types/t_load_status';
import type { TParticlesDoc } from './t_particles_doc';
import type { TParticles } from '../../../gameobjects/particles/types/t_particles';
import type { TParticles3d } from '../../../gameobjects/particles/types/t_particles_3d';
import type { TTexture } from '../../texture/types/t_texture';

/**
 * A `.particles` file, on its way in or already here.
 *
 * **Kept apart from the emitter that follows it**, and that split is the whole reason this type
 * exists: three torches in a level are three emitters, each with its own particles, its own clock
 * and its own stream of chance, all reading **one** document. Folding the two together is what makes
 * three torches parse three files and upload three copies of the same picture.
 *
 * Like a shader and unlike a texture, it keeps a list of who is waiting on it. A picture can be
 * handed to a sprite and that is enough, because the sprite hands it straight to the card. An effect
 * cannot: an emitter has to size its particles from the document, so when the bytes land they have
 * to reach everything already built against them.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesFile = {
    readonly type: 'particles-file';
    /**
     * What it is kept under in this game. The `src` unless a `key` was given.
     */
    key: string;
    src: string;
    status: TLoadStatus;
    /**
     * What the file said, or `null` until it lands.
     */
    doc: TParticlesDoc | null;
    /**
     * The picture, loaded through the game's own cache so two effects sharing one fetch it once.
     */
    texture: TTexture | null;
    /**
     * The emitters built on this file, filled in when it lands. Never written out.
     */
    bound: Array<TParticles | TParticles3d>;
    /**
     * The files of the effects its particles set off, one per entry of `doc.children`, in the same
     * order. `null` for one that was refused (a file that leads back to itself, or one too deep).
     */
    children: Array<TParticlesFile | null>;
};
