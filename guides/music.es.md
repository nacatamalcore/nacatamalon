# Hacer música con NacatamalOn

NacatamalOn toca música escrita como **notas**, no grabaciones. Una canción es un archivo de texto
pequeño (un `.song`), el motor la convierte en sonido dentro del juego y, como son notas, el juego la
puede cambiar mientras suena: más rápida en la última vuelta, en otra tonalidad, sin una voz, con una
voz que pasa de izquierda a derecha.

Esta guía va de la primera nota a un arreglo completo para la NES, la SNES o la Genesis. No hace
falta ningún programa de música ni saber teoría musical para seguirla.

- [1. Tu primera canción](#1-tu-primera-canción)
- [2. Escribir notas](#2-escribir-notas)
- [3. Las consolas y sus voces](#3-las-consolas-y-sus-voces)
- [4. Instrumentos](#4-instrumentos)
- [5. Lo que hace una nota por su cuenta](#5-lo-que-hace-una-nota-por-su-cuenta)
- [6. Samples, eco y paneo](#6-samples-eco-y-paneo)
- [7. Recetas](#7-recetas)
- [8. Las canciones que trae el motor](#8-las-canciones-que-trae-el-motor)
- [9. Tocarla en un juego](#9-tocarla-en-un-juego)
- [10. Traer música de FamiTracker o FamiStudio](#10-traer-música-de-famitracker-o-famistudio)
- [11. Cuando algo está mal](#11-cuando-algo-está-mal)

---

## 1. Tu primera canción

Una canción es un tempo, un compás y lo que toca cada voz. Esta son cuatro compases de una melodía,
un bajo y una batería, para la NES:

```json
{
    "format": 1,
    "tempo": 120,
    "meter": [4, 4],
    "voices": {
        "pulse1": { "notes": "c'4 e' g' e' | f'4 a' g'2 | e'4 c' d' b | c'1 |" },
        "triangle": { "notes": "c,2 g, | f,2 c, | a,,2 g,, | c,1 |" },
        "noise": { "notes": "x4 r x r | x4 r x r | x4 r x r | x4 x x x |" }
    }
}
```

Guárdala como `public/music/first.song` y tócala:

```ts
import { createScene, useLoadSong, useSong } from 'nacatamalon';

const Title = () => {
    useSong(useLoadSong({ src: '/music/first.song' }), { autoplay: true });
    return createScene();
};
```

En el editor ni siquiera hace falta escribir el archivo a mano: abre una canción con **Edit song**,
escribe en el cuadro de cada voz o haz clic en la cuadrícula, y pulsa play. Lo que oyes ahí es
exactamente lo que toca el juego.

---

## 2. Escribir notas

Cada voz son sus notas como texto, separadas por espacios, leídas de izquierda a derecha.

**La nota.** Una letra de la `a` a la `g`, en el cifrado inglés: `c` es do, `d` re, `e` mi, `f` fa,
`g` sol, `a` la y `b` si. `c` sola es el do central; `a` es el la de 440 Hz.

**Sostenido y bemol.** `#` la sube un semitono y `b` la baja: `f#`, `bb`.

**La octava.** `'` la sube una octava y `,` la baja, tantas veces como haga falta: `c'` es el do por
encima del do central, `c,,` dos octavas por debajo.

**Cuánto dura.** Un número detrás: `1` redonda, `2` blanca, `4` negra, `8` corchea, `16`, `32`,
`64`. Un punto añade la mitad: `4.` es una negra y una corchea. **Sin número, una nota dura lo
mismo que la anterior**, así que `c8 d e f` son cuatro corcheas.

**Silencios y batería.** `r` es un silencio. En una voz de ruido, `x` es un golpe de batería.

**Ligadura.** `~` al final mantiene una nota en la siguiente, que tiene que ser la misma: `c'2~ |
c'2` dura una redonda a través de la barra de compás.

**Compases.** `|` cierra un compás, y se **comprueba**: un compás que no suma lo que dice el `meter`
de la canción es un error, que se señala con su línea y su columna. Es tu mejor amigo: casi todas
las canciones que fallan tienen una nota de más o de menos, y la barra la encuentra.

**El compás.** `meter` es cuántos pulsos tiene un compás y qué nota es un pulso: `[4, 4]` cuatro
negras, `[3, 4]` un vals, `[6, 8]` seis corcheas. `tempo` cuenta ese pulso por minuto.

**Una intro que suena una vez.** `"loop": { "bar": 3 }` hace de los compases 1 y 2 una intro: la
canción los toca una vez y luego da vueltas del compás 3 al final.

---

## 3. Las consolas y sus voces

Una canción dice a qué consola suena con `chip`, y eso decide sus voces. Cada voz toca **una nota
cada vez**: un acorde son varias voces, o una voz tocando un arpegio (mira la
[sección 4](#4-instrumentos)).

### NES (`"chip": "nes"`, la que se usa si no se dice)

| Voz | Qué es | Para qué sirve |
|---|---|---|
| `pulse1`, `pulse2` | Ondas cuadradas | La melodía y la armonía |
| `triangle` | Una triangular escalonada | El bajo |
| `noise` | Ruido | La batería: `x`, o una nota por su color (más aguda, más siseo) |
| `dpcm` | Samples cortos con el grano de la consola | Una batería, un golpe de orquesta |

Una voz cuadrada puede decir su `duty`, su color: `0.125` fino y nasal, `0.25`, `0.5` redondo y
hueco, `0.75`.

### SNES (`"chip": "snes"`)

Ocho voces, de `s1` a `s8`, y **cada una toca un sample**: la grabación de un instrumento. El motor
trae los suyos (un piano, cuerdas, un coro…), hechos con su propio código, así que no hay grabaciones
de nadie. La SNES guardaba sus samples muy pequeños y los tocaba a 32000 muestras por segundo,
suavizados; el motor hace lo mismo, y por eso tienen ese sonido cálido y algo apagado. También tiene
el **eco** de la SNES.

### Genesis (`"chip": "genesis"`)

Seis **voces FM**, de `fm1` a `fm6`, y las tres cuadradas y el ruido de su segundo chip, de `psg1` a
`psg3` y `psgNoise`. Una voz FM son cuatro ondas que se doblan unas a otras, y de ahí viene el sonido
brillante, metálico y contundente de la Genesis: pianos eléctricos, bajos slap, metales.

---

## 4. Instrumentos

Hasta aquí cada nota es un tono plano. Un **instrumento** dice cómo suena una nota *mientras suena*:
entra fuerte y se asienta, cambia de color, tiembla, toca un acorde. Es lo que hace que una canción
suene de verdad.

### Los instrumentos del motor

El motor trae instrumentos listos: escribe `@` y el nombre antes de las notas.

```json
"pulse1": { "notes": "@lead c'4 e' g' e' |" }
```

| Para | Instrumentos |
|---|---|
| Cuadradas de NES y de Genesis | `@lead` `@soft` `@pluck` `@bell` `@major` `@minor` `@power` `@stab` |
| Triangular de NES | `@bass` `@tri-kick` |
| Ruido | `@kick` `@snare` `@hat` `@open-hat` `@crash` |
| Samples (`dpcm`, SNES) | `@drum-kick` `@drum-snare` `@drum-clap` `@drum-tom` `@orch-hit` `@zap` |
| SNES | `@piano` `@strings` `@brass` `@flute` `@organ` `@choir` `@marimba` `@guitar` `@synth-bass` `@square-lead` |
| FM de Genesis | `@epiano` `@slap-bass` `@fm-bass` `@fm-brass` `@fm-strings` `@fm-organ` `@fm-bell` `@dist-guitar` `@fm-lead` |

`@nombre` cambia el instrumento **a partir de ahí**, y `@-` vuelve a ninguno. Una voz puede empezar
con uno, `"instrument": "lead"`, y cambiar a mitad:

```json
"pulse1": { "notes": "c'4 e' g' e' | @lead c'4 e' g' e' |" }
```

El primer compás suena plano y el segundo canta: una intro que florece.

### Tus propios instrumentos

Una canción puede definir los suyos en `instruments`, por nombre. Un instrumento son **listas de
números que se leen una por frame**, sesenta veces por segundo, desde que empieza la nota, como se
hacía la música de las consolas:

```json
"instruments": {
    "pluck": { "volume": "15 12 9 6 3 0" },
    "chord": { "volume": "12 10 9 | 8", "arpeggio": "| 0 4 7" }
}
```

- `volume`: el volumen, de `0` a `15` por frame. `15 12 9 6 3 0` se apaga en una décima de segundo,
  como una cuerda pulsada; `15 14 13 12 | 11` entra y se asienta.
- `duty`: el color de una onda cuadrada por frame, de `0` a `3` (12,5, 25, 50 y 75 %). `0 0 1` empieza
  fino y se vuelve más redondo.
- `arpeggio`: semitonos que se suman por frame. `| 0 4 7` toca un acorde mayor una nota por frame,
  que es como tocaba los acordes la NES; `| 0 3 7`, uno menor.
- `pitch`: semitonos que se suman por frame, con decimales si quieres. `0 -8 -16 -20` en una voz de
  ruido es un bombo que cae.

**Pasado su final, una lista se queda en su último número**, a menos que un `|` diga desde dónde
vuelve a empezar: `15 12 | 9 8` baja a 9 y luego va 8 9 8 9…; `| 0 4 7` se repite desde el principio
mientras dure la nota.

Dos más que no son listas:

- `vibrato`: `{ "speed": 6, "depth": 0.25, "delay": 0.2 }`, un temblor de un cuarto de semitono seis
  veces por segundo, cuando la nota lleva sonando una quinta parte de segundo. Una nota larga que
  canta.
- `slide`: los segundos que tarda cada nota en deslizarse desde la anterior de su voz. `0.03` en un
  bajo le da un pequeño "uop".

Si la canción define un instrumento con el mismo nombre que uno del motor, suena el suyo;
`@nacatamalon:kick` siempre es el del motor.

---

## 5. Lo que hace una nota por su cuenta

A veces solo una nota debe deslizarse o temblar. Escríbelo entre corchetes justo después de la nota,
sin espacios:

| Escrito | Lo que hace esa nota |
|---|---|
| `c'4[slide]` | Entra deslizándose desde la nota anterior (`[slide:0.1]`: en una décima de segundo) |
| `c'2[vib]` | Tiembla (`[vib:6,0.3]`: seis veces por segundo, un tercio de semitono; `[vib:6,0.3,0.2]` tras un retardo) |
| `c'4[arp:0,4,7]` | Toca un acorde, una nota por frame |
| `c'4[vol:8]` | Suena más bajo, de `0` a `15` |

Se pueden juntar: `c'2[vib][vol:10]`. Una nota ligada lleva lo que diga su primera parte.

---

## 6. Samples, eco y paneo

### Samples

La voz `dpcm` y las voces de la SNES tocan samples. Los del motor van por nombre
(`nacatamalon:kick`, `nacatamalon:piano`…), y **cualquier archivo de sonido de tu juego** puede ser
uno:

```json
"instruments": {
    "hit": { "sample": "/samples/hit.wav" },
    "voice": { "sample": "/samples/ah.wav", "root": 64, "loop": 0.4, "adsr": { "attack": 0.05, "release": 0.3 } }
}
```

- La nota elige a qué velocidad suena. En `dpcm`, `c'` lo toca tal como se grabó, y las notas más
  graves lo tocan más lento y más grave. En la SNES, `root` dice qué nota es el archivo (`60`, el do
  central, si no se dice).
- `loop`: dónde, en segundos, vuelve a empezar, para que una nota se pueda mantener. Sin él, suena
  una vez.
- `adsr` (SNES): los segundos que tarda en entrar, los segundos que tarda en bajar a `sustain` (de
  `0` a `1`) y los segundos que tarda en apagarse cuando acaba la nota.

El motor carga los archivos que nombra una canción antes de empezar a tocarla.

### Eco (SNES)

```json
"chip": "snes",
"echo": { "delay": 0.16, "feedback": 0.45, "volume": 0.3 },
"instruments": { "lead": { "sample": "nacatamalon:flute", "echo": true } }
```

Las notas de los instrumentos con `"echo": true` vuelven a oírse `delay` segundos después (hasta
`0.24`), y vuelven otra vez según `feedback`. Es el sonido de una cueva, una catedral, un sueño. Las
cuerdas, el piano, la flauta, el órgano y el coro del motor para la SNES ya van al eco.

### Paneo

Cada voz se puede oír en cualquier punto entre la izquierda (`-1`) y la derecha (`1`):

```json
"pulse1": { "notes": "...", "pan": -0.3 },
"pulse2": { "notes": "...", "pan": 0.6 }
```

La Genesis ponía cada una de sus voces a la izquierda, a la derecha o al centro, y la SNES en
cualquier punto intermedio: abrir las voces a los lados hace que una canción suene amplia. En el
juego, un tween puede llevar una voz de un lado a otro (mira la [sección 9](#9-tocarla-en-un-juego)).

---

## 7. Recetas

**Una melodía que canta.** `@lead`, o el tuyo propio: `{ "volume": "15 14 13 12 11 10 | 9", "duty":
"0 0 1", "vibrato": { "speed": 6, "depth": 0.25, "delay": 0.2 } }`.

**Acordes con una sola voz.** `@major` y `@minor` tocan el acorde de la nota en la que están:
`@minor a1 | @major f1 | @major c'1 | @major g1 |`.

**Un ritmo de batería en la NES.** Bombo, charles, caja, charles, en corcheas:

```text
@kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x |
```

**Un bombo más lleno.** La triangular le da cuerpo: pon `@tri-kick c,4` debajo de cada golpe de
`@kick`.

**Una intro y luego la canción.** Escribe primero los compases de la intro y `"loop": { "bar": 5 }`:
la intro suena una vez y del compás 5 en adelante da vueltas.

**Música que se acelera.** Nada en el archivo: en el juego, `song.setTempo(song.tempo * 1.2)` cuando
queda poco tiempo, y sigue desde el mismo pulso.

**La misma canción en tres consolas.** Cambia `chip` y los nombres de las voces, y elige
instrumentos para cada una: una melodía con `@lead` (NES), `@flute` (SNES) o `@fm-lead` (Genesis).

---

## 8. Las canciones que trae el motor

El motor trae treinta y nueve piezas lo bastante antiguas como para ser de todos, arregladas para sus
consolas, listas para tocar por su clave:

```ts
import { createScene, useLoadSong, useSong } from 'nacatamalon';

const Chase = () => {
    useSong(useLoadSong({ src: 'nacatamalon:mountain-king' }), { autoplay: true });
    return createScene();
};
```

| Clave | Pieza | Consola | Para |
|---|---|---|---|
| `fur-elise` | Beethoven, *Para Elisa* | SNES | Un título, un menú |
| `ode-to-joy` | Beethoven, *Himno de la alegría* | NES | Una victoria, un final |
| `mountain-king` | Grieg, *En la gruta del rey de la montaña* | Genesis | Una persecución, una batalla |
| `turkish-march` | Mozart, *Marcha turca* | NES | Un mapa, un nivel |
| `can-can` | Offenbach, el cancán | NES | Un bonus, una carrera |
| `william-tell` | Rossini, *Guillermo Tell*, el galope | Genesis | Una carrera, una carga |
| `funeral-march` | Chopin, *Marcha fúnebre* | SNES | Un game over |
| `bridal-chorus` | Wagner, *Coro nupcial* | SNES | Un final feliz |
| `entertainer` | Joplin, *The Entertainer* | SNES | Una tienda |
| `gymnopedie` | Satie, *Gymnopédie n.º 1* | SNES | Los créditos, un lugar tranquilo |
| `toccata` | Bach, *Tocata y fuga en re menor* | SNES | Un castillo, el último jefe |
| `canon` | Pachelbel, *Canon en re* | SNES | Un final |
| `morning-mood` | Grieg, *La mañana* | SNES | El primer pueblo |
| `minuet-in-g` | Petzold, *Minueto en sol* | NES | Un palacio, un tutorial |
| `greensleeves` | *Greensleeves* | SNES | Una taberna, un bosque |
| `korobeiniki` | *Korobéiniki*, canción popular rusa | NES | Un puzle |
| `eine-kleine` | Mozart, *Pequeña serenata nocturna* | SNES | Un palacio, un título |
| `moonlight` | Beethoven, *Claro de luna* | SNES | Un lugar encantado |
| `prelude-in-c` | Bach, *Preludio en do* | SNES | Un menú, un punto de guardado |
| `bumblebee` | Rimski-Kórsakov, *El vuelo del moscardón* | Genesis | Un enjambre, el pánico |
| `spring` | Vivaldi, *La primavera* | SNES | Una pradera, un nuevo día |
| `twinkle` | *Estrellita, ¿dónde estás?* | NES | Un cielo de noche, una nana |
| `jingle-bells` | Pierpont, *Jingle Bells* | NES | Un nivel de nieve |
| `saints` | *When the Saints Go Marching In* | NES | Un desfile |
| `oh-susanna` | Foster, *Oh! Susanna* | NES | Una granja, un viaje |
| `amazing-grace` | *Amazing Grace* | SNES | Un amanecer, una despedida |
| `yankee-doodle` | *Yankee Doodle* | NES | Soldaditos de juguete |
| `frere-jacques` | *Frère Jacques*, en canon | SNES | Un pueblo, una escuela |
| `beethoven-fifth` | Beethoven, la *Quinta sinfonía*, el comienzo | Genesis | Un jefe que aparece, una revelación |
| `hallelujah` | Händel, el *Aleluya* del *Mesías* | SNES | Un triunfo, un tesoro |
| `stars-and-stripes` | Sousa, *Barras y estrellas*, el trío | NES | Un desfile, una vuelta de honor |
| `mozart-40` | Mozart, la *Sinfonía n.º 40*, el comienzo | SNES | Una persecución en un palacio, un reloj |
| `habanera` | Bizet, la *Habanera* de *Carmen* | SNES | Una bailarina, una plaza de noche |
| `toreador` | Bizet, la canción del torero de *Carmen* | Genesis | Una arena, la entrada de un héroe |
| `blue-danube` | Johann Strauss II, *El Danubio azul* | SNES | Un salón de baile, flotar en el espacio |
| `hungarian-rhapsody` | Liszt, *Rapsodia húngara n.º 2*, la danza rápida | NES | Una persecución de dibujos animados, un nivel frenético |
| `gladiators` | Fučík, *Entrada de los gladiadores* | NES | Un circo, un payaso |
| `valkyries` | Wagner, *La cabalgata de las valquirias*, la llamada | Genesis | Una batalla aérea, una carga |
| `danse-macabre` | Saint-Saëns, *Danza macabra*, el comienzo | Genesis | Un cementerio, la medianoche |

Un juego solo lleva las que pide. Cambian de tempo, de tonalidad y de voces como cualquier canción.
En una escena, un componente `song` puede nombrar una: `"song": "nacatamalon:canon"`.

---

## 9. Tocarla en un juego

```ts
import { createScene, useLoadSong, useSong, useTween, useUpdate } from 'nacatamalon';

const Level = () => {
    const song = useSong(useLoadSong({ src: '/music/level.song' }), { autoplay: true });
    const tween = useTween();

    // The drums out, then back in over a second.
    song.setVoice('noise', 0);
    song.setVoice('noise', 1, 1);

    // The harmony carried from left to right in two seconds.
    tween({ target: song.pan, to: { pulse2: 1 }, duration: 2 });

    useUpdate(() => {
        // Faster as the time runs out, from the same beat it was on.
        // song.setTempo(160);
        // A step higher for the last stretch.
        // song.setTranspose(2);
    });

    song.onBeat((beat) => {
        // Something on every beat: a crowd that bounces, lights that flash.
        void beat;
    });

    return createScene();
};
```

- `play`, `stop({ fade })`, `pause` y `resume`.
- `setVolume`, `setVoice(voz, volumen, fundido)`, `setPan(voz, paneo, fundido)` y `song.pan` para un
  tween.
- `setTempo(bpm)` y `setTranspose(semitonos)` siguen desde el mismo pulso, y se oyen al momento.
- La canción se convierte en sonido **mientras suena**, un instante por delante de lo que oyes,
  como la tocaba la consola: empieza en cuanto llega su archivo (unos kilobytes), casi no ocupa
  memoria mientras suena, y cambiar el tempo o la tonalidad cuesta unos milisegundos. Con la
  página oculta se para donde está, con el resto del juego, y sigue desde ahí.
- `onBeat` te avisa en cada pulso mientras suena.

Un sonido (`useSound`) también tiene `pan`: `tween({ target: sound, to: { pan: 1 }, duration: 2 })`.

---

## 10. Traer música de FamiTracker o FamiStudio

Si compones en un tracker, exporta la canción como **texto**: en FamiTracker, *File, Export text*;
en FamiStudio, *File, Export, FamiStudio Text*. Suelta el `.txt` en el editor: se convierte en
`public/music/<nombre>.song`, con sus samples en `public/samples/<nombre>/`, y el editor te dice lo
que no pudo traer.

Lo que se trae: las macros de los instrumentos como nuestras listas, las notas y sus duraciones, la
columna de volumen, los arpegios, el vibrato, el portamento, los samples y dónde da la vuelta la
canción. Lo que no: los chips que añadían algunos cartuchos (VRC6, VRC7, FDS, MMC5, N163, S5B), la
afinación fina (`Pxx`), los deslizamientos hacia arriba y hacia abajo, y un cambio de velocidad a
mitad de canción. Desde código, `importTrackerText` de `nacatamalon/authoring` hace lo mismo.

Un juego también puede cargar la exportación tal cual, sin hacer antes el `.song`:
`useLoadTrackerSong` la lee al llegar y da la misma canción que `useLoadSong`, con sus samples en
memoria, y suena en la NES del motor con su tempo, su tono, su paneo y sus pulsos.

```ts
import { createScene, useLoadTrackerSong, useSong } from 'nacatamalon';
import type { TSceneFn } from 'nacatamalon';

export const Title: TSceneFn = () => {
    // Un archivo con varias canciones: { song: 2 } para la tercera.
    useSong(useLoadTrackerSong({ src: '/music/theme.txt' }), { autoplay: true });
    return createScene();
};
```

Lee el archivo cada vez que el juego arranca, y avisa una vez de lo que dejó fuera. Para un juego
terminado, el `.song` que hace el editor carga más rápido. Un juego que no lo usa no lo lleva.

---

## 11. Cuando algo está mal

El motor nunca para una canción por un error: toca lo que puede leer y avisa del resto.

- **Un compás que no suma**: "bar 3 adds up to 3.5 beats, and a bar of 4/4 has 4", con su línea y su
  columna. Casi siempre falta una duración o sobra una.
- **Una nota que no puede leer**: una letra fuera de la `a` a la `g`, o una duración que no es 1, 2,
  4… 64.
- **Un instrumento que no existe**: `@leed` en vez de `@lead`. El aviso lista los que hay.
- **Una lista con un número mal**: "volume of lead, word 4: 'loud' is not a number". El resto del
  instrumento sigue sonando.
- **Una voz de samples sin instrumento**: las voces `dpcm`, SNES y FM necesitan uno en cada nota.

En el editor, esto aparece debajo de cada voz y en la tarjeta de cada instrumento mientras escribes;
`useSong` avisa del primero en la consola; `renderSong` los devuelve todos en `errors` y
`instrumentErrors`.
