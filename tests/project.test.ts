import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { DEFAULT_PROJECT_SETTINGS, gameOptionsFromProject, parseProject } from '../src/project';

afterEach(() => {
    (console.warn as { mockRestore?: () => void }).mockRestore?.();
});

const silence = () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
    return warn;
};

describe('parseProject', () => {
    it('reads a whole file', () => {
        const settings = parseProject({
            format: 'nacatamalon-project',
            version: 1,
            name: 'Nacatamal Quest',
            width: 256,
            height: 224,
            background: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
            smooth: true,
            msaa: 4,
            renderer: 'WEBGL2',
            scaling: 'integer',
            keep: 'height',
            pixelRatio: 'device',
            pauseOnBlur: false,
            seed: 7,
            mainScene: 'Level',
            actions: [{ name: 'jump', bindings: [{ type: 'key', key: ' ' }] }],
            actionsPersist: 'localStorage',
        });

        expect(settings.name).toBe('Nacatamal Quest');
        expect(settings.width).toBe(256);
        expect(settings.msaa).toBe(4);
        expect(settings.renderer).toBe('WEBGL2');
        expect(settings.scaling).toBe('integer');
        expect(settings.keep).toBe('height');
        expect(settings.pixelRatio).toBe('device');
        expect(settings.seed).toBe(7);
        expect(settings.mainScene).toBe('Level');
        expect(settings.actions).toEqual([{ name: 'jump', bindings: [{ type: 'key', key: ' ' }] }]);
        expect(settings.actionsPersist).toBe('localStorage');
    });

    it('fills in what is missing', () => {
        const settings = parseProject({ name: 'Half written' });

        expect(settings.name).toBe('Half written');
        expect(settings.width).toBe(DEFAULT_PROJECT_SETTINGS.width);
        expect(settings.background).toEqual(DEFAULT_PROJECT_SETTINGS.background);
        expect(settings.actions).toEqual([]);
        expect(settings.seed).toBeUndefined();
        expect(settings.pixelRatio).toBe(1);
    });

    it('reads a numeric pixel ratio, and falls back from one that could not draw', () => {
        expect(parseProject({ pixelRatio: 1.5 }).pixelRatio).toBe(1.5);
        for (const bad of [0, -2, 'retina', null]) {
            expect(parseProject({ pixelRatio: bad }).pixelRatio).toBe(DEFAULT_PROJECT_SETTINGS.pixelRatio);
        }
    });

    it('survives nonsense in every field', () => {
        const settings = parseProject({
            width: 'wide',
            height: null,
            background: 'blue',
            smooth: 'yes',
            msaa: 3,
            renderer: 'VULKAN',
            scaling: 'stretchy',
            keep: 42,
            actions: 'none',
            actionsPersist: 'carrier pigeon',
        });

        expect(settings.width).toBe(DEFAULT_PROJECT_SETTINGS.width);
        expect(settings.height).toBe(DEFAULT_PROJECT_SETTINGS.height);
        expect(settings.background).toEqual(DEFAULT_PROJECT_SETTINGS.background);
        expect(settings.smooth).toBe(false);
        expect(settings.msaa).toBe(1);
        expect(settings.renderer).toBe('AUTO');
        expect(settings.scaling).toBe(DEFAULT_PROJECT_SETTINGS.scaling);
        expect(settings.keep).toBe(DEFAULT_PROJECT_SETTINGS.keep);
        expect(settings.actions).toEqual([]);
        expect(settings.actionsPersist).toBe('none');
    });

    it('says so when it is not a project of this engine, and starts over', () => {
        const warn = silence();
        const settings = parseProject({ format: 'another-engine', width: 999 });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(settings.width).toBe(DEFAULT_PROJECT_SETTINGS.width);
    });

    it('says so when it comes from a newer version, and keeps what it understands', () => {
        const warn = silence();
        const settings = parseProject({ format: 'nacatamalon-project', version: 99, width: 400, wormholes: true });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(settings.width).toBe(400);
        expect(settings.version).toBe(1);
    });

    it('takes anything that is not an object as no project at all', () => {
        const warn = silence();
        expect(parseProject(null).width).toBe(DEFAULT_PROJECT_SETTINGS.width);
        expect(parseProject('{}').width).toBe(DEFAULT_PROJECT_SETTINGS.width);
        expect(warn).toHaveBeenCalledTimes(2);
    });
});

describe('parseProject and the editor', () => {
    it('reads the full-screen effect chain, and drops an entry that names nothing', () => {
        const settings = parseProject({ post: [{ shader: 'shaders/crt.wgsl', uniforms: { curve: 0.3 } }, { uniforms: {} }] });

        expect(settings.post).toEqual([{ shader: 'shaders/crt.wgsl', uniforms: { curve: 0.3 } }]);
        expect(gameOptionsFromProject(settings).post).toEqual(settings.post);
    });

    it('reads a file the editor wrote under its old tag, in full', () => {
        const settings = parseProject({ format: 'nacatamal-project', version: 1, name: 'Demo', width: 640, mainScene: 'room-a' });

        expect(settings.format).toBe('nacatamalon-project');
        expect(settings.name).toBe('Demo');
        expect(settings.width).toBe(640);
        expect(settings.mainScene).toBe('room-a');
    });

    it('treats a blank name as no name', () => {
        expect(parseProject({ name: '   ' }).name).toBe(DEFAULT_PROJECT_SETTINGS.name);
    });
});

describe('gameOptionsFromProject', () => {
    it('matches the game options field by field', () => {
        const settings = { ...DEFAULT_PROJECT_SETTINGS, width: 400, height: 300, seed: 3, actions: [{ name: 'jump', bindings: [] }] };
        const options = gameOptionsFromProject(settings);

        expect(options).toEqual({
            width: 400,
            height: 300,
            background: settings.background,
            renderer: settings.renderer,
            seed: 3,
            smooth: settings.smooth,
            msaa: settings.msaa,
            scaling: settings.scaling,
            keep: settings.keep,
            pixelRatio: settings.pixelRatio,
            pauseOnBlur: settings.pauseOnBlur,
            actions: settings.actions,
            actionsPersist: undefined,
            post: settings.post,
        });
    });

    it('gives the player a place to keep their controls when the project asks for one', () => {
        const local = gameOptionsFromProject({ ...DEFAULT_PROJECT_SETTINGS, actionsPersist: 'localStorage' });
        const database = gameOptionsFromProject({ ...DEFAULT_PROJECT_SETTINGS, actionsPersist: 'indexedDb' });

        expect(typeof local.actionsPersist?.adapter.save).toBe('function');
        expect(typeof database.actionsPersist?.adapter.save).toBe('function');
    });
});
