import type { TTexture } from '../texture/types/t_texture';
import type { TLoadedAtlas } from '../atlas/types/t_loaded_atlas';
import type { TBitmapFont } from '../bitmap_font/types/t_bitmap_font';
import type { TFont } from '../font/types/t_font';
import type { TAudioClip } from '../audio/types/t_audio_clip';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TGeometry } from '../../geometry/types/t_geometry';
import type { TGltfModel } from '../gltf/types/t_gltf_model';
import type { TShader } from '../shader/types/t_shader';
import type { TParticlesFile } from '../particles/types/t_particles_file';
import type { TSongFile } from '../song/types/t_song_file';
import type { TMotionFile } from '../motion/types/t_motion_file';
import type { TPalette } from '../palette/types/t_palette';
import type { TLut } from '../lut/types/t_lut';
import type { TLoadedPack } from '../pack/types/t_loaded_pack';
import type { TLoadedPixels } from '../pixels/types/t_loaded_pixels';

/**
 * Anything a game loads and keeps by key: what the `useLoad…` hooks and the shape hooks hand back.
 * Each one says what it is in its `type`, which is how `releaseAsset` knows what to let go of.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAsset =
    | TTexture
    | TLoadedAtlas
    | TBitmapFont
    | TFont
    | TAudioClip
    | TTilemap
    | TGeometry
    | TGltfModel
    | TShader
    | TParticlesFile
    | TSongFile
    | TMotionFile
    | TPalette
    | TLut
    | TLoadedPack
    | TLoadedPixels;
