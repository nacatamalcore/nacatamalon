/**
 * `nacatamalon/authoring`: the half of the public surface a **tool** needs and a **game** never
 * runs.
 *
 * The engine holds the format and the tool holds the tooling. That line is already everywhere in
 * this codebase, and this file is where it finally shows in the import path. Everything here
 * writes, lists or looks inside: turning a live scene back into a document, asking which
 * behaviours are registered and what settings they declare. A published game does none of it. It
 * reads a document, registers its behaviours and runs.
 *
 * Two reasons it is a door of its own rather than a tidier front one:
 *
 * - **Versions.** Anything that lives on the front door is part of the promise made to whoever
 *   writes a game. A name used only by an editor sitting there means renaming it breaks the
 *   engine's public surface for people who never called it.
 * - **It reads at the call site.** A line importing from here says it belongs to an editor, a
 *   build step or a generator, and not to a game.
 *
 * It is not a wall and nothing here is secret: the visual editor is the product, this is the
 * vocabulary it speaks. Anything that needs to write a scene by hand is welcome to it.
 *
 * **The split is tools, not vocabulary: the values move and the types of the format stay.**
 * `TSceneDoc` and `TScriptField` describe the format, and the format is the engine's, so a game
 * that types a variable never has to reach in here. A tool's own types (`TEditorHandle`, the node
 * catalogue's) come here with it.
 *
 * **And reading is not authoring.** Every `parse*` stays on the front door, because opening a
 * document is something a running game legitimately does; its `serialize*` twin comes here.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */

// Turning a live scene back into a document. The read direction (`parseSceneDoc`, `sceneFromDoc`)
// stays on the front door: that is how a published game boots.
export { serializeScene } from '../scene';

// Looking inside the behaviour registry: what lets a form be built for a behaviour without living
// inside a running game, and what lets a tool make the list mirror the files on disk.
//
// `registerScript` itself stays on the front door, and that is the whole line: a published game's
// entry point calls it, next to where each behaviour is written.
export {
    listScripts, getScriptFields, getScriptRequires, defaultScriptProps, clearScripts,
} from '../scripts';

// The same again for the stores, which are invisible for the same reason a behaviour's settings
// are: a store is a module singleton, so nothing enumerates it and no tool can show a project's
// state without this. Writing one down and opening a new one are here; resolving one and applying
// what a file authors stay on the front door, because a published game does both on the way up.
export {
    listGameStores, clearGameStores, serializeStoreDoc, emptyStoreDoc, storeFieldsFromState,
    defaultStoreFieldValue, isProvisionalStore, resetStores,
} from '../game_store';

// The `.atlas` format's tooling: saving one, starting one for an image, and the cut a sheet editor
// draws over the image. A game only reads them.
export { serializeAtlasDoc, emptyAtlasDoc, atlasDocFrames } from '../atlas/document';

// The same for maps and palettes: saving one and starting a new one.
export { serializeTilemapDoc, emptyTilemapDoc } from '../loaders';
// Where each of a map's layers is drawn among the rest, which is what a layer list shows.
export { resolveLayerOrder, TILE_LAYER_BANDS } from '../loaders';
export { serializePaletteDoc, emptyPaletteDoc } from '../loaders/palette';

// The effects' tooling: saving one and starting one, the footprint and reach a tool draws around an
// emitter, and the curves its gradient editor has to draw exactly as the particles are baked.
export { serializeParticlesDoc, emptyParticlesDoc } from '../loaders/particles';
export {
    particlesShapeExtent, sampleParticleColor, sampleParticleScale, measureParticlesBounds, applyParticlesDoc,
} from '../gameobjects/particles/tools';

// Bringing a model in: its tree of pieces, to be written down as boxes. A running game draws the
// scene's structure and never the file's.
export { readGltfNodes } from '../loaders';

// Driving a running game from outside it: replacing its scene every time the document being edited
// changes. A published game never does that; it changes scene from inside, by name.
export { editorHandleOf } from '../game/handle';
export type { TEditorHandle } from '../game/handle';
export type { TCameraPreview } from '../game/preview';

// The post-processing effects the engine ships, as a list a tool offers, and the cleanup a chain
// written by hand gets before it is saved.
export { POST_BUILTINS, findPostBuiltin, normalizePostChain } from '../post';
export type { TPostBuiltinInfo } from '../post';

// A new project's window settings, which is what a project starts from.
export { DEFAULT_PROJECT_SETTINGS } from '../project';

// The two angles that make something face a point, for a tool that places a light or a camera by
// where it looks.
export { eulerAim } from '../render/shared';

// The shader composer's tooling: starting a new `.shader`, the node catalogue a palette is built
// from, and the types and small pictures a canvas draws. A game compiles a graph (that stays on the
// front door) but never lists the kinds of node there are. The harness is what those pictures are
// drawn through: the shader a sprite material compiles to, and the quad and sprite that fill one.
export {
    emptyShaderGraph, NODE_CATALOG, NODE_DEFS, NODE_CATEGORIES, nodeDef, defaultParams, inferGraphTypes,
    compileNodePreviews, compilePreviewShader,
} from '../shader_composer';
export type {
    TNodeDef, TNodeCategory, TInputPort, TOutputPort, TParamDef, TParamKind, TPortDefault, TGraphTypeInfo, TNodePreview,
} from '../shader_composer';
// The harness comes from its own file, not the shader composer's barrel, and its type goes with it
// against the rule that types stay on the front door: it names WebGPU's own types, which TypeScript
// 5 does not have, so anything the front door can reach that names them breaks every game.
export {
    buildPreviewHarness, PREVIEW_QUAD_VERTICES, PREVIEW_VERTEX_BUFFERS, PREVIEW_FRAME_UNIFORMS, PREVIEW_INSTANCE,
} from '../shader_composer/preview_harness';
export type { TPreviewHarness } from '../shader_composer/preview_harness';
