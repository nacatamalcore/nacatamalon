/**
 * Where between left and right a sound is heard, `-1` to `1`, kept inside that.
 *
 * @internal
 */
export const clampPan = (pan: number): number => (Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0);

/**
 * What puts a sound between left and right: `input`, what it is connected to, and `stereo`, the
 * node whose `pan` moves it. The same node when the sound is stereo.
 *
 * @internal
 */
export type TStereo = { input: AudioNode; stereo: StereoPannerNode };

/**
 * What puts a sound between left and right, at `pan`, or `null` where the audio engine has none (a
 * game run without a browser).
 *
 * A mono sound in the middle is as loud as it was with nothing in its way. The audio engine's
 * panner shares a mono sound out at equal power, a little over 0.7 to each side in the middle, where
 * nothing in its way plays it whole to both: every mono effect and every voice of a song would be
 * 3 dB quieter for having a pan, at 0. So a mono sound goes through √2 first. Turned all the way to
 * one side it is then 3 dB louder there, which is how panning at equal power sounds. A stereo sound
 * (a recording, or one placed in space) goes straight in: in the middle the panner leaves it alone.
 *
 * @internal
 */
export const stereoPannerOf = (context: BaseAudioContext, pan: number, mono: boolean): TStereo | null => {
    if (typeof (context as { createStereoPanner?: unknown }).createStereoPanner !== 'function') {
        return null;
    }
    const stereo = context.createStereoPanner();
    stereo.pan.value = clampPan(pan);
    if (!mono) {
        return { input: stereo, stereo };
    }
    const lift = context.createGain();
    lift.gain.value = Math.SQRT2;
    lift.connect(stereo);
    return { input: lift, stereo };
};
