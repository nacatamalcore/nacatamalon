/*
 * Nacatamal Arcade, one of the fonts built into the engine. Written by `bun run build:fonts` from
 * `fonts/nacatamal_arcade.txt`: change the letters there, not here.
 */
import type { TBuiltinFont } from '../types/t_builtin_font';

export const ARCADE_FONT: TBuiltinFont = {
    name: 'Nacatamal Arcade',
    key: 'nacatamalon:arcade',
    tracking: 1,
    baseline: 7,
    chars: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¿ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç·€©←→↑↓▲▼◀▶ⒶⒷⓍⓎ★♥●■',
    widths: '888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888',
    atlas: 'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAYAAAA+hf0SAAAEaklEQVR42u1dy5brIAzj/3+au5nFnHumxbIkbBJYljYNQfgpO2ME' +
        'x/wZq7m/vreaRz///7P5a2TuH13j6SO1liwA5pex+s636yHgiiyaAQgD8CM2n10AsqHofUQBoFrbaoM7SxDqHlwA+CQBlA/fCYCV' +
        'hFtJv+j/ZX9/BAAyen91bUaqPFEClP2/4oQgYt+pBpw2ALtBdvC5JYDSC3CAwH2CXAB4kvfy2FG+SREjI3I6UBcPcfPQ/1D9HjFS' +
        'q8AQVS9/3j8baEEMtowOd+hONnDFrtmtZqF7jW62wlJmABCVIEwcoRIAEe9C5Wl8BAC66G83Gp2PiOgIgFRxhKgKUKoB5fWiqvrr' +
        'hygA2FPIiEr2hKpOc3cJ8HHO8QCVAHCL6C4AcNkAEi8gIx6zodCMFe70YhRegNJ+qgDXHW8JRGROABLKjUoIhYTJppsVRqaCH6FU' +
        'gVQcwDGP6HyXcaWygXbFOf4CZMSIh+IAKgS7EX4qABRBM3TPYABERWBURKoAoA41IypEAQBFlnC1wZkD/EoJ4Ij07ZAAKAUvFQpW' +
        'P8CONsDOOIJjffJchttK3uEFZGlVrvWxKk65wTuzmXc8IQZQHQdQhoLV8wq+QTaKZ2EsVccB1Dp2NwCy+Qw6jQsC5AJARDJ1JIqG' +
        'kC0Ng0Algl3JGuUGRmsTsieMyZiWJXQcgQhW6uwGgJvWzUrBNgBQiEhXvj4ifVKBEsEGq9LBJQBYPTRVNo3J1//+XlUgKOsFZMrP' +
        'ru96x1BVZtVSkcTXZIovXd/LSNijqlO6AKDT/TsB1o4xxEYCs/O7IpHoCc0ayVlWsMoNHzsrazpn69h08BR3MEHccGZ9w51NG2JC' +
        'yGkAUASRSgDQnRCSdSOvBBBLgN02gIu0iZ5iRaAsev0sy+j1fAD3A7iBmic0SdgMRLqo8wLgWesrqx1U+dHRhMzpjCC1l6JsUpXq' +
        'kaR8AN0JIZl0sCIzqDzdkXuHVMwOxs/JhBA2Hf0qFaCioQ0DH2AQhJApaFPTHgCuzp8zWV2buQbTzJrtcYRIuQovwAaAG0d4kZc1' +
        'Cyp1Xa1aHe1cu64vtPldF6/Sfyxz9+nrk/MBdtfWDWPtHMsX2LE+mg+g9MM7Vv5kizuq+Qhbq4Nd7d67PCD0tTYd+Aj2SGV1vr6q' +
        'tu+ttY0j0iBCiTCFjnLaEA6+groVrbt/wCUMjJuLP8IF3EnqyDBqoqoiM5edD0cqTwiCVByA6OdTWOOvBkioKmga36ih1uFKCRFZ' +
        '+yfjUf3OAkbCpG2Qae6MXcEqVlbdfnoNHWsER93UKehv8HWeZeSwfnQ1ADpIAEqEg3wLie4/qVHkKTaATcSvru+yAVS1f6q6gad6' +
        'ASgf4fXM2jvAFCMi1iq8BJYR9CrufaZ4AbUuV0aeywpmRORs9OLIdrQnJAuW2UDVPOuFKGyAR/aQUbtxE3wDxgTekKEkrLyuuLK7' +
        'BECqj5SMptcly7I2wAiWL2dtALYSSZ2uvV5AEy8AZeeMzp267rhj9/gHKg/+lh5gf2YAAAAASUVORK5CYII=',
};
