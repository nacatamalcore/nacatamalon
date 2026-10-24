import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useDraggable } from '../src/hooks/input/use_draggable';
import { useTag } from '../src/hooks/tags/use_tag';
import { useDropZone } from '../src/hooks/input/use_drop_zone';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TSpriteOptions } from '../src/gameobjects/sprite/types';

const tint = { r: 1, g: 1, b: 1, a: 1 };

/**
 * A 40x40 sprite centred on `x`, `y`, with whatever else the test adds.
 */
const square = (x: number, y: number, extra: Partial<TSpriteOptions> = {}): TSprite =>
    createSprite({ width: 40, height: 40, tint, transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 }, ...extra });

/**
 * A game on a 480x320 canvas shown at `scale`, and pointer events for pointer `id`.
 */
const dragGame = (scale = 1) => {
    const canvas = createFakeCanvas(480, 320, scale);
    const { store } = createTestGame({}, canvas);
    const frame = () => store.get('input').pointer.dispatch(store);
    const fire = (type: string, x: number, y: number, id = 1, pointerType = 'mouse') => {
        canvas.dispatchEvent(Object.assign(new Event(type), { clientX: x * scale, clientY: y * scale, button: 0, pointerId: id, pointerType }));
    };
    return { store, canvas, frame, fire };
};

describe('drag events', () => {
    it('start only past the slop, and a drag is never a click', () => {
        const { store, frame, fire } = dragGame();
        const log: string[] = [];
        startTestScene(store, 'Level', () => {
            square(100, 100, {
                onDragStart: () => { log.push('start'); },
                onDrag: () => { log.push('drag'); },
                onDragEnd: () => { log.push('end'); },
                onClick: () => { log.push('click'); },
            });
            return createScene();
        });

        fire('pointerdown', 100, 100);
        fire('pointermove', 102, 100);
        fire('pointerup', 102, 100);
        frame();
        expect(log).toEqual(['click']);

        log.length = 0;
        fire('pointerdown', 100, 100);
        frame();
        fire('pointermove', 110, 100);
        frame();
        fire('pointermove', 120, 100);
        frame();
        fire('pointerup', 120, 100);
        frame();
        expect(log).toEqual(['start', 'drag', 'drag', 'end']);
    });

    it('measure the slop on the page, not in the game pixels', () => {
        const { store, frame, fire } = dragGame(4);
        const log: string[] = [];
        startTestScene(store, 'Level', () => {
            square(100, 100, { onDragStart: () => { log.push('start'); } });
            return createScene();
        });

        fire('pointerdown', 100, 100);
        // Two game pixels are eight of the page: past the mouse's four.
        fire('pointermove', 102, 100);
        frame();
        expect(log).toEqual(['start']);
    });

    it('keep going off the sprite, and end with what is under it, never itself', () => {
        const { store, frame, fire } = dragGame();
        let card!: TSprite;
        let slot!: TSprite;
        let moves = 0;
        let endedOn: unknown = 'nothing yet';
        startTestScene(store, 'Level', () => {
            slot = square(300, 100, { onClick: () => {} });
            card = square(100, 100, {
                onDrag: () => { moves++; },
                onDragEnd: (info) => { endedOn = info.target; },
            });
            return createScene();
        });

        fire('pointerdown', 100, 100);
        fire('pointermove', 200, 200);
        frame();
        fire('pointermove', 300, 100);
        fire('pointerup', 300, 100);
        frame();
        expect(moves).toBe(2);
        expect(endedOn).toBe(slot);
        expect(endedOn).not.toBe(card);
    });

    it('give where it started and how far it went, in the world', () => {
        const { store, frame, fire } = dragGame();
        const seen: Array<[number, number, number, number]> = [];
        startTestScene(store, 'Level', () => {
            square(100, 100, { onDrag: ({ startX, startY, deltaX, deltaY }) => { seen.push([startX, startY, deltaX, deltaY]); } });
            return createScene();
        });

        fire('pointerdown', 100, 100);
        fire('pointermove', 130, 90);
        frame();
        expect(seen).toEqual([[100, 100, 30, -10]]);
    });

    it('end over nothing when the system takes the press back', () => {
        const { store, frame, fire } = dragGame();
        let endedOn: unknown = 'nothing yet';
        startTestScene(store, 'Level', () => {
            square(300, 100, { onClick: () => {} });
            square(100, 100, { onDragEnd: (info) => { endedOn = info.target; } });
            return createScene();
        });

        fire('pointerdown', 100, 100);
        fire('pointermove', 300, 100);
        fire('pointercancel', 300, 100);
        frame();
        expect(endedOn).toBeNull();
    });

    it('drag two things with two fingers, each with its own', () => {
        const { store, frame, fire } = dragGame();
        const log: string[] = [];
        startTestScene(store, 'Level', () => {
            square(100, 100, { onDrag: (info) => { log.push(`a ${info.pointerId}`); } });
            square(300, 100, { onDrag: (info) => { log.push(`b ${info.pointerId}`); } });
            return createScene();
        });

        fire('pointerdown', 100, 100, 7, 'touch');
        fire('pointerdown', 300, 100, 8, 'touch');
        fire('pointermove', 120, 100, 7, 'touch');
        fire('pointermove', 280, 100, 8, 'touch');
        frame();
        expect(log).toEqual(['a 7', 'b 8']);
    });

    it('turn the cursor into a hand that grabs', () => {
        const { store, canvas, frame, fire } = dragGame();
        startTestScene(store, 'Level', () => {
            square(100, 100, { onDrag: () => {} });
            return createScene();
        });

        fire('pointermove', 100, 100);
        frame();
        expect(canvas.style.cursor).toBe('grab');
        fire('pointerdown', 100, 100);
        fire('pointermove', 120, 100);
        frame();
        expect(canvas.style.cursor).toBe('grabbing');
        fire('pointerup', 120, 100);
        frame();
        expect(canvas.style.cursor).toBe('grab');
    });
});

describe('useDraggable', () => {
    it('moves it with the pointer, held where it was taken', () => {
        const { store, frame, fire } = dragGame();
        let card!: TSprite;
        startTestScene(store, 'Level', () => {
            card = square(100, 100);
            useDraggable(card);
            return createScene();
        });

        // Taken 10 to the right of its middle.
        fire('pointerdown', 110, 100);
        fire('pointermove', 160, 140);
        frame();
        expect(card.transform.x).toBe(150);
        expect(card.transform.y).toBe(140);
    });

    it('keeps to its axis, its grid and its bounds', () => {
        const { store, frame, fire } = dragGame();
        let card!: TSprite;
        startTestScene(store, 'Level', () => {
            card = square(100, 100);
            useDraggable(card, { axis: 'x', grid: 16, bounds: { x: 0, y: 0, width: 200, height: 320 } });
            return createScene();
        });

        fire('pointerdown', 100, 100);
        fire('pointermove', 125, 180);
        frame();
        expect(card.transform.x).toBe(128);
        expect(card.transform.y).toBe(100);

        fire('pointermove', 400, 180);
        frame();
        expect(card.transform.x).toBe(200);
    });

    it('drops on what carries the tag, and goes back from anywhere else', () => {
        const { store, frame, fire } = dragGame();
        let card!: TSprite;
        let slot!: TSprite;
        const dropped: unknown[] = [];
        startTestScene(store, 'Level', () => {
            slot = square(300, 100);
            useTag('slot').add(slot);
            card = square(100, 100);
            useDraggable(card, { dropOn: 'slot', snapBack: true, onDragEnd: (info) => { dropped.push(info.dropped); } });
            return createScene();
        });

        fire('pointerdown', 100, 100);
        fire('pointermove', 200, 250);
        fire('pointerup', 200, 250);
        frame();
        expect(card.transform.x).toBe(100);
        expect(card.transform.y).toBe(100);

        fire('pointerdown', 100, 100);
        fire('pointermove', 305, 100);
        fire('pointerup', 305, 100);
        frame();
        expect(card.transform.x).toBe(305);
        expect(dropped).toEqual([null, slot]);
    });

    it('does nothing while disabled, and again once enabled', () => {
        const { store, frame, fire } = dragGame();
        let card!: TSprite;
        let handle!: ReturnType<typeof useDraggable>;
        startTestScene(store, 'Level', () => {
            card = square(100, 100);
            handle = useDraggable(card, { enabled: false });
            return createScene();
        });

        fire('pointerdown', 100, 100);
        fire('pointermove', 150, 100);
        fire('pointerup', 150, 100);
        frame();
        expect(card.transform.x).toBe(100);

        handle.enable();
        fire('pointerdown', 100, 100);
        fire('pointermove', 150, 100);
        frame();
        expect(handle.isDragging()).toBe(true);
        expect(card.transform.x).toBe(150);
    });
});

describe('useDropZone', () => {
    /**
     * A card tagged `tag` at 100,100 that snaps back, and a zone at 300,100 accepting `accepts`.
     */
    const table = (accepts: string | string[], tag = 'card') => {
        const game = dragGame();
        const log: string[] = [];
        let card!: TSprite;
        let slot!: TSprite;
        let zone!: ReturnType<typeof useDropZone>;
        let dropped: unknown = 'nothing yet';
        startTestScene(game.store, 'Level', () => {
            slot = square(300, 100);
            zone = useDropZone(slot, {
                accepts,
                onEnter: () => { log.push('enter'); },
                onLeave: () => { log.push('leave'); },
                onDrop: (thing) => { log.push(thing === card ? 'drop card' : 'drop other'); },
            });
            card = square(100, 100);
            useTag(tag).add(card);
            useDraggable(card, { snapBack: true, onDragEnd: (info) => { dropped = info.dropped; } });
            return createScene();
        });
        return { ...game, log, card: () => card, slot: () => slot, zone: () => zone, dropped: () => dropped };
    };

    it('says canDrop while something it accepts is dragged, and isOver while it is over it', () => {
        const t = table('card');
        expect(t.zone().canDrop()).toBe(false);

        t.fire('pointerdown', 100, 100);
        t.fire('pointermove', 150, 200);
        t.frame();
        expect(t.zone().canDrop()).toBe(true);
        expect(t.zone().isOver()).toBe(false);

        t.fire('pointermove', 300, 100);
        t.frame();
        expect(t.zone().isOver()).toBe(true);

        t.fire('pointerup', 300, 100);
        t.frame();
        expect(t.zone().canDrop()).toBe(false);
        expect(t.zone().isOver()).toBe(false);
        expect(t.log).toEqual(['enter', 'drop card', 'leave']);
        expect(t.dropped()).toBe(t.slot());
        expect(t.card().transform.x).toBe(300);
    });

    it('accepts several tags', () => {
        const t = table(['coin', 'card']);
        t.fire('pointerdown', 100, 100);
        t.fire('pointermove', 300, 100);
        t.frame();
        expect(t.zone().isOver()).toBe(true);
    });

    it('ignores what it does not accept, and the card goes back', () => {
        const t = table('coin');
        t.fire('pointerdown', 100, 100);
        t.fire('pointermove', 300, 100);
        t.frame();
        expect(t.zone().canDrop()).toBe(false);
        expect(t.zone().isOver()).toBe(false);
        t.fire('pointerup', 300, 100);
        t.frame();
        expect(t.log).toEqual([]);
        expect(t.dropped()).toBeNull();
        expect(t.card().transform.x).toBe(100);
    });

    it('leaves without a drop when the drag is taken back', () => {
        const t = table('card');
        t.fire('pointerdown', 100, 100);
        t.fire('pointermove', 300, 100);
        t.frame();
        t.fire('pointercancel', 300, 100);
        t.frame();
        expect(t.log).toEqual(['enter', 'leave']);
        expect(t.zone().isOver()).toBe(false);
    });

    it('takes nothing while disabled', () => {
        const t = table('card');
        t.zone().disable();
        t.fire('pointerdown', 100, 100);
        t.fire('pointermove', 300, 100);
        t.frame();
        expect(t.zone().canDrop()).toBe(false);
        t.fire('pointerup', 300, 100);
        t.frame();
        expect(t.log).toEqual([]);
        expect(t.card().transform.x).toBe(100);
    });
});
