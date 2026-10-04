import { parseShaderFile } from './parse_shader_file';
import { compileShaderGraph } from '../../shader_composer/compile_shader_graph';
import { parseShaderGraph } from '../../shader_composer/document';
import type { TParsedShader } from './types/t_parsed_shader';

/**
 * Reads a shader file with the reader its extension asks for: a `.shader` is a graph of nodes, as
 * JSON, and anything else is WGSL with a header. Both give the same shape, so nothing after this
 * knows which it was.
 *
 * It is the loader's own reader, open to tools: an editor that lets a material pick a shader needs
 * the knobs it declares, whichever of the two ways it was written.
 * @param source - The file's text.
 * @param src - Its path: the extension decides how it is read, and warnings name it.
 * @returns What the file declares, and its code in both languages.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseShaderSource = (source: string, src: string): TParsedShader =>
    (src.endsWith('.shader') ? compileShaderGraph(parseShaderGraph(source, src), src) : parseShaderFile(source, src));
