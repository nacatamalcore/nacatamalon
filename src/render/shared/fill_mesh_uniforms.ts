import * as mat from '../../math/mat4';
import { computeModelMatrix, normalMatrixOf } from './compute_mvp_3d';
import type { TCameraSpace } from './compute_mvp_3d';
import { pickMeshLights } from './pick_mesh_lights';
import type { TDrawMesh } from '../interface/draw/t_draw_mesh';
import type { TDrawLight } from '../interface/draw/t_draw_light';

/**
 * How many numbers one model's block holds. Sixteen apiece for three matrices, four apiece after.
 */
export const MESH_UNIFORM_FLOATS = 64;

/**
 * Where the three matrices are worked out before they are copied into their places.
 *
 * Kept here rather than made per call, which is per model per frame: what this function produces is
 * copied into the caller's own buffer and never handed out, so one of each is enough however many
 * models a frame draws.
 */
const modelScratch = mat.create();
const mvpScratch = mat.create();
const normalScratch = mat.create();
const uprightScratch = mat.create();
/** A model's own `y` turned over: what stands it upright in a world whose `y` goes down. */
const UPRIGHT = { x: 1, y: -1, z: 1 };

/**
 * Writes everything a backend needs about one model: where it ends up on screen, where it is in the
 * world, which way its surfaces face, and what its surface is like.
 *
 * **The lights are deliberately not here.** They are the same for every model in the frame, so they
 * live in their own block written once. What is here is which of them light this one: the eight of
 * `lights` that reach it most (`pickMeshLights`), as their places in that block.
 *
 * Three matrices and not one, because each answers a different question. The combined one puts the
 * corner on screen. The world one is needed as well, because a lamp shines from a place and the
 * shading has to know where the corner really is, not just where it ended up in the picture. And
 * the turning one is kept apart because a direction must never be squashed by the projection: run
 * through the combined matrix, every surface would face the wrong way the moment the camera moved.
 *
 * Written once here and read by both backends, so the two cannot drift.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillMeshUniforms = (out: Float32Array, at: number, mesh: TDrawMesh, space: TCameraSpace, lights: readonly TDrawLight[] = []): void => {
    const surface = mesh.material;
    // Its own placement, worked out here only when nothing above it did: a model inside a box that
    // moved already had this done while the tree was walked.
    let model = mesh.worldMatrix ?? computeModelMatrix(mesh.transform, modelScratch);
    // Seen through the 2D camera, the world is the 2D one, `y` down, and a model built `y` up would
    // stand on its head: turned upright in its own frame first. Two mirrorings (this one and the
    // screen's) make none, so its faces still face the way they were built and none is culled.
    if (space.flat) model = mat.scale(model, UPRIGHT, uprightScratch);

    mat.multiply(space.viewProjection, model, mvpScratch);
    out.set(mvpScratch, at);
    out.set(model, at + 16);
    // Turning only, and taken from where it ended up: a model inside something that turned has to
    // have its surfaces turn with it. Written straight into its place rather than built and copied.
    normalMatrixOf(model, normalScratch);
    out.set(normalScratch, at + 32);
    // Its fourth column is never read as a matrix (every shader turns a direction with it, w = 0),
    // so its last number carries whether the picture is stretched straight across the screen, the
    // PlayStation's swimming textures: one for `affine`, zero for held true to the surface.
    out[at + 47] = surface.affine === true ? 1 : 0;
    // The other three of that column are free the same way, and two of them carry which of the
    // scene's lights reach this model: eight places in its block, four to a number.
    const [first, second] = pickMeshLights(lights, model, mesh.geometry?.bounds ?? null);
    out[at + 44] = first;
    out[at + 45] = second;
    // And the last one carries the alpha below which a pixel is cut out: zero cuts nothing, since
    // no alpha is below it.
    out[at + 46] = surface.alphaCutoff ?? 0;

    out[at + 48] = surface.tint.r;
    out[at + 49] = surface.tint.g;
    out[at + 50] = surface.tint.b;
    out[at + 51] = surface.alpha * surface.tint.a;

    // The two spare fourth numbers carry the grid a `vertexSnap` material puts its corners on, its
    // columns in one and its rows in the other; zero is no snapping. They ride here rather than in a
    // block of their own because they were free, and the layout stays the same. `true` is the game's
    // own pixels; a number is that many rows, with the columns following the view's shape so the
    // cells stay square.
    const rows = surface.vertexSnap === true
        ? space.height
        : typeof surface.vertexSnap === 'number' && surface.vertexSnap > 0 ? surface.vertexSnap : 0;
    const snap = rows > 0;
    const columns = rows * (space.width / space.height);

    // A glow picture that is not on the card yet, or never will be, reads as white there: the glow
    // would cover the whole model rather than its windows. No glow is wrong in a smaller place.
    const glow = surface.emissiveTexture;
    const dark = glow !== null && glow !== undefined && (glow.status !== 'ready' || glow.gpu === null);
    out[at + 52] = dark ? 0 : surface.emissive.r;
    out[at + 53] = dark ? 0 : surface.emissive.g;
    out[at + 54] = dark ? 0 : surface.emissive.b;
    out[at + 55] = snap ? columns : 0;

    // Where it is looked at from, which the shine needs: a highlight is where the light bounces
    // straight into the eye, so it moves when the viewer does.
    out[at + 56] = space.x;
    out[at + 57] = space.y;
    out[at + 58] = space.z;
    out[at + 59] = snap ? rows : 0;

    out[at + 60] = surface.specular.r;
    out[at + 61] = surface.specular.g;
    out[at + 62] = surface.specular.b;
    out[at + 63] = surface.shininess;
};
