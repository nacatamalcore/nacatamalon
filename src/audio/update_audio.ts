import { rootOf, viewOf, worldPlacement3dOf, worldPlacementOf } from '../box';
import { screenSizeOf } from '../DOM/screen_size';
import { fromEuler, rotateVec3 } from '../math/quat';
import {
    DEFAULT_MAX_DISTANCE, DEFAULT_MAX_DISTANCE_3D, DEFAULT_REF_DISTANCE, DEFAULT_REF_DISTANCE_3D,
} from './create_audio_manager';
import { zoneVolume2d, zoneVolume3d } from './zone_volume';
import type { TBox } from '../box';
import type { TQuat } from '../math/quat';
import type { TRuntimeStore } from '../store';
import type { TCamera3d } from '../camera/types/t_camera_3d';
import type { TAudioManager, TVoice } from './types/t_audio';

type TPoint3 = { x: number; y: number; z: number };

/**
 * Where the game is heard from this frame, and which way it faces.
 *
 * The point is kept the way its own scene measures it (a flat scene's y grows downwards) and only
 * turned into what the browser understands when it is written, so it can be compared with the
 * sounds of the same scene as it is.
 */
type TEar = {
    /**
     * A scene with a 3D camera is heard in depth; any other, on the plane.
     */
    space: '2d' | '3d';
    /**
     * Whether that space measures in pixels (a flat one, or an orthographic camera) or in units.
     */
    pixels: boolean;
    position: TPoint3;
    /**
     * In the browser's axes, which for a 3D scene are the scene's own.
     */
    forward: TPoint3;
    up: TPoint3;
};

const AHEAD: TPoint3 = { x: 0, y: 0, z: -1 };
const ABOVE: TPoint3 = { x: 0, y: 1, z: 0 };

/**
 * Where a WebAudio thing is, told in the way the browser understands. The modern way is three
 * values that can be changed over time; older engines only have the one call, so both are covered
 * and the caller does not have to know which it got.
 */
const place = (
    target: { positionX?: AudioParam; positionY?: AudioParam; positionZ?: AudioParam; setPosition?: (x: number, y: number, z: number) => void },
    x: number,
    y: number,
): void => {
    // The game's y grows downwards and WebAudio's grows upwards, so it goes over negated: a sound
    // below the player is below the player.
    if (target.positionX !== undefined) {
        target.positionX.value = x;
        target.positionY!.value = -y;
        target.positionZ!.value = 0;
        return;
    }
    target.setPosition?.(x, -y, 0);
};

/**
 * The same in depth, where the scene's axes already are the browser's: y up, and looking along -Z.
 */
const place3d = (
    target: { positionX?: AudioParam; positionY?: AudioParam; positionZ?: AudioParam; setPosition?: (x: number, y: number, z: number) => void },
    point: TPoint3,
): void => {
    if (target.positionX !== undefined) {
        target.positionX.value = point.x;
        target.positionY!.value = point.y;
        target.positionZ!.value = point.z;
        return;
    }
    target.setPosition?.(point.x, point.y, point.z);
};

/**
 * A point of the ear's own space, written in whichever of the two ways that space needs.
 */
const placeIn = (target: Parameters<typeof place3d>[0], space: TEar['space'], point: TPoint3): void => {
    if (space === '3d') {
        place3d(target, point);
        return;
    }
    place(target, point.x, point.y);
};

/**
 * Which way the ears face, in both of the browser's ways. A flat game's ears look into the screen
 * with their head up, which is what makes left on screen left in the ears.
 */
const orient = (listener: AudioListener, forward: TPoint3, up: TPoint3): void => {
    if (listener.forwardX !== undefined) {
        listener.forwardX.value = forward.x;
        listener.forwardY.value = forward.y;
        listener.forwardZ.value = forward.z;
        listener.upX.value = up.x;
        listener.upY.value = up.y;
        listener.upZ.value = up.z;
        return;
    }
    listener.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
};

/**
 * The turn of a camera, the same one the renderer draws it with: the whole turn when it has one,
 * otherwise the three angles read left and right, then up and down, then in the plane.
 */
const turnOfCamera = (camera: TCamera3d): TQuat =>
    camera.transform.quaternion === undefined || camera.transform.quaternion === null
        ? fromEuler(camera.transform.rotationX, camera.transform.rotationY, camera.transform.rotation)
        : camera.transform.quaternion;

/**
 * Puts the listener where the camera is looking: the **middle of what is on screen**, not the
 * camera's own position, which is the world point on the top-left corner. Zoom counts, because
 * zooming out shows more world and the middle of it stays the middle.
 *
 * A scene with no camera draws in screen pixels, so the middle of the screen is the middle of the
 * world too. The first scene that has a camera wins: there is one listener, and the scene under
 * everything else is the one being played.
 */
const flatEar = (store: TRuntimeStore): TEar => {
    const screen = screenSizeOf(store.get('screen').canvas);
    const camera = store.get('world').scenes.map((scene) => scene.camera2d).find((found) => found !== null) ?? null;
    const position = camera === null
        ? { x: screen.width / 2, y: screen.height / 2, z: 0 }
        : {
            x: camera.transform.x + screen.width / 2 / camera.zoom,
            y: camera.transform.y + screen.height / 2 / camera.zoom,
            z: 0,
        };
    return { space: '2d', pixels: true, position, forward: AHEAD, up: ABOVE };
};

/**
 * The ears in a 3D camera. A perspective one is heard from where it stands. An orthographic one
 * measures in pixels and shows a whole board, so, like a flat camera, it is heard from the middle of
 * what it shows: the same middle its frustum is built around, carried by its turn.
 */
const cameraEar = (store: TRuntimeStore, camera: TCamera3d): TEar => {
    const turn = turnOfCamera(camera);
    const forward = rotateVec3(turn, AHEAD);
    const up = rotateVec3(turn, ABOVE);
    const at = camera.transform;
    if (camera.projection === 'perspective') {
        return { space: '3d', pixels: false, position: { x: at.x, y: at.y, z: at.z }, forward, up };
    }

    const screen = screenSizeOf(store.get('screen').canvas);
    const zoom = camera.zoom > 0 ? camera.zoom : 1;
    const width = Math.max(screen.width, 1);
    const height = Math.max(screen.height, 1);
    // The middle of the frustum `computeProjection` builds, in the camera's own frame.
    const middle = rotateVec3(turn, { x: width * zoom / 2, y: height - height * zoom / 2 - 2 * at.y, z: 0 });
    return {
        space: '3d',
        pixels: true,
        position: { x: at.x + middle.x, y: at.y + middle.y, z: at.z + middle.z },
        forward,
        up,
    };
};

/**
 * The ears somebody put on an object: where the object ends up in the world, facing its -Z.
 */
const objectEar = (box: TBox): TEar => {
    const root = rootOf(box);
    if (root.camera3d === null) {
        const at = worldPlacementOf(box);
        return { space: '2d', pixels: true, position: { x: at.x, y: at.y, z: 0 }, forward: AHEAD, up: ABOVE };
    }
    const pose = worldPlacement3dOf(box);
    return {
        space: '3d',
        pixels: root.camera3d.projection === 'orthographic',
        position: pose.position,
        forward: rotateVec3(pose.quaternion, AHEAD),
        up: rotateVec3(pose.quaternion, ABOVE),
    };
};

/**
 * Where the game is heard from, first answer wins: ears somebody put on an object, then the first
 * scene with a 3D camera, then the flat rule that was here before either.
 */
const findEar = (store: TRuntimeStore, audio: TAudioManager): TEar => {
    const on = audio.listeners.filter((box) => !box.destroyed && box.audioListener !== null && box.audioListener.enabled);
    if (on.length > 1 && !audio.warnedListeners) {
        audio.warnedListeners = true;
        console.warn('[NacatamalOn] useAudioListener: more than one set of ears is switched on, so the first one is used. Switch the others off.');
    }
    if (on.length > 0) {
        return objectEar(on[0]);
    }

    const camera = store.get('world').scenes.map((scene) => scene.camera3d).find((found) => found !== null) ?? null;
    return camera === null ? flatEar(store) : cameraEar(store, camera);
};

/**
 * A turn in the plane, as a direction the browser reads: y goes over negated, as every point does.
 */
const flatAhead = (rotation: number): TPoint3 => ({ x: Math.cos(rotation), y: -Math.sin(rotation), z: 0 });

/**
 * Puts one placed voice where its object is, for the ears it is heard with.
 *
 * A voice whose object lives in the other kind of space (a flat scene heard by a 3D camera), or
 * inside a picture made by `createSpriteTexture`, has no place those ears could measure, so it is
 * put right on them: heard at its own volume, from no side. Comparing its pixels with the ears'
 * units would put it somewhere, and somewhere wrong.
 */
const placeVoiceFor = (audio: TAudioManager, ear: TEar, voice: TVoice): void => {
    const box = voice.box;
    const sound = voice.sound;
    if (box === null || sound === null) {
        return;
    }
    const root = rootOf(box);
    const space = root.camera3d === null ? '2d' : '3d';
    const placed = viewOf(box) === root && space === ear.space;

    if (voice.area !== null) {
        let volume = 1;
        if (placed && sound.zone !== null) {
            const heard = ear.space === '3d'
                ? zoneVolume3d(sound.zone, worldPlacement3dOf(box), ear.position)
                : zoneVolume2d(sound.zone, worldPlacementOf(box), ear.position);
            if (heard === null && !audio.warnedZones.has(sound)) {
                audio.warnedZones.add(sound);
                console.warn(`[NacatamalOn] useSound: the area of this sound is a '${sound.zone.shape.kind}', which has no meaning in a ${ear.space === '3d' ? '3D' : 'flat'} scene, so it is heard everywhere at full volume.`);
            }
            volume = heard ?? 1;
        }
        voice.area.gain.value = volume;
        return;
    }

    const panner = voice.panner;
    if (panner === null) {
        return;
    }
    // Set only when it changes: a new panning model can restart what the browser worked out.
    const model = ear.space === '3d' ? 'HRTF' : 'equalpower';
    if (panner.panningModel !== model) {
        panner.panningModel = model;
    }
    const ref = sound.refDistance ?? (ear.pixels ? DEFAULT_REF_DISTANCE : DEFAULT_REF_DISTANCE_3D);
    const max = sound.maxDistance ?? (ear.pixels ? DEFAULT_MAX_DISTANCE : DEFAULT_MAX_DISTANCE_3D);
    if (panner.refDistance !== ref) {
        panner.refDistance = ref;
    }
    if (panner.maxDistance !== max) {
        panner.maxDistance = max;
    }
    if (sound.cone !== null) {
        panner.coneInnerAngle = sound.cone.inner;
        panner.coneOuterAngle = sound.cone.outer;
        panner.coneOuterGain = sound.cone.outerVolume;
    }

    if (!placed) {
        placeIn(panner, ear.space, ear.position);
        return;
    }
    if (space === '3d') {
        const pose = worldPlacement3dOf(box);
        place3d(panner, pose.position);
        if (sound.cone !== null) {
            aim(panner, rotateVec3(pose.quaternion, AHEAD));
        }
        return;
    }
    const at = worldPlacementOf(box);
    place(panner, at.x, at.y);
    if (sound.cone !== null) {
        aim(panner, flatAhead(at.rotation));
    }
};

/**
 * Which way a sound with a cone faces, in both of the browser's ways.
 */
const aim = (panner: PannerNode, direction: TPoint3): void => {
    if (panner.orientationX !== undefined) {
        panner.orientationX.value = direction.x;
        panner.orientationY.value = direction.y;
        panner.orientationZ.value = direction.z;
        return;
    }
    panner.setOrientation?.(direction.x, direction.y, direction.z);
};

/**
 * Puts one voice in its place straight away, the moment it starts, rather than a frame later at the
 * origin. Used by what starts voices; the frame keeps them there with {@link updateAudio}.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const placeVoice = (store: TRuntimeStore, audio: TAudioManager, voice: TVoice): void => {
    placeVoiceFor(audio, findEar(store, audio), voice);
};

/**
 * Keeps the sound in step with what is on screen, once a frame: the listener goes where the camera
 * looks, and every sound placed in the world goes where the thing making it is.
 *
 * A game with no sound returns on the first line, and one with sound but nothing placed only moves
 * the listener. It runs while the game is paused on purpose: moving a listener is not simulating
 * anything, and a pause menu that lets you move the camera should still sound right.
 *
 * The listener is the ears somebody put on an object when there are any, and the camera otherwise.
 * A sound that fills an area is not moved at all: its volume is worked out from where the listener
 * stands.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const updateAudio = (store: TRuntimeStore): void => {
    const audio = store.get('audio').manager;
    if (audio === null) {
        return;
    }

    const ear = findEar(store, audio);
    placeIn(audio.context.listener, ear.space, ear.position);
    orient(audio.context.listener, ear.forward, ear.up);

    for (const voice of audio.voices) {
        placeVoiceFor(audio, ear, voice);
    }
};
