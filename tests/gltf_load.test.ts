import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { releaseAsset, whenLoaded } from '../src/loaders';
import { holdersOf } from '../src/loaders/asset_holds';
import { editorHandleOf, openHost } from '../src/game/handle/editor_handle_of';
import type { TGameInstance } from '../src/game/types/t_game_instance';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGlb, asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfModel, TTexture } from '../src/loaders';
import type { TTestModel } from './helpers/test_gltf';

/**
 * Reading a model file: both shapes it arrives in, the pieces it turns into, and where its corners
 * end up once the file's own tree has had its say.
 */

const ONE_PIECE: TTestModel = { nodes: [{ name: 'Body', primitives: [TEST_QUAD] }] };

/**
 * Loads a model and waits for it, the way a scene would across a couple of frames.
 */
const load = async (model: TTestModel | ArrayBuffer, options: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const files: Record<string, unknown> = { ...extra };
    let src = 'model.glb';
    if (model instanceof ArrayBuffer) {
        files[src] = model;
    } else {
        src = 'model.gltf';
        const { json, bin } = asGltf(model);
        files[src] = json;
        files['model.bin'] = bin;
    }

    const served = serveGltf(files);
    const { store } = createTestGame();
    let loaded: TGltfModel | null = null;
    startTestScene(store, 'Level', () => {
        loaded = useLoadGltf({ src, ...options });
        return createScene();
    });
    await whenLoaded(loaded as unknown as TGltfModel);
    return { model: loaded as unknown as TGltfModel, store, asked: served.asked, restore: served.restore };
};

afterEach(() => { mock.restore(); });

describe('useLoadGltf', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useLoadGltf({ src: 'a.gltf' })).toThrow('[NacatamalOn] useLoadGltf');
    });

    it('comes back at once, still loading, with nothing to draw yet', () => {
        serveGltf({ 'model.gltf': asGltf(ONE_PIECE).json, 'model.bin': asGltf(ONE_PIECE).bin });
        const { store } = createTestGame();
        let model: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: 'model.gltf' });
            return createScene();
        });

        expect(model!.status).toBe('loading');
        expect(model!.parts).toHaveLength(0);
    });

    it('turns one piece of the file into one part, on the graphics card', async () => {
        const { model } = await load(ONE_PIECE);

        expect(model.status).toBe('ready');
        expect(model.parts).toHaveLength(1);
        expect(model.parts[0].name).toBe('Body');
        expect(model.parts[0].geometry.vertexCount).toBe(4);
        expect(model.parts[0].geometry.indexCount).toBe(6);
        expect(model.parts[0].geometry.vertexBuffer).not.toBeNull();
    });

    it('reads the same model out of one binary file as out of two', async () => {
        const text = await load(ONE_PIECE);
        const binary = await load(asGlb(ONE_PIECE));

        expect(binary.model.status).toBe('ready');
        expect(binary.model.parts).toHaveLength(1);
        expect(Array.from(binary.model.parts[0].geometry.positions!))
            .toEqual(Array.from(text.model.parts[0].geometry.positions!));
        // The binary one names no neighbour: everything it needs came in the one request.
        expect(binary.asked).toEqual(['model.glb']);
    });

    it('draws every piece of a model that has several, each with its own surface', async () => {
        const { model } = await load({
            nodes: [
                { name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'Glass', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            materials: [
                { name: 'paint', baseColorFactor: [1, 0, 0, 1] },
                { name: 'window', baseColorFactor: [0, 0, 1, 0.5] },
            ],
        });

        expect(model.parts.map((part) => part.name)).toEqual(['Body', 'Glass']);
        expect(model.parts.map((part) => part.material)).toEqual(['paint', 'window']);
        expect(model.parts[0].tint).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        expect(model.parts[1].tint).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    });

    it('splits one mesh of several runs into one part each, which is what a shared surface cannot do', async () => {
        const { model } = await load({
            nodes: [{ name: 'Car', primitives: [{ ...TEST_QUAD, material: 0 }, { ...TEST_QUAD, material: 1 }] }],
            materials: [{ name: 'body', baseColorFactor: [1, 1, 0, 1] }, { name: 'glass', baseColorFactor: [0, 1, 1, 1] }],
        });

        expect(model.parts).toHaveLength(2);
        expect(model.parts[0].tint.r).toBe(1);
        expect(model.parts[1].tint.r).toBe(0);
        // Both came out of one piece of the file, so they share its name and the surface is the
        // only thing telling them apart. That is the ordinary case for a vehicle's glass.
        expect(model.parts.map((part) => part.name)).toEqual(['Car', 'Car']);
        expect(model.parts.map((part) => part.material)).toEqual(['body', 'glass']);
    });

    it('works the file tree into the corners, so one placement moves the whole model', async () => {
        const { model } = await load({
            nodes: [
                { name: 'Root', translation: [10, 0, 0], children: [1] },
                { name: 'Child', translation: [0, 5, 0], primitives: [TEST_QUAD] },
            ],
            roots: [0],
        });

        // The corner at the piece's own origin ends up at its parent's move plus its own.
        const positions = model.parts[0].geometry.positions!;
        expect(positions[0]).toBeCloseTo(10);
        expect(positions[1]).toBeCloseTo(5);
        expect(positions[2]).toBeCloseTo(0);
    });

    it('reads a placement given as a finished matrix', async () => {
        const { model } = await load({
            nodes: [{
                name: 'Moved',
                // Column by column, which is how the format writes one: a move of (3, 4, 5).
                matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1],
                primitives: [TEST_QUAD],
            }],
        });

        const positions = model.parts[0].geometry.positions!;
        expect([positions[0], positions[1], positions[2]]).toEqual([3, 4, 5]);
    });

    it('takes one named piece and leaves the rest', async () => {
        const { model } = await load({
            nodes: [{ name: 'Body', primitives: [TEST_QUAD] }, { name: 'Turret', primitives: [TEST_QUAD] }],
        }, { node: 'Turret' });

        expect(model.parts).toHaveLength(1);
        expect(model.parts[0].name).toBe('Turret');
    });

    it('says what the file does hold when the named piece is not in it', async () => {
        const warn = spyOnWarn();
        const { model } = await load({ nodes: [{ name: 'Body', primitives: [TEST_QUAD] }] }, { node: 'Turret' });

        expect(model.status).toBe('error');
        expect(warn.messages.join(' ')).toContain('Body');
        warn.restore();
    });

    it('asks for the same file once however many scenes want it', async () => {
        const { json, bin } = asGltf(ONE_PIECE);
        const served = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let first: TGltfModel | null = null;
        let second: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            first = useLoadGltf({ src: 'model.gltf' });
            second = useLoadGltf({ src: 'model.gltf' });
            return createScene();
        });
        await whenLoaded(first as unknown as TGltfModel);

        expect(second).toBe(first);
        expect(served.asked.filter((url) => url === 'model.gltf')).toHaveLength(1);
        served.restore();
    });

    it('never throws when the file is not there: it says so and draws nothing', async () => {
        const warn = spyOnWarn();
        const served = serveGltf({});
        const { store } = createTestGame();
        let model: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: 'missing.gltf' });
            return createScene();
        });
        await whenLoaded(model as unknown as TGltfModel);

        expect(model!.status).toBe('error');
        expect(warn.messages.join(' ')).toContain('missing.gltf');
        warn.restore();
        served.restore();
    });
});

describe('pictures', () => {
    it('works a picture path out against the file that named it, and shares one upload between pieces', async () => {
        const { json, bin } = asGltf({
            nodes: [
                { name: 'A', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'B', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            materials: [{ image: 'textures/atlas.png' }, { image: 'textures/atlas.png' }],
        });
        const served = serveGltf({
            'models/tower.gltf': json,
            'models/model.bin': bin,
            'models/textures/atlas.png': 'png',
        });
        const { store } = createTestGame();
        let model: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: 'models/tower.gltf' });
            return createScene();
        });
        await whenLoaded(model as unknown as TGltfModel);

        expect(model!.status).toBe('ready');
        expect(model!.parts[0].texture).toBe(model!.parts[1].texture!);
        expect(served.asked.filter((url) => url.endsWith('.png'))).toEqual(['/models/textures/atlas.png']);
        served.restore();
    });

    it('keeps a glow and the picture that masks it, so only the masked part lights up', async () => {
        const lit = await load({
            nodes: [{ name: 'Sign', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ emissiveFactor: [1, 1, 1] }],
        });
        expect(lit.model.parts[0].emissive).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(lit.model.parts[0].emissiveTexture).toBeNull();

        const masked = await load(
            {
                nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
                materials: [{ image: 'bottle.png', emissiveFactor: [1, 1, 1], emissiveImage: 'logo.png' }],
            },
            {},
            { 'bottle.png': 'png', 'logo.png': 'png' },
        );
        const [bottle] = masked.model.parts;
        expect(bottle.emissive).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(bottle.emissiveTexture).not.toBeNull();
        expect(bottle.emissiveTexture).not.toBe(bottle.texture);
        expect(masked.asked.filter((url) => url.endsWith('.png')).sort()).toEqual(['/bottle.png', '/logo.png']);
    });

    it('fetches no glow picture when asked for no pictures, and drops the glow it masked', async () => {
        const { model, asked } = await load(
            {
                nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
                materials: [{ emissiveFactor: [1, 1, 1], emissiveImage: 'logo.png' }],
            },
            { textures: false },
            { 'logo.png': 'png' },
        );
        expect(model.parts[0].emissiveTexture).toBeNull();
        // And the glow it masked is dropped, rather than lighting the whole bottle.
        expect(model.parts[0].emissive).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(asked.filter((url) => url.endsWith('.png'))).toEqual([]);
    });

    it('scales a glow by the strength the file asks for', async () => {
        const { model } = await load({
            nodes: [{ name: 'Lava', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ emissiveFactor: [0.5, 0, 0], emissiveStrength: 4 }],
        });

        // 0.5 × 4 = 2 in linear light, which the screen curve turns into 1.3533.
        expect(model.parts[0].emissive.r).toBeCloseTo(1.3533, 4);
    });

    it('leaves every piece in its plain colour when asked for no pictures', async () => {
        const { model, asked } = await load(
            { nodes: [{ name: 'A', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ image: 'atlas.png' }] },
            { textures: false },
        );

        expect(model.parts[0].texture).toBeNull();
        expect(asked.some((url) => url.endsWith('.png'))).toBe(false);
    });

    it('reads a picture kept inside a binary model, fetching nothing at all', async () => {
        const glb = asGlb({
            nodes: [{ name: 'A', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ embeddedImage: 'png-bytes' }],
        });
        const { model, asked } = await load(glb);

        expect(model.status).toBe('ready');
        expect(model.parts[0].texture?.status).toBe('ready');
        // The whole model came in one request: no sheet beside it, no second round trip.
        expect(asked).toEqual(['model.glb']);
    });
});

describe('a picture kept inside a model file, the same in more than one', () => {
    /**
     * Several binary models loaded into one game, each from the materials given.
     */
    const loadAll = async (files: Record<string, Array<{ embeddedImage: string }>>) => {
        const served = serveGltf(Object.fromEntries(Object.entries(files).map(([name, materials]) => [name, asGlb({
            nodes: materials.map((_, i) => ({ name: `Part${i}`, primitives: [{ ...TEST_QUAD, material: i }] })),
            materials,
        })])));
        try {
            const { store } = createTestGame();
            const models: TGltfModel[] = [];
            startTestScene(store, 'Shop', () => {
                for (const name of Object.keys(files)) models.push(useLoadGltf({ src: name }));
                return createScene();
            });
            for (const model of models) await whenLoaded(model);
            // Every record once, whichever names it is kept under.
            const pictures = new Set(store.get('assets').textures.values());
            return { models, pictures };
        } finally {
            served.restore();
        }
    };

    it('goes up once when two files carry it', async () => {
        const { models, pictures } = await loadAll({ 'crate.glb': [{ embeddedImage: 'sheet' }], 'barrel.glb': [{ embeddedImage: 'sheet' }] });

        expect(models.map((model) => model.status)).toEqual(['ready', 'ready']);
        expect(models[0]!.parts[0]!.texture).toBe(models[1]!.parts[0]!.texture);
        expect(models[0]!.parts[0]!.texture?.status).toBe('ready');
        expect(pictures.size).toBe(1);
        // Named after the first model that brought it, which is what a message about it can say.
        expect(models[0]!.parts[0]!.texture?.key).toMatch(/#image:/);
    });

    it('goes up once when one file carries it twice', async () => {
        const { models, pictures } = await loadAll({ 'shelf.glb': [{ embeddedImage: 'sheet' }, { embeddedImage: 'sheet' }] });

        expect(models[0]!.parts[0]!.texture).toBe(models[0]!.parts[1]!.texture);
        expect(pictures.size).toBe(1);
    });

    it('stays for the model still wearing it when the other is let go of', async () => {
        const served = serveGltf({
            'crate.glb': asGlb({ nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ embeddedImage: 'sheet' }] }),
            'barrel.glb': asGlb({ nodes: [{ name: 'Barrel', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ embeddedImage: 'sheet' }] }),
        });
        try {
            const { store } = createTestGame();
            let crate!: TGltfModel;
            let barrel!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                crate = useLoadGltf({ src: 'crate.glb' });
                barrel = useLoadGltf({ src: 'barrel.glb' });
                return createScene();
            });
            await whenLoaded(crate);
            await whenLoaded(barrel);
            const sheet = barrel.parts[0]!.texture!;

            expect(releaseAsset(store, crate)).toBe(true);
            expect(crate.status).toBe('released');
            expect(sheet.status).toBe('ready');
            expect(sheet.gpu).not.toBeNull();

            // And goes with the last one wearing it.
            releaseAsset(store, barrel);
            expect(sheet.status).toBe('released');
            expect(sheet.gpu).toBeNull();
        } finally {
            served.restore();
        }
    });

    it('stays for a model still loading that has already found it', async () => {
        // The barrel finds the shared sheet, then waits for a picture of its own beside it: its parts
        // are not out yet when the crate is let go of.
        const served = serveGltf({
            'crate.glb': asGlb({ nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ embeddedImage: 'sheet' }] }),
            'barrel.glb': asGlb({
                nodes: [{ name: 'Lid', primitives: [{ ...TEST_QUAD, material: 0 }] }, { name: 'Body', primitives: [{ ...TEST_QUAD, material: 1 }] }],
                materials: [{ embeddedImage: 'sheet' }, { image: 'slow.png' }],
            }),
            'slow.png': 'png',
        });
        const answered = globalThis.fetch;
        let letThrough!: () => void;
        const gate = new Promise<void>((resolve) => { letThrough = resolve; });
        globalThis.fetch = (async (input: string) => {
            if (String(input).includes('slow.png')) await gate;
            return answered(input);
        }) as typeof fetch;
        try {
            const { store } = createTestGame();
            let crate!: TGltfModel;
            let barrel!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                crate = useLoadGltf({ src: 'crate.glb' });
                barrel = useLoadGltf({ src: 'barrel.glb' });
                return createScene();
            });
            await whenLoaded(crate);
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            expect(barrel.status).toBe('loading');

            releaseAsset(store, crate);
            letThrough();
            await whenLoaded(barrel);

            expect(barrel.status).toBe('ready');
            expect(barrel.parts[0]!.texture?.status).toBe('ready');
            expect(barrel.parts[0]!.texture?.gpu).not.toBeNull();
        } finally {
            globalThis.fetch = answered;
            served.restore();
        }
    });

    it('stays let go of when it was let go of while it was on its way', async () => {
        const served = serveGltf({
            'crate.glb': asGlb({ nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ embeddedImage: 'sheet' }] }),
        });
        try {
            const { store } = createTestGame();
            let crate!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                crate = useLoadGltf({ src: 'crate.glb' });
                return createScene();
            });
            const geometries = store.get('assets').geometries.size;
            expect(releaseAsset(store, crate)).toBe(true);
            await whenLoaded(crate);
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));

            expect(crate.status).toBe('released');
            expect(crate.parts).toEqual([]);
            expect(store.get('assets').geometries.size).toBe(geometries);
        } finally {
            served.restore();
        }
    });

    it('leaves no shapes behind when let go of while waiting for a picture of its second piece', async () => {
        const served = serveGltf({
            'barrel.glb': asGlb({
                nodes: [{ name: 'Lid', primitives: [{ ...TEST_QUAD, material: 0 }] }, { name: 'Body', primitives: [{ ...TEST_QUAD, material: 1 }] }],
                materials: [{}, { image: 'slow.png' }],
            }),
            'slow.png': 'png',
        });
        const answered = globalThis.fetch;
        let letThrough!: () => void;
        const gate = new Promise<void>((resolve) => { letThrough = resolve; });
        globalThis.fetch = (async (input: string) => {
            if (String(input).includes('slow.png')) await gate;
            return answered(input);
        }) as typeof fetch;
        try {
            const { store } = createTestGame();
            let barrel!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                barrel = useLoadGltf({ src: 'barrel.glb' });
                return createScene();
            });
            const geometries = store.get('assets').geometries.size;
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            expect(barrel.status).toBe('loading');

            releaseAsset(store, barrel);
            letThrough();
            await whenLoaded(barrel);
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));

            expect(barrel.status).toBe('released');
            expect(barrel.parts).toEqual([]);
            expect(store.get('assets').geometries.size).toBe(geometries);
        } finally {
            globalThis.fetch = answered;
            served.restore();
        }
    });

    it('takes with it the pictures it had found, and the one on its way, and asks for no more', async () => {
        const served = serveGltf({
            'barrel.glb': asGlb({
                nodes: [
                    { name: 'Lid', primitives: [{ ...TEST_QUAD, material: 0 }] },
                    { name: 'Body', primitives: [{ ...TEST_QUAD, material: 1 }] },
                    { name: 'Base', primitives: [{ ...TEST_QUAD, material: 2 }] },
                ],
                materials: [{ embeddedImage: 'sheet' }, { image: 'slow.png' }, { image: 'never.png' }],
            }),
            'slow.png': 'png',
            'never.png': 'png',
        });
        const answered = globalThis.fetch;
        const asked: string[] = [];
        let letThrough!: () => void;
        const gate = new Promise<void>((resolve) => { letThrough = resolve; });
        globalThis.fetch = (async (input: string) => {
            asked.push(String(input));
            if (String(input).includes('slow.png')) await gate;
            return answered(input);
        }) as typeof fetch;
        try {
            const { store } = createTestGame();
            let barrel!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                barrel = useLoadGltf({ src: 'barrel.glb' });
                return createScene();
            });
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            const found = [...new Set(store.get('assets').textures.values())];
            expect(found.length).toBe(2);

            releaseAsset(store, barrel);
            letThrough();
            await whenLoaded(barrel);
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));

            for (const texture of found) {
                expect(texture.status).toBe('released');
                expect(texture.gpu).toBeNull();
            }
            expect(store.get('assets').textures.size).toBe(0);
            expect(asked.some((src) => src.includes('never.png'))).toBe(false);
        } finally {
            globalThis.fetch = answered;
            served.restore();
        }
    });

    it('leaves a picture it had found for another model still wearing it, when let go of on the way', async () => {
        const served = serveGltf({
            'crate.glb': asGlb({ nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ embeddedImage: 'sheet' }] }),
            'barrel.glb': asGlb({
                nodes: [{ name: 'Lid', primitives: [{ ...TEST_QUAD, material: 0 }] }, { name: 'Body', primitives: [{ ...TEST_QUAD, material: 1 }] }],
                materials: [{ embeddedImage: 'sheet' }, { image: 'slow.png' }],
            }),
            'slow.png': 'png',
        });
        const answered = globalThis.fetch;
        let letThrough!: () => void;
        const gate = new Promise<void>((resolve) => { letThrough = resolve; });
        globalThis.fetch = (async (input: string) => {
            if (String(input).includes('slow.png')) await gate;
            return answered(input);
        }) as typeof fetch;
        try {
            const { store } = createTestGame();
            let crate!: TGltfModel;
            let barrel!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                crate = useLoadGltf({ src: 'crate.glb' });
                barrel = useLoadGltf({ src: 'barrel.glb' });
                return createScene();
            });
            await whenLoaded(crate);
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));

            releaseAsset(store, barrel);
            letThrough();
            await whenLoaded(barrel);

            const sheet = crate.parts[0]!.texture!;
            expect(sheet.status).toBe('ready');
            expect(sheet.gpu).not.toBeNull();
        } finally {
            globalThis.fetch = answered;
            served.restore();
        }
    });

    it('can be let go of after failing to load', async () => {
        const served = serveGltf({
            'bad.gltf': { asset: { version: '2.0' }, buffers: [{ uri: 'bad.bin', byteLength: 4 }], nodes: [{ name: 'Rock', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 9 } }] }] },
        });
        const warn = console.warn;
        console.warn = () => {};
        try {
            const { store } = createTestGame();
            let bad!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                bad = useLoadGltf({ src: 'bad.gltf' });
                return createScene();
            });
            await whenLoaded(bad);
            expect(bad.status).toBe('error');
            expect(releaseAsset(store, bad)).toBe(true);
            expect(bad.status).toBe('released');
        } finally {
            console.warn = warn;
            served.restore();
        }
    });

    /**
     * A tower whose first piece wears `atlas.png` and whose second points at a picture inside the file
     * that is not there, so the file fails once the first picture has been found.
     */
    const failsAfterAPicture = () => {
        const { json, bin } = asGltf({
            nodes: [
                { name: 'A', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'B', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            materials: [{ image: 'atlas.png' }, { embeddedImage: 'sheet' }],
        });
        (json as { images: Array<{ bufferView?: number }> }).images[1]!.bufferView = 99;
        return serveGltf({ 'tower.gltf': json, 'model.bin': bin, 'atlas.png': 'png' });
    };

    it('holds no picture of the game\'s once it has failed', async () => {
        const served = failsAfterAPicture();
        const warn = console.warn;
        console.warn = () => {};
        try {
            const { store } = createTestGame();
            let atlas!: TTexture;
            let tower!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                atlas = useLoadTexture({ src: 'atlas.png' });
                tower = useLoadGltf({ src: 'tower.gltf' });
                return createScene();
            });
            await whenLoaded(tower);
            expect(tower.status).toBe('error');

            releaseAsset(store, atlas);
            expect(atlas.status).toBe('released');
        } finally {
            console.warn = warn;
            served.restore();
        }
    });

    it('lets a picture the game let go of on the way go, once it has failed', async () => {
        const served = failsAfterAPicture();
        // The picture held back, so the game lets go of it while the model still wears it.
        let open!: () => void;
        const held = new Promise<void>((done) => { open = done; });
        Object.assign(globalThis, { createImageBitmap: async () => { await held; return { width: 4, height: 4, close: () => {} }; } });
        const warn = console.warn;
        console.warn = () => {};
        try {
            const { store } = createTestGame();
            let atlas!: TTexture;
            let tower!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                atlas = useLoadTexture({ src: 'atlas.png' });
                tower = useLoadGltf({ src: 'tower.gltf' });
                return createScene();
            });
            while (!holdersOf(atlas).includes(tower)) {
                await new Promise((done) => setTimeout(done, 0));
            }
            releaseAsset(store, atlas);
            expect(atlas.status).not.toBe('released');

            open();
            await whenLoaded(tower);
            expect(tower.status).toBe('error');
            expect(atlas.status).toBe('released');
            expect(atlas.gpu).toBeNull();
        } finally {
            console.warn = warn;
            served.restore();
        }
    });

    it('still takes the pictures it sent for itself when let go of after failing', async () => {
        const served = failsAfterAPicture();
        const warn = console.warn;
        console.warn = () => {};
        try {
            const { store } = createTestGame();
            let tower!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                tower = useLoadGltf({ src: 'tower.gltf' });
                return createScene();
            });
            await whenLoaded(tower);
            const atlas = [...store.get('assets').textures.values()].find((texture) => texture.src.endsWith('atlas.png'))!;
            expect(atlas.status).toBe('ready');

            releaseAsset(store, tower);
            expect(atlas.status).toBe('released');
        } finally {
            console.warn = warn;
            served.restore();
        }
    });

    it('still takes the pictures it sent for itself when taken out by the editor after failing', async () => {
        const served = failsAfterAPicture();
        const warn = console.warn;
        console.warn = () => {};
        try {
            const { store } = createTestGame();
            let tower!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                tower = useLoadGltf({ src: 'tower.gltf' });
                return createScene();
            });
            await whenLoaded(tower);
            expect(tower.status).toBe('error');
            const atlas = [...store.get('assets').textures.values()].find((texture) => texture.src.endsWith('atlas.png'))!;
            const instance: TGameInstance = { destroy: () => {}, on: () => () => {} };
            openHost(instance).resolve(store);
            const editor = await editorHandleOf(instance);

            expect(editor.evictAsset(tower.key)).toBe(true);
            editor.releaseForgotten();
            expect(atlas.status).toBe('released');
        } finally {
            console.warn = warn;
            served.restore();
        }
    });

    /**
     * A model taken out by the editor once it has its first picture, while the second is still on
     * its way; `alsoTheGame` has the game load the first picture itself too.
     */
    const takenOutWhileLoading = async (alsoTheGame: boolean) => {
        const { json, bin } = asGltf({
            nodes: [
                { name: 'A', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'B', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            materials: [{ image: 'atlas.png' }, { image: 'slow.png' }],
        });
        const served = serveGltf({ 'tower.gltf': json, 'model.bin': bin, 'atlas.png': 'png', 'slow.png': 'png' });
        // The second picture is held back, so the model is still on its way once it has the first.
        let letThrough!: () => void;
        const held = new Promise<void>((resolve) => { letThrough = resolve; });
        const answer = globalThis.fetch;
        globalThis.fetch = (async (input: string) => {
            if (String(input).endsWith('slow.png')) {
                await held;
            }
            return answer(input);
        }) as unknown as typeof fetch;
        try {
            const { store } = createTestGame();
            let tower!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                if (alsoTheGame) {
                    useLoadTexture({ src: 'atlas.png' });
                }
                tower = useLoadGltf({ src: 'tower.gltf' });
                return createScene();
            });
            const textures = store.get('assets').textures;
            const named = (end: string) => [...textures.values()].find((texture) => texture.src.endsWith(end));
            while (named('slow.png') === undefined) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            const atlas = named('atlas.png')!;
            const slow = named('slow.png')!;
            expect(atlas.status).toBe('ready');
            expect(tower.status).toBe('loading');
            const instance: TGameInstance = { destroy: () => {}, on: () => () => {} };
            openHost(instance).resolve(store);
            const editor = await editorHandleOf(instance);

            expect(editor.evictAsset(tower.key)).toBe(true);
            editor.releaseForgotten();
            letThrough();
            await whenLoaded(tower);
            await whenLoaded(slow);
            return { atlas, slow };
        } finally {
            globalThis.fetch = answer;
            served.restore();
        }
    };

    it('takes the pictures it sent for itself when taken out by the editor while still loading', async () => {
        const { atlas, slow } = await takenOutWhileLoading(false);
        expect(atlas.status).toBe('released');
        // The one still on its way when it went never reaches the card.
        expect(slow.status).toBe('released');
        expect(slow.gpu).toBeNull();
    });

    it('leaves a picture the game asked for itself when the editor takes out a model still loading', async () => {
        const { atlas, slow } = await takenOutWhileLoading(true);
        expect(atlas.status).toBe('ready');
        expect(slow.status).toBe('released');
    });

    it('keeps a shape it is made of, let go of by the game, until the model goes', async () => {
        const served = serveGltf({ 'crate.glb': asGlb({ nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD }] }] }) });
        try {
            const { store } = createTestGame();
            let crate!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                crate = useLoadGltf({ src: 'crate.glb' });
                return createScene();
            });
            await whenLoaded(crate);
            const shape = crate.parts[0]!.geometry;

            expect(releaseAsset(store, shape)).toBe(true);
            expect(shape.status).toBe('ready');

            releaseAsset(store, crate);
            expect(shape.status).toBe('released');
        } finally {
            served.restore();
        }
    });

    it('says nothing about a file let go of that then could not be fetched', async () => {
        const served = serveGltf({});
        const warn = mock();
        const original = console.warn;
        console.warn = warn;
        try {
            const { store } = createTestGame();
            let crate!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                crate = useLoadGltf({ src: 'nowhere.glb' });
                return createScene();
            });
            releaseAsset(store, crate);
            await whenLoaded(crate);
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));

            expect(crate.status).toBe('released');
            expect(warn).not.toHaveBeenCalled();
        } finally {
            console.warn = original;
            served.restore();
        }
    });

    it('forgets a model that wore it once it is let go of, however often that happens', async () => {
        const served = serveGltf({
            'crate.glb': asGlb({ nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ embeddedImage: 'sheet' }] }),
            'barrel.glb': asGlb({ nodes: [{ name: 'Barrel', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ embeddedImage: 'sheet' }] }),
        });
        try {
            const { store } = createTestGame();
            let crate!: TGltfModel;
            startTestScene(store, 'Shop', () => {
                crate = useLoadGltf({ src: 'crate.glb' });
                return createScene();
            });
            await whenLoaded(crate);
            const sheet = crate.parts[0]!.texture!;

            // A barrel brought in and let go of, again and again, while the crate keeps the sheet.
            for (let round = 0; round < 5; round++) {
                let barrel!: TGltfModel;
                startTestScene(store, `Aisle${round}`, () => {
                    barrel = useLoadGltf({ src: 'barrel.glb' });
                    return createScene();
                });
                await whenLoaded(barrel);
                expect(barrel.parts[0]!.texture).toBe(sheet);
                releaseAsset(store, barrel);
            }

            expect(sheet.status).toBe('ready');
            expect(holdersOf(sheet)).toEqual([crate]);
        } finally {
            served.restore();
        }
    });

    it('goes up twice when the pictures differ, even by one byte', async () => {
        const { models, pictures } = await loadAll({ 'crate.glb': [{ embeddedImage: 'sheet-a' }], 'barrel.glb': [{ embeddedImage: 'sheet-b' }] });

        expect(models[0]!.parts[0]!.texture).not.toBe(models[1]!.parts[0]!.texture);
        expect(pictures.size).toBe(2);
    });
});

/**
 * Catches the warnings a loader writes, so a test can read them instead of the console.
 */
const spyOnWarn = (): { messages: string[]; restore: () => void } => {
    const messages: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => { messages.push(args.map(String).join(' ')); };
    return { messages, restore: () => { console.warn = original; } };
};
