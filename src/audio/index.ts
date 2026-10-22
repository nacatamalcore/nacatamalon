export {
    createAudioManager, getAudioManager, DEFAULT_CHANNEL, DEFAULT_MAX_DISTANCE, DEFAULT_REF_DISTANCE,
    DEFAULT_MAX_DISTANCE_3D, DEFAULT_REF_DISTANCE_3D,
} from './create_audio_manager';
export { updateAudio, placeVoice } from './update_audio';
export { rampTo } from './ramp';
export { logVoice, startSoundLog } from './sound_log';
export type { TLoggedSound, TSoundLog, TSoundLogPoint } from './sound_log';
export { applyDucking, DEFAULT_DUCK_FADE } from './duck';
export { wrapPosition } from './loop_position';
export { createLayeredPlayer } from './layered_player';
export type { TLayeredPiece, TLayeredPlayer } from './layered_player';
export { createBeatClock } from './beat_clock';
export { heardPositionOf } from './heard_position';
export { clipFromSamples } from './clip_from_samples';
export type { TBeatListener } from './beat_clock';
export { zoneVolume2d, zoneVolume3d } from './zone_volume';
export { soundOf } from './attachment_players';

export type { TAudioClock, TAudioHandle, TAudioManager, TVoice } from './types/t_audio';
export type {
    TSoundAttachment, TSoundCone, TSoundDuck, TSoundFade, TSoundHandle, TSoundOptions, TSoundSource, TSampledSound, TSoundZone, TSoundZoneShape,
} from './types/t_sound';
export type { TMusicAttachment, TMusicHandle, TMusicLayer, TMusicLayerOptions, TMusicOptions } from './types/t_music';
export type { TAudioListener } from './types/t_audio_listener';
export type { TSongAttachment, TSongHandle, TSongOptions } from './types/t_song_player';
