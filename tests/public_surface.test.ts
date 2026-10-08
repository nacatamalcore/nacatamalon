import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * Which door each name goes out of.
 *
 * The front one is for whoever writes a game, `nacatamalon/authoring` for a tool,
 * `nacatamalon/extend` for a package that extends the engine, and `nacatamalon/physics2d` and
 * `nacatamalon/physics3d` for a game that simulates. The rule is literal, **would a published game ever run this**, and the reason it needs a
 * test is that breaking it is completely silent: a name for an editor sitting on the front door
 * works perfectly, and only shows up later, as a rename that cannot be made without breaking the
 * promise the engine makes to people who never called it.
 *
 * It is not hypothetical. Five of these were put on the front door the day the script system
 * landed, and nothing failed.
 */

/**
 * Every value (not type) a barrel hands out.
 */
const valuesOf = (path: string): string[] => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const names: string[] = [];
    for (const match of source.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g)) {
        if (match[1] !== undefined) continue;
        for (const part of match[2].split(',')) {
            const name = part.trim();
            if (name.length === 0 || name.startsWith('type ')) continue;
            names.push(name.split(' as ').pop()!.trim());
        }
    }
    return names;
};

const front = valuesOf('../src/index.ts');
const tools = valuesOf('../src/authoring/index.ts');
const extend = valuesOf('../src/extend/index.ts');
const physics2d = valuesOf('../src/physics/rapier2d/index.ts');
const physics3d = valuesOf('../src/physics/box3d/index.ts');

describe('the front door', () => {
    it('hands out nothing that only a tool calls', () => {
        // `list*` and `clear*` are the two shapes an index takes, and both of them are a tool's
        // question about a project rather than anything a game does. The two exceptions are named
        // rather than carved out by prefix, so the trap still catches the next one: a game really
        // does clear an emitter's particles, and really does listen to a signal.
        const gamesOwn = ['clearParticles', 'listen'];
        const toolOnly = front.filter((name) => !gamesOwn.includes(name) && (
            name.startsWith('serialize')
            || name.startsWith('empty')
            || name.startsWith('list')
            || name.startsWith('clear')
            || ['getScriptFields', 'getScriptRequires', 'defaultScriptProps', 'defaultStoreFieldValue', 'storeFieldsFromState'].includes(name)
        ));

        expect(toolOnly).toEqual([]);
    });

    it('keeps what a game itself runs, including reading a document', () => {
        for (const name of [
            'createGame', 'registerScript', 'useScript', 'parseSceneDoc', 'sceneFromDoc',
            // A published game resolves the store an object was given, and lays what its files
            // author over what its code declared, on the way up.
            'storeOf', 'getGameStore', 'applyStoreDocs', 'parseStoreDoc', 'useStoreLink',
            // A published game loads a `.shader` it ships with, and may compose one in code.
            'parseShaderGraph', 'compileShaderGraph', 'compileShader',
            // A published game loads its sheets.
            'parseAtlasDoc',
            // And its maps, palettes and shader files; and a controls screen names its keys.
            'parseTilemapDoc', 'parsePaletteDoc', 'parseShaderFile', 'parseShaderSource',
            'bindingKey', 'describeBinding',
        ]) {
            expect(front).toContain(name);
        }
    });

    it('hands out the arithmetic a game would otherwise write by hand', () => {
        // Measured on the web's examples: `clamp` written out eighteen times, the distance between two
        // transforms eight. The matrices are deliberately not here: they are the renderer's.
        for (const name of ['clamp', 'lerp', 'degToRad', 'wrapAngle', 'lerpAngle', 'vec2Distance', 'vec2Angle', 'vec3Cross']) {
            expect(front).toContain(name);
        }
        expect(front.some((name) => name.startsWith('mat4'))).toBe(false);
    });

    it('keeps the vocabulary: the values move, the types of the format stay', () => {
        const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
        // A game that types a variable as one of these must never have to reach into the tools door.
        for (const name of ['TSceneDoc', 'TScriptField', 'TScriptProps', 'TBoxNode', 'TStoreDoc', 'TStoreField']) {
            expect(source).toContain(name);
        }
    });

    it('does not hand out the types of a tool or of an extension', () => {
        // Those go with the door they belong to. On the front door they are not only noise in a
        // game's autocomplete: `TPreviewHarness` names WebGPU's own types, which TypeScript 5 does
        // not have, and every game stopped compiling on it.
        const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
        for (const name of ['TEditorHandle', 'TCameraPreview', 'TPreviewHarness', 'TNodeDef', 'TRuntimeStore', 'TPhysicsProvider', 'TBox', 'IBuffer', 'ITexture']) {
            expect(source).not.toMatch(new RegExp(`\\b${name}\\b`));
        }
    });
});

describe('the tools door', () => {
    it('is where writing a scene down lives, and looking inside the registry', () => {
        expect(tools.sort()).toEqual([
            'clearGameStores', 'clearScripts', 'defaultScriptProps', 'defaultStoreFieldValue',
            'editorHandleOf', 'emptyStoreDoc', 'getScriptFields', 'getScriptRequires', 'listGameStores',
            'listScripts', 'serializeScene', 'serializeStoreDoc', 'storeFieldsFromState',
            // The shader composer's palette and thumbnails: a game compiles a graph, it never lists
            // the kinds of node there are or draws a small picture of one.
            'NODE_CATALOG', 'NODE_CATEGORIES', 'NODE_DEFS', 'compileNodePreviews', 'compilePreviewShader',
            'defaultParams', 'emptyShaderGraph', 'inferGraphTypes', 'nodeDef',
            // And what those pictures are drawn through.
            'buildPreviewHarness', 'PREVIEW_QUAD_VERTICES', 'PREVIEW_VERTEX_BUFFERS', 'PREVIEW_FRAME_UNIFORMS',
            'PREVIEW_INSTANCE',
            // A sheet editor's: saving an atlas, starting one for an image, and drawing its cut over
            // the image. A game only reads one.
            'serializeAtlasDoc', 'emptyAtlasDoc', 'atlasDocFrames',
            // The same for maps and palettes, and a model's tree of pieces for bringing it in.
            'serializeTilemapDoc', 'emptyTilemapDoc', 'serializePaletteDoc', 'emptyPaletteDoc', 'readGltfNodes',
            // Where a store came from: an editor labels it, a game never asks.
            'isProvisionalStore',
            // An effect's: saving and starting one, and what an editor measures and draws around it.
            'serializeParticlesDoc', 'emptyParticlesDoc', 'particlesShapeExtent', 'sampleParticleColor',
            'sampleParticleScale', 'measureParticlesBounds', 'applyParticlesDoc',
            // What a Play window does between two runs: forget every store the last one made.
            'resetStores',
            // A layer list's order, the effects a post chain editor offers, a new project's window
            // and the angles a tool aims a light with.
            'resolveLayerOrder', 'TILE_LAYER_BANDS', 'POST_BUILTINS', 'findPostBuiltin', 'normalizePostChain',
            'DEFAULT_PROJECT_SETTINGS', 'eulerAim',
            // Saving a picture painted in code as a file, and reading one: a build script's, never a running game's.
            'encodePng', 'decodePng',
        ].sort());
    });

    it('is the only way in for a tool driving a running game, and a game never sees it', () => {
        // A game changes scene from inside, by name. Replacing it from outside on every edit is a
        // tool's, so the instance a game holds says `destroy` and nothing else.
        expect(tools).toContain('editorHandleOf');
        expect(front).not.toContain('editorHandleOf');
    });

    it('does not repeat what the front door already hands out', () => {
        expect(tools.filter((name) => front.includes(name))).toEqual([]);
    });
});

describe('the extension door', () => {
    it('is where a package that extends the engine reaches in', () => {
        expect(extend.sort()).toEqual([
            // Installing what simulates physics. A game never calls it: the adapter's own
            // `installPhysics2d()` does.
            'registerPhysicsProvider',
            // Which game, and which of its objects, is being built right now.
            'getActiveGame', 'getActiveGameObject',
            // Where an object really is, flat and in space, and the way back to its parent.
            'placementOf', 'worldPlacementOf', 'localPositionFrom',
            'placement3dOf', 'worldPlacement3dOf', 'localPosition3dFrom', 'localQuaternionFrom',
        ].sort());
    });

    it('hands out nothing the other two doors do', () => {
        expect(extend.filter((name) => front.includes(name) || tools.includes(name))).toEqual([]);
    });
});

describe('the physics doors', () => {
    it('are where a game installs what moves its colliders, and reaches the world', () => {
        expect(physics2d.sort()).toEqual(['getPhysicsWorld2d', 'installPhysics2d', 'loadRapier2D', 'rapier2dProvider'].sort());
        expect(physics3d.sort()).toEqual([
            'getPhysicsWorld3d', 'installPhysics3d', 'loadBox3D', 'box3dProvider', 'useCharacterBody', 'DEFAULT_RAY_DISTANCE',
        ].sort());
    });

    it('hand out nothing another door does, not even each other', () => {
        // Each name says which half it answers for, so a game that simulates in both dimensions
        // imports from the two doors without renaming anything, and the reference has one page
        // per name.
        const others = [...front, ...tools, ...extend];
        expect(physics2d.filter((name) => others.includes(name) || physics3d.includes(name))).toEqual([]);
        expect(physics3d.filter((name) => others.includes(name))).toEqual([]);
    });

    it('stay off the front door, which would make every game need a physics engine to compile', () => {
        const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
        expect(source).not.toMatch(/from '\.\/physics\/(rapier2d|box3d)/);
    });
});
