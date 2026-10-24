/**
 * `nacatamalon/authoring`: what a **tool** uses to make a game's files, and a **game** never runs.
 *
 * A build script that saves a picture it painted, a generator that writes levels, a converter that
 * brings in music from a tracker: everything here writes, measures or lists. Turning a scene back
 * into a document, saving a PNG or a WAV, asking which behaviours are registered and what settings
 * they declare. A published game does none of it. It reads its documents, registers its behaviours
 * and runs.
 *
 * Two reasons it is a door of its own rather than part of the front one:
 *
 * - **Versions.** Anything on the front door is part of the promise made to whoever writes a game,
 *   and a name only a tool uses should be free to change without touching it.
 * - **It reads at the call site.** A line importing from here says it belongs to a build step, a
 *   script or a generator, and not to a game.
 *
 * **The split is tools, not vocabulary: the values move and the types of the format stay.**
 * `TSceneDoc` and `TScriptField` describe the format, and the format is the engine's, so a game
 * that types a variable never has to reach in here. A tool's own types come here with it.
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

// The `.atlas` format's tooling: saving one, starting one for an image, and the frames a sheet is
// cut into. A game only reads them.
export { serializeAtlasDoc, emptyAtlasDoc, atlasDocFrames } from '../atlas/document';

// The same for maps and palettes: saving one and starting a new one.
export { serializeTilemapDoc, emptyTilemapDoc } from '../loaders';
// Where each of a map's layers is drawn among the rest, which is what a layer list shows.
export { resolveLayerOrder, TILE_LAYER_BANDS } from '../loaders';
export { serializePaletteDoc, emptyPaletteDoc } from '../loaders/palette';
// Saving a picture painted in code as a file, for a build script or a tool: no page needed.
export { encodePng } from '../pixels/encode_png';
export { decodePng } from '../pixels/decode_png';

// The effects' tooling: saving one and starting one, the footprint and reach a tool draws around an
// emitter, and its colour and size curves sampled exactly as the particles are baked.
export { serializeParticlesDoc, emptyParticlesDoc } from '../loaders/particles';
export {
    particlesShapeExtent, sampleParticleColor, sampleParticleScale, measureParticlesBounds, applyParticlesDoc,
} from '../gameobjects/particles/tools';

// Sound made rather than recorded: a song or an effect mixed into one track, written as a file,
// and measured by whoever cannot hear it. A game plays the tracks; it never writes a file.
export { serializeSongDoc, mixSong, encodeWav, analyzeAudio } from '../audio/synth';
export { serializeMotionDoc } from '../motion/serialize_motion_doc';
// A voice's notes read, and written back as text, for a tool that changes them.
export { parseSongNotes, writeSongNotes, songInstrumentErrors, songInstrumentNames } from '../audio/synth';
// Songs from a tracker's text export, brought in as `.song` documents.
export { importTrackerText, importFamiTrackerText, importFamiStudioText } from './tracker';
// One of the engine's songs by its key, as a document.
export { loadBuiltinSong } from '../audio/synth/builtin';
export type { TTrackerImport } from './tracker';

// How big a text came out, for a tool to outline it and pick it by.
export { textBlockSize } from '../gameobjects/text';

// Bringing a model in: its tree of pieces, to be written down as boxes. A running game draws the
// scene's structure and never the file's.
export { readGltfNodes } from '../loaders';

// Driving a running game from outside it, as a test or a preview does: replacing its scene when
// its document changes. A published game never does that; it changes scene from inside, by name.
export { editorHandleOf } from '../game/handle';
export type { TEditorHandle } from '../game/handle';
export type { TLoggedSound, TSoundLog, TSoundLogPoint } from '../audio';
export type { TCanvasFit } from '../DOM/types/t_canvas_fit';
export type { TCameraPreview } from '../game/preview';

// The post-processing effects the engine ships, as a list a tool offers, and the cleanup a chain
// written by hand gets before it is saved.
export { POST_BUILTINS, findPostBuiltin, normalizePostChain } from '../post';
export type { TPostBuiltinInfo, TEffectField } from '../post';

// The material looks the same way: the list a tool offers with their knobs, finding one by the name a
// document gives it, and which of a material's uniforms each knob is. The makers (`rim()`, `toonLighting()`)
// and the looks' types are the format and stay on the front door.
export { MATERIAL_LOOKS, findMaterialLook, lookKnobs } from '../shader_composer';
export type { TMaterialLookInfo } from '../shader_composer';

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
