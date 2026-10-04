import { describe, expect, it } from 'bun:test';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createScene } from '../src/scene/create_scene';
import { useTransform } from '../src/hooks/transform';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useCamera3d } from '../src/hooks';
import { createMesh } from '../src/gameobjects/mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useHelperAxis, useHelperGrid, useHelperLines } from '../src/hooks/helpers';
import { writeLines } from '../src/gameobjects/lines';
import { LINE_VERTEX_FLOATS } from '../src/render/shared/line_vertex';
import { serializeScene } from '../src/scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext, TDrawLines, TRenderPass } from '../src/render/interface';
import type { TLines } from '../src/gameobjects/lines';

/**
 * Lines in space: what the debug helpers draw.
 *
 * The rule tested most is where a corner ends up: lines are written measured from their object and
 * have to reach the card already in the world, following the object as it moves. The other one is
 * that the record stays plain data and the corners live beside it.
 */

const frame = (store: ReturnType<typeof createTestGame>['store']): TRenderPass => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx, 0);
    return ctx.passes[ctx.passes.length - 1];
};

const linesIn = (pass: TRenderPass): TDrawLines[] =>
    (pass.drawables ?? []).filter((item) => item.type === 'lines') as unknown as TDrawLines[];

/**
 * Corner `i` of a drawn set, as `[x, y, z, r, g, b, a]`.
 */
const corner = (lines: TDrawLines, i: number): number[] =>
    Array.from(lines.vertices.subarray(i * LINE_VERTEX_FLOATS, (i + 1) * LINE_VERTEX_FLOATS));

const RED_LINE = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1]);

describe('writing lines', () => {
    it('keeps the record plain data: the corners live beside it', () => {
        const { store } = createTestGame();
        let made!: TLines;
        startTestScene(store, 'Level', () => {
            [made] = useHelperLines({ vertices: RED_LINE });
            return createScene();
        });

        expect(JSON.parse(JSON.stringify(made))).toEqual(made);
        expect(Object.values(made).some((value) => value instanceof Float32Array)).toBe(false);
    });

    it('refuses a run that is not a whole number of lines', () => {
        const { store } = createTestGame();
        let made!: TLines;
        startTestScene(store, 'Level', () => {
            [made] = useHelperLines();
            return createScene();
        });

        expect(() => writeLines(made, new Float32Array(LINE_VERTEX_FLOATS))).toThrow(/not a whole number of lines/);
    });

    it('draws what was written last, shorter or longer than before', () => {
        const { store } = createTestGame();
        let set!: (vertices: Float32Array) => void;
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            [, set] = useHelperLines({ vertices: RED_LINE });
            return createScene();
        });
        expect(linesIn(frame(store))[0].count).toBe(2);

        const three = new Float32Array(RED_LINE.length * 3);
        three.set(RED_LINE, 0);
        three.set(RED_LINE, RED_LINE.length);
        three.set(RED_LINE, RED_LINE.length * 2);
        set(three);
        expect(linesIn(frame(store))[0].count).toBe(6);

        set(RED_LINE);
        expect(linesIn(frame(store))[0].count).toBe(2);
    });

    it('copies what it is given, so the caller can reuse its array', () => {
        const { store } = createTestGame();
        let set!: (vertices: Float32Array) => void;
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            [, set] = useHelperLines();
            return createScene();
        });
        const mine = new Float32Array(RED_LINE);
        set(mine);
        mine[7] = 99;

        expect(corner(linesIn(frame(store))[0], 1)[0]).toBe(1);
    });
});

describe('where the lines are drawn', () => {
    it('reaches the backend in the world, placed, turned and scaled by its own transform', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            useHelperLines({ vertices: RED_LINE, transform: { x: 10, rotationY: Math.PI / 2, scaleX: 2 } });
            return createScene();
        });

        const drawn = linesIn(frame(store))[0];
        expect(corner(drawn, 0).slice(0, 3)).toEqual([10, 0, 0]);
        // (1, 0, 0) scaled by 2 and turned a quarter round Y is (0, 0, -2), then moved 10 along X.
        const [x, y, z] = corner(drawn, 1);
        expect(x).toBeCloseTo(10, 6);
        expect(y).toBeCloseTo(0, 6);
        expect(z).toBeCloseTo(-2, 6);
        expect(corner(drawn, 1).slice(3)).toEqual([1, 0, 0, 1]);
    });

    it('follows the object it was made in, as that object moves', () => {
        const { store } = createTestGame();
        let place!: ReturnType<typeof useTransform>;
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            useSpawn(() => {
                place = useTransform({ x: 3 });
                useHelperLines({ vertices: RED_LINE });
            })();
            return createScene();
        });
        expect(corner(linesIn(frame(store))[0], 0)[0]).toBeCloseTo(3, 6);

        place.x = -4;
        place.y = 2;
        const moved = corner(linesIn(frame(store))[0], 1);
        expect(moved[0]).toBeCloseTo(-3, 6);
        expect(moved[1]).toBeCloseTo(2, 6);
    });

    it('is seen through the scene\'s 3D view, like a model', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            useHelperAxis();
            return createScene();
        });

        const pass = frame(store);
        const at = (pass.drawables ?? []).findIndex((item) => item.type === 'lines');
        expect(pass.viewIndex?.[at]).toBe(0);
        expect(pass.views3d).toHaveLength(1);
    });

    it('is not handed to the backend at all when hidden', () => {
        const { store } = createTestGame();
        let axis!: TLines;
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            axis = useHelperAxis();
            return createScene();
        });
        axis.visible = false;
        expect(linesIn(frame(store))).toHaveLength(0);

        axis.visible = true;
        expect(linesIn(frame(store))[0].count).toBe(6);
    });

    it('keeps its place among the models, in the order they were made', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            const cube = useCubeGeometry();
            createMesh({ geometry: cube });
            useHelperAxis();
            createMesh({ geometry: cube });
            return createScene();
        });

        expect((frame(store).drawables ?? []).map((item) => item.type)).toEqual(['mesh', 'lines', 'mesh']);
    });
});

describe('the helpers', () => {
    it('draws three arms from the middle, or six with the other halves dimmed', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            useHelperAxis({ size: 2 });
            useHelperAxis({ size: 2, negative: true });
            return createScene();
        });

        const [plain, both] = linesIn(frame(store));
        expect(plain.count).toBe(6);
        expect(both.count).toBe(12);
        // X red to (2, 0, 0), Y green, Z blue.
        expect(corner(plain, 1)).toEqual([2, 0, 0, 1, expect.closeTo(0.23, 5), expect.closeTo(0.23, 5), 1] as never);
        expect(corner(plain, 3).slice(0, 3)).toEqual([0, 2, 0]);
        expect(corner(plain, 5).slice(0, 3)).toEqual([0, 0, 2]);
        // The other half of X goes the other way, darker.
        expect(corner(both, 7)[0]).toBe(-2);
        expect(corner(both, 7)[3]).toBeCloseTo(0.4, 5);
    });

    it('draws a grid of 2n + 1 lines each way, the middle ones in the axes\' colours', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            useHelperGrid({ half: 2, step: 1 });
            return createScene();
        });

        const grid = linesIn(frame(store))[0];
        // Five lines along X and five along Z, two corners each.
        expect(grid.count).toBe(20);
        const reds = [];
        for (let i = 0; i < grid.count; i++) {
            const c = corner(grid, i);
            expect(c[1]).toBe(0);
            if (c[3] > 0.6) reds.push(c);
        }
        // The one line along X at z = 0: two corners, from -2 to 2.
        expect(reds.map((c) => [c[0], c[2]])).toEqual([[-2, 0], [2, 0]]);
    });

    it('does not lose the last line to a step that is not exact in binary', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            useHelperGrid({ half: 0.3, step: 0.1 });
            return createScene();
        });

        // -0.3 to 0.3 in tenths is seven lines each way.
        expect(linesIn(frame(store))[0].count).toBe(28);
    });

    it('refuses a grid with no size or no step, which would never finish', () => {
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', () => {
            useHelperGrid({ step: 0 });
            return createScene();
        })).toThrow(/more than zero/);
    });

    it('is left out of a scene document: it is a debug drawing, not part of the scene', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            useHelperGrid();
            return createScene();
        });

        const doc = serializeScene(root);
        expect(JSON.stringify(doc)).not.toContain('lines');
    });
});
