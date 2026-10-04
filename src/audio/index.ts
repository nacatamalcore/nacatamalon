export {
    createAudioManager, getAudioManager, DEFAULT_CHANNEL, DEFAULT_MAX_DISTANCE, DEFAULT_REF_DISTANCE,
    DEFAULT_MAX_DISTANCE_3D, DEFAULT_REF_DISTANCE_3D,
} from './create_audio_manager';
export { updateAudio, placeVoice } from './update_audio';
export { rampTo } from './ramp';
export { zoneVolume2d, zoneVolume3d } from './zone_volume';

export type { TAudioHandle, TAudioManager, TVoice } from './types/t_audio';
export type {
    TSoundAttachment, TSoundCone, TSoundFade, TSoundHandle, TSoundOptions, TSoundSource, TSoundZone, TSoundZoneShape,
} from './types/t_sound';
export type { TMusicAttachment, TMusicHandle, TMusicLayer, TMusicLayerOptions, TMusicOptions } from './types/t_music';
export type { TAudioListener } from './types/t_audio_listener';
