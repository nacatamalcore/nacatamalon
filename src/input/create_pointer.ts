import { momentOf } from './moment';
import { pointerButtonName } from './pointer_buttons';
import type { TPointerButtonName } from './pointer_buttons';
// Straight from its file: the box barrel reaches the store, and the store creates this pointer.
import { rootOf } from '../box/root_of';
import { screenSizeOf } from '../DOM/screen_size';
import { unapplyView2d } from '../render/shared';
import { pickTargets, pickTargetsAt } from './pick_targets';
import { ownerOfDrawable } from '../box/drawable_owner';
import { topmostListening } from './topmost_listening';
import type { TBox } from '../box';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';
import type { TRuntimeStore } from '../store';
import type { TListeningSprite, TPointerTarget } from './topmost_listening';
import { DRAG_SLOP } from '../CONFIG';
import type { TDropZoneSpec, TPointerDragInfo, TPointerInfo, TPointerKind, TPointerListener, TPointerLockOptions, TPointerSource, TPointerType, TPointerWheelListener } from './types/t_pointer';
import type { TSpriteEvents } from './types/t_sprite_events';

/**
 * One event as the DOM left it, already in the game's pixels. `leave` is the pointer leaving the
 * canvas. The wheel's turn rides along, and is nothing for every other kind; so does how far the
 * mouse moved, in pixels of the page, which is nothing for anything but a move.
 */
type TQueuedEvent = {
    /**
     * `cancel` is a press the system took back (a gesture of the browser's, a call coming in): it
     * ends like a release, so nothing stays held, but it is never a click.
     *
     * `pressed` and `released` are a second button changing while another is held: the browser
     * says so in a move, not in a down or an up, so they only reach `justPressed` and `justReleased`.
     */
    kind: TPointerKind | 'leave' | 'cancel' | 'pressed' | 'released';
    pointerId: number;
    pointerType: TPointerType;
    screenX: number;
    screenY: number;
    button: TPointerButtonName;
    deltaX: number;
    deltaY: number;
    movementX: number;
    movementY: number;
    /**
     * When it happened, in seconds on the page's clock (see `momentOf`).
     */
    time: number;
};

/**
 * The id the mouse goes by where the browser gives none (the wheel's events carry no pointer), the
 * one browsers give the mouse anyway.
 */
const MOUSE_ID = 1;

/**
 * What the browser calls a pointer, as one of ours: anything it does not name is a mouse.
 */
const typeOf = (event: PointerEvent): TPointerType =>
    event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse';

/**
 * How long a browser that answers a capture with an event rather than a promise is given to answer.
 */
const LOCK_ANSWER_MS = 1000;

/**
 * One listener and who registered it.
 */
type TRegistration = { kind: TPointerKind; box: TBox; listener: TPointerListener | TPointerWheelListener };

/**
 * A drop zone: what it is, the part of the scene it belongs to, and what it accepts and is told.
 */
type TZone = { target: TPointerTarget; box: TBox; spec: TDropZoneSpec };

/**
 * A press on something that can be dragged: what, where it went down and where it is now (game
 * pixels), how far it must go to be a drag (game pixels too), whether it went that far, and the
 * drop zone under it.
 */
type TDrag = { target: TPointerTarget; startX: number; startY: number; x: number; y: number; slop: number; started: boolean; over: TZone | null };

/**
 * Whether a set of events reacts to being dragged.
 */
const draggable = (connection: TSpriteEvents): boolean =>
    connection.onDragStart !== undefined || connection.onDrag !== undefined || connection.onDragEnd !== undefined;

/**
 * How many pixels one of the browser's other units stands for: a line of text, and a page. The
 * numbers are the ones browsers themselves use when they have to convert.
 */
const LINE_PIXELS = 16;
const PAGE_PIXELS = 800;

/**
 * Listens to the mouse and touch on one canvas, queues what happens, and hands it to the game when the
 * loop asks: to the scene-wide listeners of `usePointer`, and to the sprites that react by themselves.
 *
 * The API is listeners, but they do not run when the DOM fires. The DOM only writes the queue; the
 * loop empties it at the start of a frame, before any update. So a click is handled at a moment the
 * game chose, never half way through walking the scene, and whatever a listener does (spawn,
 * destroy, move things) behaves the same as it would in `useUpdate`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPointer = (canvas: HTMLCanvasElement, options: { contextMenu?: () => boolean } = {}): TPointerSource => {
    let queue: TQueuedEvent[] = [];
    let registrations: TRegistration[] = [];

    /**
     * What reacts by itself: sprites, texts, nine-slices and whole objects. A map beside them, never a
     * field in them.
     */
    const listening = new Map<TPointerTarget, TListeningSprite>();
    /**
     * Where the pointer was last seen over the canvas, or `null` once it left.
     */
    let lastPosition: { x: number; y: number } | null = null;
    /**
     * What listens under the pointer right now.
     */
    let hovered: TPointerTarget | null = null;
    /**
     * What listening each pointer's press started on, so a click can be told from a drag off it.
     * One per pointer: a second finger landing does not take the first one's click away.
     */
    const pressed = new Map<number, TPointerTarget | null>();
    /**
     * A press on something that can be dragged, by pointer: what, where it went down (game pixels),
     * how far it must go to be a drag (game pixels too), and whether it went that far. One per
     * pointer, so two fingers drag two things.
     */
    const drags = new Map<number, TDrag>();
    /**
     * Every place things can be dragged into, in the order they were made.
     */
    let zones: TZone[] = [];
    /**
     * Every pointer pressing, as of the last frame that handed events on, in the order they started:
     * the state `isDown`, `touches` and `isPressing` read. Kept by the frame and not by the DOM, so
     * every update of a frame sees the same answer.
     */
    const active = new Map<number, { pointerId: number; pointerType: TPointerType; screenX: number; screenY: number }>();
    /**
     * The buttons that went down and came up in the events of this frame, `'main'` for a finger. Emptied
     * when the next frame's events are handed out, so each reads as true for one frame.
     */
    const wentDown = new Set<TPointerButtonName>();
    const cameUp = new Set<TPointerButtonName>();
    /**
     * When each button of `wentDown` went down, by its event: the first press if there were two.
     */
    const wentDownAt = new Map<TPointerButtonName, number>();
    const goneDown = (button: TPointerButtonName, time: number): void => {
        if (!wentDown.has(button)) {
            wentDownAt.set(button, time);
        }
        wentDown.add(button);
    };
    /**
     * What is under each pressing pointer, worked out once per frame on the first question and kept
     * until the next frame's events: several buttons asking about the same fingers lay the scene out
     * once. Same order as `active`.
     */
    let underActive: Array<Array<TSprite | TText | TNineSlice>> | null = null;

    /**
     * From a position on the page to the game's pixels. The canvas is shown at a CSS size that may
     * differ from the game's size (scaled up to fit), so the ratio between the two is the whole
     * conversion. The game's size, not the buffer's: with a `pixelRatio` the buffer holds more real
     * pixels than the game has. `fitCanvas` sizes the element to the picture exactly, so there is no
     * letterbox inside it to subtract.
     */
    const toScreen = (event: MouseEvent): { x: number; y: number } => {
        const rect = canvas.getBoundingClientRect();
        const size = screenSizeOf(canvas);
        return {
            x: (event.clientX - rect.left) * (size.width / rect.width),
            y: (event.clientY - rect.top) * (size.height / rect.height),
        };
    };

    /**
     * `DRAG_SLOP`, from pixels of the page to the game's, for a pointer of this kind.
     */
    const slopFor = (pointerType: TPointerType): number => {
        const rect = canvas.getBoundingClientRect();
        const size = screenSizeOf(canvas);
        return DRAG_SLOP[pointerType] * (rect.width > 0 ? size.width / rect.width : 1);
    };

    /** Each button's bit in a pointer event's `buttons`, by its number in `button`. */
    const BUTTON_BITS = [1, 4, 2, 8, 16];

    const enqueue = (kind: TQueuedEvent['kind'], event: PointerEvent): void => {
        const { x, y } = toScreen(event);
        const moved = kind === 'move';
        const queued: TQueuedEvent = {
            kind,
            pointerId: event.pointerId ?? MOUSE_ID,
            pointerType: typeOf(event),
            screenX: x,
            screenY: y,
            button: pointerButtonName(event.button),
            deltaX: 0,
            deltaY: 0,
            movementX: moved ? event.movementX ?? 0 : 0,
            movementY: moved ? event.movementY ?? 0 : 0,
            time: momentOf(event),
        };

        // Many moves can arrive between two frames and only the last position matters, so a move
        // replaces a move right before it; how far it moved is added, as the wheel's turns are,
        // or a quick flick of a captured mouse would lose most of itself. Presses and releases
        // are never merged: a quick click is a down and an up, and both have to arrive.
        // Only a move of the same pointer: two fingers moving in one frame are two positions, and
        // folding one into the other would make the first jump to where the second is.
        const last = queue[queue.length - 1];
        if (moved && last?.kind === 'move' && last.pointerId === queued.pointerId) {
            queued.movementX += last.movementX;
            queued.movementY += last.movementY;
            queue[queue.length - 1] = queued;
            return;
        }
        queue.push(queued);
    };

    const onDown = (event: Event): void => {
        const pointerEvent = event as PointerEvent;
        // Keeps the release coming to this canvas even if it happens outside it, or a drag that
        // ends off the edge would leave the button held for ever.
        canvas.setPointerCapture?.(pointerEvent.pointerId);
        noteButtons(pointerEvent);
        enqueue('down', pointerEvent);
    };
    const onUp = (event: Event): void => {
        // The last button let go: nothing of this pointer is held, and a finger's id is not reused.
        heldButtons.delete((event as PointerEvent).pointerId ?? MOUSE_ID);
        enqueue('up', event as PointerEvent);
    };
    const onCancel = (event: Event): void => {
        heldButtons.delete((event as PointerEvent).pointerId ?? MOUSE_ID);
        enqueue('cancel', event as PointerEvent);
    };
    /** The buttons each pointer had held at its last event, as `buttons` says them. */
    const heldButtons = new Map<number, number>();
    const noteButtons = (event: PointerEvent): void => {
        if (typeof event.buttons === 'number') heldButtons.set(event.pointerId ?? MOUSE_ID, event.buttons);
    };

    const onMove = (event: Event): void => {
        const pointerEvent = event as PointerEvent;
        // A button changing while another is held, a chord, comes as a move and not as a down or an
        // up: it is told by `buttons`, the bit of the button the move names now set or now clear.
        const changed = pointerEvent.button ?? -1;
        const bit = BUTTON_BITS[changed];
        if (bit !== undefined && typeof pointerEvent.buttons === 'number') {
            const before = heldButtons.get(pointerEvent.pointerId ?? MOUSE_ID) ?? 0;
            const now = pointerEvent.buttons & bit;
            if (now !== (before & bit)) enqueue(now !== 0 ? 'pressed' : 'released', pointerEvent);
        }
        noteButtons(pointerEvent);
        enqueue('move', pointerEvent);
    };
    const onLeave = (event: Event): void => enqueue('leave', event as PointerEvent);

    const onWheel = (event: Event): void => {
        // Nobody listening: the page keeps its scroll, which is what a game sitting in the middle of
        // an article owes the reader.
        if (!registrations.some((registration) => registration.kind === 'wheel')) {
            return;
        }
        const wheel = event as WheelEvent;
        wheel.preventDefault();

        const unit = wheel.deltaMode === 1 ? LINE_PIXELS : wheel.deltaMode === 2 ? PAGE_PIXELS : 1;
        const { x, y } = toScreen(wheel);
        const deltaX = (wheel.deltaX ?? 0) * unit;
        const deltaY = (wheel.deltaY ?? 0) * unit;

        // Several turns between two frames are added together, not replaced like a move: every notch
        // is a notch, and a fast spin must not lose most of itself.
        const last = queue[queue.length - 1];
        if (last?.kind === 'wheel') {
            queue[queue.length - 1] = { ...last, screenX: x, screenY: y, deltaX: last.deltaX + deltaX, deltaY: last.deltaY + deltaY, time: momentOf(wheel) };
            return;
        }
        queue.push({ kind: 'wheel', pointerId: MOUSE_ID, pointerType: 'mouse', screenX: x, screenY: y, button: 'main', deltaX, deltaY, movementX: 0, movementY: 0, time: momentOf(wheel) });
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    // Not passive, or the page could not be kept from scrolling while the game uses the wheel.
    canvas.addEventListener('wheel', onWheel, { passive: false });
    // The right button is the game's, so the browser's menu does not open over it. Only the canvas:
    // the page around it keeps its own.
    const onContextMenu = (event: Event): void => {
        if (options.contextMenu?.() !== true) event.preventDefault();
    };
    canvas.addEventListener('contextmenu', onContextMenu);

    // Without it a finger dragging on the canvas scrolls or zooms the page instead of reaching the
    // game. The style is not there on a test's fake canvas, hence the check.
    if (canvas.style !== undefined) {
        canvas.style.touchAction = 'none';
    }

    /**
     * How far the event being handed on moved the mouse, for every listener and sprite that hears it.
     */
    const movement = { x: 0, y: 0 };
    /**
     * Which pointer the event being handed on came from, and when, for every listener and sprite
     * that hears it. Outside an event (a sprite the pointer stopped being over, worked out after
     * them) it is now.
     */
    const current: { pointerId: number; pointerType: TPointerType; time: number | null } = { pointerId: MOUSE_ID, pointerType: 'mouse', time: null };

    /**
     * What a listener belonging to `box` is told: the world through the camera of its own scene.
     */
    const infoFor = (box: TBox, screenX: number, screenY: number, button: TPointerButtonName, hits: Array<TSprite | TText | TNineSlice>): TPointerInfo => {
        const world = unapplyView2d(rootOf(box).camera2d, { x: screenX, y: screenY });
        return {
            screenX,
            screenY,
            worldX: world.x,
            worldY: world.y,
            movementX: movement.x,
            movementY: movement.y,
            button,
            pointerId: current.pointerId,
            pointerType: current.pointerType,
            time: current.time ?? momentOf({}),
            target: hits[0] ?? null,
            hits,
        };
    };

    /**
     * Whether this canvas has the mouse. No page (a test, the native runtime) is never captured.
     */
    const lockedHere = (): boolean => typeof document !== 'undefined' && document.pointerLockElement === canvas;

    /**
     * Asks for the capture once and waits for the answer: a promise in most browsers, the
     * `pointerlockchange` or `pointerlockerror` event in the ones that return nothing.
     */
    const askForLock = async (raw: boolean): Promise<void> => {
        const asked = raw
            ? canvas.requestPointerLock({ unadjustedMovement: true })
            : canvas.requestPointerLock();
        if (asked instanceof Promise) {
            await asked;
            return;
        }
        await new Promise<void>((resolve, reject) => {
            const done = (granted: boolean): void => {
                document.removeEventListener('pointerlockchange', onChange);
                document.removeEventListener('pointerlockerror', onError);
                clearTimeout(timer);
                if (granted) resolve();
                else reject(new Error('refused'));
            };
            const onChange = (): void => done(lockedHere());
            const onError = (): void => done(false);
            const timer = setTimeout(() => done(lockedHere()), LOCK_ANSWER_MS);
            document.addEventListener('pointerlockchange', onChange);
            document.addEventListener('pointerlockerror', onError);
        });
    };

    const lock = async (options: TPointerLockOptions = {}): Promise<boolean> => {
        if (lockedHere()) {
            return true;
        }
        if (typeof document === 'undefined' || typeof canvas.requestPointerLock !== 'function') {
            // A touch screen, the native runtime, a test: there is no mouse to capture.
            return false;
        }
        try {
            await askForLock(options.raw === true);
        } catch {
            // Refused. Asked for raw movement, that may be all the browser refused, so it is asked
            // once more without; anything else is the player's or the page's no, and the answer is
            // `false`, never an exception in the game.
            if (options.raw !== true) {
                return false;
            }
            try {
                await askForLock(false);
            } catch {
                return false;
            }
        }
        return lockedHere();
    };

    const unlock = (): void => {
        if (lockedHere()) {
            document.exitPointerLock();
        }
    };

    /**
     * Calls one of a sprite's own events on every connection that has it, in the order they were
     * made. Over a copy: a connection removed by an earlier one does not hear this same event.
     */
    const fireSprite = (sprite: TPointerTarget | null, name: Exclude<keyof TSpriteEvents, 'onDragStart' | 'onDrag' | 'onDragEnd'>, screenX: number, screenY: number, button: TPointerButtonName, hits: Array<TSprite | TText | TNineSlice>): void => {
        if (sprite === null) {
            return;
        }
        const entry = listening.get(sprite);
        if (entry === undefined) {
            return;
        }
        const info = infoFor(entry.box, screenX, screenY, button, hits);
        for (const connection of [...entry.connections]) {
            if (entry.connections.includes(connection)) {
                connection[name]?.(info);
            }
        }
    };

    /**
     * The hand over something clickable, the normal arrow anywhere else.
     */
    const setCursor = (): void => {
        if (canvas.style === undefined) {
            return;
        }
        const has = (test: (connection: TSpriteEvents) => boolean): boolean =>
            hovered !== null && (listening.get(hovered)?.connections.some(test) ?? false);
        const dragging = [...drags.values()].some((drag) => drag.started);
        canvas.style.cursor = dragging ? 'grabbing' : has(draggable) ? 'grab' : has((connection) => connection.onClick !== undefined) ? 'pointer' : '';
    };

    /**
     * Whether `zone` takes `dragged`: it, or an object it sits in, carries one of the tags the zone
     * accepts.
     */
    const accepts = (zone: TZone, dragged: TPointerTarget): boolean => {
        const wanted = zone.spec.accepts;
        if (wanted === undefined) {
            return true;
        }
        const names: readonly string[] = typeof wanted === 'string' ? [wanted] : wanted;
        const carries = (thing: { tags?: string[] }): boolean => names.some((name) => thing.tags?.includes(name) === true);
        if (carries(dragged)) {
            return true;
        }
        for (let box = ('children' in dragged ? dragged.parent : ownerOfDrawable(dragged)?.box ?? null); box !== null; box = box.parent) {
            if (carries(box)) {
                return true;
            }
        }
        return false;
    };

    /**
     * Whether a zone is still there to be dropped into: not gone, in a scene that runs and shows.
     */
    const zoneAnswers = (zone: TZone): boolean => {
        if (zone.target.destroyed || zone.box.destroyed) {
            return false;
        }
        const scene = rootOf(zone.box);
        return !scene.paused && !scene.held;
    };

    /**
     * The zone on top under a drag that takes what it drags: for each hit, the hit itself or the
     * nearest object it sits in, as with what listens.
     */
    const zoneUnder = (dragged: TPointerTarget, under: ReadonlyArray<TSprite | TText | TNineSlice>): TZone | null => {
        if (zones.length === 0) {
            return null;
        }
        for (const hit of under) {
            let candidate: TPointerTarget | null = hit;
            let box = ownerOfDrawable(hit)?.box ?? null;
            while (candidate !== null) {
                const found = zones.find((zone) => zone.target === candidate && zoneAnswers(zone) && accepts(zone, dragged));
                if (found !== undefined) {
                    return found;
                }
                candidate = box;
                box = box?.parent ?? null;
            }
        }
        return null;
    };

    /**
     * What is under a drag: every hit but the dragged thing and its pieces.
     */
    const underOf = (drag: TDrag, hits: Array<TSprite | TText | TNineSlice>): Array<TSprite | TText | TNineSlice> =>
        hits.filter((hit) => hit !== drag.target && !sitsIn(hit, drag.target));

    /**
     * What a drag listener belonging to `box` is told.
     */
    const dragInfo = (box: TBox, drag: TDrag, screenX: number, screenY: number, button: TPointerButtonName, under: Array<TSprite | TText | TNineSlice>): TPointerDragInfo => {
        const pointerInfo = infoFor(box, screenX, screenY, button, under);
        const start = unapplyView2d(rootOf(box).camera2d, { x: drag.startX, y: drag.startY });
        return {
            ...pointerInfo,
            startX: start.x,
            startY: start.y,
            deltaX: pointerInfo.worldX - start.x,
            deltaY: pointerInfo.worldY - start.y,
            zone: drag.over?.target ?? null,
        };
    };

    /**
     * Moves a drag over another zone, or off every one: the one it leaves is told first.
     */
    const setOver = (drag: TDrag, next: TZone | null, screenX: number, screenY: number, button: TPointerButtonName, under: Array<TSprite | TText | TNineSlice>): void => {
        const before = drag.over;
        if (before === next) {
            return;
        }
        drag.over = next;
        if (before !== null && zones.includes(before) && zoneAnswers(before)) {
            before.spec.onLeave?.(drag.target, dragInfo(before.box, drag, screenX, screenY, button, under));
        }
        if (next !== null) {
            next.spec.onEnter?.(drag.target, dragInfo(next.box, drag, screenX, screenY, button, under));
        }
    };

    /**
     * Calls one of the drag events of what `drag` holds, told what is under it, never itself, and
     * settles the zone it is over first. Not when it was destroyed, or its scene paused or held:
     * then nothing reacts, as with any event.
     */
    const fireDrag = (drag: TDrag, name: 'onDragStart' | 'onDrag' | 'onDragEnd', screenX: number, screenY: number, button: TPointerButtonName, hits: Array<TSprite | TText | TNineSlice>): void => {
        const entry = listening.get(drag.target);
        if (entry === undefined || drag.target.destroyed) {
            return;
        }
        const scene = rootOf(entry.box);
        if (scene.paused || scene.held) {
            return;
        }
        const under = underOf(drag, hits);
        setOver(drag, zoneUnder(drag.target, under), screenX, screenY, button, under);
        const info = dragInfo(entry.box, drag, screenX, screenY, button, under);
        for (const connection of [...entry.connections]) {
            if (entry.connections.includes(connection)) {
                connection[name]?.(info);
            }
        }
    };

    /**
     * Works out which listening sprite is under the pointer now, and tells the old and the new one if
     * that changed. Run once a frame and not only on movement: a button that slides under a still
     * mouse is hovered all the same.
     */
    const refreshHover = (store: TRuntimeStore): void => {
        // A hovered sprite destroyed on its own is told it lost the pointer, so whatever it showed on
        // hover (a tooltip, a highlight elsewhere) can go. One that left with its scene is already
        // forgotten, and its handlers belong to a scene that no longer runs.
        if (hovered !== null && hovered.destroyed) {
            fireSprite(hovered, 'onPointerOut', lastPosition?.x ?? 0, lastPosition?.y ?? 0, 'main', []);
            listening.delete(hovered);
            hovered = null;
        }
        if (hovered !== null && !listening.has(hovered)) {
            hovered = null;
        }

        if (listening.size === 0 && hovered === null) {
            return;
        }

        let next: TPointerTarget | null = null;
        let hits: Array<TSprite | TText | TNineSlice> = [];
        if (lastPosition !== null && listening.size > 0) {
            hits = pickTargets(store, lastPosition.x, lastPosition.y);
            next = topmostListening(hits, listening);
        }

        if (next !== hovered) {
            const x = lastPosition?.x ?? 0;
            const y = lastPosition?.y ?? 0;
            fireSprite(hovered, 'onPointerOut', x, y, 'main', hits);
            hovered = next;
            fireSprite(hovered, 'onPointerOver', x, y, 'main', hits);
        }
        setCursor();
    };

    /**
     * Removes one connection. When it was the sprite's last, the sprite stops listening, and if the
     * pointer was over it, it is told first, with the handlers it still had.
     *
     * `tellOut` is false when the connection goes because its part of the scene left: those handlers
     * belong to something that no longer runs, so they are not called on the way out.
     */
    const disconnect = (sprite: TPointerTarget, connection: TSpriteEvents, tellOut: boolean): void => {
        const entry = listening.get(sprite);
        if (entry === undefined || !entry.connections.includes(connection)) {
            return;
        }

        if (entry.connections.length === 1 && hovered === sprite) {
            if (tellOut) {
                fireSprite(sprite, 'onPointerOut', lastPosition?.x ?? 0, lastPosition?.y ?? 0, 'main', []);
            }
            hovered = null;
            setCursor();
        }

        entry.connections = entry.connections.filter((existing) => existing !== connection);
        if (entry.connections.length === 0) {
            listening.delete(sprite);
            for (const [id, target] of pressed) {
                if (target === sprite) {
                    pressed.set(id, null);
                }
            }
            for (const [id, drag] of drags) {
                if (drag.target === sprite) {
                    drags.delete(id);
                }
            }
        } else if (hovered === sprite) {
            // Still listening, but maybe no longer clickable.
            setCursor();
        }
    };

    /**
     * What is under each pressing pointer this frame, laid out once and kept until the next.
     */
    const heldHits = (store: TRuntimeStore): Array<Array<TSprite | TText | TNineSlice>> => {
        if (underActive === null) {
            underActive = pickTargetsAt(store, [...active.values()].map((finger) => ({ x: finger.screenX, y: finger.screenY })));
        }
        return underActive;
    };

    /**
     * Whether a drawable belongs to an object, by itself or through anything above it.
     */
    const sitsIn = (hit: TSprite | TText | TNineSlice, target: TPointerTarget): boolean => {
        if (!('children' in target)) {
            return false;
        }
        for (let box = ownerOfDrawable(hit)?.box ?? null; box !== null; box = box.parent) {
            if (box === target) {
                return true;
            }
        }
        return false;
    };

    const remove = (registration: TRegistration): void => {
        registrations = registrations.filter((existing) => existing !== registration);
    };

    return {
        on: (kind, box, listener) => {
            const registration: TRegistration = { kind, box, listener };
            registrations.push(registration);

            const off = (): void => remove(registration);
            // Leaves with whatever registered it: a stopped scene or a destroyed object takes its
            // listeners along, so none of them fires on something that is gone.
            box.cleanups.push(off);
            return off;
        },

        listenSprite: (sprite, box, events) => {
            // Its own object, so the same handlers connected twice are still two connections that
            // can be removed one at a time.
            const connection: TSpriteEvents = { ...events };
            const entry = listening.get(sprite);
            if (entry === undefined) {
                listening.set(sprite, { box, connections: [connection] });
            } else {
                entry.connections.push(connection);
            }

            box.cleanups.push(() => disconnect(sprite, connection, false));
            return () => disconnect(sprite, connection, true);
        },

        dispatch: (store: TRuntimeStore) => {
            // Taken first, so an event queued while listeners run waits for the next frame
            // instead of being handled inside this one.
            const events = queue;
            queue = [];
            // A new frame: what is under the fingers is asked again.
            underActive = null;
            wentDown.clear();
            wentDownAt.clear();
            cameUp.clear();

            for (const event of events) {
                const { screenX, screenY, button, deltaX, deltaY, pointerId } = event;
                // Taken back by the system: everything a release does but the click.
                const cancelled = event.kind === 'cancel';
                const kind = (cancelled ? 'up' : event.kind) as Exclude<TQueuedEvent['kind'], 'cancel'>;
                movement.x = event.movementX;
                movement.y = event.movementY;
                current.pointerId = pointerId;
                current.pointerType = event.pointerType;
                current.time = event.time;

                if (kind === 'leave') {
                    lastPosition = null;
                    continue;
                }
                if (kind === 'pressed' || kind === 'released') {
                    if (kind === 'pressed') {
                        goneDown(button, event.time);
                    } else {
                        cameUp.add(button);
                    }
                    continue;
                }
                lastPosition = { x: screenX, y: screenY };

                // What is pressing, kept before anyone is told, so a listener that asks `isDown`
                // hears the same as the event it is handling.
                if (kind === 'down') {
                    active.set(pointerId, { pointerId, pointerType: event.pointerType, screenX, screenY });
                    goneDown(button, event.time);
                } else if (kind === 'up') {
                    active.delete(pointerId);
                    cameUp.add(button);
                } else if (kind === 'move') {
                    const finger = active.get(pointerId);
                    if (finger !== undefined) {
                        active.set(pointerId, { ...finger, screenX, screenY });
                    }
                }

                const listeners = registrations.filter((registration) => registration.kind === kind);
                if (listeners.length === 0 && listening.size === 0) {
                    continue;
                }

                // Worked out once per event: every listener and every sprite sees the same answer.
                const hits = pickTargets(store, screenX, screenY);

                for (const registration of listeners) {
                    // A listener removed by an earlier one in this same event does not run.
                    if (!registrations.includes(registration)) {
                        continue;
                    }
                    const scene = rootOf(registration.box);
                    // Skipped the same way its updates are: a paused scene does not react, and
                    // neither does one held behind a transition. The held one matters most: it is
                    // not even on screen, so a click meant for what is covering it would otherwise
                    // be answered by a room nobody can see.
                    if (registration.box.destroyed || scene.paused || scene.held) {
                        continue;
                    }
                    const info = infoFor(registration.box, screenX, screenY, button, hits);
                    if (kind === 'wheel') {
                        (registration.listener as TPointerWheelListener)({ ...info, deltaX, deltaY });
                    } else {
                        (registration.listener as TPointerListener)(info);
                    }
                }

                // A sprite has no wheel of its own to hear, so the wheel stops here.
                if (listening.size === 0 || kind === 'wheel') {
                    continue;
                }

                const topmost = topmostListening(hits, listening);

                if (kind === 'move') {
                    const drag = drags.get(pointerId);
                    if (drag !== undefined) {
                        drag.x = screenX;
                        drag.y = screenY;
                        if (!drag.started && Math.hypot(screenX - drag.startX, screenY - drag.startY) >= drag.slop) {
                            drag.started = true;
                            fireDrag(drag, 'onDragStart', screenX, screenY, button, hits);
                        }
                        if (drag.started) {
                            fireDrag(drag, 'onDrag', screenX, screenY, button, hits);
                        }
                    }
                    // Which sprite is under it is settled first: a move that leaves the button is
                    // an out for the button, not one last move over it.
                    if (topmost !== hovered) {
                        fireSprite(hovered, 'onPointerOut', screenX, screenY, button, hits);
                        hovered = topmost;
                        fireSprite(hovered, 'onPointerOver', screenX, screenY, button, hits);
                    } else if (hovered !== null) {
                        fireSprite(hovered, 'onPointerMove', screenX, screenY, button, hits);
                    }
                    continue;
                }

                if (kind === 'down') {
                    pressed.set(pointerId, topmost);
                    // Only the main button drags: the right one opens a menu, the middle one pans.
                    if (topmost !== null && button === 'main' && (listening.get(topmost)?.connections.some(draggable) ?? false)) {
                        drags.set(pointerId, { target: topmost, startX: screenX, startY: screenY, x: screenX, y: screenY, slop: slopFor(event.pointerType), started: false, over: null });
                    }
                    fireSprite(topmost, 'onPointerDown', screenX, screenY, button, hits);
                    continue;
                }

                // A release ends the drag first, over nothing when the system took it back.
                const drag = drags.get(pointerId);
                drags.delete(pointerId);
                if (drag?.started === true) {
                    const released = cancelled ? [] : hits;
                    fireDrag(drag, 'onDragEnd', screenX, screenY, button, released);
                    // Then the zone it was let go over takes it, and is left.
                    const zone = drag.over;
                    if (zone !== null && zones.includes(zone) && zoneAnswers(zone)) {
                        zone.spec.onDrop?.(drag.target, dragInfo(zone.box, drag, screenX, screenY, button, underOf(drag, released)));
                    }
                    setOver(drag, null, screenX, screenY, button, []);
                }

                // Then tell whatever is under it, and it is a click only if this same pointer's
                // press started on that same sprite, it was not dragged, and the system did not take
                // the press back.
                fireSprite(topmost, 'onPointerUp', screenX, screenY, button, hits);
                if (!cancelled && drag?.started !== true && topmost !== null && topmost === pressed.get(pointerId)) {
                    fireSprite(topmost, 'onClick', screenX, screenY, button, hits);
                }
                pressed.delete(pointerId);
            }
            current.pointerId = MOUSE_ID;
            current.pointerType = 'mouse';
            current.time = null;

            // Hover is worked out with the pointer still, so nothing it fires moved the mouse.
            movement.x = 0;
            movement.y = 0;
            refreshHover(store);

            // And so is the zone under each drag: a zone that slides under a card held still is
            // entered all the same.
            if (zones.length > 0) {
                for (const drag of drags.values()) {
                    if (drag.started && listening.has(drag.target)) {
                        const under = underOf(drag, pickTargets(store, drag.x, drag.y));
                        setOver(drag, zoneUnder(drag.target, under), drag.x, drag.y, 'main', under);
                    }
                }
            }
        },

        touches: () => [...active.values()],
        justPressed: (button) => (button === undefined ? wentDown.size > 0 : wentDown.has(button)),
        justReleased: (button) => (button === undefined ? cameUp.size > 0 : cameUp.has(button)),
        pressedAt: (button) => (button === undefined ? (wentDownAt.size > 0 ? Math.min(...wentDownAt.values()) : null) : wentDownAt.get(button) ?? null),
        position: () => lastPosition,
        isPressing: (store, target) => {
            if (active.size === 0) {
                return false;
            }
            return heldHits(store).some((hits) => hits.some((hit) => hit === target || sitsIn(hit, target)));
        },
        pressedBoxes: (store) => {
            const boxes = new Set<TBox>();
            if (active.size === 0) {
                return boxes;
            }
            for (const hits of heldHits(store)) {
                for (const hit of hits) {
                    for (let box = ownerOfDrawable(hit)?.box ?? null; box !== null; box = box.parent) {
                        boxes.add(box);
                    }
                }
            }
            return boxes;
        },

        dropZone: (target, box, spec) => {
            const zone: TZone = { target, box, spec };
            zones.push(zone);
            const remove = (): void => {
                zones = zones.filter((existing) => existing !== zone);
                // Gone without a word: what it would say belongs to something no longer there.
                for (const drag of drags.values()) {
                    if (drag.over === zone) {
                        drag.over = null;
                    }
                }
            };
            box.cleanups.push(remove);
            return {
                remove,
                isOver: () => [...drags.values()].some((drag) => drag.started && drag.over === zone),
                canDrop: () => zones.includes(zone) && zoneAnswers(zone)
                    && [...drags.values()].some((drag) => drag.started && listening.has(drag.target) && accepts(zone, drag.target)),
            };
        },

        lock,
        unlock,
        isLocked: lockedHere,

        destroy: () => {
            unlock();
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onCancel);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerleave', onLeave);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('contextmenu', onContextMenu);
            queue = [];
            registrations = [];
            listening.clear();
            hovered = null;
            pressed.clear();
            drags.clear();
            zones = [];
            active.clear();
            underActive = null;
            setCursor();
        },
    };
};
