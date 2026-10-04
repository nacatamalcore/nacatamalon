/**
 * The shader a particle in three dimensions is drawn with: a square that always faces the camera.
 *
 * The square is built **here, per corner**, from the camera's own right and up, and not on the
 * processor. That is what keeps a turning camera free: each particle is one point in the buffer, and
 * orbiting the camera changes two directions in the view block rather than every particle.
 *
 * The particle's point is placed first and the square spread around it afterwards, along the
 * camera's axes. The other way round, spreading it on the emitter and then placing it, would let
 * the emitter's own turn and stretch tilt and squash the square, which is what facing the camera
 * means it must not do.
 *
 * `up` is subtracted rather than added because the corners are laid out with y growing downwards,
 * as the flat ones are. Adding it would draw every picture upside down.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLES_3D_SHADER = /* wgsl */ `
struct View { viewProjection: mat4x4f, right: vec4f, up: vec4f };
@group(0) @binding(0) var<uniform> view: View;

@group(1) @binding(0) var particleSampler: sampler;
@group(1) @binding(1) var particleTexture: texture_2d<f32>;

struct Instance {
    @location(1) position: vec3f,
    @location(2) size: f32,
    @location(3) rotation: f32,
    @location(4) tint: vec4f,
};

struct VertexOut {
    @builtin(position) clip: vec4f,
    @location(0) tint: vec4f,
    @location(1) uv: vec2f,
};

@vertex
fn vs(@location(0) corner: vec2f, inst: Instance) -> VertexOut {
    let local = corner * inst.size;
    let c = cos(inst.rotation);
    let s = sin(inst.rotation);
    let turned = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);
    let world = inst.position + view.right.xyz * turned.x - view.up.xyz * turned.y;

    var out: VertexOut;
    out.clip = view.viewProjection * vec4f(world, 1.0);
    out.tint = inst.tint;
    out.uv = corner + 0.5;
    return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    return textureSample(particleTexture, particleSampler, in.uv) * in.tint;
}
`;
