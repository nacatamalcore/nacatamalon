import { afterEach, describe, expect, it } from 'bun:test';
import { emptyTilemapDoc, parseTilemapDoc, serializeTilemapDoc } from '../src/loaders/tilemap';
import { emptyPaletteDoc, parsePaletteDoc, serializePaletteDoc } from '../src/loaders/palette';
import { readGltfNodes } from '../src/loaders/gltf/read_gltf_nodes';
import { parseShaderSource } from '../src/loaders/shader';
import { eulerAim, transformForward } from '../src/render/shared';
import { bindingKey, describeBinding } from '../src/input';
import { applyStoreDocs, clearGameStores, createGameStore, emptyStoreDoc, isProvisionalStore } from '../src/game_store';
import * as quat from '../src/math/quat';
import { emptyShaderGraph } from '../src/shader_composer/document';
import type { TTransform3d } from '../src';

/**
 * What a tool needs from the engine besides the runtime: writing a map or a palette back out, bringing
 * a model's tree in, naming a binding, aiming something. Each has to agree with the half a game runs,
 * so every one is checked against it rather than on its own.
 */

const place = (rotationX: number, rotationY: number, quaternion: TTransform3d['quaternion'] = null): TTransform3d => ({
    x: 0, y: 0, z: 0, rotation: 0, rotationX, rotationY, scaleX: 1, scaleY: 1, scaleZ: 1, quaternion,
});

const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
    expect(a.z).toBeCloseTo(b.z, 6);
};

describe('writing a map', () => {
    it('writes what the reader reads back unchanged', () => {
        const doc = parseTilemapDoc({
            format: 1, kind: 'tilemap', atlas: 'tiles.atlas', cell: 8, width: 2, height: 1,
            tiles: { 1: { frame: 3, solid: true }, 2: { anim: 'water', blocksBullets: false } },
            layers: [{ name: 'ground', order: 'under', data: [1, 2] }, { name: 'top', order: 5, data: [0, 1] }],
        }, 'x.tilemap');

        expect(parseTilemapDoc(JSON.parse(serializeTilemapDoc(doc)), 'x.tilemap')).toEqual(doc);
    });

    it('puts each layer on one line, so a big map is still a file somebody can read', () => {
        const text = serializeTilemapDoc(emptyTilemapDoc({ atlas: 'tiles.atlas', width: 40, height: 30 }));

        expect(text.split('\n').filter((line) => line.includes('"data"'))).toHaveLength(1);
        expect(text.endsWith('}\n')).toBe(true);
    });

    it('starts a new map the reader accepts, with the sheet\'s frames as its tiles from 1', () => {
        const doc = emptyTilemapDoc({ atlas: 'tiles.atlas', frames: 3 });

        expect(() => parseTilemapDoc(JSON.parse(serializeTilemapDoc(doc)), 'new.tilemap')).not.toThrow();
        expect(Object.keys(doc.tiles)).toEqual(['1', '2', '3']);
        expect(doc.tiles[1]).toEqual({ frame: 0, solid: false, blocksBullets: false });
        expect(doc.layers[0].data).toHaveLength(20 * 15);
    });
});

describe('writing a palette', () => {
    it('writes two spaces and a line break at the end, the bytes the files on disk already have', () => {
        expect(serializePaletteDoc({ format: 1, kind: 'palette', name: 'Two', colors: ['#010203'] }))
            .toBe('{\n  "format": 1,\n  "kind": "palette",\n  "name": "Two",\n  "colors": [\n    "#010203"\n  ]\n}\n');
    });

    it('starts a new palette empty, and the reader keeps it as it is', () => {
        const doc = emptyPaletteDoc('Mine');

        expect(doc.colors).toEqual([]);
        expect(parsePaletteDoc(JSON.parse(serializePaletteDoc(doc)))).toEqual(doc);
    });
});

describe('a model\'s tree of pieces', () => {
    it('copies a piece written as a move, a turn and a size exactly, with no rounding', () => {
        const [root] = readGltfNodes({
            scenes: [{ nodes: [0] }],
            nodes: [{ name: 'body', mesh: 0, translation: [0.9, 1, 2], rotation: [0, 0.6, 0, 0.8], scale: [2, 2, 2] }],
        });

        expect(root.name).toBe('body');
        expect(root.transform.x).toBe(0.9);
        expect(root.transform.quaternion).toEqual([0, 0.6, 0, 0.8]);
        expect(root.transform.scaleX).toBe(2);
        expect(root.hasMesh).toBe(true);
    });

    it('takes a finished matrix apart into the same three things', () => {
        const [root] = readGltfNodes({
            scenes: [{ nodes: [0] }],
            nodes: [{ matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 6, 7, 1] }],
        });

        expect([root.transform.x, root.transform.y, root.transform.z]).toEqual([5, 6, 7]);
        expect(root.transform.scaleY).toBeCloseTo(2, 6);
        expect(root.name).toBe('');
        expect(root.hasMesh).toBe(false);
    });

    it('keeps the tree, says which piece a rig deforms, and visits a shared piece once', () => {
        const [root] = readGltfNodes({
            scenes: [{ nodes: [0] }],
            nodes: [{ name: 'car', children: [1, 2, 1] }, { name: 'wheel', mesh: 0 }, { name: 'driver', mesh: 1, skin: 0 }],
        });

        expect(root.children.map((child) => child.name)).toEqual(['wheel', 'driver']);
        expect(root.children[1].skinned).toBe(true);
    });

    it('gives no pieces for something that is not a model file, instead of throwing', () => {
        for (const nonsense of [null, 7, 'model', {}]) {
            expect(readGltfNodes(nonsense)).toEqual([]);
        }
    });

    it('reads the scene the file says is the default one', () => {
        const nodes = readGltfNodes({ scene: 1, scenes: [{ nodes: [0] }, { nodes: [1] }], nodes: [{ name: 'a' }, { name: 'b' }] });

        expect(nodes.map((node) => node.name)).toEqual(['b']);
    });
});

describe('aiming', () => {
    it('gives the angles that face along a direction, and facing back gives the direction again', () => {
        for (const dir of [{ x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: -3, y: -5, z: -3 }, { x: 0.2, y: 0.9, z: 0.4 }]) {
            const length = Math.hypot(dir.x, dir.y, dir.z);
            const aim = eulerAim(dir);
            close(transformForward(place(aim.rotationX, aim.rotationY)), { x: dir.x / length, y: dir.y / length, z: dir.z / length });
        }
    });

    it('answers nothing with no turn, instead of numbers that are not numbers', () => {
        expect(eulerAim({ x: 0, y: 0, z: 0 })).toEqual({ rotationX: 0, rotationY: 0 });
    });

    it('lets a quaternion decide the facing when there is one, as it decides the turn', () => {
        // Half a turn around Y: forward goes from -Z to +Z whatever the angles say.
        const turned = transformForward(place(0.4, 1.2, quat.fromAxisAngle(0, 1, 0, Math.PI)));

        close(turned, { x: 0, y: 0, z: 1 });
    });
});

describe('naming a binding', () => {
    it('reads a key as a person says it', () => {
        expect(describeBinding({ type: 'key', key: ' ' })).toBe('Space');
        expect(describeBinding({ type: 'key', key: 'z' })).toBe('Z');
        expect(describeBinding({ type: 'key', key: 'ArrowLeft' })).toBe('Arrow Left');
    });

    it('reads the pad with the labels the pad already has', () => {
        expect(describeBinding({ type: 'button', button: 'start' })).toBe('START');
        expect(describeBinding({ type: 'axis', axis: 'leftX', dir: -1 })).toBe('L STICK LEFT');
    });

    it('tells two bindings apart', () => {
        expect(bindingKey({ type: 'axis', axis: 'leftX', dir: 1 })).not.toBe(bindingKey({ type: 'axis', axis: 'leftX', dir: -1 }));
        expect(bindingKey({ type: 'button', button: 'a' })).toBe('button:a');
    });
});

describe('where a store came from', () => {
    afterEach(() => clearGameStores());

    it('says a store only its file built is waiting for code, and stops saying it once code declares it', () => {
        applyStoreDocs([{ ...emptyStoreDoc('save'), fields: [{ name: 'coins', type: 'number', value: 0 }] }]);
        expect(isProvisionalStore('save')).toBe(true);

        createGameStore({ key: 'save', state: { coins: 0 } });
        expect(isProvisionalStore('save')).toBe(false);
    });

    it('says no for a key nothing has made', () => {
        expect(isProvisionalStore('nothing')).toBe(false);
    });
});

describe('reading a shader file for a tool', () => {
    it('reads a graph by its extension and anything else as a shader with a header', () => {
        const graph = parseShaderSource(JSON.stringify(emptyShaderGraph('sprite2d')), 'glow.shader');
        const text = parseShaderSource('// @shader sprite2d\n// @wgsl\nfn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }\n', 'plain.wgsl');

        expect(graph.shader).toBe('sprite2d');
        expect(text.shader).toBe('sprite2d');
    });
});
