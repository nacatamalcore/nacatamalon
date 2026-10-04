/**
 * Compiles one shader stage, and throws with the compiler's own message if it does not compile.
 */
const compileShader = (gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (shader === null) {
        throw new Error(`[NacatamalOn] WebGL2: could not create the ${label} shader.`);
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`[NacatamalOn] WebGL2: the ${label} shader did not compile.\n${log}`);
    }
    return shader;
};

/**
 * Builds a program from a vertex and a fragment shader, and throws with the compile or link log if
 * either fails.
 *
 * WebGPU reports a broken shader through `uncapturederror` and keeps going; WebGL2 only tells when
 * asked, so this asks once, at build time, and a broken shader stops the boot with its message
 * instead of drawing nothing in silence. Checking once is enough: the status never changes later.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const compileProgram = (gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, label: string): WebGLProgram => {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment`);

    const program = gl.createProgram();
    if (program === null) {
        throw new Error(`[NacatamalOn] WebGL2: could not create the ${label} program.`);
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    // The program keeps what it linked, so the stages can go whether it worked or not.
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`[NacatamalOn] WebGL2: the ${label} program did not link.\n${log}`);
    }
    return program;
};
