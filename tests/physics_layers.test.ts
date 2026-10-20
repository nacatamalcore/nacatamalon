import { afterEach, describe, expect, it } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { cleanLayerNames, resolveLayers } from '../src/physics/layer_names';
import { parseProject } from '../src/project';
import { gameOptionsFromProject } from '../src/project/game_options_from_project';
import { createScene } from '../src/scene/create_scene';
import { usePhysicsBody2d, usePhysicsBody3d } from '../src/hooks/physics';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TPhysicsBody2d, TPhysicsBody3d } from '../src/physics/types/t_physics';

/**
 * Physics layers by name: what a game calls them, and the numbers the format keeps.
 */

afterEach(() => { registerPhysicsProvider(null); });

const NAMES = ['world', 'player', 'enemy', 'shot'];

describe('layer names', () => {
    it('turn into the numbers and the mask the format keeps', () => {
        expect(resolveLayers({ layer: 'enemy', collidesWith: ['world', 'shot'] }, NAMES)).toEqual({
            layer: 2,
            collidesWith: (1 << 0) | (1 << 3),
        });
        // Numbers stay numbers, a mask stays a mask, and a list may mix the two.
        expect(resolveLayers({ layer: 1, collidesWith: 5 }, NAMES)).toEqual({ layer: 1, collidesWith: 5 });
        expect(resolveLayers({ collidesWith: ['player', 3] }, NAMES)).toEqual({ collidesWith: (1 << 1) | (1 << 3) });
        expect(resolveLayers({}, NAMES)).toEqual({});
    });

    it('take a name nobody gave as layer 0, and say so once', () => {
        const warn = console.warn;
        const said: string[] = [];
        console.warn = (message: string) => { said.push(message); };
        try {
            expect(resolveLayers({ layer: 'ghost' }, NAMES)).toEqual({ layer: 0 });
            resolveLayers({ layer: 'ghost' }, NAMES);
        } finally {
            console.warn = warn;
        }
        expect(said).toHaveLength(1);
        expect(said[0]).toContain("no layer called 'ghost'");
        expect(said[0]).toContain('world, player, enemy, shot');
    });

    it('are kept clean: names, each once, sixteen at most', () => {
        expect(cleanLayerNames(['world', '', ' player ', 'world', 3])).toEqual(['world', 'player']);
        expect(cleanLayerNames(Array.from({ length: 20 }, (_, i) => `l${i}`))).toHaveLength(16);
        expect(cleanLayerNames(undefined)).toEqual([]);
    });

    it('come from the project file into the game', () => {
        const settings = parseProject({ physicsLayers: ['world', 'player'] });
        expect(settings.physicsLayers).toEqual(['world', 'player']);
        expect(gameOptionsFromProject(settings).physicsLayers).toEqual(['world', 'player']);
    });
});

describe('a body that says its layers by name', () => {
    it('is written down with their numbers, in 2D and in 3D', () => {
        const { store } = createTestGame({ physicsLayers: NAMES });
        let flat!: TPhysicsBody2d;
        let solid!: TPhysicsBody3d;
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform({ x: 0, y: 0 });
                flat = usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'circle', radius: 4 }, layer: 'shot', collidesWith: ['enemy', 'world'] });
            }, 'Shot')();
            useSpawn(() => {
                useTransform({ x: 0, y: 0, z: 0 });
                solid = usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [1, 1, 1] }, layer: 'world' });
            }, 'Wall')();
            return createScene();
        });

        expect([flat.layer, flat.collidesWith]).toEqual([3, (1 << 2) | (1 << 0)]);
        expect(solid.layer).toBe(0);
    });
});
