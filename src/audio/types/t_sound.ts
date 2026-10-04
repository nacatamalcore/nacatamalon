import type { TAudioClip } from '../../loaders/audio/types/t_audio_clip';
import type { TParticleColliderShape2d, TParticleColliderShape3d } from '../../gameobjects/particles/colliders/t_particle_collider';

/**
 * What to play: a clip from `useLoadAudio`, or just where the file is and let `useSound` load it.
 * The same two doors `createSprite` offers for an image.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundSource = TAudioClip | { src: string; key?: string };

/**
 * Where a sound is heard loudest: a speaker, a siren, a radio on a shelf. Straight ahead of its
 * object it plays at full volume, and further round it drops towards `outerVolume`.
 *
 * Ahead is the way the object faces: its -Z in a 3D scene, the same way a camera and a lamp face, and
 * along its turn in a flat one (to the right when it is not turned).
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundCone = {
    /**
     * How wide the loud part is, in degrees, from edge to edge.
     */
    inner: number;
    /**
     * Past this width, in degrees, it is at its quietest. Between the two it fades.
     */
    outer: number;
    /**
     * How loud it is behind, from `0` (silent) to `1` (the same as ahead).
     */
    outerVolume: number;
};

/**
 * The shape of an area a sound fills: the same shapes that stop particles. A box, a ball or an
 * endless floor in a 3D scene; a rectangle, a circle or an endless floor in a flat one. An endless
 * floor fills everything under it, which is what the water of a lake needs.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundZoneShape = TParticleColliderShape2d | TParticleColliderShape3d;

/**
 * An area a sound fills, the way a meadow is full of birds or a cave of dripping: inside, it plays
 * at full volume wherever you stand, and outside it fades as you walk away.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundZone = {
    /**
     * Measured on the object, so it moves, turns and grows with it.
     */
    shape: TSoundZoneShape;
    /**
     * How far outside the shape it takes to fade to silence. `0` stops dead at the edge.
     */
    fade: number;
};

/**
 * How a sound plays.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundOptions = {
    /**
     * The name this sound keeps in a saved scene, so that opening one and saving it again gives the
     * same file back. Made up when nobody says, which is right for a sound written in code and
     * wrong for one that came out of a document.
     */
    id?: string;
    /**
     * `0` silent, `1` as recorded. Default `1`. This sound only: the channel and the general volume still apply.
     */
    volume?: number;
    /**
     * Repeats until it is stopped. Default `false`.
     *
     * It also decides what the sound **is**: a one-off can be played on top of itself (two coins at
     * once are heard twice), while a looping one is a single sound that `pause`, `resume` and `stop`
     * act on: music, rain, an engine.
     */
    loop?: boolean;
    /**
     * How fast it plays, which also changes the pitch: `2` is twice as fast, an octave up. Default `1`.
     */
    rate?: number;
    /**
     * Which volume group it belongs to: `'sfx'` (the default) or `'music'` are there from the start,
     * and any other name works straight away. An options screen moves these with `useAudio`.
     */
    channel?: string;
    /**
     * Starts as soon as the file is ready, with no `play()`. Default `false`.
     */
    autoplay?: boolean;
    /**
     * Places the sound in the world, **where the object that asked for it is**: it comes from a
     * side and gets quieter with distance. It follows the object wherever it goes, including when
     * what carries it is what moves.
     *
     * Heard from the camera, or from whatever `useAudioListener` put the ears on. In a 3D scene it
     * can also be told apart in front and behind, best with headphones. Default `false`, which is
     * the same volume wherever the listener is.
     */
    spatial?: boolean;
    /**
     * How far it can be heard at full volume. Placed sounds only. Measured the way the scene
     * measures: `100` pixels in a flat scene and under an orthographic camera, `1` unit under a
     * perspective one.
     */
    refDistance?: number;
    /**
     * Past this distance it is not heard at all: between `refDistance` and this it fades in a
     * straight line. Placed sounds only. `2000` pixels, or `20` units under a perspective camera.
     */
    maxDistance?: number;
    /**
     * Louder ahead of the object than behind it. Placed sounds only.
     */
    cone?: TSoundCone;
    /**
     * Fills an area instead of coming from a point: full volume inside, fading outside, and never
     * from one side, because an ambience is all around. Wins over `spatial`.
     */
    zone?: TSoundZone;
};

/**
 * How a sound starts or stops.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundFade = {
    /**
     * How long it takes to come in or go out, in seconds. Default `0`, at once.
     */
    fade?: number;
};

/**
 * One sound attached to one object: which clip, and how it was asked to play.
 *
 * **What it holds is the intention, never what is sounding.** A scene saved while the music was
 * halfway through comes back ready to start, not halfway through: where a voice had got to is a
 * fact about this run, and a level is not.
 *
 * It carries the clip itself rather than its name, the way a sprite carries its texture, so that
 * whoever writes the scene down can name the file and ask for it to be fetched again in one step.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundAttachment = {
    readonly type: 'sound';
    id: string;
    clip: TAudioClip;
    volume: number;
    loop: boolean;
    rate: number;
    channel: string;
    autoplay: boolean;
    spatial: boolean;
    /**
     * `null` until somebody chooses one: then it is what the scene measures in.
     */
    refDistance: number | null;
    maxDistance: number | null;
    cone: TSoundCone | null;
    zone: TSoundZone | null;
};

/**
 * Controls a sound made with `useSound`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundHandle = {
    /**
     * Plays it from the beginning. A one-off played again sounds on top of itself; a looping sound
     * starts over rather than doubling.
     *
     * Does nothing while the file is still loading, or if it failed: a sound missing is a sound
     * missing, never an error in the middle of the game.
     */
    play(options?: TSoundFade): void;
    /**
     * Stops it, fading out first when asked to. Playing again starts from the beginning.
     */
    stop(options?: TSoundFade): void;
    /**
     * Freezes it where it is. `resume` carries on from there.
     */
    pause(): void;
    /**
     * Carries on from where `pause` left it.
     */
    resume(): void;
    /**
     * Changes this sound's volume, now and for the next time it plays, over `fade` seconds if given.
     */
    setVolume(volume: number, fade?: number): void;
    /**
     * Turns repeating on or off, now and for the next time it plays.
     */
    setLoop(loop: boolean): void;
    /**
     * Changes the speed and pitch, now and for the next time it plays.
     */
    setRate(rate: number): void;
    /**
     * Whether something of this sound is sounding right now.
     */
    readonly playing: boolean;
};
