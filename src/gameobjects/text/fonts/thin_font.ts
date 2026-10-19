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
    chars: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¿ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç·€©←→↑↓▲▼◀▶ⒶⒷⓍⓎ★♥●■',
    widths: '666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666688888888888888888',
    atlas: 'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAYAAAA+hf0SAAAETklEQVR42u1d25bjIAzj/3+6s497ZhqwLck2BF7mdAhNAUX4njGM' +
        '7fOvrfqerln1r8b+3/ftutn3Mq6xjN2lhecSBcDnS1td8wSA2eavJqbq/33/ziCCfgMymLGBjPHo3FYsFWG41wOAsYDo4iIAWDGc' +
        'hQFX90TG0wCoBICVJRAKfjMDlLKP9wlZbfK38UyQnigDUO6dxQCz/6+ESBUIMjZPdYydpMEc28o3iSGERVQ8C4V71Uj2eOv6VALB' +
        'cnw9/v7ZmbqiXut46/URI09EqmZ+3u0I+HOd5YxlSMoIAKwMgtgRUAAgQLWyK0PTeAQAQ4qNUKhXz41oEcgR5rlHh/PfalIfHls7' +
        'k4rZCEafUPQIU4OAxQCPfQyKQ2m4kqJZAFD7IuRm3qgUzDD0oJa2zCOgwtcwhJ7O227jMoBXiPKOjThbVuM9Dh/vGqJqJeP7IDuA' +
        'Wm9W2wHQBUZpnDG/lS9kdg+zHYCFYDXCdwUAKjw+fY+1P2wHQIU8BgCYpuaovx4BAKJBpQLgDQygsvSpGcB6xIQBUGU7z5YBsu0I' +
        '7PlJ9gORkjtoAd6gFLYW4DkCI0esVAu47doAPl3sABkyiOIzGq+gjtcYlWcMI+Cy8+eIP0MRlBoGwdsBwMpsqvKkwgErXj0eFQKr' +
        'AMBWx4bYzZ3m0GEbItjRq+gTbAEAErWcFStRDgALBSkSMBkAsOYVMH7fcQBYxd0zjgjUX688QoYjViEadXz1+NvKMrNGVmbtSMpA' +
        'QsPE2UKal2G3y07pAoAuvz87HKw8Ygi1BHr71ZZI5AlFhGTV2tFliI4hT5VC4CAVsIhmH6dkNjFt9Wxv2Q4AYKjHZQDoHhASSa64' +
        'DEBmgEwZQBm0GdHDGYYyy/eHQ76uHUG/ANdIc0KRhEQgUpI6LwDOml9Z7iBDj7agmxVWvmNEUKa7uUTK92SmdIwH8JSoYzikVFqG' +
        'JD2coVYovXmDEA/ASB+vKlXb5ghQlTPrEBDCKFPTGgDMIwMpr6KyA7AoHpEBqrUAGQCuHeFFWlb1OReN2rVWEj11fqbN7zp5lr+f' +
        'laV76vxo8QAVuXVDnDuHxguo50eJB2Dp4R0zfzyGkm7xCGnZwcpy7x0WyPNam9EoHkFuqaz212cuiCKgZXsGqM6OVfd7ZQB2zOIg' +
        'lKJV1w+4AQPj+uLbq4BZQR1IQeuO6/iZtK2MIFUPAKvG8Eh48VQofW23M5zNEFZHz+9rEB+8IoU9zGCsQoqdKnKwX9iw2rQZxVr6' +
        'Z4Edq374IUMjcrJrACncpNUMMAih4WEW71QnsOoFDh1kABnFe2sEojKAWo+OxgucqgWYpfzdXfkl1TOubSAmhaMFpxX2+JXb9BrD' +
        'HhbCs+gzKfbJK4f+ZVAkC4BHlhKxSvGVf1E1DAXIcRsf0WOtG+XVcy16sHfzLgBEDBAFhpXqo4YQBCCvAQAqA6AMgAAAFfKuDLCx' +
        'FmB5kRKrFuFttx3XfgDw1a/oixLqvwAAAABJRU5ErkJggg==',
};
