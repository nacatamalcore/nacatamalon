import { describe, expect, it } from 'bun:test';
import { createMesh } from '../src/gameobjects/mesh';
import { createScene } from '../src/scene/create_scene';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useBlobShadow } from '../src/hooks/light/use_blob_shadow';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBlobShadowOptions } from '../src/hooks/light/use_blob_shadow';
import type { TBox } from '../src/box';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * The cheap shadow: a disc under a thing, following it.
 *
 * What these are really about is that it costs the renderer nothing. It is an ordinary model
 * wearing an ordinary material, so every claim below can be read off plain data, with no device
 * anywhere near it.
 */

/**
 * A scene with one thing and its shadow, plus a way to run frames through it.
 */
const shadowed = (options: Omit<TBlobShadowOptions, 'target'> = {}) => {
    const { store } = createTestGame();
    let target!: TMesh;
    let shadow!: TMesh;

    const root: TBox = startTestScene(store, 'Level', () => {
        target = createMesh({ geometry: useCubeGeometry(), transform: { y: 0.5 } });
        shadow = useBlobShadow({ target, ...options });
        return createScene();
    });

    return { target, shadow, tick: (seconds: number) => runHookUpdates(root, seconds) };
};

describe('a blob shadow follows what it is under', () => {
    it('sits under it from the very first frame, before anything has run', () => {
        const { shadow } = shadowed();

        expect(shadow.transform.x).toBe(0);
        expect(shadow.transform.z).toBe(0);
    });

    it('moves with it in x and z, and stays on the ground', () => {
        const { target, shadow, tick } = shadowed({ groundY: -2 });

        target.transform.x = 3;
        target.transform.z = -1.5;
        target.transform.y = 7;
        tick(0.016);

        expect(shadow.transform.x).toBe(3);
        expect(shadow.transform.z).toBe(-1.5);
        // Height is the target's alone: the shadow lies on the ground it was given, a hair above
        // it so a floor at exactly that height does not fight it for the pixel.
        expect(shadow.transform.y).toBeGreaterThan(-2);
        expect(shadow.transform.y).toBeCloseTo(-2, 2);
    });

    it('is the size it was asked for, whatever disc it was built from', () => {
        const { shadow } = shadowed({ radius: 1.5 });

        expect(shadow.transform.scaleX).toBeCloseTo(3, 6);
        expect(shadow.transform.scaleZ).toBeCloseTo(3, 6);
    });
});

describe('the jump cue', () => {
    it('grows and fades as the thing above it rises', () => {
        const { target, shadow, tick } = shadowed({ radius: 0.5, opacity: 0.6, followHeight: true });

        target.transform.y = 2;
        tick(0.016);

        // One unit up is half again as wide, so two is twice.
        expect(shadow.transform.scaleX).toBeCloseTo(2, 6);
        expect(shadow.material.alpha).toBeCloseTo(0.3, 6);
    });

    it('comes back to what it was when the thing lands', () => {
        const { target, shadow, tick } = shadowed({ opacity: 0.6, followHeight: true });

        target.transform.y = 2;
        tick(0.016);
        target.transform.y = 0;
        tick(0.016);

        expect(shadow.transform.scaleX).toBeCloseTo(1, 6);
        expect(shadow.material.alpha).toBeCloseTo(0.6, 6);
    });

    it('does not grow below the ground, which would read as the thing falling through it', () => {
        const { target, shadow, tick } = shadowed({ groundY: 0, followHeight: true });

        target.transform.y = -5;
        tick(0.016);

        expect(shadow.transform.scaleX).toBeCloseTo(1, 6);
    });

    it('holds one size when it was not asked to follow the height', () => {
        const { target, shadow, tick } = shadowed({ opacity: 0.5 });

        target.transform.y = 4;
        tick(0.016);

        expect(shadow.transform.scaleX).toBeCloseTo(1, 6);
        expect(shadow.material.alpha).toBeCloseTo(0.5, 6);
    });
});

describe('what it costs', () => {
    it('casts no shadow of its own, so a scene with a real one gets no dark ring', () => {
        const { target, shadow } = shadowed();

        expect(shadow.castShadow).toBe(false);
        // And the ordinary case is untouched: an ordinary model says nothing and so casts.
        expect(target.castShadow).toBeUndefined();
    });

    it('is one shape however many there are', () => {
        const { store } = createTestGame();
        let first!: TMesh;
        let second!: TMesh;

        startTestScene(store, 'Level', () => {
            const cube = useCubeGeometry();
            const a = createMesh({ geometry: cube });
            const b = createMesh({ geometry: cube, transform: { x: 4 } });
            first = useBlobShadow({ target: a, radius: 0.5 });
            second = useBlobShadow({ target: b, radius: 2 });
            return createScene();
        });

        // Different sizes, and still the same disc: a size is a placement, never a shape.
        expect(first.geometry).toBe(second.geometry);
    });

    it('brings both halves of its effect, so it draws the same on either card', () => {
        const { shadow } = shadowed();

        expect(shadow.material.fragment).toContain('fn effect(');
        expect(shadow.material.fragmentGlsl).toContain('vec4 effect(');
        // The two read the same names, which is what makes them the same arithmetic.
        expect(shadow.material.fragment).toContain('uniforms.model');
        expect(shadow.material.fragmentGlsl).toContain('uniforms.model');
        expect(shadow.material.uniforms).toEqual({ softness: 0.4 });
    });
});
