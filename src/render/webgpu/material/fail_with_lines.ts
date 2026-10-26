/**
 * Says why a pipeline was refused: the shader's own lines when the shader is what was wrong, which
 * is nearly always, and the card's word for the pipeline otherwise.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const failWithLines = (module: GPUShaderModule, error: unknown, fail: (reason: unknown) => void): void => {
    void module.getCompilationInfo().then((info) => {
        const bad = info.messages.filter((message) => message.type === 'error');
        fail(bad.length > 0 ? bad.map((message) => `${message.lineNum}: ${message.message}`).join('\n') : (error as { message?: string })?.message ?? error);
    }, () => fail(error));
};
