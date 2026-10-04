/**
 * A single white texel. What a sprite with no texture (or a failed one) samples, so it goes
 * through the same shader and the same batch as every other sprite and its tint is the colour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWhiteTexture = (device: GPUDevice): GPUTexture => {
    const texture = device.createTexture({
        label: 'white texel',
        size: [1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture }, new Uint8Array([255, 255, 255, 255]), {}, [1, 1]);
    return texture;
};
