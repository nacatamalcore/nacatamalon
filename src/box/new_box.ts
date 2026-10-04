import { nanoId } from '../utils';
import type { TBox } from './types/t_box';

/**
 * An empty box, ready to be filled: a fresh id, no parent, no children, nothing registered.
 *
 * Attaching it to a parent is the caller's job, so a box can never claim a parent that does
 * not list it among its children.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newBox = (name: string): TBox => ({
    id: nanoId(),
    name,
    parent: null,
    children: [],
    updateCallbacks: [],
    cleanups: [],
    drawables: [],
    data: [],
    sounds: [],
    stores: [],
    physics: null,
    physicsWorld: null,
    scripts: [],
    provided: new Map(),
    paused: false,
    held: false,
    time: 0,
    loads: [],
    destroyed: false,
    spawned: false,
    camera2d: null,
    camera3d: null,
    fog: null,
    transform: null,
    light: null,
    particleCollider: null,
    audioListener: null,
    spriteTexture: null,
    screenSpace: false,
    visible: true,
});
