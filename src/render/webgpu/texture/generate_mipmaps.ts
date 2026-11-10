/**
 * Draws each copy as the average of the four pixels of the one before that it covers. Read through
 * a smoothing sampler at the middle of those four, which is their average, so the shader is a single
 * read. Kept straight, as the texture is (nothing premultiplied), like the WebGL2 backend's.
 */
const MIP_SHADER = /* wgsl */ `
@group(0) @binding(0) var mipSource: texture_2d<f32>;
@group(0) @binding(1) var mipSampler: sampler;

struct Out {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> Out {
    // One triangle bigger than the picture, which the edges cut to it.
    let corner = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
    var out: Out;
    out.position = vec4<f32>(corner * 2.0 - 1.0, 0.0, 1.0);
    out.uv = vec2<f32>(corner.x, 1.0 - corner.y);
    return out;
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    return textureSampleLevel(mipSource, mipSampler, in.uv, 0.0);
}
`;

/**
 * What drawing the copies needs, made once per graphics card.
 */
type TMipDrawer = {
    pipeline: GPURenderPipeline;
    sampler: GPUSampler;
};

const drawers = new WeakMap<GPUDevice, TMipDrawer>();

const drawerFor = (device: GPUDevice): TMipDrawer => {
    let drawer = drawers.get(device);
    if (drawer === undefined) {
        const module = device.createShaderModule({ label: 'mipmaps', code: MIP_SHADER });
        drawer = {
            pipeline: device.createRenderPipeline({
                label: 'mipmaps',
                layout: 'auto',
                vertex: { module, entryPoint: 'vs' },
                fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
                primitive: { topology: 'triangle-list' },
            }),
            sampler: device.createSampler({ label: 'mipmaps', magFilter: 'linear', minFilter: 'linear' }),
        };
        drawers.set(device, drawer);
    }
    return drawer;
};

/**
 * Works out a texture's chain of mipmaps from its first picture: each copy drawn from the one
 * before, in one submission. Again whenever the first picture changes.
 *
 * WebGPU has no call that does it, so it is drawn: the texture has to be `rgba8unorm` and allow
 * `RENDER_ATTACHMENT`, which every texture made with mipmaps here does. One with a single level has
 * nothing to work out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const generateWebGPUMipmaps = (device: GPUDevice, texture: GPUTexture): void => {
    if (texture.mipLevelCount <= 1) {
        return;
    }
    const { pipeline, sampler } = drawerFor(device);
    const layout = pipeline.getBindGroupLayout(0);
    const encoder = device.createCommandEncoder({ label: 'mipmaps' });
    for (let level = 1; level < texture.mipLevelCount; level++) {
        const group = device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) },
                { binding: 1, resource: sampler },
            ],
        });
        const pass = encoder.beginRenderPass({
            label: `mipmap ${level}`,
            colorAttachments: [{
                view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
            }],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
    }
    device.queue.submit([encoder.finish()]);
};
