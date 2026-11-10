// The journey of a thousand miles begins with a single step.
//
// What almost every game uses. What is a subject of its own has a door of its own, so this list stays
// one a person can read: `nacatamalon/math`, `/pixels`, `/shader`, `/effects`, `/transitions`, `/files`.
export { createGame } from './game/bootstrap/create_game';
export { createScene } from './scene';
export { useTransform, useCamera3d, useFog } from './hooks';
export { useLight2d, useAmbientLight2d, useUnlit2d, useDirectionalLight, usePointLight, useSpotLight, useRectLight, useAmbientLight, useBlobShadow } from './hooks';
export { createMesh, createMeshInstances } from './gameobjects/mesh';
export type { TMesh, TMeshOptions, TMeshInstancePlacement, TMeshInstanceRun, TMeshInstances, TMeshInstancesOptions } from './gameobjects/mesh';
export { createModel } from './gameobjects/model';
export { createPack } from './gameobjects/pack';
export type { TPackOptions } from './gameobjects/pack';
export { createSpriteTexture, createView, setViewFilter, resizeSpriteTexture, viewToWorld, worldToView, viewToRay } from './gameobjects/sprite_texture';
export type { TSpriteTexture, TSpriteTextureSees, TSpriteTextureOptions, TViewFilter, TViewOptions, TViewPointInput, TViewToWorld, TWorldToView, TViewRay } from './gameobjects/sprite_texture';
export type { TModel, TModelOptions } from './gameobjects/model';
export type { TLight2dOptions } from './hooks/light/use_light_2d';
export type { TLight2d, TAmbientLight2d, TLight, TDirectionalLight, TPointLight, TSpotLight, TRectLight, TAmbientLight, TLightOptionsBase } from './light';
export { useCubeGeometry, usePlaneGeometry, useCircleGeometry, useSphereGeometry, useIcoSphereGeometry, useCylinderGeometry, useConeGeometry, useTorusGeometry, useLatheGeometry } from './hooks';
export type { TBlobShadowOptions } from './hooks';
export type { TCubeGeometryOptions, TPlaneGeometryOptions, TCircleGeometryOptions, TSphereGeometryOptions, TIcoSphereGeometryOptions, TCylinderGeometryOptions, TConeGeometryOptions, TTorusGeometryOptions, TLatheGeometryOptions } from './hooks';
export type { TGeometry, TGeometryData, TUvProjection } from './geometry';
export type { TDrawable } from './gameobjects/types';
export type { TTransformOptions } from './hooks';
export type { TTransform3d } from './gameobjects/types/t_transform_3d';
export { useData, useWatch, useStateMachine } from './hooks';
export { useScript, provide, useScriptApi, useReport } from './hooks';
export type { TUseScriptOptions } from './hooks';
// Registering a behaviour is a game's own business: its entry point calls this, next to where the
// behaviour is written. Looking INSIDE the registry is a tool's, and lives in `nacatamalon/authoring`.
export { registerScript } from './scripts';
export type { TScriptFn, TScriptProps, TScriptField, TScriptOptions, TScriptRequirement, TScriptAttachment } from './scripts';
export type { TDataRecord, TDataSetter, TWatchDep, TStateMachine, TStateDef, TStateGoOptions, TStateMachineOptions } from './hooks';
export {
    useUpdate, useLateUpdate, useLoadTexture, useLoadAtlas, useLoadProgress, useScene, useCleanup, useReady,
    useSceneTransitionEnd, useSpawn, useSelf, useKeyboard, useGame, useSpriteAnimation,
    getSpriteAnimation, useSkeletalAnimation, useTween, useTimer, useCamera2d, useScreenSpace,
    useWorldOffScreen, usePointer, useGamepad, useActions, useAction, useDirection, useInputMap,
    useTouchAction, useDraggable, useDropZone, useSignal, useStore, useStoreLink, usePhysicsBody2d,
    usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d, useLoadBitmapFont, useLoadFont, useLoadModel,
    useLoadParticles, useLoadPack, useLoadScene, useLoadAudio, useSound, useAudio, useMusic, useSong,
    useLoadSong, useLoadTrackerSong, useMotion, useLoadMotion, useAudioListener, useParticleCollider2d,
    useParticleCollider3d,
} from './hooks';
export { createMaterial } from './gameobjects/material';
// Lines in space: the debug helpers (an axis gizmo, a floor grid) and any lines a game wants to draw.
export { useLines, useHelperAxis, useHelperGrid } from './hooks';
export type { TUseLinesOptions, TLinesHandle, TUseHelperAxisOptions, THelperAxisColors, TUseHelperGridOptions } from './hooks';
export type { TLines } from './gameobjects/lines';
export type { TNewLinesOptions } from './gameobjects/lines';
export { createParticles, createParticles3d, playParticles, stopParticles, pauseParticles, clearParticles, particleCount, emitParticles } from './gameobjects/particles';
export type { TParticles, TParticlesOptions, TParticleOverrides, TParticles3d, TParticles3dOptions } from './gameobjects/particles';
export type { TParticleCollider2d, TParticleCollider3d, TParticleColliderShape2d, TParticleColliderShape3d } from './gameobjects/particles/colliders/t_particle_collider';
export type { TParticlesEffect, TParticlesEffect2d, TParticlesEffect3d, TParticleColorStopInput } from './loaders/particles';
export type {
    TParticlesFile, TParticleBlend, TParticleAnimPace, TEmitShape2d, TEmitShape3d, TParticleCollision,
    TParticleTrail, TParticlesBounds, TChildEmitter,
} from './loaders/particles';
export type { TSceneChangeOptions, TSceneLaunchOptions, TSceneStopOptions } from './transition';
export type { TConsolePaletteName } from './loaders/palette/console_palettes';
export { createSprite } from './gameobjects/sprite/create_sprite';
// The far layers of a level: a picture repeated endlessly across, moving with the camera only so much.
export { createBackdrop } from './gameobjects/sprite/create_backdrop';
export type { TBackdropOptions } from './gameobjects/sprite/create_backdrop';
export type { TCreateSprite } from './gameobjects/sprite/create_sprite';
export { createText } from './gameobjects/text/create_text';
export { createNineSlice } from './gameobjects/nine_slice/create_nine_slice';
export { createPolygon } from './gameobjects/polygon';
export type { TPolygon, TPolygonOptions } from './gameobjects/polygon';
export { createShapes } from './gameobjects/shapes';
export type { TShape, TShapeCircle, TShapeEllipse, TShapeLine, TShapePolygon, TShapeRect, TShapeStroke, TShapes, TShapesOptions } from './gameobjects/shapes';
export { createTilemap, getTilemap, blocksBulletsAt, cellAt, cellCorner, markLayerChanged, setTile, solidAt, solidAtPoint, tileAt, tileInfoAt, tileInfoAtPoint } from './gameobjects/tilemap';
export { createSpriteAtlas, setSpriteFrame } from './atlas';
export { destroy } from './destroy';
export { listen, onReport } from './events';
export type { TReportHandler } from './events';
export { createGameSignal } from './signal';
// Physics: the FORMAT only. The engine keeps colliders, writes them down and reads them back while
// being completely unable to move them. What moves them is registered from outside, so a game that
// never simulates never pays for the WebAssembly and a tool can draw a collider's outline without
// loading a physics engine at all. What does move them is installed with one call from its own door
// (`installPhysics2d()` from `nacatamalon/physics2d`, `installPhysics3d()` from `nacatamalon/physics3d`).
export { createPhysicsBody2d, createPhysicsBody3d } from './physics';
export type { TPhysicsLayer, TPhysicsLayerOptions } from './physics';
export type {
    TPhysicsBody, TPhysicsBody2d, TPhysicsBody3d, TPhysicsBodyType,
    TPhysicsSurface, TPhysicsWorld, TPhysicsWorld2d, TPhysicsWorld3d, TCollider2d, TCollider3d,
} from './physics';
// Reaching a named part of something, the turret of a tank or the wheels of a car, from a behaviour.
export { findObject, findObjects, ownerOf, sceneOf } from './box';
// How big something is and where: what is drawn flat, how a text is set and where its lines break,
// and a point of the world measured on an object (where a hit landed on it), or a point of an
// object found in the world (where a shot leaves it from).
export { boundsOf, sizeOf, measureText, letterAt, pointOf, worldToLocal, localToWorld, worldToLocal3d, localToWorld3d } from './layout';
export type { TMeasurable, TMeasureTextOptions, TTextLetter, TTextMeasure } from './layout';
// Whether two things touch, with no physics: a bullet and a brick, the player and the coins.
export { collisionBetween } from './hitbox';
export type { TRect, TCollisionTarget, THitbox } from './hitbox';
export type { TCollisionWhen, TCollisionMatch, TCollisionMatched } from './hitbox/types/t_hitbox';
export { useHitbox, useCollisionBetween, useCollisionWith, useTag } from './hooks';
export type { TTag, TTaggable } from './tags';
export { useMask } from './hooks';
export type { TMask, TMaskOptions, TMaskRect, TMaskChannel } from './mask';
export type { TCollisionWithOptions } from './hooks';
// Photos of the game taken by the game: a photography game, an album, a sticker.
export { useCapture } from './hooks';
export type { TCapture, TPhoto, TPhotoBox, TPhotoBoxRef, TPhotoOptions } from './capture';
// A platformer's camera: a dead zone, the level's edges, looking ahead, and a shake.
export { useCameraFollow, useParallax } from './hooks';
export type { TCameraFollow, TCameraFollowOptions, TCameraTarget } from './hooks';
// A platformer's character on the scene's maps, with no physics engine. The same character in the 2D
// world, pushing crates, is `useCharacterBody2d` in `nacatamalon/physics2d`.
export { useTileBody2d } from './physics/character/use_tile_body_2d';
export type { TCharacterBody2d, TCharacterShape2d } from './physics/character/t_character_body_2d';
export type { THitboxOptions } from './hooks';
// Where the pointer is in the world, and where a point of the world is on the screen; and turning a
// camera to look at something.
export { screenToRay, worldToScreen, cameraLookAt } from './camera';
export type { TRay, TScreenPoint } from './camera';
// A shape by the name it is kept under, which is how a collider names one.
export { getGeometry, createGeometry, updateGeometry } from './geometry';
export { createGameStore, localStorageAdapter, indexedDbAdapter } from './game_store';
// Reaching a store, by its key or from the object it was given to. Reading its file is in
// `nacatamalon/files`; listing them and writing them are a tool's, in `nacatamalon/authoring`.
export { getGameStore, storeOf } from './game_store';
export { getColor, lerpColor, fromHsl, consoleColor } from './color';
export { useColor } from './hooks';
export type { TColor, TColorInput, TColorOption } from './color';
export type { TScene, TSceneFn } from './scene';
export type { TUseLoadTextureOptions, TUseLoadAtlasOptions, TUseLoadModelOptions, TSkeletalAnimation, TSkeletalAnimationOptions, TSkeletalClipOptions, TAnimatable, TSceneHandle, TGameObject, TSpawnOptions } from './hooks';
export type { TSpriteAnimation, TSpriteAnimationOptions, TAnimationClip } from './hooks';
export type { TTweenOptions, TTweenTargetOptions, TTweenFields, TTweenHandle, TTweenStarter } from './hooks';
export type { TTimer, TTimerHandle } from './hooks';
export type { TDestroyOptions } from './destroy';
export type { TLoadProgress, TLoadStatus, TAsset, TTexture, TLoadedAtlas, TBitmapFont, TFont, TAudioClip, TGltfModel, TGltfPart, TShading } from './loaders';
export type { TSkeleton, TSkeletalClip, TJointPose, TClipEvent } from './animation';
export type {
    TMaterial, TSpriteMaterial, TMeshMaterial, TMaterialMap, TMaterialOcclusion, TTextureWrap, TCullMode, TMaterialShader, TMaterialOptions,
    TSpriteMaterialOptions, TMeshMaterialOptions, TUniformType, TUniformValues, TUniformSignature,
} from './materials';
export type { TLightingLook, TStepLook } from './shader_composer';
export type { TSprite, TSpriteOptions } from './gameobjects/sprite/types';
export type { TTransform2d } from './gameobjects/types/t_transform_2d';
export type { T2dOptions } from './gameobjects/types/t_2d_options';
export type { T3dOptions, TMeshSurfaceOptions } from './gameobjects/types/t_3d_options';
export type { TText, TTextStyle, TTextOptions } from './gameobjects/text';
export type { TNineSlice, TNineSliceBorders, TNineSliceMode, TNineSliceOptions } from './gameobjects/nine_slice/types';
export type { TTilemap, TTilemapLayer, TTilemapOptions, TTilemapDrawOptions, TTilemapFileOptions, TTilemapDocOptions, TTilemapCodeDoc } from './gameobjects/tilemap';
export type { TTileDoc, TTileLayerOrder } from './loaders';
export type { TSpriteAtlas, TSpriteAtlasOptions, TAtlasPoint, TAtlasFramePoints } from './atlas';
export type { TCamera2d, TCamera2dOptions, TCamera3d, TCamera3dOptions } from './camera';
export type { TFog, TFogOptions } from './fog';
export type { TKeyboard, TKeyName, TPointerInfo, TPointerDragInfo, TPointerDragListener, TDropZoneListener, TPointerHandle, TPointerType, TPointerTouch, TPointerListener, TPointerWheelInfo, TPointerWheelListener, TPointerLockOptions, TSpriteEvents } from './input';
export type { TGamepad, TGamepadAxisName, TGamepadButtonName, TGamepadInfo, TGamepadListener, TGamepadTarget, TRumbleOptions, TUseGamepadOptions } from './input';
export type { TAction, TActionBinding, TActionCaptureOptions, TActionDef, TActionDevice, TActionMap, TActionName, TActionOverrides, TActionPersist, TActionsHandle, TInputMapHandle, TActionPresetName } from './input';
export type { TPointerButtonName } from './input';
export { gamepadAxisDirectionLabel, normalizeActionMap, bindingKey, describeBinding } from './input';

// A box a scene built, made again while the game runs. Reading a scene's file is in
// `nacatamalon/files`; writing one down is `serializeScene`, in `nacatamalon/authoring`.
export { copyBox } from './scene';
export type { TGeometrySource, TSpriteAnimationDoc } from './scene';
// Sound made from text rather than recorded: a song's tracks and an effect's samples, the same in a
// game, in an editor and on the desktop runtime.
export { renderSong, renderSfx, songVoicesOf } from './audio/synth';
export type {
    TRenderedSong, TSfxOptions, TSfxPreset, TSongDoc, TSongError, TSongInstrument, TSongInstrumentError, TSongInstrumentInfo, TSongInstrumentList, TSongNote, TSongNoteEffects, TSongSample, TSongSampleInfo, TSongBuiltinInfo, TSongChip, TFmPatch, TFmOperator, TSongVoice, TSongVoiceName, TAudioMeasure,
} from './audio/synth';
export type { TMotionDoc, TMotionTrack, TMotionKey, TMotionEvent, TMotionEase, TMotionTransition, TMotionOptions, TMotionHandle, TMotionAttachment } from './motion';
export type { TGameSignal, TSignalHandler } from './signal';
// A sound laid out in the scene, played by a behaviour.
export { soundOf } from './audio';
export type {
    TSoundAttachment, TSoundHandle, TSoundOptions, TSoundSource, TSampledSound, TAudioHandle, TSoundCone, TSoundDuck, TSoundFade, TSoundZone,
    TSoundZoneShape, TMusicAttachment, TMusicHandle, TMusicLayer, TMusicLayerOptions, TMusicOptions, TAudioListener,
    TSongAccompaniment, TSongAttachment, TSongHandle, TSongOptions, TBeatListener,
} from './audio';
export type { TGameStore, TGameStoreConfig, TStoreActionsFactory, TStoreGet, TStoreListener, TStoreSelector, TStoreSet, TStorePersistence, TStorePersist } from './game_store';
export type { TGameHandle, TGamePauseEvent, TGameResizeEvent } from './game/handle';
// What its `capture` is asked for and hands back.
export type { TCaptureOptions } from './game/capture';
export type { TCaptureResult } from './render/interface';
export type { TGameInstance } from './game/types/t_game_instance';
export type { TGameEvents, TGameEventName } from './game/types/t_game_events';
export type { TGameOptions, TGameStep, TPixelSnap } from './game/types/t_game_options';
export type { TConsoleScreen, TConsoleScreenName } from './game/console_screens';
export type { TGameTarget } from './game/bootstrap/create_game';
export type { TRendererBackend } from './render/interface';
// The running engine's version: what the boot banner announces, and what a bug report should
// quote. Read from `package.json`, so the package is the one place the number is written.
export { VERSION } from './version';
export { BUILTIN, INPUT, LIMITS, PHYSICS, RENDER, SCREEN } from './CONST';
// Types a public signature already names. Each was reachable through something exported and could
// not be written down by a game that wanted to hold one, which is also what the reference said about
// every one of them: named, and never documented.
export type { TCssNamedColor } from './color';
export type { TCreateMaterial } from './gameobjects/material/create_material';
export type { TLightBase } from './light/types/t_light';
export type { TShaderHalf } from './materials/types/t_material';
export type { TMaterialShaderOptions } from './materials';
export type { TAtlasFrame } from './atlas';
export type { TLoadable, TBitmapFontMeta, TBitmapFontGlyph, TFontMeta } from './loaders';
export type { TGltfNodeInfo } from './loaders';
export type { TParticleRange, TParticleColorStop, TParticleScaleStop } from './loaders/particles';
export type { TRendererType } from './render';
export type { TCanvasScaling, TCanvasKeep, TCanvasAlign } from './DOM';
export type { TUseActionsOptions, TUseDraggableOptions, TDraggableHandle, TDraggableDropInfo, TUseDropZoneOptions, TDropZoneHandle } from './hooks';
export type {
    TUseLoadAudioOptions, TUseLoadBitmapFontOptions, TUseLoadFontOptions, TUseLoadParticlesOptions,
    TUseLoadPackOptions, TUseLoadSceneOptions, TUseLoadSongOptions, TUseLoadTrackerSongOptions,
    TUseLoadMotionOptions,
} from './hooks/loaders';
export type { TSongFile } from './loaders/song';
export type { TMotionFile } from './loaders/motion';
export type { TLoadedPack } from './loaders/pack';
export type { TLoadedScene } from './loaders/scene';
export type { TPhysicsBody2dOptions, TPhysicsBody3dOptions } from './hooks/physics/use_physics_body';

// Small pieces a game and a tool both reach for: a fresh id, and which way something faces.
export { nanoId } from './utils/nano_id';
export { transformForward } from './render/shared';
