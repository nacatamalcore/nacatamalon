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
    chars: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¿ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç·×€©←→↑↓▲▼◀▶ⒶⒷⓍⓎ★♥●■',
    widths: '8888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888',
    atlas: 'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAYAAAA+hf0SAAAEJ0lEQVR42u1dyXYDIQzj/3+aXnro60sGS5YwMHBrJk1YhPAinNaC' +
        'rf+20bNP7xs9R1///1r/05j+o2PcvVFjYQHQH9roPU+fh4ArMugMQDIA32LxswNAFhTtRxQAqrGNFnhlBkn1wQWAbwygnHwnAEYM' +
        'N2K/6Pex/78FAJhzf/TZGVY5kQHKvl+xQxDadx4DThsgu0B28LkZQOkFOEDg3kEuAJzkvRzbShcJpWgVxaNxA/YIUfVPZYg5wBBh' +
        'rq/9jxpcCkNJGThSTRjz/cz8ZANRNkM2GlW7APACAGXYzFx8BQA6aGWkbxZFq4+I1WwAZJ2+7njWD1cNWMkgzM5l+rc6A3x9lp2U' +
        'C4D9bABpoMZBoa4jIBqGVh8BSvupAly3vSEIUWWkVfvxbBwiMpdKL8cVR0m7QQ43TukGqs5zlsYRPUPks54WmLKRRlG/CwAdALLG' +
        '4wgA1HeiX6CgWAYATIwBSRyhGUkUAIos4WiBmQ38SgZwRPpmMAAqwYMB4JjA0wHALtCs/ocBMDtbp/YCZlvRs6x0FQBmZTNvu3EA' +
        'DwPMdFMZCkdYgo3iWRRL1XEA9Rk7GwCodF2WxgUBcgEgEpk6EkVNqJaGQVBtBCpFoZFnkaQQu8MyGdOyhI4jEJFlndkAcMu6syy4' +
        'DAAigQZ2p6hy+KPX4UCJYIFV6eBSAKCXN9VHQDTfXxUIYr0ARrZ2fdfbZDZenRTJpIpxqXWyuzfS7y1vp6wGgLbYrRw1wJahkDcq' +
        'irL1C1ribuRSN5uqs4HObF02HdzFFUwQNzyrmrYGippYELIbABRBpFIArKoHUFHoZYDNsoUu0WZGFaywAdBI5tUDKPxgo5F82w5F' +
        'EgrAyN7xvwA4dHy96u7gVQTN0dz1CYUqqRpJbxKEMOlgRWZQubsjfYeOmFlu3q6CkGw6+jVHgFKG1gx6gCwDoMfUdgBwVf5EGYBZ' +
        'gPagB1BTfMbPrvQCbAC4cYQXeVm94Kauq1Sro5zrquMLL77TiHE/H40rq9w9fXzTcwHObGPF3T+2Uqc7DgEdYYwbtMvNn0xVjko9' +
        'Qq+4Hawu977KBHVDAYxdAADVCDqRAdgCCv2wu422AhGnVQE7bXyNLRBx283Flz5fAaDKSqWIS4f+f+r5DkGQGeBH7zpGX1dqG6UA' +
        '2OUMdIZqGS/o/6R+6rf6txFZMD4CqJsrY1eoil3l2p8m/dMY1BugB67nw+lqlSJnphWrBsDqDBDNdiJjaJV16mbWCTzFBqApPgqA' +
        'VXX/faGfdNnRCzjKze8VJVSu4OEZbWiNu0oGYBRDr9DmM1efmHQoU2NIZQVnKDJlZJ0CAGQHZqqMuZ47Geao81X9o0qqbB3792iB' +
        'LgBAXfuqDDA6klg36TUAQNwUxgZowevNrA2Q+Q2dlB/9NgDs5gWg6p3lq3nddpuy/QBLQiOq7v7MoQAAAABJRU5ErkJggg==',
};
