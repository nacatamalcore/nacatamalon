# Iluminación 2D

`useLight2d` ilumina sprites y capas de tilemaps sin mapas de normales. Funciona en WebGPU y WebGL2,
incluidos los materiales personalizados, los textos, los paneles nine-slice, las formas
(`createShapes`), los polígonos y las partículas (`createParticles`). Las luces son independientes de
la iluminación 3D.

```ts
import {
    createScene, createSprite, useAmbientLight2d, useLight2d,
} from 'nacatamalon';

const Cueva = () => {
    useAmbientLight2d({ color: '#8899cc', intensity: 0.15 });
    useLight2d({
        transform: { x: 160, y: 90 },
        color: '#ffbb66',
        intensity: 1,
        radius: 100,
        falloff: 1,
    });
    createSprite({
        width: 320, height: 180,
        anchor: { x: 0, y: 0 },
        tint: '#809080',
    });
    return createScene();
};
```

Una escena sin ninguno de estos hooks conserva sus colores originales. Si tiene luces pero no luz
ambiental, la base es negra. El último `useAmbientLight2d` establece la base; declarar varios emite
un aviso.

Una escena que ha tenido una luz 2D sigue iluminada hasta que termina, aunque todas sus lámparas
se oculten o se destruyan: una cueva iluminada solo por el farol del jugador sigue a oscuras cuando
el jugador muere, en lugar de pasar a pleno día. Para el día, pon la luz ambiental a
`intensity: 1`.

La luz sigue la posición del objeto que la contiene. Pon `useLight2d` dentro del componente del
jugador para llevar una luz con él. Las transformaciones de los padres mueven su posición; el radio
se mantiene en píxeles del mundo. El zoom de la cámara amplía la luz junto al escenario. Las luces
de objetos ocultos están inactivas y las de una textura de sprites pertenecen al mundo de esa imagen.

El resultado es un registro: cambia `light.transform.x`, `light.color`, `light.intensity`,
`light.radius` o `light.falloff` para actualizarlo en el siguiente fotograma. Al cambiar el color del
registro, usa `getColor`, por ejemplo `light.color = getColor('#ffbb66')`. Una intensidad o un radio
igual a cero apaga la luz. `falloff: 1` desvanece linealmente hasta el radio; `2` atenúa más deprisa
al alejarse del centro y `0` produce un círculo de borde duro. Fuera del radio no aporta luz.

Un mundo puede tener todas las lámparas que necesite. La vista de cada cámara se ilumina con ocho
como mucho, de las que están encendidas y llegan a lo que muestra: primero las que más alumbran su
centro, medido por lo lejos que queda el centro de cada una respecto a lo que alcanza. Una antorcha
justo ahí va primero, y una lámpara grande que cubre toda la vista, una luna, va antes que las
antorchas de los bordes. Un nivel largo puede tener una antorcha cada pocos pasos, y las que quedan
detrás del jugador dejan su sitio a las de delante. Si más de ocho llegan a la vez a una vista, se
avisa una vez. Una lámpara en cualquier parte del mundo lo deja iluminado, aunque esté lejos de la
cámara. Las contribuciones RGB de las lámparas se suman al ambiente y multiplican el RGB de la
superficie; el alfa se conserva. En materiales personalizados, la iluminación se aplica después del
efecto del fragmento. Las partículas también se iluminan: el polvo o el humo de una cueva se ven
oscuros; saca las chispas y el fuego con `useUnlit2d` para que brillen. Estas luces no iluminan
mallas 3D ni partículas 3D. No proyectan sombras, no se bloquean con paredes y no calculan relieve
de sprites.

Marca los objetos del HUD con `useScreenSpace()` para conservar sus colores; una lámpara puesta en
el HUD no ilumina nada. Para algo del mundo que da su propia luz (un fuego, un cartel de neón, el
cristal de una lámpara, unos ojos en la oscuridad), llama a `useUnlit2d()` en su componente: él y
todo lo que cuelga de él conservan sus colores y siguen moviéndose con la cámara. Cada escena
iluminada que deja algo fuera lo dibuja por una vista más de las quince que tiene el fotograma para
las escenas; si no queda ninguna, se dibuja iluminado. Los objetos del mundo pueden recibir
iluminación aunque no haya una cámara declarada. Cada vista lleva su iluminación, por lo que las
escenas superpuestas mantienen sus luces separadas. Los documentos de escena guardan ambos tipos
como componentes de luz con `kind: 'point-2d'` y `kind: 'ambient-2d'`, y lo que queda fuera como
`unlit2d: true` en su caja.
