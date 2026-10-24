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
    chars: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¿ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç·×€©←→↑↓▲▼◀▶ⒶⒷⓍⓎ★♥●■',
    widths: '8888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888',
    atlas: 'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAYAAAA+hf0SAAAEbUlEQVR42u1dSZKDMAz0/z/tucxhaioEqRdLBvuWQAjGba0tMUZw' +
        'zN9xd+zTeXfHs9///27+Gcj9Z+e4+4DmggJgfhl353y7XgZckUkzAGEAvsXisxPILGj2PqIAUM3tboE7SxDqHlwAuJIAyofvBMCd' +
        'hLuTftH/Q3+/BQAQvX93bUaqPFEClP2/YodkxL5TDThtAHaB7OBzSwClF+AAgXsHuQDwJO/lsaN8kSJGRmR3ZF28jJuX/Q/V7zNG' +
        'ahUYourl4/2zgZaMwYbocIfuZANX7JzdajZ1r9HFVljKDACiEoSJI1QCIOJdqDyNSwBkJ/3tRqPHIyI6AiBVHCGqApRqQHm9qKr+' +
        '+mUWAOwuZEQlu0NVu7m7BLg85niASgC4RXQXALhsAIkXgIhHNBSKWOFOL0bhBSjtpwpwnfGWQASyAzKh3KiEUEgYNN2sMDIV/Ail' +
        'CqTiAI7jGZ3vMq5UNtCqOMcnQEaM+FQcQIVgN8J3BYAiaJZdszQAoiIwKiJVAFCHmjMqRAEARZbwboGRDfxKCeCI9K2QAFkKHhQK' +
        'Vj/AjjbAyjiCY37yXIbbSl7hBaC0Ktf8WBWnXOCV2cwznhADqI4DKEPB6uMKvgEaxbMwlqrjAGoduxoAaD6DTuMmAXIAICKZOhJF' +
        'Q8iWToNAJYJdyRrlAkZrE9AdxmRMyxI6jkAEK3VWA8BN62alYBsAKESkK18fkT5QoESwwKp0cAkA7h6aKpvG5Ov/nlcVCEK9AKT8' +
        '7PiuZwxVZVYtFUl8Tab40nUeImG3qk7pAoBO9+8EWDvGEBsJRI+vikRmdyhqJKOsYJUbPlZW1nTO1rHp4CnuYJJxw5n5DXc2bYgJ' +
        'IbsBQBFEKgFAd0II6kYeCSCWAKttABdpM7uLFYGy6PVRltHr+QDuB3ACNU9okrAYiHRR5wHAs+ZXVjuo8qOjCZndGUFqL0XZpArq' +
        'kaR8AN0JIUg6WJEZVO7uyL2nVMwKxs/OhBA2Hf0qFaCioQ0DH2AQhJApaFPTHgCuzp8TrK5FrsE0s2Z7HGWkXIUXYAPAiSO8yMua' +
        'BZW6rlatjnauXecXWvyuk1fpP5a5+/T5yfkAq2vrhrF2juULrJgfzQdQ+uEdK3/Q4o5qPsLS6mBXu/cuDyj7WpsOfAR7pLI6X19V' +
        '2/fW2sYRaRChRJhCRzltCAdfQd2K1t0/4BAGxsnFb+ECVoKUed/AXaQyek4kVAwf3yEIsgL8SPYv8v0U9gCQAmAueKOGWoerJQSr' +
        'n6+MS/U7DRgJc/nbae6MXcEqVkuoyEP/NIchaHWbLc8f2XQ1y8hh/egOAOguAaLZTkgCz2Z9Al0A2N0GgEV8FABqG0BV+6eqG3ir' +
        'FzCBV/I8mll7hgghM/GO3kovgmUMvYKbj7zSJcJERXr0uKxgRkTORi+WLH9zKNrrF11A1XHWS1HYAFuWLSn9WCZbh352EVpeA4Bd' +
        'JECmOknJeHpUMi1r0GULImagvBm1AdhKJXU697EA2M0LyLJ3WnfyOuMM9fgBnfNGXeqiocAAAAAASUVORK5CYII=',
};
