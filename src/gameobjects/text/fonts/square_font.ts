/*
 * Nacatamal Square, one of the fonts built into the engine. Written by `bun run build:fonts` from
 * `fonts/nacatamal_square.txt`: change the letters there, not here.
 */
import type { TBuiltinFont } from '../types/t_builtin_font';

export const SQUARE_FONT: TBuiltinFont = {
    name: 'Nacatamal Square',
    key: 'nacatamalon:square',
    tracking: 1,
    baseline: 7,
    chars: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¿ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç·€©←→↑↓▲▼◀▶ⒶⒷⓍⓎ★♥●■',
    widths: '888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888',
    atlas: 'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAYAAAA+hf0SAAAEJElEQVR42u1dy3bsIAzj/3+au+mip+cm2LJkAzG7TqYTCEL4IZwx' +
        'jG3+tNW1/31vdd37+d/P5q+G9N87xtMbNBYUAPOlrb7z9nsecFkGHQFIBOBHTH50AJ4J9fbDCgDW2FYTvDODhPqgAsATAzAfvhIA' +
        'K4ZbsZ/1fuj/HwEAZN9f/XaEVW5kgLL7M1aIh/aV24DSBohOkBx8agZgegEKEKhXkAoAN3kv17bSSfJSNIvivXEDdAth9Y9liCnA' +
        'YGGux/5bDS6GocQMHLEeGHJ/5PlEA1EyQ9YaVWsAaAHgZdjIs3gEgHfQzEhfFkWzt4jdbADPPD2ueNQPZw2YySDIykX6tzsDPF6L' +
        'PpQGwHk2ADVQo6BQ1RZgDUOztwCm/VQBrm5fCEJUGWnVfjwah7A8S6aXo4qjhN0ghRvHdANZ+zlK4x49g+W33iYYspFWUb8GAA8A' +
        'UeNxBQDont4bMCgWAQASY/AkjrwZSS8AGFnC1QQjC/iTDKCI9GUwgFeC5waA4gHeDgB0grL6bwZAdraO7QVkW9FZVjoLAFnZzG4d' +
        'B9AwQKabilC4hyXQKJ5EsVQdB2DvsdkA8ErXaWlcJ0AaACSRqSJRNIhqaTcIqo1ApijUcs2SFEJXWCRjWpbQUQQioqyTDQC1rDvK' +
        'gtsAwBJoQFcKK4e/+twdKCFMMCsdXAoA7+FN9hZgzfdXBYJQLwCRrbXv2o1m49VJkUSqGJVaJ7p6Lf0+8nTKbgAYm53KYQNsGwr5' +
        'oqIoWr9gBM5GbnWyqTobqMzWRdPBk1zBxOOGR1XT0kDRIAtCTgMAI4hUCoBd9QAsCm0GOCxbqBJtRlTBDBvAG8lsPQDDDxYayd1O' +
        'KJJQAEb0jH8D4NLxzaqzg60IytHczYRClVCNpC8JQpB0MCMzyFzdlr67tpgsN+9UQUg0Hf2ZLYApQxsCPUCUAbzb1HEAUFX+9DIA' +
        'MgHjRQ/ApviIn13pBcgA0HGED3lZs+CkrqpUq6Kc667jM0++0ohRX1+NK6rcvX186bkAZbax4uwfWqlTHYdwbWGIG3TKyZ9IVY5K' +
        'PcKsOB3MLve+ywOaggIYpwDAVSPoRgZACyjMy842ygpE3FYF7LbxDbRARLfOxZden4nFmhmVSD0um/f/kevm/p8QBMkWaazCy6oz' +
        '/myAmE4F7b4HqkK1lv4/GY/sdx+iYPQeb3cdC2MlS0bxCyNm4HVvTyueDfBpOH4fTUc/Un9UkZNpxSrLq1QwQIjCjQxC3ftPqhN4' +
        'ig0go/jV7++u+5+J9fxP9ALY/bteWdvNmWL01rCrXOGIIuhT2ntkT/Ral2gJmagVHKFIhpF1pfTJ83DQCWRdVzLM1QDIduOsjGH9' +
        'ezVBDYBLGGC1JaFuUgOAZAMM4/Fl1AaIvCMn6kd/MlN6ihfgVedsX62rW7fM9g9LktvjGFRiJwAAAABJRU5ErkJggg==',
};
