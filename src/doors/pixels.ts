// Pictures painted in code, in plain JavaScript, and the textures made from them: a game's own art
// with no image files and no page, the same in the browser, on the native runtime and in a test.
export {
    createPixels, setPixel, getPixel, fillRect, drawLine, fillCircle, drawCircle, fillEllipse,
    drawEllipse, fillPolygon, blitPixels, mapPixels, fillGradient, fillNoise, fillChecker, fillDither,
    clonePixels, swapColors, outlinePixels, mirrorPixels, snapToPalette, checkColorLimit, shadeWithRamp,
    drawText, pixelsFromRows, sheetFromRows,
} from '../pixels';
export type {
    TPixels, TPixelRegion, TFillGradientOptions, TFillNoiseOptions, TDrawTextOptions, TPixelPalette,
    TPixelRowsOptions, TPixelSheet, TOutlinePixelsOptions, TMirrorPixelsOptions, TSnapToPaletteOptions,
    TColorLimitOptions, TColorLimitCell, TShadeWithRampOptions,
} from '../pixels';
export { createPixelTexture, updatePixelTexture } from '../gameobjects/pixel_texture';
export type { TPixelTextureOptions, TPixelPaint } from '../gameobjects/pixel_texture';
export type { TLoadedPixels } from '../loaders/pixels';
export type { TUseLoadPixelsOptions } from '../hooks';
export { useLoadPixels } from '../hooks';
