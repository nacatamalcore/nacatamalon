export { createSpriteAtlas } from './create_sprite_atlas';
export { setSpriteFrame } from './set_sprite_frame';

export type { TSpriteAtlasOptions } from './create_sprite_atlas';
export type { TSpriteAtlas } from './types/t_sprite_atlas';

// Internal, for the engine's own use: a game asks for a frame by number and never works out
// where it is.
export { atlasFrame } from './atlas_frame';
export type { TAtlasFrame } from './types/t_sprite_atlas';
