export const hasWebGPU = (): boolean => {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
}