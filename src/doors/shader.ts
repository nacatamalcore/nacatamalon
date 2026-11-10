// A material's or an effect's look written by hand: the shader composer, and `.shader` files.
export { useLoadShader } from '../hooks';
export type { TUseLoadShaderOptions } from '../hooks';
export type { TShader, TParsedShader } from '../loaders/shader';
// A shader written as typed values instead of text, which `compileShader`
// turns into the fields `createMaterial` takes, in both languages. Every value starts with
// `composer`, so none of them can clash with a game's own names. A `.shader` file is the same graph
// drawn as nodes; reading and compiling one is here because a game loads them, and the node
// catalogue an editor builds its palette from goes out of `nacatamalon/authoring`.
export {
    compileShader, composerFloat, composerVec2, composerVec3, composerVec4, composerSwizzle, composerX,
    composerY, composerZ, composerW, composerUv, composerTime, composerResolution, composerSurface,
    composerWorldNormal, composerWorldPos, composerViewDir, composerLight, composerEmissive,
    composerShine, composerEnvUv, composerVertexPosition, composerVertexNormal, composerVertexColor,
    composerScreenPos, composerUv2, composerWorldTangent, composerWorldBitangent, composerVertexTangent,
    composerVertexBitangent, composerInstanceData, composerInstanceOrigin, composerFrontFacing, composerCarry, composerOcclusion, composerLocalUv,
    composerLayerUv, composerTextureSample, composerMapSample, composerUniform, composerAdd, composerSub,
    composerMul, composerDiv, composerAbs, composerFloor, composerFract, composerSin, composerCos,
    composerSqrt, composerSign, composerNormalize, composerLength, composerDistance, composerDot,
    composerCross, composerPow, composerMin, composerMax, composerClamp, composerMix, composerStep,
    composerSmoothstep, composerReflect, composerMod, composerAtan2, composerOneMinus, composerSaturate,
    composerPipe, composerSimplexNoise, composerFbm, composerCellularNoise, composerFresnel,
    composerCelShade, parseShaderGraph, compileShaderGraph, toonLighting, unlitLighting, mangaDots, rim,
} from '../shader_composer';
export type {
    TComposerNode, TComposerInput, TComposerSampleOptions, TComposerStep, TInputKind, THelperDef, TShaderGraph, TCompiledShader,
    TShaderGraphDoc, TGraphNodeDoc, TGraphEdgeDoc, TGraphCommentDoc, TParamValue, TGraphTarget, TLook,
    TToonLook, TUnlitLook, TMangaDotsLook, TRimLook,
} from '../shader_composer';
export type { TComposerBinaryOp } from '../shader_composer/math';
export type { TShaderTarget } from '../loaders/shader/types/t_shader_target';
export { parseShaderFile, parseShaderSource } from '../loaders/shader';
