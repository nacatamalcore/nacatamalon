import * as mat from '../../math/mat4';
import * as quat from '../../math/quat';
import { degToRad } from '../../math/angle';
import type { Mat4 } from '../../math/mat4';
import type { TTransform3d } from '../../gameobjects/types/t_transform_3d';
import type { TDrawCamera3d } from '../interface/draw/t_draw_camera_3d';

/**
 * Where a turn is worked out on its way into something bigger.
 *
 * Two and not one because a view and a model are both being composed in the same frame, and one
 * shared between them would have the second overwrite what the first was still reading. They never
 * nest, which is what makes two enough.
 */
const viewTurn = mat.create();
const modelTurn = mat.create();

/**
 * Turning a placement into a matrix: the one place it happens, so a camera and a model placed the
 * same way agree exactly.
 *
 * Turns are applied Y, then X, then Z, which is the order that makes "look left and right" and
 * "look up and down" behave the way a player expects when both are used at once.
 *
 * A placement carrying a `quaternion` is turned by that instead, and the three angles are not read
 * at all. Mixing them would mean deciding which wins in a place nobody would think to look; one of
 * the two says which way something faces, and the one written last is not a rule anyone can hold.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rotationMatrix = (transform: TTransform3d, dst?: Mat4): Mat4 => {
    const out = dst ?? mat.create();
    const turn = transform.quaternion;
    if (turn !== undefined && turn !== null) {
        return quat.toMat4(turn, out);
    }

    mat.identity(out);
    mat.rotateY(out, transform.rotationY, out);
    mat.rotateX(out, transform.rotationX, out);
    mat.rotateZ(out, transform.rotation, out);
    return out;
};

/**
 * Which way a model's surfaces face, taken from where the model ended up.
 *
 * Read off the placement rather than built from the angles again, because the placement may be a
 * composed one: a model inside something that turned has to have its surfaces turn with it, or a
 * turned parent moves its child and lights it as though it had never moved.
 *
 * The move is dropped, because a direction has no place, and an uneven size is undone the other way
 * round, so a model squashed or stretched is still lit along its surface: see `mat.normalMatrix`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const normalMatrixOf = (model: Mat4, dst?: Mat4): Mat4 => mat.normalMatrix(model, dst);

/**
 * Where something is, as a matrix: move, then turn, then scale.
 *
 * With a `pivot`, the turn and the scale go about it: moved to where the pivot is, turned and
 * scaled, and moved back by the pivot from there. Unturned and at its own size, that is the same
 * matrix as without one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const computeModelMatrix = (transform: TTransform3d, dst?: Mat4): Mat4 => {
    const out = dst ?? mat.create();
    const pivot = transform.pivot ?? null;
    mat.identity(out);
    if (pivot === null) {
        mat.translate(out, { x: transform.x, y: transform.y, z: transform.z }, out);
    } else {
        mat.translate(out, { x: transform.x + pivot.x, y: transform.y + pivot.y, z: transform.z + pivot.z }, out);
    }
    mat.multiply(out, rotationMatrix(transform, modelTurn), out);
    mat.scale(out, { x: transform.scaleX, y: transform.scaleY, z: transform.scaleZ }, out);
    if (pivot !== null) {
        mat.translate(out, { x: -pivot.x, y: -pivot.y, z: -pivot.z }, out);
    }
    return out;
};

/**
 * The view: the camera's own placement, turned inside out.
 *
 * Built from the same recipe a model uses and then inverted, rather than written out by hand, so a
 * camera and a model at the same placement can never disagree.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const computeView = (camera: TDrawCamera3d | null, dst?: Mat4): Mat4 => {
    const out = dst ?? mat.create();
    if (camera === null) {
        return mat.identity(out);
    }
    // Following the 2D camera: what it does to a sprite, done to the world, `y` down. Magnify, turn
    // against it, move to it (`applyView2d`), and back from this camera's own depth.
    const flat = camera.flat ?? null;
    if (flat !== null) {
        mat.identity(out);
        mat.scale(out, { x: flat.zoom, y: flat.zoom, z: 1 }, out);
        mat.rotateZ(out, -flat.rotation, out);
        mat.translate(out, { x: -flat.x, y: -flat.y, z: -camera.transform.z }, out);
        return out;
    }
    mat.identity(out);
    mat.translate(out, { x: camera.transform.x, y: camera.transform.y, z: camera.transform.z }, out);
    mat.multiply(out, rotationMatrix(camera.transform, viewTurn), out);
    return mat.invert(out, out);
};

/**
 * How the view is flattened onto the screen, **measured in pixels**.
 *
 * `'perspective'` is the ordinary one and only the shape of the screen matters to it.
 * `'orthographic'` is the one that needed the sizes, and the reason this takes them:
 *
 * **An orthographic 3D camera measures in the same pixels a sprite does.** Without that, a model
 * one unit wide and a sprite one pixel wide live in two spaces that merely look alike: they can be
 * layered but not *placed*, and "put this tank on tile (5, 7)" has no answer. The frustum is
 * `width * zoom` across, which is what makes zooming agree with the 2D rather than resemble it.
 *
 * **Y still points up here**, the opposite of the 2D. Sharing the axis literally would mean a
 * negative scale somewhere, and a mirrored basis flips which way a triangle faces: every model would
 * be drawn inside out. So the two are reconciled in the frustum instead.
 *
 * That reconciliation is the `-2y` below. One camera is read by both halves and they disagree about
 * which way its `y` points: left alone, moving the camera down moves sprites up and models down, and
 * they drift apart by twice it. `computeView` moves by `-y` like anything else, which is right for a
 * model and backwards for this, so shifting the top and bottom of the frustum by `-2y` cancels the
 * one and applies the other. `height - h` does the same for zoom, which grows from the top-left
 * corner in 2D and would otherwise grow from the middle here.
 *
 * With no camera it still gives a frustum the size of the screen, so a scene that forgot one draws
 * something rather than nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const computeProjection = (camera: TDrawCamera3d | null, viewportWidth: number, viewportHeight: number, dst?: Mat4): Mat4 => {
    if (camera?.projection === 'perspective') {
        return mat.perspective(degToRad(camera.fov), viewportWidth / viewportHeight, camera.near, camera.far, dst);
    }
    // Following the 2D camera: the screen's pixels as the sprites have them, from the top-left
    // corner, `y` going down. The view has put the camera's turn and zoom in already.
    if (camera !== null && (camera.flat ?? null) !== null) {
        const depth = camera.far;
        return mat.ortho(0, Math.max(viewportWidth, 1), Math.max(viewportHeight, 1), 0, -depth, depth, dst);
    }

    // Guarded: a zoom of 0 collapses the frustum to nothing, and a canvas can measure zero for a
    // frame while the page works out its size.
    const zoom = camera !== null && camera.zoom > 0 ? camera.zoom : 1;
    const w = Math.max(viewportWidth, 1) * zoom;
    const h = Math.max(viewportHeight, 1) * zoom;
    const shift = 2 * (camera?.transform.y ?? 0);
    const height = Math.max(viewportHeight, 1);

    // As deep behind the camera as in front of it. An orthographic camera is placed like the 2D one,
    // by x and y, and a model sits around z = 0 as a sprite does: from a camera at z = 0, a near plane
    // in front of it cut away the half of every model nearer than that, and a sphere showed only its
    // back faces, culled, so nothing at all. `near` is the perspective's.
    const depth = camera?.far ?? 1000;
    return mat.ortho(0, w, height - h - shift, height - shift, -depth, depth, dst);
};

/**
 * Everything about how a scene is looked at that every model in it shares.
 *
 * It exists because the two are exactly that: **shared**. The view and the projection depend on the
 * camera and the size of what is being drawn on, and on nothing about any model, so working them
 * out inside the per-model fill meant doing the same arithmetic once for every model in the frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCameraSpace = {
    /**
     * The projection over the view, ready to have a model's own placement multiplied into it.
     */
    viewProjection: Mat4;
    /**
     * Where it is looked at from, which the shine needs: a highlight moves when the viewer does.
     */
    x: number;
    y: number;
    z: number;
    /**
     * The camera's own right and up, in the world, which is what a particle builds its square along
     * so that it faces the camera. They are the first two rows of the view: the view undoes the
     * camera's turn, and undoing a turn is its transpose.
     */
    right: [number, number, number];
    up: [number, number, number];
    /**
     * The size of what this view draws into, in the game's own pixels (not the buffer's): the grid a
     * material with `vertexSnap` puts its corners on.
     */
    width: number;
    height: number;
    /**
     * Seen through the 2D camera (`TCamera3d.follow2d`): the world is the 2D one, `y` down, and each
     * model is turned upright in it (`fillMeshUniforms`).
     */
    flat: boolean;
};

/**
 * One of those, empty, for something that means to fill it again and again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newCameraSpace = (): TCameraSpace => ({ viewProjection: mat.create(), x: 0, y: 0, z: 0, right: [1, 0, 0], up: [0, 1, 0], width: 1, height: 1, flat: false });

/**
 * Where the two halves are built before they are multiplied together. Never handed out.
 */
const viewScratch = mat.create();
const projectionScratch = mat.create();

/**
 * Works out how a scene is looked at, into a place that already exists.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillCameraSpace = (
    out: TCameraSpace,
    camera: TDrawCamera3d | null,
    viewportWidth: number,
    viewportHeight: number,
): TCameraSpace => {
    computeView(camera, viewScratch);
    computeProjection(camera, viewportWidth, viewportHeight, projectionScratch);
    mat.multiply(projectionScratch, viewScratch, out.viewProjection);

    out.right[0] = viewScratch[0]!;
    out.right[1] = viewScratch[4]!;
    out.right[2] = viewScratch[8]!;
    out.up[0] = viewScratch[1]!;
    out.up[1] = viewScratch[5]!;
    out.up[2] = viewScratch[9]!;

    out.x = camera?.transform.x ?? 0;
    out.y = camera?.transform.y ?? 0;
    out.z = camera?.transform.z ?? 0;
    out.width = Math.max(viewportWidth, 1);
    out.height = Math.max(viewportHeight, 1);
    out.flat = (camera?.flat ?? null) !== null;
    if (out.flat) {
        // The screen's up is the world's -y here: a particle's square is built standing the right way.
        out.up[0] = -out.up[0];
        out.up[1] = -out.up[1];
        out.up[2] = -out.up[2];
    }
    return out;
};

/**
 * The kept run of those, one per scene being drawn, filled again each pass.
 *
 * Kept rather than made because a pass happens sixty times a second and these never change shape: a
 * game settles on its number of scenes in the first frame and allocates nothing after it.
 *
 * **What comes back is good until the next call and no longer.** It is the same run of objects every
 * time, so holding on to one across passes hands you another pass's camera, which draws a scene from
 * somewhere it is not and reports nothing at all. Both callers read it inside the pass that filled
 * it, which is the only safe way to use it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const spaces: TCameraSpace[] = [];

export const cameraSpacesFor = (
    views: readonly { readonly camera: TDrawCamera3d | null }[],
    viewportWidth: number,
    viewportHeight: number,
): readonly TCameraSpace[] => {
    while (spaces.length < views.length) {
        spaces.push(newCameraSpace());
    }
    for (let i = 0; i < views.length; i++) {
        fillCameraSpace(spaces[i], views[i].camera, viewportWidth, viewportHeight);
    }
    return spaces;
};
