// The journey of a thousand miles begins with a single step.
export { createGame } from './game/bootstrap/create_game';
export { createScene } from './scene';
export { useTransform, useCamera3d, useFog } from './hooks';
export { useLight, usePointLight, useSpotLight, useAmbientLight, useBlobShadow } from './hooks';
export { createMesh } from './gameobjects/mesh';
export type { TMesh, TMeshOptions } from './gameobjects/mesh';
export { createModel } from './gameobjects/model';
export { createPack } from './gameobjects/pack';
export type { TPackOptions } from './gameobjects/pack';
export { createSpriteTexture } from './gameobjects/sprite_texture';
export type { TSpriteTexture, TSpriteTextureSees, TSpriteTextureOptions } from './gameobjects/sprite_texture';
// Pictures painted in code, in plain JavaScript, and the textures made from them: a game's own art
// with no image files and no page, the same in the browser, on the native runtime and in a test.
export {
    createPixels, setPixel, getPixel, fillRect, drawLine, fillCircle, drawCircle, blitPixels, mapPixels,
    fillGradient, fillNoise, fillChecker, clonePixels, swapColors,
} from './pixels';
export type { TPixels, TPixelRegion, TFillGradientOptions, TFillNoiseOptions } from './pixels';
export { createPixelTexture, updatePixelTexture } from './gameobjects/pixel_texture';
export type { TPixelTextureOptions, TPixelPaint } from './gameobjects/pixel_texture';
export type { TLoadedPixels } from './loaders/pixels';
export type { TUseLoadPixelsOptions } from './hooks';
export type { TModel, TModelOptions } from './gameobjects/model';
export { MAX_LIGHTS } from './light';
export type { TLight, TDirectionalLight, TPointLight, TSpotLight, TAmbientLight, TLightOptionsBase } from './light';
export { useCubeGeometry, usePlaneGeometry, useCircleGeometry, useUvSphereGeometry, useIcoSphereGeometry, useCylinderGeometry, useConeGeometry, useTorusGeometry } from './hooks';
export type { TBlobShadowOptions } from './hooks';
export type { TCubeGeometryOptions, TPlaneGeometryOptions, TCircleGeometryOptions, TUvSphereGeometryOptions, TIcoSphereGeometryOptions, TCylinderGeometryOptions, TConeGeometryOptions, TTorusGeometryOptions } from './hooks';
export type { TGeometry } from './geometry';
export type { TDrawable } from './gameobjects/types';
// A turn as a whole, and the one way of building one that a scene written by hand needs: an object
// tilted off the axes (a ramp, a banked corner) is authored with three angles and stored as this.
// The four that turn something about an axis come out too, for a rotate gizmo.
// The rest of the quaternion arithmetic stays inside, where the renderer and the rigs use it.
export { fromEuler as quatFromEuler } from './math/quat';
export { fromAxisAngle as quatFromAxisAngle, multiply as quatMultiply, normalize as quatNormalize, rotateVec3 as quatRotateVec3 } from './math/quat';
export type { TQuat } from './math/quat';
// The everyday arithmetic of a game: keeping a number in range, blending two of them, turning
// degrees into the radians every rotation uses, and points and directions. Prefixed (`vec2Add`, not
// a `Vec2` namespace) so a game that only uses `clamp` bundles only `clamp`, the same rule as the
// easing curves below. Vectors are plain `{ x, y }` objects, so a transform can be passed as one.
// The 4x4 matrices stay inside: they are the renderer's, and they would tie the API to wgpu-matrix.
export { clamp } from './math/clamp';
export { lerp } from './math/lerp';
export { TAU, degToRad, radToDeg, lerpAngle, wrap as wrapAngle } from './math/angle';
export {
    add as vec2Add, sub as vec2Sub, scale as vec2Scale, negate as vec2Negate, lerp as vec2Lerp, dot as vec2Dot,
    len as vec2Length, dist as vec2Distance, normalize as vec2Normalize, equals as vec2Equals, angle as vec2Angle,
} from './math/vec2';
export type { TVec2 } from './math/vec2';
export {
    add as vec3Add, sub as vec3Sub, scale as vec3Scale, negate as vec3Negate, lerp as vec3Lerp, dot as vec3Dot,
    cross as vec3Cross, len as vec3Length, dist as vec3Distance, normalize as vec3Normalize, equals as vec3Equals,
} from './math/vec3';
export type { TVec3 } from './math/vec3';
export type { TTransformOptions } from './hooks';
export type { TTransform3d } from './gameobjects/types/t_transform_3d';
export { useData, useWatch } from './hooks';
export { useScript, provide, useApi, useEvent } from './hooks';
// Registering a behaviour is a game's own business: its entry point calls this, next to where the
// behaviour is written. Looking INSIDE the registry is a tool's, and lives in `nacatamalon/authoring`.
export { registerScript } from './scripts';
export type { TScriptFn, TScriptProps, TScriptField, TScriptOptions, TScriptRequirement, TScriptAttachment } from './scripts';
export type { TDataRecord, TDataSetter, TWatchDep } from './hooks';
export { useUpdate, useLoadTexture, useLoadAtlas, useLoader, useScene, useSceneUnmount, useSpawn, useSelf, useKeyboard, useGame, useSpriteAnimation, getSpriteAnimation, useSkeletalAnimation, useTween, useTimer, useCamera2d, useScreenSpace, usePointer, useGamepad, useActions, useAction, useVector, useInputMap, useRandom, useSignal, useStore, useStoreLink, usePhysicsBody2d, usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d, useLoadBitmapFont, useLoadFont, useLoadGltf, useLoadShader, useLoadPalette, useLoadLut, useLoadParticles, useLoadPack, useLoadAudio, useLoadPixels, useSound, useAudio, useMusic, useAudioListener, usePostProcess, useParticleCollider2d, useParticleCollider3d } from './hooks';
export { createMaterial } from './gameobjects/material';
// Lines in space: the debug helpers (an axis gizmo, a floor grid) and any lines a game wants to draw.
export { useHelperLines, useHelperAxis, useHelperGrid } from './hooks';
export type { TUseHelperLinesOptions, THelperLines, TUseHelperAxisOptions, THelperAxisColors, TUseHelperGridOptions } from './hooks';
export type { TLines } from './gameobjects/lines';
export type { TNewLinesOptions } from './gameobjects/lines';
export { LINE_VERTEX_FLOATS } from './render/shared/line_vertex';
export { createParticles, createParticles3d, playParticles, stopParticles, pauseParticles, clearParticles, particleCount, emitParticles } from './gameobjects/particles';
export { parseParticlesDoc, PARTICLES_FORMAT } from './loaders/particles';
export type { TParticles, TParticlesOptions, TParticleOverrides, TParticles3d, TParticles3dOptions } from './gameobjects/particles';
export type { TParticleCollider2d, TParticleCollider3d, TParticleColliderShape2d, TParticleColliderShape3d } from './gameobjects/particles/colliders/t_particle_collider';
export type { TParticlesFile, TParticlesDoc, TParticlesDoc2d, TParticlesDoc3d, TParticleBlend, TEmitShape2d, TEmitShape3d, TParticleCollision, TParticleTrail, TParticlesBounds, TChildEmitter } from './loaders/particles';
export {
    dither, posterize, paletteMatch, lutGrade, COLOR_LEVELS,
    crt, CRT_PRESETS, colorAdjust, mosaic, rgbSplit, wave, shockwave, distort, glitch, grain, oldFilm, halftone, ntsc, lcd, zoomBlur, motionBlur, blur, bloom, godrays, tiltShift, phosphor,
} from './post';
export type { TPostEffect, TPostPass, TPostChain, TPostChainEntry, TPostProcessOptions, TBuiltinPostEffect, TCrtOptions, TCrtUniforms } from './post';

export { fade, wipe, iris, pixelate } from './transition';
export type { TTransition, TSceneChangeOptions, TWipeDirection } from './transition';
export type { TPalette, TPaletteDoc } from './loaders/palette';
export { parsePaletteDoc, PALETTE_FORMAT, MAX_PALETTE_COLORS } from './loaders/palette';
export type { TLut } from './loaders/lut';
export { createSprite } from './gameobjects/sprite/create_sprite';
export type { TCreateSprite } from './gameobjects/sprite/create_sprite';
export { createText } from './gameobjects/text/create_text';
export { createNineSlice } from './gameobjects/nine_slice/create_nine_slice';
export { createTilemap, getTilemap, blocksBulletsAt, cellAt, cellCorner, markLayerChanged, setTile, solidAt, solidAtPoint, tileAt, tileInfoAt } from './gameobjects/tilemap';
export { createSpriteAtlas, setSpriteFrame } from './atlas';
// The `.atlas` format: reading one is how a game loads its sheets, so it stays here. Writing one,
// starting one and cutting one to draw over the image are a tool's, in `nacatamalon/authoring`.
export { parseAtlasDoc, ATLAS_FORMAT } from './atlas/document';
export type { TAtlasDoc, TAtlasDocFrame, TAtlasGridSpec, TAtlasPixelRect, TAtlasSequenceDoc } from './atlas/document';
export { destroy } from './destroy';
export { listen, onEvent } from './events';
export type { TObjectEventHandler } from './events';
export { createGameSignal, scenePaused, sceneResumed, gamePaused, gameResumed } from './signal';
// Physics: the FORMAT only. The engine keeps colliders, writes them down and reads them back while
// being completely unable to move them. What moves them is registered from outside, so a game that
// never simulates never pays for the WebAssembly and a tool can draw a collider's outline without
// loading a physics engine at all. What does move them is installed with one call from its own door
// (`installPhysics2d()` from `nacatamalon/physics2d`, `installPhysics3d()` from `nacatamalon/physics3d`).
export { createPhysicsBody2d, createPhysicsBody3d, PHYSICS_LAYERS, ALL_LAYERS } from './physics';
export type {
    TPhysicsBody, TPhysicsBody2d, TPhysicsBody3d, TPhysicsBodyType,
    TPhysicsSurface, TPhysicsWorld, TPhysicsWorld2d, TPhysicsWorld3d, TCollider2d, TCollider3d,
} from './physics';
// Reaching a named part of something, the turret of a tank or the wheels of a car, from a behaviour.
export { findObject, findObjects } from './box';
// Where the pointer is in the world, and where a point of the world is on the screen; and turning a
// camera to look at something.
export { screenToRay, worldToScreen, cameraLookAt } from './camera';
export type { TRay, TScreenPoint } from './camera';
// A shape by the name it is kept under, which is how a collider names one.
export { getGeometry } from './geometry';
export { createGameStore, localStorageAdapter, indexedDbAdapter } from './game_store';
// Reaching a store and reading its file: both of these a published game does. It resolves the
// store an object was given, and it installs what its `.store` files author over what the code
// declared, which is what booting an exported project is. Listing them and writing them are a
// tool's, and go out of `nacatamalon/authoring`.
export { getGameStore, storeOf, applyStoreDocs, parseStoreDoc, STORE_FORMAT, STORE_VERSION } from './game_store';
export { getColor, lerpColor, fromHsl } from './color';
export { useColor } from './hooks';
export type { TColor, TColorInput } from './color';
export type { TScene, TSceneFn } from './scene';
export type { TUseLoadShaderOptions } from './hooks';
export type { TUseLoadTextureOptions, TUseLoadAtlasOptions, TUseLoadGltfOptions, TSkeletalAnimation, TSkeletalAnimationOptions, TSceneHandle, TGameObject, TSpawnOptions } from './hooks';
export type { TSpriteAnimation, TSpriteAnimationOptions, TAnimationClip } from './hooks';
export type { TTweenOptions, TTweenHandle, TTweenStarter } from './hooks';
export type { TTimer, TTimerHandle } from './hooks';
export type { TDestroyOptions } from './destroy';
export type { TLoader, TLoadStatus, TTexture, TLoadedAtlas, TBitmapFont, TFont, TAudioClip, TGltfModel, TGltfPart, TShading } from './loaders';
export type { TSkeleton, TSkeletalClip, TJointPose, TClipEvent } from './animation';
export type {
    TMaterial, TSpriteMaterial, TMeshMaterial, TMaterialMap, TTextureWrap, TMaterialShader, TMaterialOptions,
    TSpriteMaterialOptions, TMeshMaterialOptions, TUniformType, TUniformValues, TUniformSignature,
} from './materials';
export type { TShader, TParsedShader } from './loaders/shader';
// The shader composer: a shader written as typed values instead of text, which `compileShader`
// turns into the fields `createMaterial` takes, in both languages. Every value starts with
// `composer`, so none of them can clash with a game's own names. A `.shader` file is the same graph
// drawn as nodes; reading and compiling one is here because a game loads them, and the node
// catalogue an editor builds its palette from goes out of `nacatamalon/authoring`.
export {
    compileShader,
    composerFloat, composerVec2, composerVec3, composerVec4, composerSwizzle, composerX, composerY, composerZ, composerW,
    composerUv, composerTime, composerResolution, composerSurface, composerWorldNormal, composerWorldPos,
    composerViewDir, composerLight, composerEmissive, composerShine, composerEnvUv, composerVertexPosition, composerVertexNormal, composerVertexColor,
    composerTextureSample, composerMapSample, composerUniform,
    composerAdd, composerSub, composerMul, composerDiv, composerAbs, composerFloor, composerFract, composerSin,
    composerCos, composerSqrt, composerSign, composerNormalize, composerLength, composerDistance, composerDot,
    composerCross, composerPow, composerMin, composerMax, composerClamp, composerMix, composerStep,
    composerSmoothstep, composerReflect, composerMod, composerOneMinus, composerSaturate,
    composerPipe, composerSimplexNoise, composerFbm, composerCellularNoise, composerFresnel, composerCelShade,
    parseShaderGraph, compileShaderGraph, SHADER_GRAPH_FORMAT,
} from './shader_composer';
export type {
    TComposerNode, TComposerInput, TComposerStep, TInputKind, THelperDef, TShaderGraph, TCompiledShader,
    TShaderGraphDoc, TGraphNodeDoc, TGraphEdgeDoc, TGraphCommentDoc, TParamValue, TGraphTarget,
} from './shader_composer';
export type { TSprite, TSpriteOptions } from './gameobjects/sprite/types';
export type { TTransform2d } from './gameobjects/types/t_transform_2d';
export type { TText, TTextStyle, TTextOptions } from './gameobjects/text';
export type { TNineSlice, TNineSliceBorders, TNineSliceMode, TNineSliceOptions } from './gameobjects/nine_slice/types';
export type { TTilemap, TTilemapLayer, TTilemapOptions } from './gameobjects/tilemap';
export type { TTileDoc, TTilemapDoc, TTilemapLayerDoc, TTileLayerOrder } from './loaders';
export { TILEMAP_FORMAT, parseTilemapDoc } from './loaders';
export type { TSpriteAtlas, TSpriteAtlasOptions } from './atlas';
export type { TCamera2d, TCamera2dOptions, TCamera3d, TCamera3dOptions } from './camera';
export type { TFog, TFogOptions } from './fog';
export type { TKeyboard, TKeyName, TPointerInfo, TPointerHandle, TPointerListener, TPointerWheelInfo, TPointerWheelListener, TSpriteEvents } from './input';
export type { TGamepad, TGamepadAxisName, TGamepadButtonName, TGamepadInfo, TGamepadListener, TGamepadTarget, TRumbleOptions, TUseGamepadOptions } from './input';
export type { TAction, TActionBinding, TActionCaptureOptions, TActionDef, TActionDevice, TActionMap, TActionName, TActionOverrides, TActionPersist, TActionsHandle, TInputMapHandle } from './input';
export { GAMEPAD_AXES, GAMEPAD_AXIS_LABELS, GAMEPAD_BUTTONS, GAMEPAD_BUTTON_LABELS, gamepadAxisDirectionLabel, normalizeActionMap, bindingKey, describeBinding, DEFAULT_ACTION_DEADZONE, DEFAULT_ACTION_PRESS } from './input';
export { parseProject, gameOptionsFromProject } from './project';
export type { TProjectSettings } from './project';

// The scene document: the format, reading one, writing one down, and turning one into a scene.
// Writing one down is `serializeScene`, in `nacatamalon/authoring`: reading is not authoring.
export { parseSceneDoc, sceneFromDoc, SCENE_FORMAT, SCENE_VERSION } from './scene';
export type {
    TSceneDoc, TBoxNode, TDataEntry, TAssetEntry, TGeometrySource, TComponentDoc, TMaterialDoc, TMeshMaterialDoc, TMaterialMapDoc,
    TSpriteComponent, TTextComponent, TMeshComponent, TTilemapComponent, TTilemapLayerOverride, TParticlesComponent, TParticles3dComponent, TParticleCollider2dComponent, TParticleCollider3dComponent, TSpriteTextureComponent, TMusicComponent, TAudioListenerComponent, TCamera2dComponent,
    TCamera3dComponent, TFogComponent, TLightComponent, TSpriteAnimationDoc,
} from './scene';
export type { TRandomHandle } from './math/random';
export type { TGameSignal, TSignalHandler, TScenePauseEvent, TGamePauseEvent } from './signal';
export type {
    TSoundAttachment, TSoundHandle, TSoundOptions, TSoundSource, TAudioHandle, TSoundCone, TSoundFade, TSoundZone,
    TSoundZoneShape, TMusicAttachment, TMusicHandle, TMusicLayer, TMusicLayerOptions, TMusicOptions, TAudioListener,
} from './audio';
export type { TGameStore, TGameStoreConfig, TStoreActionsFactory, TStoreGet, TStoreListener, TStoreSelector, TStoreSet, TStorePersistence, TStorePersist } from './game_store';
// The format's vocabulary, which stays on the root the way `TSceneDoc` does: it describes a file,
// and the file is the engine's.
export type { TStoreDoc, TStoreField, TStoreFieldType, TStoreFieldValue, TStorePersistDoc } from './game_store';
export type { TGameHandle } from './game/handle';
// What its `capture` is asked for and hands back.
export type { TCaptureOptions } from './game/capture';
export type { TCaptureResult } from './render/interface';
export type { TGameInstance } from './game/types/t_game_instance';
export type { TGameEvents, TGameEventName } from './game/types/t_game_events';
export type { TGameOptions } from './game/types/t_game_options';
export type { TGameTarget } from './game/bootstrap/create_game';
export type { TRendererBackend } from './render/interface';
// The running engine's version: what the boot banner announces, and what a bug report should
// quote. Read from `package.json`, so the package is the one place the number is written.
export { VERSION } from './version';
// The easing curves and the `TEaseFn` type they share. A bare `export *`, never `export * as`:
// each curve comes out under its own name, so a game that only uses `easeOutBounce` leaves the
// other thirty-two behind when it is bundled.
export * from './math/easing';
export * from'./CONST';
// Types a public signature already names. Each was reachable through something exported and could
// not be written down by a game that wanted to hold one, which is also what the reference said about
// every one of them: named, and never documented.
export type { TCssNamedColor } from './color';
export type { TCreateMaterial } from './gameobjects/material/create_material';
export type { TLightBase } from './light/types/t_light';
export type { TShaderHalf } from './materials/types/t_material';
export type { TMaterialShaderOptions } from './materials';
export type {
    TScriptComponent, TSoundComponent, TStoreComponent, TPhysicsBody2dComponent, TPhysicsBody3dComponent,
    TPhysicsWorld2dComponent, TPhysicsWorld3dComponent,
} from './scene/document/types/t_component_doc';
export type { TSceneFromDocOptions } from './scene/document';
export type { TComposerBinaryOp } from './shader_composer/math';
export type { TAtlasFrame } from './atlas';
export type { TLoadable, TBitmapFontMeta, TBitmapFontGlyph, TFontMeta } from './loaders';
export type { TGltfNodeInfo } from './loaders';
export type { TParticleRange, TParticleColorStop, TParticleScaleStop, TEmissionDoc } from './loaders/particles';
export type { TShaderTarget } from './loaders/shader/types/t_shader_target';
export type { TRendererType } from './render';
export type { TCanvasScaling, TCanvasKeep } from './DOM';
export type { TUseActionsOptions } from './hooks';
export type { TUseLoadAudioOptions, TUseLoadBitmapFontOptions, TUseLoadFontOptions, TUseLoadLutOptions, TUseLoadPaletteOptions, TUseLoadParticlesOptions, TUseLoadPackOptions } from './hooks/loaders';
export type { TLoadedPack } from './loaders/pack';
export type { TPhysicsBody2dOptions, TPhysicsBody3dOptions } from './hooks/physics/use_physics_body';

// Small pieces a game and a tool both reach for: a fresh id, which way something faces, and reading
// a shader file the way the loader does.
export { nanoId } from './utils/nano_id';
export { transformForward } from './render/shared';
export { parseShaderFile, parseShaderSource } from './loaders/shader';
