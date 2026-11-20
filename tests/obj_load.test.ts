import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useLoadModel } from '../src/hooks/loaders/use_load_model';
import { whenLoaded } from '../src/loaders';
import { readObj } from '../src/loaders/obj/read_obj';
import { readMtl } from '../src/loaders/obj/read_mtl';
import { createTestGame, startTestScene } from './helpers/test_game';
import { serveGltf } from './helpers/test_gltf';
import type { TGltfModel } from '../src/loaders';

/**
 * Reading a Wavefront model: the plain text format, its material files, and the same model record a
 * glTF becomes.
 */

const bytes = (text: string): ArrayBuffer => {
    const encoded = new TextEncoder().encode(text);
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
};

const QUAD = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 0 1
`;

const load = async (files: Record<string, unknown>, src = 'crate.obj', options: Record<string, unknown> = {}) => {
    const served = serveGltf(files);
    const { store } = createTestGame();
    let loaded!: TGltfModel;
    startTestScene(store, 'Level', () => {
        loaded = useLoadModel({ src, ...options });
        return createScene();
    });
    await whenLoaded(loaded);
    return { model: loaded, asked: served.asked };
};

afterEach(() => { mock.restore(); });

describe('readObj', () => {
    it('cuts a face of four corners into two triangles and shares the corners they have in common', () => {
        const { parts } = readObj(`${QUAD}f 1/1/1 2/2/1 3/3/1 4/4/1\n`, 'auto', undefined);
        expect(parts).toHaveLength(1);
        expect(Array.from(parts[0].indices)).toEqual([0, 1, 2, 0, 2, 3]);
        expect(parts[0].vertices.length).toBe(4 * 8);
    });

    it('turns the picture coordinates upside down, counted from the top as glTF counts them', () => {
        const { parts } = readObj(`${QUAD}f 1/1/1 2/2/1 3/3/1\n`, 'auto', undefined);
        // The first corner sits at the bottom left of the picture: v 0 becomes 1.
        expect(parts[0].vertices[6]).toBe(0);
        expect(parts[0].vertices[7]).toBe(1);
        // Its facing, as the file wrote it.
        expect(Array.from(parts[0].vertices.subarray(3, 6))).toEqual([0, 0, 1]);
    });

    it('reads corners counted from the end, and faces written without coordinates or facings', () => {
        const { parts } = readObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n', 'auto', undefined);
        expect(Array.from(parts[0].indices)).toEqual([0, 1, 2]);
        // No facings written, so they are worked out: the triangle faces +z.
        expect(parts[0].vertices[5]).toBeCloseTo(1, 5);
    });

    it('makes one part per piece and surface, and counts the pieces of one name', () => {
        const text = `${QUAD}o Car\nusemtl paint\nf 1 2 3\nusemtl glass\nf 1 3 4\no Wheel\nf 1 2 3\no Car\nusemtl paint\nf 2 3 4\n`;
        const { parts, names } = readObj(text, 'auto', undefined);
        expect(parts.map((part) => [part.name, part.material, part.occurrence])).toEqual([
            ['Car', 'paint', 0],
            ['Car', 'glass', 1],
            // A surface stays in force from one piece to the next until another is named.
            ['Wheel', 'glass', 0],
        ]);
        // The Car painted again later grows the part it started.
        expect(parts[0].indices.length).toBe(6);
        expect(names).toEqual(['Car', 'Wheel']);
    });

    it('takes one piece by name, keeping the number it has in the whole file', () => {
        const text = `${QUAD}o Car\nusemtl paint\nf 1 2 3\nusemtl glass\nf 1 3 4\n`;
        const { parts } = readObj(text, 'auto', 'Car');
        expect(parts.map((part) => part.occurrence)).toEqual([0, 1]);
        expect(readObj(text, 'auto', 'Boat').parts).toHaveLength(0);
    });

    it('carries the colours written on corners, and shades flat when asked', () => {
        const text = 'v 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 1 0 0 0 1\nf 1 2 3\n';
        const smooth = readObj(text, 'auto', undefined).parts[0];
        expect(Array.from(smooth.colors!)).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
        const flat = readObj(text, 'flat', undefined).parts[0];
        expect(flat.colors).not.toBeNull();
        expect(flat.indices.length).toBe(3);
    });

    it('lists the material files it names, even one whose name has spaces', () => {
        expect(readObj('mtllib a.mtl b.mtl\n', 'auto', undefined).libraries).toEqual(['a.mtl', 'b.mtl']);
        expect(readObj('mtllib my crate.mtl\n', 'auto', undefined).libraries).toEqual(['my crate.mtl']);
    });
});

describe('readMtl', () => {
    it('reads colour, picture, glow and see-through, and walks past the rest', () => {
        const surfaces = readMtl([
            'newmtl glass',
            'Ns 96',
            'Kd 0.2 0.4 0.6',
            'Ke 1 0.5 0',
            'd 0.5',
            'map_Kd -clamp on -s 2 2 textures\\glass.png',
            'newmtl leaf',
            'Tr 0.25',
            'map_Kd C:\\Users\\someone\\leaf.jpg',
            'map_d C:\\Users\\someone\\leaf.jpg',
        ].join('\n'), (file) => `/models/${file}`);

        const glass = surfaces.get('glass')!;
        expect(glass.tint).toEqual({ r: 0.2, g: 0.4, b: 0.6, a: 0.5 });
        expect(glass.emissive).toEqual({ r: 1, g: 0.5, b: 0, a: 1 });
        expect(glass.transparent).toBe(true);
        expect(glass.image?.uri).toBe('/models/textures/glass.png');
        expect(glass.wrap).toEqual({ u: 'clamp', v: 'clamp' });

        const leaf = surfaces.get('leaf')!;
        expect(leaf.tint.a).toBe(0.75);
        // A path from the exporter's own computer is looked for beside the material file.
        expect(leaf.image?.uri).toBe('/models/leaf.jpg');
        expect(leaf.image?.type).toBe('image/jpeg');
        expect(leaf.alphaCutoff).toBe(0.5);
    });
});

describe('useLoadModel with a Wavefront file', () => {
    it('reads it into parts on the graphics card, with the surfaces and pictures of its material file', async () => {
        const { model, asked } = await load({
            'models/crate.obj': bytes(`mtllib crate.mtl\n${QUAD}o Crate\nusemtl wood\nf 1/1/1 2/2/1 3/3/1 4/4/1\n`),
            'models/crate.mtl': bytes('newmtl wood\nKd 1 0.5 0.25\nmap_Kd wood.png\n'),
            'models/wood.png': 'png',
        }, 'models/crate.obj');

        expect(model.status).toBe('ready');
        expect(model.parts).toHaveLength(1);
        expect(model.parts[0].name).toBe('Crate');
        expect(model.parts[0].material).toBe('wood');
        expect(model.parts[0].tint).toEqual({ r: 1, g: 0.5, b: 0.25, a: 1 });
        expect(model.parts[0].geometry.vertexCount).toBe(4);
        expect(model.parts[0].geometry.vertexBuffer).not.toBeNull();
        expect(model.parts[0].geometry.source).toEqual({ kind: 'gltf', src: 'models/crate.obj', node: 'Crate' });
        expect(model.parts[0].texture?.status).toBe('ready');
        expect(asked).toEqual(['models/crate.obj', '/models/crate.mtl', '/models/wood.png']);
        expect(model.skeletons).toEqual([]);
    });

    it('draws its pieces white when the material file is missing, and says so', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { model } = await load({
            'crate.obj': bytes(`mtllib gone.mtl\n${QUAD}usemtl wood\nf 1 2 3\n`),
        });
        expect(model.status).toBe('ready');
        expect(model.parts[0].tint).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(String(warn.mock.calls[0]?.[0])).toContain("'gone.mtl'");
    });

    it('fails the way a glTF does when it holds no piece of the name asked for', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { model } = await load({ 'crate.obj': bytes(`${QUAD}o Lid\nf 1 2 3\n`) }, 'crate.obj', { node: 'Body' });
        expect(model.status).toBe('error');
        expect(String(warn.mock.calls[0]?.[1])).toContain("What it does hold: Lid");
    });

    it('looks for a material file named from the exporter\'s own computer beside the model', async () => {
        const { model, asked } = await load({
            'models/crate.obj': bytes(`mtllib C:\\Users\\someone\\crate.mtl\nmtllib C:\\Users\\someone\\crate.mtl\n${QUAD}usemtl wood\nf 1 2 3\n`),
            'models/crate.mtl': bytes('newmtl wood\nKd 0 1 0\n'),
        }, 'models/crate.obj');
        expect(model.parts[0].tint).toEqual({ r: 0, g: 1, b: 0, a: 1 });
        // Named twice, asked for once.
        expect(asked).toEqual(['models/crate.obj', '/models/crate.mtl']);
    });

    it('reads a file that begins with a long run of blank lines', async () => {
        const { model } = await load({ 'crate.obj': bytes(`${'\n'.repeat(100)}${QUAD}f 1 2 3\n`) });
        expect(model.status).toBe('ready');
    });

    it('says a web page answered instead of the model, rather than that the model is empty', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { model } = await load({ 'ship.glb': bytes('<!doctype html><html><body>Not here</body></html>') }, 'ship.glb');
        expect(model.status).toBe('error');
        expect(String(warn.mock.calls[0]?.[1])).toContain('web page');
    });

    it('is told apart from a glTF by what it holds, not by its name', async () => {
        const { model } = await load({ 'model.bin': bytes(`\ufeff# exported\n${QUAD}f 1 2 3\n`) }, 'model.bin');
        expect(model.status).toBe('ready');
        expect(model.parts).toHaveLength(1);
    });
});
