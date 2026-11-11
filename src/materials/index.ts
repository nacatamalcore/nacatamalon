export { newMaterial } from './new_material';
export { deriveSignature } from './derive_signature';
export { applyShader, rememberOverrides } from './apply_shader';
export { plastic, ceramic, chrome, rubber, carPaint, glass, neon, pearl, hologram, gold, copper, brass, anodized } from './recipes';
export type { TMaterialRecipe, TMaterialRecipeOptions } from './recipes';

export type { TMaterial, TSpriteMaterial, TMeshMaterial, TMaterialMap, TMaterialOcclusion, TMaterialReflection, TMaterialReflectionRecord, TMaterialNormalMap, TTextureWrap, TCullMode } from './types/t_material';
export type { TMaterialShader, TUniformType, TUniformValues, TUniformValue, TUniformPoint, TUniformPointValue, TUniformColorValue, TUniformNumbers, TUniformSignature } from './types/t_uniforms';
export type {
    TMaterialOptions, TSpriteMaterialOptions, TMeshMaterialOptions, TMaterialShaderOptions,
} from './types/t_material_options';
