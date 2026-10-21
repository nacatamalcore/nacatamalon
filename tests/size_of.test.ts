import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createNineSlice } from '../src/gameobjects/nine_slice/create_nine_slice';
import { boundsOf, sizeOf } from '../src/gameobjects/size_of';
import { textBlockSize } from '../src/gameobjects/text/expand_text';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import type { TFrameContext } from '../src/render';
import type { TTexture } from '../src/loaders';

/**
 * How big something drawn flat is, and where the rectangle it covers sits: what a box behind a label
 * and a coin after a score are laid out from.
 */

const picture = (width: number, height: number, status: 'ready' | 'loading' = 'ready'): TTexture => ({
    type: 'texture', key: `p${width}x${height}`, src: '/p.png', width: status === 'ready' ? width : 0, height: status === 'ready' ? height : 0, status, gpu: { resourceType: 'texture' },
} as unknown as TTexture);

/** What a scene body makes, measured in it. */
const inScene = <T>(body: () => T): T => {
    const { store } = createTestGame();
    let made!: T;
    startTestScene(store, 'Level', () => {
        made = body();
        return createScene();
    });
    return made;
};

describe('sizeOf', () => {
    it('is what a sprite was given, or else its picture, with its own scale', () => {
        const [given, ofPicture, grown] = inScene(() => [
            createSprite({ width: 10, height: 6 }),
            createSprite({ texture: picture(24, 32) }),
            createSprite({ texture: picture(24, 32), transform: { scaleX: 2, scaleY: -1 } }),
        ]);
        expect(sizeOf(given)).toEqual({ width: 10, height: 6 });
        expect(sizeOf(ofPicture)).toEqual({ width: 24, height: 32 });
        // Mirrored is no smaller.
        expect(sizeOf(grown)).toEqual({ width: 48, height: 32 });
    });

    it('measures nothing of a picture still on the way', () => {
        const sprite = inScene(() => createSprite({ texture: picture(24, 32, 'loading') }));
        expect(sizeOf(sprite)).toEqual({ width: 0, height: 0 });
    });

    it('measures a text the frame it is made, and the same as it is drawn', () => {
        const { store } = createTestGame();
        const font = createTestFont();
        let text!: ReturnType<typeof createText>;
        let before!: { width: number; height: number };
        startTestScene(store, 'Level', () => {
            text = createText({ text: 'ABC', font });
            // Asked before anything has been drawn.
            before = sizeOf(text);
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);

        expect(before.width).toBeGreaterThan(0);
        expect(before).toEqual(textBlockSize(text));
        // And it follows the words: a longer one is wider.
        text.text = 'ABCDE';
        expect(sizeOf(text).width).toBeGreaterThan(before.width);
    });

    it('measures a text in the font the engine carries, while that font is still on its way', () => {
        // No font given: the built-in one, which loads like any other and is not ready in the body.
        const [short, long] = inScene(() => [createText({ text: 'SCORE 0' }), createText({ text: 'SCORE 0000' })]);
        expect(short.font.status).not.toBe('ready');
        expect(sizeOf(short).width).toBeGreaterThan(0);
        expect(sizeOf(short).height).toBeGreaterThan(0);
        expect(sizeOf(long).width).toBeGreaterThan(sizeOf(short).width);
    });

    it('is a panel\'s width and height', () => {
        const panel = inScene(() => createNineSlice({ texture: picture(24, 24), slice: 8, width: 100, height: 40 }));
        expect(sizeOf(panel)).toEqual({ width: 100, height: 40 });
    });
});

describe('boundsOf', () => {
    it('starts a sprite from its middle and a text from its corner, as each is placed', () => {
        const font = createTestFont();
        const [sprite, text] = inScene(() => [
            createSprite({ width: 20, height: 10, transform: { x: 100, y: 50 } }),
            createText({ text: 'AB', font, transform: { x: 100, y: 50 } }),
        ] as const);
        expect(boundsOf(sprite)).toEqual({ x: 90, y: 45, width: 20, height: 10 });
        const { width, height } = sizeOf(text);
        expect(boundsOf(text)).toEqual({ x: 100, y: 50, width, height });
    });

    it('grows about the pivot, so a score anchored by its corner and grown from its middle stays centred', () => {
        const sprite = inScene(() => createSprite({
            width: 20, height: 10, anchor: { x: 0, y: 0 }, pivot: { x: 0.5, y: 0.5 }, transform: { x: 0, y: 0, scaleX: 2, scaleY: 2 },
        }));
        // Its middle stays at (10, 5); twice the size about it.
        expect(boundsOf(sprite)).toEqual({ x: -10, y: -5, width: 40, height: 20 });
    });

    it('lays out a coin just after a score, in the box they share', () => {
        const font = createTestFont();
        const [score, coin] = inScene(() => [
            createText({ text: 'ABC', font, transform: { x: 8, y: 8 } }),
            createSprite({ width: 8, height: 8, anchor: { x: 0, y: 0 } }),
        ] as const);
        const at = boundsOf(score);
        coin.transform.x = at.x + at.width + 4;
        coin.transform.y = at.y;
        expect(boundsOf(coin).x).toBe(8 + sizeOf(score).width + 4);
    });

    it('is the same rectangle mirrored', () => {
        const [plain, mirrored] = inScene(() => [
            createSprite({ width: 20, height: 10, transform: { x: 100, y: 50 } }),
            createSprite({ width: 20, height: 10, transform: { x: 100, y: 50, scaleX: -1 } }),
        ]);
        expect(boundsOf(mirrored)).toEqual(boundsOf(plain));
    });
});
