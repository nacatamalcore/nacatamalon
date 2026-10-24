/*
 * Nacatamal Thin, one of the fonts built into the engine. Written by `bun run build:fonts` from
 * `fonts/nacatamal_thin.txt`: change the letters there, not here.
 */
import type { TBuiltinFont } from '../types/t_builtin_font';

export const THIN_FONT: TBuiltinFont = {
    name: 'Nacatamal Thin',
    key: 'nacatamalon:thin',
    tracking: 1,
    baseline: 7,
    chars: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¿ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç·×€©←→↑↓▲▼◀▶ⒶⒷⓍⓎ★♥●■',
    widths: '6666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666688888888888888888',
    atlas: 'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAYAAAA+hf0SAAAEXUlEQVR42u1d23bDIAzj/3+62+POmgTbkmxD4GWnI7SFqL7KzhjG' +
        '8fkds7m7a2bzs7V/566ue3pfxjWWtauM8F6iAPhcjNk1dwB4uvmzjanm/39+ZxBB3wFZzLiBjPXo3mZSKiLhXg8AxgGih4sAYCbh' +
        'LBJw9pnIehoAlQCwSglEBL9ZApRKH+8vZHaTr9YzQbqjDUD57CwJ8PT/mRGpAkHGzVOpsZ08mG1H+U1iGGERF88iwr1uJHu99Xwq' +
        'gWBRX7ff/0mnzkSvdb31+kiQJ2JVM1+vpgK+rrPoWIaljADAKkGQOAIKAASoVunK8DRuAcCwYiMi1OvnRrwIRIV5PqOD/reG1Icn' +
        '1s4UxWwEo79QVIWpQcCSALdzDBGHiuFKEc0CgDoXIQ/zRq1gRqAHjbRlqoCKXMMQZjrPOIMrAbxGlHdtJNkyW+9J+HjPEHUrGe8H' +
        'xQHUfrM6DoAeMCrGGfub5UKePsMcB2AhWI3wVQGAGo9372OdD8cBUCOPAQBmqDmar0cAgHhQqQB4gwRQRfrUEsCqYsIAqIqdZ9sA' +
        '2XEE9v4k9wOxkjt4AV5SCtsL8KjAiIqVegFnnBjAp0scIMMGUbxG+Qpqvsao1DEMwmXn15F8hoKUGgbB2wHAqmyqyqTChBWvH48a' +
        'gVUAYLtjQ5zmTkvosAMRbPYq+gu2AABhLWdxJcoBYBFBigJMBgCsdQWM77cdAGa8e4aKQPP1ShUyHFyFKOv4+PFnlFVmjazK2pFU' +
        'gYTSxNlGmlfCLled0gUAXb5/Nh2snDGERgK98+pIJPILRYxk1dnRbYiOlKdKI3CQGlhEq49TKpuYsXp2tmwFADDc4zIAdCeERIor' +
        'jgQgS4BMG0BJ2oz44YxAmeX9w5SvE0fQH8AJ0uzQJCERiJSizgOAvfZXVjvI8KMt6GbRyldkBGWmm0usfE9lSkc+gKdFHSMhpfIy' +
        'JOXhDLdCmc0bBD4Ao3y8qlVtGxWgamfWgRDCaFPTGgBMlYG0V1HFAVgiHrEBqr0AGQBOHOFFXla1nouydq2dRHfdn+nmd908K9/P' +
        'qtLddX80PkBFbd0Q186hfAH1/ih8AJYf3rHyxxMo6cZHSKsOVrZ773BAnsfajEZ8BHmksjpfn3kgCkLL8hKgujpWPe+1AdicxUFo' +
        'RavuH3AIA+Pk4tu7gNUgZTS8bn3O3YMgWeCPPrRqkMq2lQ+mMvUH6q7DFRIi6iE8dVlDcvSKEneZF1ARuBnJlbeRRNMVMK7AZJl/' +
        'In7M5k0AUFrR7B5AChXRXQIMAnX8dh+d+gRWAGAVG4D54K4vADBtALUfHeULvNULmKmY17iqZzhi/Z6ne0SsdLQhtSJeP0urbh0s' +
        'i9CaZk2mZ5bpleEym4/8ZYhIFgCXBoDHjbFYqJl/UTcMBcjSvDeWH2u9UV4/1+IHe2/eAYBDSngkQBQYVlEfCoSAANkGACNY5GG1' +
        'AVAJgAAANfK2twGQB0B29wIsD1pi9So844zlxg9QJ9PE1aJ3CgAAAABJRU5ErkJggg==',
};
