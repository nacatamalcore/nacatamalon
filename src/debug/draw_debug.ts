import { debugMarks } from './debug_marks';
import { createRecord } from '../gameobjects/create_record';
import { trackDrawableOwner, worldPlacementOf } from '../box';
import { worldPlacement3dOf } from '../box/world_placement_3d_of';
import { writeLineList } from '../gameobjects/lines/lines_state';
import { getColor } from '../color';
import { getPhysicsProviders } from '../physics/physics_provider';
import { rectsOf } from '../hitbox/collision_between';
import { sceneTilemaps } from '../gameobjects/tilemap/scene_tilemaps';
import { cellOf, eachCell, gridsOf, slopeSurfaceAt, solidAtCell } from '../physics/character/tile_cells';
import { DEBUG_COLORS } from './t_debug_draw';
import type { TDebugDraw } from './t_debug_draw';
import type { TBox } from '../box/types/t_box';
import type { TRuntimeStore } from '../store/types/t_runtime_store';
import type { TShape, TShapes } from '../gameobjects/shapes/types/t_shapes';
import type { TLine } from '../gameobjects/lines/lines_state';
import type { TLines } from '../gameobjects/lines/types/t_lines';
import type { TDrawable } from '../gameobjects/types';
import type { TPhysicsBody2d, TPhysicsBody3d } from '../physics/types/t_physics';

/**
 * What the debug mode draws in each scene: one set of flat shapes and one of lines in space, on the
 * scene's root, made the first time and kept.
 */
type TOverlay = { shapes: TShapes; lines: TLines | null };

const overlays = new WeakMap<TBox, TOverlay>();

/** What the debug mode added to a scene, which a scene written down leaves out. */
const ours = debugMarks;

/**
 * Whether a drawable is the debug mode's, which is no part of what the scene is.
 *
 * @internal
 */
export const isDebugDrawable = (drawable: TDrawable): boolean => ours.has(drawable);

/** Where the debug drawing sits among what a scene draws: above all of it. */
const ON_TOP = 1_000_000;

const overlayOf = (store: TRuntimeStore, scene: TBox): TOverlay => {
    let overlay = overlays.get(scene);
    if (overlay === undefined) {
        const shapes: TShapes = createRecord('shapes', {
            name: 'debug',
            transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
            shapes: [],
            tint: getColor('white'),
            zIndex: ON_TOP,
            destroyed: false,
        });
        ours.add(shapes);
        scene.drawables.push(shapes);
        trackDrawableOwner(shapes, scene, store);
        overlay = { shapes, lines: null };
        overlays.set(scene, overlay);
    }
    return overlay;
};

/** Lines in space for a scene, made the first time something three-dimensional is drawn. */
const linesOf = (store: TRuntimeStore, scene: TBox, overlay: TOverlay): TLines => {
    if (overlay.lines === null) {
        const lines: TLines = createRecord('lines', {
            name: 'debug',
            transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
            zIndex: ON_TOP,
            visible: true,
            destroyed: false,
        }) as TLines;
        writeLineList(lines, []);
        ours.add(lines);
        scene.drawables.push(lines);
        trackDrawableOwner(lines, scene, store);
        overlay.lines = lines;
    }
    return overlay.lines;
};

/** A thin outline in a colour. */
const stroke = (color: string) => ({ width: 1, color });

/**
 * A pen for one scene and one frame: what is drawn with it is collected, and handed to the scene's
 * overlay at the end.
 */
const penFor = (): { draw: TDebugDraw; shapes: TShape[]; lines: TLine[] } => {
    const shapes: TShape[] = [];
    const lines: TLine[] = [];
    const draw: TDebugDraw = {
        rect: (x, y, width, height, color, rotation = 0) => {
            shapes.push({ type: 'rect', x: x - width / 2, y: y - height / 2, width, height, rotation, stroke: stroke(color) });
        },
        circle: (x, y, radius, color) => {
            shapes.push({ type: 'circle', x, y, radius, stroke: stroke(color) });
        },
        line: (x1, y1, x2, y2, color) => {
            shapes.push({ type: 'line', points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], stroke: stroke(color) });
        },
        polygon: (points, color) => {
            if (points.length < 2) return;
            shapes.push({ type: 'line', points: points.map((point) => ({ x: point.x, y: point.y })), closed: true, stroke: stroke(color) });
        },
        line3d: (from, to, color) => {
            lines.push({ from: { ...from }, to: { ...to }, color });
        },
    };
    return { draw, shapes, lines };
};

/** The colour of a body by how it moves, or as a sensor. */
const colorOf = (body: { body: string; sensor: boolean }): string =>
    body.sensor ? DEBUG_COLORS.sensor : body.body === 'dynamic' ? DEBUG_COLORS.moving : body.body === 'kinematic' ? DEBUG_COLORS.driven : DEBUG_COLORS.still;

/** A flat collider of the full simulation, from what the object keeps, where the object is. */
const drawBody2d = (box: TBox, body: TPhysicsBody2d, draw: TDebugDraw): void => {
    const at = worldPlacementOf(box);
    const color = colorOf(body);
    const collider = body.collider;
    if (collider.shape === 'rect') {
        draw.rect(at.x, at.y, collider.width * Math.abs(at.scaleX), collider.height * Math.abs(at.scaleY), color, at.rotation);
    } else if (collider.shape === 'circle') {
        const radius = collider.radius * Math.max(Math.abs(at.scaleX), Math.abs(at.scaleY));
        draw.circle(at.x, at.y, radius, color);
        // A spoke, so a turning wheel is seen to turn.
        draw.line(at.x, at.y, at.x + Math.cos(at.rotation) * radius, at.y + Math.sin(at.rotation) * radius, color);
    } else {
        const cos = Math.cos(at.rotation);
        const sin = Math.sin(at.rotation);
        draw.polygon(collider.vertices.map(([vx, vy]) => {
            const x = vx * at.scaleX;
            const y = vy * at.scaleY;
            return { x: at.x + x * cos - y * sin, y: at.y + x * sin + y * cos };
        }), color);
    }
};

/** Turns a point by a quaternion. */
const rotate = (q: readonly [number, number, number, number], v: { x: number; y: number; z: number }) => {
    const [qx, qy, qz, qw] = q;
    const tx = 2 * (qy * v.z - qz * v.y);
    const ty = 2 * (qz * v.x - qx * v.z);
    const tz = 2 * (qx * v.y - qy * v.x);
    return {
        x: v.x + qw * tx + (qy * tz - qz * ty),
        y: v.y + qw * ty + (qz * tx - qx * tz),
        z: v.z + qw * tz + (qx * ty - qy * tx),
    };
};

/** A collider in space, as lines: a box's edges, a ball's three rings, a capsule's rings and sides. */
const drawBody3d = (box: TBox, body: TPhysicsBody3d, draw: TDebugDraw): void => {
    const pose = worldPlacement3dOf(box);
    const color = colorOf(body);
    const s = pose.scale;
    const toWorld = (x: number, y: number, z: number) => {
        const local = { x: (x + body.offset[0]) * s.x, y: (y + body.offset[1]) * s.y, z: (z + body.offset[2]) * s.z };
        const turned = rotate(pose.quaternion, local);
        return { x: pose.position.x + turned.x, y: pose.position.y + turned.y, z: pose.position.z + turned.z };
    };
    const ring = (radius: number, y: number, plane: 'xz' | 'xy' | 'yz') => {
        const steps = 16;
        for (let i = 0; i < steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            const b = ((i + 1) / steps) * Math.PI * 2;
            const at = (angle: number) => plane === 'xz'
                ? toWorld(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
                : plane === 'xy' ? toWorld(Math.cos(angle) * radius, y + Math.sin(angle) * radius, 0) : toWorld(0, y + Math.cos(angle) * radius, Math.sin(angle) * radius);
            draw.line3d(at(a), at(b), color);
        }
    };
    const collider = body.collider;
    if (collider.shape === 'box') {
        const [hx, hy, hz] = collider.size.map((size) => size / 2);
        const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as const)));
        for (const [ax, ay, az] of corners) {
            for (const [bx, by, bz] of corners) {
                // The twelve edges: corners that differ in one coordinate.
                const differ = Number(ax !== bx) + Number(ay !== by) + Number(az !== bz);
                if (differ === 1 && (ax < bx || ay < by || az < bz)) draw.line3d(toWorld(ax * hx, ay * hy, az * hz), toWorld(bx * hx, by * hy, bz * hz), color);
            }
        }
    } else if (collider.shape === 'sphere') {
        ring(collider.radius, 0, 'xz');
        ring(collider.radius, 0, 'xy');
        ring(collider.radius, 0, 'yz');
    } else if (collider.shape === 'capsule') {
        const half = Math.max(0, collider.height / 2 - collider.radius);
        ring(collider.radius, half, 'xz');
        ring(collider.radius, -half, 'xz');
        for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            draw.line3d(toWorld(x * collider.radius, -half, z * collider.radius), toWorld(x * collider.radius, half, z * collider.radius), color);
        }
    }
};

/**
 * The tiles of a scene's maps that stop things: the edges of the solid regions (only where a solid
 * cell meets one that is not, so a wall of tiles is one outline and not a grid), the tops of ledges,
 * and the surfaces of slopes.
 */
const drawTiles = (store: TRuntimeStore, scene: TBox, draw: TDebugDraw): void => {
    for (const grid of gridsOf(sceneTilemaps(store, scene), () => {})) {
        eachCell([grid], grid.x, grid.y, grid.x + grid.map.width * grid.w, grid.y + grid.map.height * grid.h, (_grid, column, row, left, top) => {
            const cell = cellOf(grid.map, column, row);
            const right = left + grid.w;
            const bottom = top + grid.h;
            if (cell.solid) {
                if (!solidAtCell(grid, column, row - 1)) draw.line(left, top, right, top, DEBUG_COLORS.tile);
                if (!solidAtCell(grid, column, row + 1)) draw.line(left, bottom, right, bottom, DEBUG_COLORS.tile);
                if (!solidAtCell(grid, column - 1, row)) draw.line(left, top, left, bottom, DEBUG_COLORS.tile);
                if (!solidAtCell(grid, column + 1, row)) draw.line(right, top, right, bottom, DEBUG_COLORS.tile);
            } else if (cell.slope !== undefined) {
                draw.line(left, slopeSurfaceAt(cell.slope, left, top, grid.w, grid.h, left), right, slopeSurfaceAt(cell.slope, left, top, grid.w, grid.h, right), DEBUG_COLORS.tile);
            } else if (cell.oneWay) {
                draw.line(left, top, right, top, DEBUG_COLORS.ledge);
            }
        });
    }
};

/**
 * What the engine itself knows to draw in a scene: the colliders of the full simulation, flat and in
 * space, from what each object keeps; every hitbox; and the tiles that stop things. A physics draws
 * the rest from its provider.
 */
const drawScene = (store: TRuntimeStore, scene: TBox, draw: TDebugDraw): void => {
    const visit = (box: TBox): void => {
        if (box.destroyed) return;
        const body = box.physics;
        if (body !== null && body._type === 'physics-body-2d') drawBody2d(box, body, draw);
        if (body !== null && body._type === 'physics-body-3d') drawBody3d(box, body, draw);
        if (box.hitboxes.length > 0) {
            for (const rect of rectsOf(box)) draw.rect(rect.cx, rect.cy, rect.hx * 2, rect.hy * 2, DEBUG_COLORS.hitbox, rect.rotation);
        }
        for (const child of box.children) visit(child);
    };
    visit(scene);
    drawTiles(store, scene, draw);
    for (const provider of getPhysicsProviders()) provider.drawDebug?.(scene, draw);
};

/**
 * Draws, or stops drawing, what every scene is made of, for the frame about to be shown: called once
 * the updates are over. Off, the overlays already made are hidden and cost nothing more.
 *
 * @internal
 */
export const updateDebug = (store: TRuntimeStore): void => {
    const on = store.get('config').debug;
    for (const scene of store.get('world').scenes) {
        if (!on) {
            const overlay = overlays.get(scene);
            if (overlay !== undefined) {
                overlay.shapes.visible = false;
                if (overlay.lines !== null) overlay.lines.visible = false;
            }
            continue;
        }
        if (scene.held) continue;
        const overlay = overlayOf(store, scene);
        const pen = penFor();
        drawScene(store, scene, pen.draw);
        overlay.shapes.shapes = pen.shapes;
        overlay.shapes.visible = true;
        if (pen.lines.length > 0 || overlay.lines !== null) {
            const lines = linesOf(store, scene, overlay);
            writeLineList(lines, pen.lines);
            lines.visible = pen.lines.length > 0;
        }
    }
};
