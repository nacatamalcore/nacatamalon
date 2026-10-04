/**
 * Standard CSS Level 4 named colors. Listed as a string-literal union purely so
 * editors autocomplete them as `useColor`/`getColor` arguments: `fromCss` (and the
 * browser's CSS parser it relies on) accepts any of these plus the rest of the CSS
 * color syntax (`rgb()`, `hsl()`, hex, etc.) regardless of this list.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCssNamedColor =
    | 'aliceblue' | 'antiquewhite' | 'aqua' | 'aquamarine' | 'azure'
    | 'beige' | 'bisque' | 'black' | 'blanchedalmond' | 'blue' | 'blueviolet' | 'brown' | 'burlywood'
    | 'cadetblue' | 'chartreuse' | 'chocolate' | 'coral' | 'cornflowerblue' | 'cornsilk' | 'crimson' | 'cyan'
    | 'darkblue' | 'darkcyan' | 'darkgoldenrod' | 'darkgray' | 'darkgreen' | 'darkgrey' | 'darkkhaki'
    | 'darkmagenta' | 'darkolivegreen' | 'darkorange' | 'darkorchid' | 'darkred' | 'darksalmon'
    | 'darkseagreen' | 'darkslateblue' | 'darkslategray' | 'darkslategrey' | 'darkturquoise' | 'darkviolet'
    | 'deeppink' | 'deepskyblue' | 'dimgray' | 'dimgrey' | 'dodgerblue'
    | 'firebrick' | 'floralwhite' | 'forestgreen' | 'fuchsia'
    | 'gainsboro' | 'ghostwhite' | 'gold' | 'goldenrod' | 'gray' | 'green' | 'greenyellow' | 'grey'
    | 'honeydew' | 'hotpink'
    | 'indianred' | 'indigo' | 'ivory'
    | 'khaki'
    | 'lavender' | 'lavenderblush' | 'lawngreen' | 'lemonchiffon' | 'lightblue' | 'lightcoral'
    | 'lightcyan' | 'lightgoldenrodyellow' | 'lightgray' | 'lightgreen' | 'lightgrey' | 'lightpink'
    | 'lightsalmon' | 'lightseagreen' | 'lightskyblue' | 'lightslategray' | 'lightslategrey'
    | 'lightsteelblue' | 'lightyellow' | 'lime' | 'limegreen' | 'linen'
    | 'magenta' | 'maroon' | 'mediumaquamarine' | 'mediumblue' | 'mediumorchid' | 'mediumpurple'
    | 'mediumseagreen' | 'mediumslateblue' | 'mediumspringgreen' | 'mediumturquoise' | 'mediumvioletred'
    | 'midnightblue' | 'mintcream' | 'mistyrose' | 'moccasin'
    | 'navajowhite' | 'navy'
    | 'oldlace' | 'olive' | 'olivedrab' | 'orange' | 'orangered' | 'orchid'
    | 'palegoldenrod' | 'palegreen' | 'paleturquoise' | 'palevioletred' | 'papayawhip' | 'peachpuff'
    | 'peru' | 'pink' | 'plum' | 'powderblue' | 'purple'
    | 'rebeccapurple' | 'red' | 'rosybrown' | 'royalblue'
    | 'saddlebrown' | 'salmon' | 'sandybrown' | 'seagreen' | 'seashell' | 'sienna' | 'silver' | 'skyblue'
    | 'slateblue' | 'slategray' | 'slategrey' | 'snow' | 'springgreen' | 'steelblue'
    | 'tan' | 'teal' | 'thistle' | 'tomato' | 'turquoise'
    | 'violet'
    | 'wheat' | 'white' | 'whitesmoke'
    | 'yellow' | 'yellowgreen'
    | 'transparent' | 'currentcolor';
