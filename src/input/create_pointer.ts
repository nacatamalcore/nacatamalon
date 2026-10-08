// Straight from its file: the box barrel reaches the store, and the store creates this pointer.
import { rootOf } from '../box/root_of';
import { screenSizeOf } from '../DOM/screen_size';
import { unapplyView2d } from '../render/shared';
import { pickTargets } from './pick_targets';
import { topmostListening } from './topmost_listening';
import type { TBox } from '../box';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';
import type { TRuntimeStore } from '../store';
import type { TListeningSprite, TPointerTarget } from './topmost_listening';
import type { TPointerInfo, TPointerKind, TPointerListener, TPointerLockOptions, TPointerSource, TPointerWheelListener } from './types/t_pointer';
import type { TSpriteEvents } from './types/t_sprite_events';

/**
 * One event as the DOM left it, already in the game's pixels. `leave` is the pointer leaving the
 * canvas. The wheel's turn rides along, and is nothing for every other kind; so does how far the
 * mouse moved, in pixels of the page, which is nothing for anything but a move.
 */
type TQueuedEvent = {
    kind: TPointerKind | 'leave';
    screenX: number;
    screenY: number;
    button: number;
    deltaX: number;
    deltaY: number;
    movementX: number;
    movementY: number;
};

/**
 * How long a browser that answers a capture with an event rather than a promise is given to answer.
 */
const LOCK_ANSWER_MS = 1000;

/**
 * One listener and who registered it.
 */
type TRegistration = { kind: TPointerKind; box: TBox; listener: TPointerListener | TPointerWheelListener };

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
export const createPointer = (canvas: HTMLCanvasElement): TPointerSource => {
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
     * What listening a press started on, so a click can be told from a drag off it.
     */
    let pressed: TPointerTarget | null = null;

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

    const enqueue = (kind: TQueuedEvent['kind'], event: PointerEvent): void => {
        const { x, y } = toScreen(event);
        const moved = kind === 'move';
        const queued: TQueuedEvent = {
            kind,
            screenX: x,
            screenY: y,
            button: event.button ?? 0,
            deltaX: 0,
            deltaY: 0,
            movementX: moved ? event.movementX ?? 0 : 0,
            movementY: moved ? event.movementY ?? 0 : 0,
        };

        // Many moves can arrive between two frames and only the last position matters, so a move
        // replaces a move right before it; how far it moved is added, as the wheel's turns are,
        // or a quick flick of a captured mouse would lose most of itself. Presses and releases
        // are never merged: a quick click is a down and an up, and both have to arrive.
        const last = queue[queue.length - 1];
        if (moved && last?.kind === 'move') {
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
        enqueue('down', pointerEvent);
    };
    const onUp = (event: Event): void => enqueue('up', event as PointerEvent);
    const onMove = (event: Event): void => enqueue('move', event as PointerEvent);
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
            queue[queue.length - 1] = { ...last, screenX: x, screenY: y, deltaX: last.deltaX + deltaX, deltaY: last.deltaY + deltaY };
            return;
        }
        queue.push({ kind: 'wheel', screenX: x, screenY: y, button: 0, deltaX, deltaY, movementX: 0, movementY: 0 });
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    // Not passive, or the page could not be kept from scrolling while the game uses the wheel.
    canvas.addEventListener('wheel', onWheel, { passive: false });

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
     * What a listener belonging to `box` is told: the world through the camera of its own scene.
     */
    const infoFor = (box: TBox, screenX: number, screenY: number, button: number, hits: Array<TSprite | TText | TNineSlice>): TPointerInfo => {
        const world = unapplyView2d(rootOf(box).camera2d, { x: screenX, y: screenY });
        return {
            screenX,
            screenY,
            worldX: world.x,
            worldY: world.y,
            movementX: movement.x,
            movementY: movement.y,
            button,
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
    const fireSprite = (sprite: TPointerTarget | null, name: keyof TSpriteEvents, screenX: number, screenY: number, button: number, hits: Array<TSprite | TText | TNineSlice>): void => {
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
        const clickable = hovered !== null
            && (listening.get(hovered)?.connections.some((connection) => connection.onClick !== undefined) ?? false);
        canvas.style.cursor = clickable ? 'pointer' : '';
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
            fireSprite(hovered, 'onPointerOut', lastPosition?.x ?? 0, lastPosition?.y ?? 0, 0, []);
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
            fireSprite(hovered, 'onPointerOut', x, y, 0, hits);
            hovered = next;
            fireSprite(hovered, 'onPointerOver', x, y, 0, hits);
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
                fireSprite(sprite, 'onPointerOut', lastPosition?.x ?? 0, lastPosition?.y ?? 0, 0, []);
            }
            hovered = null;
            setCursor();
        }

        entry.connections = entry.connections.filter((existing) => existing !== connection);
        if (entry.connections.length === 0) {
            listening.delete(sprite);
            if (pressed === sprite) {
                pressed = null;
            }
        } else if (hovered === sprite) {
            // Still listening, but maybe no longer clickable.
            setCursor();
        }
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

            for (const event of events) {
                const { kind, screenX, screenY, button, deltaX, deltaY } = event;
                movement.x = event.movementX;
                movement.y = event.movementY;

                if (kind === 'leave') {
                    lastPosition = null;
                    continue;
                }
                lastPosition = { x: screenX, y: screenY };

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
                    pressed = topmost;
                    fireSprite(topmost, 'onPointerDown', screenX, screenY, button, hits);
                    continue;
                }

                // A release: tell whatever is under it, and it is a click only if the press started
                // on that same sprite.
                fireSprite(topmost, 'onPointerUp', screenX, screenY, button, hits);
                if (topmost !== null && topmost === pressed) {
                    fireSprite(topmost, 'onClick', screenX, screenY, button, hits);
                }
                pressed = null;
            }

            // Hover is worked out with the pointer still, so nothing it fires moved the mouse.
            movement.x = 0;
            movement.y = 0;
            refreshHover(store);
        },

        lock,
        unlock,
        isLocked: lockedHere,

        destroy: () => {
            unlock();
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerleave', onLeave);
            canvas.removeEventListener('wheel', onWheel);
            queue = [];
            registrations = [];
            listening.clear();
            hovered = null;
            pressed = null;
            setCursor();
        },
    };
};
