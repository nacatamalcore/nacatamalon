// The engine's file formats, for a game that reads one itself: what each one holds, and the function
// that reads it. Loading one with a `useLoad…` needs none of this. Writing one is a tool's, in
// `nacatamalon/authoring`: reading is not authoring.
export { parseParticlesDoc } from '../loaders/particles';
export type { TParticlesDoc, TParticlesDoc2d, TParticlesDoc3d } from '../loaders/particles';
export type { TPaletteDoc } from '../loaders/palette';
export { parsePaletteDoc } from '../loaders/palette';
export { parseAtlasDoc } from '../atlas/document';
export type {
    TAtlasDoc, TAtlasDocFrame, TAtlasGridSpec, TAtlasPixelRect, TAtlasSequenceDoc,
} from '../atlas/document';
export { applyStoreDocs, parseStoreDoc } from '../game_store';
export type { TTerrainDoc, TTilemapDoc, TTilemapLayerDoc } from '../loaders';
export { parseTilemapDoc } from '../loaders';
export { parseProject, gameOptionsFromProject } from '../project';
export type { TProjectSettings } from '../project';
export { objectFromDoc, parseSceneDoc, sceneFromDoc } from '../scene';
export type {
    TSceneDoc, TBoxNode, TDataEntry, TAssetEntry, TComponentDoc, TMaterialDoc, TMeshMaterialDoc,
    TMaterialMapDoc, TSpriteComponent, TNineSliceComponent, TTextComponent, TMeshComponent,
    TTilemapComponent, TTilemapLayerOverride, TParticlesComponent, TParticles3dComponent,
    TParticleCollider2dComponent, TParticleCollider3dComponent, TSpriteTextureComponent, TMusicComponent,
    TSongComponent, TMotionComponent, TAudioListenerComponent, TMaskComponent, TFilterComponent,
    TShapesComponent, TCamera2dComponent, TCamera3dComponent, TFogComponent, TLightComponent,
} from '../scene';
export { parseSongDoc } from '../audio/synth';
export { parseMotionDoc } from '../motion';
export type {
    TStoreDoc, TStoreField, TStoreFieldType, TStoreFieldValue, TStorePersistDoc,
} from '../game_store';
export { DOCUMENTS } from '../CONST';
export type {
    TScriptComponent, TSoundComponent, TStoreComponent, TPhysicsBody2dComponent, TPhysicsBody3dComponent,
    TPhysicsWorld2dComponent, TPhysicsWorld3dComponent, TRetroBody2dComponent, TRetroWorld2dComponent,
} from '../scene/document/types/t_component_doc';
export type { TSceneFromDocOptions } from '../scene/document';
export type { TEmissionDoc } from '../loaders/particles';
