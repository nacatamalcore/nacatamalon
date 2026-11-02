import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createView, viewToWorld } from '../src/gameobjects/sprite_texture';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useWorldOffScreen } from '../src/hooks/camera/use_world_off_screen';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { ownerOf } from '../src/box/owner_of';
import { destroy } from '../src/destroy/destroy';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

/**
 * `createView`: a view of the world in a rectangle of the screen, the picture and the sprite showing
 * it made in one go.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const frameOf = (store: TRuntimeStore): TFrameContext => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx, 1 / 60);
    return ctx;
};
const screenOf = (ctx: TFrameContext): TRenderPass => ctx.passes[ctx.passes.length - 1]!;
const passFor = (ctx: TFrameContext, texture: TTexture): TRenderPass => ctx.passes.find((pass) => pass.renderTarget === texture.gpu)!;
const spritesOf = (pass: TRenderPass): TSprite[] => (pass.drawables ?? []).filter((item) => item.type === 'sprite') as TSprite[];

const keyed = (key: string): TTexture => ({ type: 'texture', key, src: `/${key}.png`, status: 'ready', width: 16, height: 16, gpu: { resourceType: 'texture' } }) as unknown as TTexture;
const HERO = keyed('hero');
const LABEL = keyed('label');
const MARKER = keyed('marker');

/**
 * A level with a hero, split in two halves, each looking through a camera of its own, with a marker
 * on the hero and its label pinned on it in a piece of its own.
 */
const split = () => {
    const { store } = createTestGame();
    let left!: TSprite;
    let right!: TSprite;
    const Label = (name: string) => {
        useScreenSpace();
        createSprite({ texture: LABEL, transform: { x: 4, y: 4 }, tint: { r: 1, g: 1, b: 1, a: name === 'P1' ? 1 : 0.5 } });
    };
    const Half = (x: number, name: string) => {
        const camera = useCamera2d({ zoom: 0.5 });
        camera.transform.x = x;
        createSprite({ texture: MARKER, transform: { x: 100, y: 50 } });
        useSpawn(Label)(name);
    };
    startTestScene(store, 'Level', () => {
        useWorldOffScreen();
        createSprite({ texture: HERO, transform: { x: 100, y: 50 } });
        left = createView({ x: 0, y: 0, width: 160, height: 120 }, Half, -50, 'P1');
        right = createView({ x: 160, y: 0, width: 160, height: 120 }, Half, 50, 'P2');
        return createScene();
    });
    return { store, left, right };
};

describe('createView', () => {
    it('shows a view of the world on the screen, pinned at its place and as big as asked', () => {
        const { store, left, right } = split();
        const screen = spritesOf(screenOf(frameOf(store)));

        expect(screen).toContain(left);
        expect(screen).toContain(right);
        expect([right.transform.x, right.transform.y]).toEqual([160, 0]);
        expect(right.anchor).toEqual({ x: 0, y: 0 });
        expect([right.texture!.width, right.texture!.height]).toEqual([160, 120]);
        // The world is off the screen: the hero is drawn only in the halves.
        expect(screen.some((sprite) => sprite.texture === HERO)).toBe(false);
    });

    it('draws the world and its marker through the camera its component asks for, and its label pinned on it', () => {
        const { store, left } = split();
        const pass = passFor(frameOf(store), left.texture!);
        // The camera each thing in the half is drawn through, or null for one pinned to the half.
        const cameraOf = (texture: TTexture) => {
            const i = (pass.drawables ?? []).findIndex((item) => (item as TSprite).texture === texture);
            const index = pass.cameraIndex![i]!;
            return index < 0 ? null : pass.cameras![index]!;
        };

        // Being shown from a piece pinned to the screen pins nothing of what the view draws.
        expect(cameraOf(HERO)?.zoom).toBe(0.5);
        expect(cameraOf(MARKER)?.zoom).toBe(0.5);
        expect(cameraOf(LABEL)).toBeNull();
        const labels = spritesOf(pass).filter((sprite) => sprite.texture === LABEL);
        expect(labels.map((sprite) => sprite.tint.a)).toEqual([1]);
    });

    it('is not seen in the other half, being pinned to the screen', () => {
        const { store, left, right } = split();
        const pass = passFor(frameOf(store), left.texture!);

        expect(spritesOf(pass).some((sprite) => sprite.texture === right.texture)).toBe(false);
    });

    it('hands back the sprite a click on the view is read through', () => {
        const { store, left } = split();
        frameOf(store);

        // 80 pixels into the left half, at zoom 0.5, from a camera moved to -50.
        const point = viewToWorld(left, { x: 80, y: 60 });
        expect(point.inside).toBe(true);
        expect(point.x).toBeCloseTo(-50 + 80 / 0.5);
    });

    it('is not drawn at all while its piece is hidden', () => {
        const { store, left } = split();
        ownerOf(left)!.visible = false;

        expect(frameOf(store).passes.some((pass) => pass.renderTarget === left.texture!.gpu)).toBe(false);
    });

    it('goes with its piece, picture and all', () => {
        const { store, left } = split();
        frameOf(store);
        const picture = left.texture!;

        destroy(ownerOf(left)!, { immediate: true });
        expect(picture.status).toBe('released');
        expect(spritesOf(screenOf(frameOf(store)))).not.toContain(left);
    });

    it('says so when it is not told where on the screen, or told what it sees', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            expect(() => createView({ x: Number.NaN, y: 0, width: 10, height: 10 })).toThrow('[NacatamalOn] createView');
            expect(() => createView({ x: 0, y: 0, width: 10, height: 10, sees: 'inside' } as never)).toThrow('always sees the world');
            return createScene();
        });
        expect(() => createView({ x: 0, y: 0, width: 10, height: 10 })).toThrow('createView');
    });
});
