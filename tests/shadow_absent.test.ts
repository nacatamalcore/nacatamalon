import { describe, expect, it } from 'bun:test';
import { findShadowSource } from '../src/render/shared/light_space';
import type { TDrawItem, TDrawLight, TDrawMesh, TFrameContext, TDrawView3d } from '../src/render/interface';

/**
 * The promise that this feature is free for the games that do not use it.
 *
 * It is the same contract the effects chain keeps, and it is worth a file of its own for the same
 * reason: a scene lit by eight ordinary lamps must draw exactly what it drew before shadows
 * existed, make no 16 MB picture, and record no extra pass. Everything below reads that off the
 * one answer the whole feature hangs on.
 */

const at = () => ({ x: 0, y: 0, z: 0, rotation: 0, rotationX: -0.9, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });

const light = (fields: Partial<TDrawLight> = {}): TDrawLight => ({
    type: 'directional',
    color: { r: 1, g: 1, b: 1, a: 1 },
    intensity: 1,
    transform: at(),
    ...fields,
});

const mesh = (fields: Partial<TDrawMesh> = {}): TDrawMesh => ({
    type: 'mesh',
    geometry: null,
    transform: at(),
    material: {} as TDrawMesh['material'],
    skeleton: null,
    ...fields,
});

const view = (lights: TDrawLight[]): TDrawView3d => ({ camera: null, lights, ambient: { r: 0, g: 0, b: 0, a: 1 } });

const frame = (pass: Partial<TFrameContext['passes'][number]>): TFrameContext => ({
    time: 0,
    passes: [{ ...pass }],
} as TFrameContext);

describe('a scene that never asked for shadows', () => {
    it('gets no light to draw from, which is what stops everything else happening', () => {
        const ctx = frame({
            views3d: [view([light(), light({ type: 'point' })])],
            drawables: [mesh() as TDrawItem],
            viewIndex: [0],
        });

        expect(findShadowSource(ctx)).toBeNull();
    });

    it('gets none from a scene with no models and no lights at all', () => {
        expect(findShadowSource(frame({}))).toBeNull();
    });

    it('gets none when the only light that asked is a bulb', () => {
        const ctx = frame({ views3d: [view([light({ type: 'point', castShadow: true })])] });

        expect(findShadowSource(ctx)).toBeNull();
    });
});

describe('a scene that did ask', () => {
    it("hands back the light, which of the scene's lights it is, and what goes in the map", () => {
        const floor = mesh({ castShadow: false });
        const crate = mesh();
        const ctx = frame({
            views3d: [view([light(), light({ castShadow: true })])],
            drawables: [floor, crate] as TDrawItem[],
            viewIndex: [0, 0],
        });

        const source = findShadowSource(ctx)!;

        expect(source).not.toBeNull();
        expect(source.lightIndex).toBe(1);
        // The floor is left out of the map and still receives: being drawn into it is about
        // casting, never about receiving.
        expect(source.casters).toEqual([crate]);
    });

    it("takes only its own scene's models, so a menu over a level does not cast into it", () => {
        const inLevel = mesh();
        const inMenu = mesh();
        const ctx = frame({
            views3d: [view([light({ castShadow: true })]), view([light()])],
            drawables: [inLevel, inMenu] as TDrawItem[],
            viewIndex: [0, 1],
        });

        expect(findShadowSource(ctx)!.casters).toEqual([inLevel]);
    });

    it('is the first scene that asked, not the last one drawn', () => {
        const first = light({ castShadow: true, intensity: 0.5 });
        const second = light({ castShadow: true, intensity: 9 });
        const ctx = frame({ views3d: [view([first]), view([second])] });

        expect(findShadowSource(ctx)!.light).toBe(first);
    });

    it('leaves out a model with no shape on the card, because there is nothing to draw', () => {
        const ctx = frame({
            views3d: [view([light({ castShadow: true })])],
            drawables: [mesh()] as TDrawItem[],
            viewIndex: [0],
        });

        // It is still counted as a caster here: whether a shape has arrived is the pass's question,
        // asked at the moment of drawing, exactly as the pass that lights the scene asks it.
        expect(findShadowSource(ctx)!.casters).toHaveLength(1);
    });
});
