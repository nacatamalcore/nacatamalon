import * as mat from '../../math/mat4';
import * as quat from '../../math/quat';
import type { Mat4 } from '../../math/mat4';
import type { TGltfDoc, TGltfNode } from './types/t_gltf_doc';

/**
 * One piece of the file that has something to draw, and where it ended up once everything above it
 * had its say.
 *
 * @internal
 */
export type TMeshNode = {
    /**
     * The node's own name, or `''`. It is how a part is found again from outside.
     */
    name: string;
    meshIndex: number;
    world: Mat4;
    /**
     * Which rig deforms it, if any. A deformed piece is placed by its bones, not by `world`.
     */
    skinIndex: number | undefined;
};

/**
 * Where one node sits relative to the one above it.
 *
 * A file gives this either as a finished matrix or as a move, a turn and a size, never both. The
 * finished one is taken as it is: undoing it into three parts and building it again would only lose
 * precision on the way.
 */
const localMatrixOf = (node: TGltfNode): Mat4 => {
    if (node.matrix !== undefined) {
        return new Float32Array(node.matrix) as Mat4;
    }

    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const rotation = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];

    let m = mat.create();
    m = mat.translate(m, { x: tx, y: ty, z: tz });
    m = mat.multiply(m, quat.toMat4([rotation[0], rotation[1], rotation[2], rotation[3]]));
    m = mat.scale(m, { x: sx, y: sy, z: sz });
    return m;
};

/**
 * Walks the file's tree and reports **every** piece that has something to draw, each with the place
 * it ends up in.
 *
 * Every one, not the first: over half of the models anyone is likely to try are several pieces with
 * several surfaces, and a loader that took only the first would draw a car's body and leave its
 * wheels on the floor. What comes back is in the order the file lists it, so a model always builds
 * its parts the same way round.
 *
 * `only` narrows it to the piece of that name and whatever hangs beneath it, which is how one
 * turret is taken out of a file holding a whole fortress.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findMeshNodes = (doc: TGltfDoc, only?: string): TMeshNode[] => {
    const roots = doc.scenes?.[doc.scene ?? 0]?.nodes ?? [];
    const nodes = doc.nodes ?? [];
    const found: TMeshNode[] = [];
    // A file may point two parents at one child. Visiting it twice would draw it twice, in the
    // first parent's place both times.
    const seen = new Set<number>();

    const visit = (index: number, parent: Mat4, taking: boolean): void => {
        const node = nodes[index];
        if (node === undefined || seen.has(index)) {
            return;
        }
        seen.add(index);

        const world = mat.multiply(parent, localMatrixOf(node));
        const name = node.name ?? '';
        const mine = taking || only === undefined || name === only;

        if (mine && node.mesh !== undefined) {
            found.push({ name, meshIndex: node.mesh, world, skinIndex: node.skin });
        }
        for (const child of node.children ?? []) {
            visit(child, world, mine);
        }
    };

    for (const root of roots) {
        visit(root, mat.create(), false);
    }
    return found;
};

/**
 * The names of every piece the file can draw, for the message shown when somebody asks for one
 * that is not there.
 *
 * It earns its place: renaming an object and re-exporting it is the ordinary way a model quietly
 * stops appearing, and being told what the file does contain turns an afternoon into a second.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const meshNodeNames = (doc: TGltfDoc): string[] =>
    findMeshNodes(doc).map((node) => node.name).filter((name) => name.length > 0);
