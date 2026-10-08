export { newMaterial } from './new_material';
export { deriveSignature } from './derive_signature';
export { applyShader, rememberOverrides } from './apply_shader';

export type { TMaterial, TSpriteMaterial, TMeshMaterial, TMaterialMap, TTextureWrap } from './types/t_material';
export type { TMaterialShader, TUniformType, TUniformValues, TUniformSignature } from './types/t_uniforms';
export type {
    TMaterialOptions, TSpriteMaterialOptions, TMeshMaterialOptions, TMaterialShaderOptions,
} from './types/t_material_options';
