# Hacer plugins

Un plugin es un paquete que importan los juegos de otros: un cuadro de diálogo que escribe, una forma
de arrastrar cosas, una barra de vida, una simulación en la GPU. Se escribe como se escribe un juego,
con los mismos hooks, y se usa como cualquier librería: el juego importa lo que el plugin exporta y
lo llama. No se configura nada del motor para él.

```ts
// Un juego que usa un plugin.
import { createText } from 'nacatamalon';
import { useTypewriter } from 'nacatamalon-typewriter';

const Sign = () => {
    const line = createText({ text: '' });
    useTypewriter(line, { speed: 30 }).type('Bienvenido al pueblo.');
};
```

## Empezar uno

Hace falta Node.js 20.19 o superior. Quien usa tu plugin no lo necesita.

```bash
npm create nacatamalon@latest health-bar -- --template plugin   # nacatamalon-health-bar, useHealthBar
cd health-bar
npm install
npm run dev                    # la vista: una página tuya para probar el plugin
npm run demo                   # la demo: un juego pequeño que usa el plugin, el escaparate de la tienda
```

La carpeta le da el nombre al plugin. Desde el `.zip` de la plantilla (en
[nacatamalon.com/docs/plugins](https://nacatamalon.com/docs/plugins), con un tutorial que hace uno de
principio a fin), `npm install` y luego, una vez, `npm run rename -- health-bar`. El `PLUGIN_GUIDE.md`
del proyecto lo explica paso a paso, y su `AGENTS.md` lleva a un asistente de programación a las
mismas reglas.

```
src/index.ts       lo que importa un juego, y nada más
src/plugin.ts      el nombre del plugin y su rango del motor, del package.json; engineFits()
src/use_*.ts       un hook por archivo
view/              la página en la que pruebas el plugin mientras lo haces; nunca se empaqueta
demo/              un juego pequeño que usa el plugin por su nombre; la tienda la muestra
tests/             el plugin en un juego sin navegador
store/             icono y capturas para la ficha de la tienda
```

## Un hook

```ts
import { useSelf, useUpdate, useCleanup } from 'nacatamalon';
import { placementOf, requireEngine } from 'nacatamalon/extend';

// La plantilla lo tiene en src/plugin.ts, leído del package.json.
const engineFits = (): boolean => requireEngine('nacatamalon-spin', '>=0.7.0 <1');

export const useSpin = ({ speed = 0.25 } = {}): void => {
    if (!engineFits()) return;
    const self = useSelf();
    useUpdate((delta) => {
        const placement = placementOf(self);
        if (placement) placement.rotation += speed * Math.PI * 2 * delta;
    });
    useCleanup(() => {});
};
```

Un juego lo llama dentro de un componente, `const Coin = () => { useSpin(); createSprite(...) }`, y
trabaja sobre ese objeto mientras viva. Nadie lo registra: cuando se ejecuta, el motor tiene en la
mano ese juego y ese objeto, y `useSelf` y `useUpdate` les pertenecen.

**El ciclo de vida son los hooks.** No hay un init, update o destroy aparte que aprender:

| Cuándo | En un plugin |
|---|---|
| Se crea el objeto | el cuerpo del hook; `useReady` cuando la escena está completa |
| Cada fotograma | `useUpdate`, `useLateUpdate` |
| El objeto se va | `useCleanup` |
| Pausa, pestaña oculta, salir de la página | `useGame().onPaused`, `onResumed`, `onHidden`, `onShown`, `onLeaving` |
| Cambia la escena | `useScene`, `useSceneTransitionEnd` |

Para lo que es de todo el juego, el plugin exporta una función `install…()` que el juego llama una
vez al principio de `main.ts`, como `installPhysics2d()`. Lo que instala puede ser un sistema de
juego (`registerGameSystem`), más abajo.

## Código para todo el juego

Un guardado que corre esté la escena que esté, analítica, una ayuda para depurar, música que no se
corta entre niveles: lo que es del juego y no de una escena. `registerGameSystem(nombre, fn)` ejecuta
`fn` una vez en cada juego que arranca, antes de su primera escena, en una caja propia que ningún
cambio de escena toca, y la desmonta cuando el juego termina. Está en la puerta principal,
`nacatamalon`, porque un juego también lo usa para su propio código; un plugin exporta una función de
instalación que lo llama:

```ts
import { registerGameSystem, useGame, useUpdate, useCleanup } from 'nacatamalon';

// Hecha una vez, arriba del módulo: la misma función se llame cuantas veces se llame el install.
const playTime = () => {
    let seconds = 0;
    useUpdate((delta) => { seconds += delta; });           // cada fotograma, esté la escena que esté
    useGame().onLeaving(() => localStorage.setItem('play-time', String(seconds)));
    useCleanup(() => { /* el juego termina */ });
};

export const installPlayTime = () => registerGameSystem('nacatamalon-play-time', playTime);
```

El juego llama a `installPlayTime()` al principio de `main.ts`, antes de `createGame`; uno registrado
con un juego en marcha espera al siguiente, y lo dice. Dentro, los hooks son los de siempre:

- Sus `useUpdate` corren antes que los de todas las escenas en cada fotograma, y sus `useLateUpdate`
  después de los de todas, así que prepara las cosas para las escenas y lee dónde las dejaron.
- El juego en pausa lo pausa también (`useGame().onPaused` se lo dice); una escena en pausa, no.
- No es de ninguna escena: `useScene`, las cámaras, las luces, la física, `useRenderStyle` y `useFog`
  lanzan un error dentro de él. Lo que crea no se dibuja en ningún sitio; para enseñar algo, lanza
  una escena propia.
- Uno que lanza un error se informa y se deja fuera, y el juego sigue.
- El mismo nombre con la misma función no hace nada, y por eso el cuerpo se hace una vez, fuera del
  install: un install llamado dos veces no hace nada. Con otra función, lanza un error. Devuelve una
  función que lo quita para los juegos que arranquen después.
- Mientras una herramienta monta el juego en vez de jugarlo (el modo edición del editor), sus sistemas
  se desmontan, listeners incluidos, y vuelven a arrancar cuando se juega.

Corre empiece el juego por la escena que empiece. Una escena que lanza las demás (un `Main` que nunca
se para, con los niveles a su lado) haría lo mismo mientras el juego empiece por ella, y faltaría
cuando no: un nivel jugado directamente desde el editor, un juego creado con `initialScene`, un test
que empieza en el tercer nivel. Una escena lanzada al lado de los niveles sigue siendo la forma de
tener algo siempre en pantalla, un marcador o un marco, porque un sistema no dibuja.

## Lo que `nacatamalon/extend` da a un plugin

Un juego nunca lo importa; un plugin sí.

- `requireEngine(plugin, rango)`: si el motor que corre es uno para el que se hizo el plugin. Cuando
  no lo es, lo dice una vez, en nombre del plugin. El `engineFits()` de la plantilla lo llama con el
  rango de `peerDependencies` del `package.json`, así que los dos nunca dicen cosas distintas.
- `getActiveGame()`, `getActiveGameObject()`: qué juego, y qué objeto suyo, se está construyendo,
  para lo que un plugin guarda por juego.
- `placementOf`, `worldPlacementOf`, `localPositionFrom`, y lo mismo en 3D: dónde está de verdad un
  objeto, se haya colocado él o a través de lo que dibuja.
- `registerAssetType`: un tipo de archivo propio, más abajo.
- `registerPostEffect`: un efecto de pantalla con un nombre que los datos del juego pueden usar, más abajo.
- `registerPhysicsProvider`: otro motor de física.

`nacatamalon/extend/gpu` tiene `useGpuPass`, para trabajo propio del plugin en la GPU: una simulación
en compute, una imagen calculada en la GPU. Ver [la guía de la pasada de GPU](gpu_pass.es.md). Tiene
también un tipo de dibujo propio del plugin, más abajo.

Todo lo demás que usa un plugin es la API del propio juego: `measureText`, `useKeyboard`,
`createSprite`, los stores.

## Las reglas

- **Solo las puertas públicas del motor**: `nacatamalon` y sus subrutas en `exports` de su
  `package.json`. Nunca una ruta de dentro del motor. El `npm run check` de la plantilla dice dónde.
- **El motor se queda fuera del build.** `nacatamalon` es una `peerDependency`: el juego trae el
  suyo, y dos copias serían dos motores que no se ven.
- **Todo lo demás va dentro.** Un juego que copia el plugin a mano no tiene npm para instalar sus
  dependencias, así que el build las empaqueta.
- **Nada en una variable de módulo** que sea de un juego: una página puede tener varios juegos.
- **Los mensajes empiezan por el nombre del plugin**, y uno que se repetiría cada fotograma se dice
  una vez.
- **Un juego que no importa el plugin no paga nada por él** (`sideEffects: false`).

## Probarlo

Los tests de la plantilla ejecutan el plugin en un juego sin navegador, con `nacatamalon/headless`:
igual cada vez, un fotograma cada vez.

```ts
import { createScene, createText } from 'nacatamalon';
import { createHeadlessGame } from 'nacatamalon/headless';
import { useTypewriter } from 'nacatamalon-typewriter';

const Level = () => {
    const line = createText({ text: '' });
    useTypewriter(line).type('Hola.');
    return createScene();
};

const game = createHeadlessGame({ width: 320, height: 180, scenes: { Level } });
await game.loaded();   // no ejecuta ningún fotograma: el primer game.run(1) es el primero
game.run(30);
```

Lo que es un objeto ahora se lee mejor del propio objeto (`text.text`, `sprite.transform`).

## Compartirlo

`npm run pack` construye, comprueba y deja dos archivos en `release/`:

- **`<nombre>-<versión>.zip`**: para mandarlo a mano, subirlo a una página de versiones o darlo a la
  tienda.
- **`<nombre>-<versión>.tgz`**: lo mismo para npm, que es opcional.

Un juego lo usa de cualquiera de las dos formas. Descomprimido en la carpeta `plugins/` del juego, con
`"nacatamalon-health-bar": "file:./plugins/nacatamalon-health-bar"` en las `dependencies` del juego,
se importa por su nombre:

```ts
import { useHealthBar } from 'nacatamalon-health-bar';
```

o por su ruta, `'../plugins/nacatamalon-health-bar/dist/index.js'`, sin nada en `dependencies`.
Desde npm, `npm install nacatamalon-health-bar`.

## La tienda

La tienda de nacatamalon.com tiene plugins gratuitos y de pago. La ficha de un plugin sale del propio
plugin: el icono y las capturas de `store/`, listados en el `package.json` bajo `nacatamalon`, y la
demo, que se puede jugar. Con `npm run demo` abierto, **F9** guarda la demo como captura en `store/`.

`npm run check` hace las mismas comprobaciones que la tienda. Después, el equipo de nacatamalon revisa
cada plugin, y cada versión nueva, antes de publicarlo. Manda el código sin ofuscar: ofuscar se puede
(`OBFUSCATE` en `scripts/build.mjs`), pero hace más lento el código que corre cada fotograma y no lo
protege de verdad, porque el código llega al navegador de cada jugador.

## Un tipo de dibujo propio

Un plugin que dibuja algo que ningún sprite, modelo o material puede (formas calculadas en el shader
en vez de hechas de triángulos, un campo de hierba en una sola llamada) le enseña al motor un **tipo
de dibujo**, desde `nacatamalon/extend/gpu`. El motor trata cada uno de sus dibujos como un modelo:
sigue a su objeto, se ordena con los modelos de la escena, se oculta y se va con él, lo dibuja cada
cámara de su escena y puede proyectar en los mapas de sombra. Lo dibuja el pipeline del plugin,
dentro de las pasadas del motor, con la misma profundidad, máscaras y luces.

```ts
import { createDrawable, registerDrawableKind } from 'nacatamalon/extend/gpu';
import type { TCustomDrawable, TDrawableKind, TWebGpuDrawableContext, TWebGpuDrawables } from 'nacatamalon/extend/gpu';

type TBlob = TCustomDrawable & { radius: number };
type TBlobPayload = { radius: number };
// El pipeline propio del plugin: su shader, hecho sobre `context.depthStencil` y `context.lights.wgsl`.
declare const createBlobPipeline: (context: TWebGpuDrawableContext) => TWebGpuDrawables<TBlobPayload>;

const BLOBS: TDrawableKind<TBlobPayload> = {
    name: 'nacatamalon-blobs',
    // Una vez por fotograma para cada uno, cuando el motor ya lo ha colocado.
    prepare: (drawable) => ({ radius: (drawable as TBlob).radius }),
    webgpu: createBlobPipeline,
};

export const useBlob = (radius: number): TBlob => {
    registerDrawableKind(BLOBS);
    return createDrawable(BLOBS.name, {}, { radius });
};
```

A lo que lo dibuja se le cuenta cada pasada antes de grabar nada en ella (`beginPass`, con todos sus
dibujos y la cámara, las luces y el mapa de sombra de cada escena), luego se le pide dibujar cada uno
donde cae (`draw`, con dónde está en esa pasada, `world`: se lee ahí y no se guarda lo que recibió
`prepare`, porque una imagen del mundo puede ponerlo en otro sitio) y, para proyectar sombra, se le cuentan los mapas de sombra del fotograma
(`beginShadows`, `drawShadow`). Su sitio en cualquier buffer se hace en `beginPass`, nunca mientras
dibuja. Los tipos dicen el resto: `TWebGpuDrawables`, `TWebGpuDrawableContext`. TypeScript 6 conoce los tipos de WebGPU pero no
sus constantes (`GPUBufferUsage`, `GPUShaderStage`, `GPUTextureUsage`): un plugin que hace un pipeline
añade `@webgpu/types` a sus `devDependencies` y a `types` en su `tsconfig.json`.

Un tipo vive en profundidad (lo normal) o plano, `space: '2d'`: entonces sus dibujos se colocan y se
ordenan como sprites (`x`, `y`, `rotation`, `scaleX`, `scaleY`, con su parallax), y cada pasada le da
sus vistas 2D (`cameras`: la pantalla y luego cada cámara 2D), cada una con la matriz de los píxeles
del mundo a la pantalla y sus luces 2D, con las que `context.lights2d` ilumina un color
(`illuminate2d`) como se ilumina un sprite.

Para parecerse a los modelos que lo rodean, un tipo en profundidad dibuja como se dibuja un modelo, con
las funciones de shader del propio motor (`context.shading`, añadido a su shader): `ambientFacing` para
el ambiente de la escena, del color del suelo abajo al del cielo arriba cuando tiene dos;
`roundReflectionUv` y `cubeReflectionUv` para dónde cae un reflejo en una imagen del entorno (un
`studioEnvironment`, la `texture` de un `useEnvironment`, un matcap), que el juego le da al hook del
plugin en sus opciones (un dibujo puede ser el `around` de su propio `useEnvironment`, y queda fuera de
él, como un modelo); y `snapToGrid` y `affineUvOf` para las esquinas que tiemblan y las imágenes que
nadan del estilo. Cada vista dice qué pide el estilo de su escena (`style`: `perPixel`, `affine` y la
rejilla `snap`), así que con `RENDER.STYLES.ps1` un dibujo tiembla en la misma rejilla que los modelos
de al lado.

Con qué puede contar: las formas de `nacatamalon/extend/gpu` se mantienen como están hasta la 2.0, y
también las piezas de shader que recibe (`context.lights`, `context.lights2d`, `context.shading`), por
su nombre. A un campo de sus structs o a una de sus funciones solo se les añade; nunca se quitan, se
renombran ni cambian de argumentos. Por eso un tipo las lee con las declaraciones que le da el motor,
por su nombre, y dimensiona lo que guarda un bloque con los `floats` que se le dicen, nunca con un
número escrito en el plugin.

Un tipo da lo que lo dibuja en cada backend: `webgpu` y `webgl2`, con los mismos momentos en los dos
(`TWebGl2Drawables`, sin encoder porque WebGL2 dibuja al momento; cada llamada corre dentro de la
pasada del motor y el estado de GL se deja como estaba al volver, y pone él mismo cada estado con el
que dibuja). Un backend para el que no da nada deja sus dibujos fuera, y el motor lo dice una vez;
igual en un juego sin navegador.

El motor deja fuera de cada cámara y de cada mapa de sombra los dibujos que no se pueden ver en ellos,
si el tipo dice cuánto ocupa cada uno (`bounds`, una caja en el espacio del propio dibujo, que incluya
lo que mueva su shader). Deja fuera dibujos enteros: uno extendido por una zona grande, un campo o un
bosque, mejor hecho como varios.

## Un tipo de archivo propio

Un plugin con un formato propio (un rig, un árbol de diálogos, un nivel de su propia clase) le enseña
al motor a cargarlo con `registerAssetType`, de `nacatamalon/extend`. El motor trae el archivo (igual
en una página, sin navegador y desde una dirección `data:`), lo lee como JSON, texto o bytes, y se lo da
al `parse` del plugin, que hace con él lo que usa el juego. Lo que el archivo nombra, una imagen, un
sonido u otro archivo de plugin, `parse` lo pide con su `help`: el motor lo carga junto al archivo, y el
archivo solo está listo cuando ha llegado todo.

```ts
import { registerAssetType } from 'nacatamalon/extend';
import type { TTexture } from 'nacatamalon';

type TDialogue = { lines: string[]; portrait: TTexture };

// Hecho una vez, arriba del módulo.
const DIALOGUES = registerAssetType<TDialogue>({
    kind: 'nacatamalon-talk-dialogue',
    read: 'json',
    parse: (json, help) => {
        const doc = json as { lines: string[]; portrait: string };
        return { lines: doc.lines, portrait: help.texture(doc.portrait) };   // junto al archivo
    },
    release: (dialogue) => { /* lo que el plugin guarde de él, si guarda algo */ },
});

export const useLoadDialogue = DIALOGUES.useLoad;   // useLoadDialogue({ src: 'talk/intro.json' })
```

El registro que devuelve es como los del motor: lo cuenta `useLoadProgress`, por eso lo espera una escena
de carga (y el `loaded()` de un juego headless), se guarda con su `key` y se comparte, y se suelta con `releaseAsset` (que llama a
`release` y suelta lo que pidió `parse`, salvo que otro lo sujete). Su `data` es lo que hizo `parse`, en
cuanto está `'ready'`. Un documento de escena lo lista como `{ type: 'plugin', kind, key, src }` y lo
carga con la escena; sin el plugin, lo dice una vez, lo deja fuera y lo conserva al guardar el documento.

## Un efecto de pantalla con nombre

El efecto de pantalla de un plugin se puede poner en código (`usePostProcess(vhs())`). Para que los
datos del juego también lo nombren (`createGame({ post: [{ builtin: 'nacatamalon-vhs' }] })`, el `post` de
un estilo de render, un documento de escena, una motion que mueve sus uniforms), se registra con
`registerPostEffect`, de `nacatamalon/extend`, descrito como el motor describe los suyos
(`TPostBuiltinInfo`: `key`, `label`, `description`, `fields`, `binds`, `build`). `allPostEffects()` lo
lista detrás de los del motor.

## Lo que un plugin todavía no puede hacer

Poner un componente propio en un documento de escena para el editor, o enseñar sus archivos en la
paleta del editor. Las dos llegan con las extensiones del propio editor, después de la 1.0.
