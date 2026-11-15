import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createShapes } from '../src/gameobjects/shapes';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useDraggable } from '../src/hooks/input/use_draggable';
import { useDropZone } from '../src/hooks/input/use_drop_zone';
import { useTag } from '../src/hooks/tags/use_tag';
import { useMask } from '../src/hooks/mask/use_mask';
import { usePointer } from '../src/hooks/input/use_pointer';
import { createPolygon } from '../src/gameobjects/polygon';
import { listen } from '../src/events';
import { pickTargets } from '../src/input/pick_targets';
import { destroy, flushDestroyed } from '../src/destroy';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TShapes } from '../src/gameobjects/shapes';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TBox } from '../src/box';

const at = (x: number, y: number, rotation = 0, scale = 1) => ({ x, y, rotation, scaleX: scale, scaleY: scale });

/** A game on a 480x320 canvas, with a click, a hover and a drag in game pixels. */
const pointerGame = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({}, canvas);
    const fire = (type: string, x: number, y: number) => {
        canvas.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse' }));
    };
    const frame = () => store.get('input').pointer.dispatch(store);
    const click = (x: number, y: number) => { fire('pointerdown', x, y); fire('pointerup', x, y); frame(); };
    const hover = (x: number, y: number) => { fire('pointermove', x, y); frame(); };
    return { store, fire, frame, click, hover };
};

/** A button: a filled rounded rectangle 60x20 from its top-left, and an outlined ring beside it. */
const button = (x: number, y: number): TShapes => createShapes({
    transform: at(x, y),
    shapes: [
        { type: 'rect', x: 0, y: 0, width: 60, height: 20, radius: 4, fill: '#e15554' },
        { type: 'circle', x: 90, y: 10, radius: 10, stroke: { width: 2, color: '#ffffff' } },
    ],
});

describe('the pointer on shapes', () => {
    it('finds a set of shapes where it is drawn, filled or outlined, and nowhere else', () => {
        const { store } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Menu', () => { shapes = button(100, 100); return createScene(); });

        expect(pickTargets(store, 130, 110)).toEqual([shapes]);  // inside the rectangle
        expect(pickTargets(store, 190, 100.5)).toEqual([shapes]); // on the ring's outline
        expect(pickTargets(store, 190, 110)).toEqual([]);         // inside the ring, which is not filled
        expect(pickTargets(store, 170, 110)).toEqual([]);         // between them
        expect(pickTargets(store, 100.2, 100.2)).toEqual([]);     // the rounded corner cut away
    });

    it('follows the turn and the scale of its transform', () => {
        const { store } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Menu', () => {
            // Turned a quarter about 100, 100 and twice as big: the rectangle runs down, to the left.
            shapes = createShapes({ transform: at(100, 100, Math.PI / 2, 2), shapes: [{ type: 'rect', x: 0, y: 0, width: 60, height: 20, fill: '#ffffff' }] });
            return createScene();
        });

        expect(pickTargets(store, 80, 200)).toEqual([shapes]);
        expect(pickTargets(store, 130, 110)).toEqual([]);
    });

    it('is in its place among the rest: under a sprite drawn over it, over one drawn under it', () => {
        const { store } = createTestGame();
        let shapes!: TShapes;
        let below!: TSprite;
        let above!: TSprite;
        startTestScene(store, 'Menu', () => {
            below = createSprite({ width: 200, height: 200, transform: at(130, 110), zIndex: 0 });
            shapes = createShapes({ zIndex: 1, transform: at(100, 100), shapes: [{ type: 'rect', x: 0, y: 0, width: 60, height: 20, fill: '#ffffff' }] });
            above = createSprite({ width: 10, height: 10, transform: at(110, 110), zIndex: 2 });
            return createScene();
        });

        expect(pickTargets(store, 110, 110)).toEqual([above, shapes, below]);
        expect(pickTargets(store, 140, 110)).toEqual([shapes, below]);
    });

    it('answers its own listeners, the shapes or the object that holds them', () => {
        const game = pointerGame();
        const log: string[] = [];
        startTestScene(game.store, 'Menu', () => {
            const play = button(100, 100);
            listen(play, { onClick: () => { log.push('play'); }, onPointerOver: () => { log.push('over'); }, onPointerOut: () => { log.push('out'); } });
            const quit = useSpawn(() => { useTransform(at(100, 200)); createShapes({ shapes: [{ type: 'rect', x: 0, y: 0, width: 60, height: 20, fill: '#ffffff' }] }); })();
            listen(quit, { onClick: () => { log.push('quit'); } });
            return createScene();
        });

        game.hover(130, 110);
        game.click(130, 110);
        game.hover(300, 300);
        game.click(130, 210);
        game.click(300, 300);

        expect(log).toEqual(['over', 'play', 'out', 'quit']);
    });

    it('is no longer found once destroyed, even before it leaves the scene', () => {
        const { store } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Menu', () => { shapes = button(100, 100); return createScene(); });

        destroy(shapes);
        expect(pickTargets(store, 130, 110)).toEqual([]);
        flushDestroyed(store);
        expect(pickTargets(store, 130, 110)).toEqual([]);
    });

    it('is not found where nothing of it is drawn: hidden, or squashed to nothing by itself or by its object', () => {
        const { store } = createTestGame();
        let oneShapeHidden!: TShapes;
        startTestScene(store, 'Menu', () => {
            button(100, 0).visible = false;
            createShapes({ transform: { x: 100, y: 50, rotation: 0, scaleX: 0, scaleY: 1 }, shapes: [{ type: 'rect', x: 0, y: 0, width: 60, height: 20, fill: '#ffffff' }] });
            useSpawn(() => {
                useTransform({ x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 0 });
                createShapes({ shapes: [{ type: 'rect', x: 0, y: 0, width: 60, height: 20, fill: '#ffffff' }] });
            })();
            oneShapeHidden = createShapes({
                transform: at(100, 150),
                shapes: [
                    { type: 'rect', x: 0, y: 0, width: 60, height: 20, fill: '#ffffff', visible: false },
                    { type: 'rect', x: 100, y: 0, width: 20, height: 20, fill: '#ffffff' },
                ],
            });
            return createScene();
        });

        expect(pickTargets(store, 130, 10)).toEqual([]);
        expect(pickTargets(store, 100, 60)).toEqual([]);
        expect(pickTargets(store, 130, 100)).toEqual([]);
        expect(pickTargets(store, 130, 160)).toEqual([]);
        expect(pickTargets(store, 210, 160)).toEqual([oneShapeHidden]);
    });

    it('is touched where a changed shape is now, smaller or bigger than before', () => {
        const { store } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Menu', () => { shapes = button(100, 100); return createScene(); });

        expect(pickTargets(store, 130, 110)).toEqual([shapes]);
        (shapes.shapes[0] as { width: number }).width = 10;
        expect(pickTargets(store, 130, 110)).toEqual([]);
        expect(pickTargets(store, 105, 110)).toEqual([shapes]);
        // Grown past where it ever was: touched in the part that is new.
        (shapes.shapes[0] as { width: number }).width = 80;
        expect(pickTargets(store, 170, 110)).toEqual([shapes]);
    });

    it('is pressed by a finger on it, as an on-screen button', () => {
        const game = pointerGame();
        let shapes!: TShapes;
        let pointer!: ReturnType<typeof usePointer>;
        startTestScene(game.store, 'Pad', () => { shapes = button(100, 100); pointer = usePointer(); return createScene(); });

        game.fire('pointerdown', 130, 110);
        game.frame();
        expect(pointer.isPressing(shapes)).toBe(true);
        game.fire('pointermove', 300, 300);
        game.frame();
        expect(pointer.isPressing(shapes)).toBe(false);
    });

    it('can be dragged, and dropped by the tags of its object', () => {
        const game = pointerGame();
        let piece!: TBox;
        let shapes!: TShapes;
        const dropped: unknown[] = [];
        startTestScene(game.store, 'Board', () => {
            const slot = createSprite({ width: 40, height: 40, transform: at(300, 100) });
            useDropZone(slot, { accepts: 'piece', onDrop: (dragged) => { dropped.push(dragged); } });
            piece = useSpawn(() => {
                shapes = createShapes({ transform: at(100, 100), shapes: [{ type: 'circle', x: 0, y: 0, radius: 10, fill: '#ffffff' }] });
                useDraggable(shapes);
            })();
            useTag('piece').add(piece);
            return createScene();
        });

        game.fire('pointerdown', 100, 100);
        game.fire('pointermove', 300, 100);
        game.frame();
        expect(shapes.transform.x).toBe(300);
        game.fire('pointerup', 300, 100);
        game.frame();
        expect(dropped).toEqual([shapes]);
    });
});

describe('a mask squashed to nothing', () => {
    it('keeps everything out of the pointer, in the shape of a polygon or of shapes', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const polygon = useSpawn(() => {
                useTransform({ x: 100, y: 100, rotation: 0, scaleX: 0, scaleY: 1 });
                createPolygon({ points: [{ x: -20, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 20 }, { x: -20, y: 20 }] });
            })();
            const a = useSpawn(() => { createSprite({ width: 60, height: 60, transform: at(100, 100) }); })();
            useMask({ by: polygon }).add(a);

            const shapes = useSpawn(() => {
                useTransform({ x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 0 });
                createShapes({ shapes: [{ type: 'circle', x: 0, y: 0, radius: 20, fill: '#ffffff' }] });
            })();
            const b = useSpawn(() => { createSprite({ width: 60, height: 60, transform: at(300, 100) }); })();
            useMask({ by: shapes }).add(b);
            return createScene();
        });

        expect(pickTargets(store, 100, 100)).toEqual([]);
        expect(pickTargets(store, 300, 100)).toEqual([]);
    });
});
