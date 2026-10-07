import { describe, expect, it } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createPixelTexture, updatePixelTexture } from '../src/gameobjects/pixel_texture';
import { createPixels, fillRect, fillGradient } from '../src/pixels';
import { encodePng } from '../src/pixels/encode_png';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { serializeScene } from '../src/scene/document';
import { stopScene } from '../src/scene/stop_scene';
import { startScene } from '../src/scene/start_scene';
import { registerScene } from '../src/scene/register_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TTexture } from '../src/loaders';

/**
 * A picture painted in code turned into a texture: what the game gets, how long it lives, and what
 * reaches the graphics card when it changes.
 */

const RED = { r: 1, g: 0, b: 0, a: 1 };

describe('createPixelTexture', () => {
    it('gives back a texture that is ready at once, the size of the picture', () => {
        const { store } = createTestGame();
        let texture!: TTexture;
        startTestScene(store, 'S', () => {
            texture = createPixelTexture(createPixels(12, 7, RED));
            return createScene();
        });

        expect(texture.status).toBe('ready');
        expect([texture.width, texture.height]).toEqual([12, 7]);
        expect(texture.gpu).not.toBeNull();
        // Listed with the game's textures, so `createSprite({ key })` finds it like a loaded one.
        expect(store.get('assets').textures.get(texture.key)).toBe(texture);
    });

    it('lets one with no name go when its scene stops', () => {
        const { store, renderer } = createTestGame();
        let texture!: TTexture;
        startTestScene(store, 'S', () => {
            texture = createPixelTexture(createPixels(4, 4));
            return createScene();
        });
        const gpu = texture.gpu;

        stopScene(store, 'S');

        expect(renderer.destroyedTextures).toEqual([gpu!]);
        expect(texture.gpu).toBeNull();
        expect(store.get('assets').textures.has(texture.key)).toBe(false);
    });

    it('keeps one with a name, and gives it back with the new picture when asked again', () => {
        const { store, renderer } = createTestGame();
        const made: TTexture[] = [];
        registerScene(store, 'Room', () => {
            made.push(createPixelTexture(createPixels(8, 8, RED), { key: 'floor' }));
            return createScene();
        });
        for (let restart = 0; restart < 3; restart++) {
            startScene(store, 'Room');
            stopScene(store, 'Room');
        }

        // One texture for three starts: no pile of copies on the graphics card.
        expect(new Set(made).size).toBe(1);
        expect(renderer.destroyedTextures).toEqual([]);
        // The two later starts upload their picture into it.
        expect(renderer.dataUpdates).toHaveLength(2);
    });

    it('makes a new one when the same name comes back at another size', () => {
        const { store, renderer } = createTestGame();
        let first!: TTexture;
        let second!: TTexture;
        startTestScene(store, 'S', () => {
            first = createPixelTexture(createPixels(8, 8), { key: 'map' });
            second = createPixelTexture(createPixels(16, 8), { key: 'map' });
            return createScene();
        });

        expect(second).not.toBe(first);
        expect(second.width).toBe(16);
        expect(first.gpu).toBeNull();
        expect(renderer.destroyedTextures).toHaveLength(1);
    });

    it('will not take the name of an image loaded from a file', () => {
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'S', () => {
            useLoadTexture({ src: '/hero.png', key: 'hero' });
            createPixelTexture(createPixels(4, 4), { key: 'hero' });
            return createScene();
        })).toThrow(/already the name of another texture/);
    });

    it('must be made inside a scene', () => {
        expect(() => createPixelTexture(createPixels(1, 1))).toThrow(/inside a scene body/);
    });
});

describe('updatePixelTexture', () => {
    const made = () => {
        const { store, renderer } = createTestGame();
        const pixels = createPixels(10, 6);
        let texture!: TTexture;
        startTestScene(store, 'S', () => {
            texture = createPixelTexture(pixels);
            return createScene();
        });
        return { renderer, pixels, texture };
    };

    it('sends the whole picture when no rectangle is given', () => {
        const { renderer, pixels, texture } = made();
        fillRect(pixels, 0, 0, 10, 6, RED);

        updatePixelTexture(texture);

        expect(renderer.dataUpdates).toEqual([{ texture: texture.gpu!, width: 10, height: 6, region: undefined }]);
    });

    it('sends only the rectangle asked for, cut to the picture', () => {
        const { renderer, texture } = made();

        updatePixelTexture(texture, { x: 7, y: -2, width: 6, height: 4 });

        expect(renderer.dataUpdates[0]!.region).toEqual({ x: 7, y: 0, width: 3, height: 2 });
    });

    it('sends nothing for a rectangle wholly outside', () => {
        const { renderer, texture } = made();
        updatePixelTexture(texture, { x: 20, y: 0, width: 4, height: 4 });
        expect(renderer.dataUpdates).toHaveLength(0);
    });

    it('refuses a texture it did not make', () => {
        const { store } = createTestGame();
        let loaded!: TTexture;
        startTestScene(store, 'S', () => {
            loaded = useLoadTexture({ src: '/hero.png' });
            return createScene();
        });
        expect(() => updatePixelTexture(loaded)).toThrow(/not made by createPixelTexture/);
    });
});

describe('a scene document', () => {
    it('names a painted texture but does not list it as a file to load', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createSprite({ texture: createPixelTexture(createPixels(4, 4, RED), { key: 'badge' }) });
            createSprite({ texture: useLoadTexture({ src: '/hero.png', key: 'hero' }) });
            return createScene();
        });

        const doc = serializeScene(store.get('world').scenes[0]!);

        // The loaded image is listed with its file; the painted one has no file to list.
        expect(doc.assets.filter((asset) => asset.type === 'texture').map((asset) => asset.key)).toEqual(['hero']);
        const sprites = doc.root.components.filter((component) => component.type === 'sprite');
        expect(sprites.map((sprite) => (sprite as { texture: string | null }).texture)).toEqual(['badge', 'hero']);
    });
});

describe('encodePng', () => {
    /**
     * The chunks of a PNG by type, with each chunk's CRC checked against its bytes.
     */
    const chunksOf = (png: Uint8Array) => {
        const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
        const chunks: { type: string; body: Uint8Array }[] = [];
        let at = 8;
        while (at < png.length) {
            const length = view.getUint32(at);
            const type = String.fromCharCode(...png.slice(at + 4, at + 8));
            const crc = view.getUint32(at + 8 + length);
            // An independent CRC32, bit by bit, so the check does not share the table being tested.
            let c = 0xffffffff;
            for (const byte of png.slice(at + 4, at + 8 + length)) {
                c ^= byte;
                for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
            }
            expect(crc).toBe((c ^ 0xffffffff) >>> 0);
            chunks.push({ type, body: png.slice(at + 8, at + 8 + length) });
            at += 12 + length;
        }
        return chunks;
    };

    it('writes a PNG that any reader decodes back to the same pixels', () => {
        // Tall enough for the image data to need more than one stored block.
        const pixels = fillGradient(createPixels(130, 140), { from: RED, to: { r: 0, g: 0, b: 1, a: 0.5 }, bands: 6 });
        const png = encodePng(pixels);

        expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const chunks = chunksOf(png);
        expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);

        const header = new DataView(chunks[0]!.body.buffer, chunks[0]!.body.byteOffset);
        expect([header.getUint32(0), header.getUint32(4), chunks[0]!.body[8], chunks[0]!.body[9]]).toEqual([130, 140, 8, 6]);

        // zlib checks the stream's own checksum as it inflates.
        const raw = inflateSync(chunks[1]!.body);
        const row = 130 * 4;
        for (let y = 0; y < 140; y++) {
            expect(raw[y * (row + 1)]).toBe(0);
            expect([...raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1))]).toEqual([...pixels.data.subarray(y * row, (y + 1) * row)]);
        }
    });
});
