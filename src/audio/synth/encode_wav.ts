/**
 * Writes sound as a `.wav` file: 16-bit samples, one channel per track, the tracks interleaved.
 * Anything past full scale is held at full scale rather than wrapping round into a crack.
 *
 * @param channels - One track for mono, two for stereo, all the same length.
 * @param sampleRate - Samples per second.
 * @returns The bytes of the file.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const encodeWav = (channels: Float32Array | Float32Array[], sampleRate: number): Uint8Array => {
    const tracks = Array.isArray(channels) ? channels : [channels];
    const frames = tracks[0]?.length ?? 0;
    const blockAlign = tracks.length * 2;
    const dataSize = frames * blockAlign;
    const bytes = new Uint8Array(44 + dataSize);
    const view = new DataView(bytes.buffer);
    const text = (at: number, value: string): void => {
        for (let i = 0; i < value.length; i += 1) {
            view.setUint8(at + i, value.charCodeAt(i));
        }
    };

    text(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, tracks.length, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, dataSize, true);

    let at = 44;
    for (let frame = 0; frame < frames; frame += 1) {
        for (const track of tracks) {
            const sample = Math.max(-1, Math.min(1, track[frame] ?? 0));
            view.setInt16(at, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
            at += 2;
        }
    }
    return bytes;
};
