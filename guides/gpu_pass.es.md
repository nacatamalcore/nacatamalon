# El trabajo propio de un plugin en la GPU

`useGpuPass`, en `nacatamalon/extend/gpu`, es para quien escribe un plugin que necesita lo
que un material o un efecto de post no pueden hacer: una simulación en compute, una imagen
calculada en la GPU. Un juego nunca lo llama: llama al hook que exporta el plugin, que le devuelve
imágenes normales. Sus formas se mantienen como están hasta la 2.0.

Una pasada no es algo del mundo ni cambia cómo dibuja el motor. Es trabajo que el motor ejecuta una
vez por fotograma, mientras vive el componente que la creó, con la GPU en sus manos.

- **Cuándo se ejecuta.** `stage: 'before'`, el valor por defecto, se ejecuta antes de que el
  fotograma dibuje nada: sombras, cámaras o pantalla. Lo que dibuja se ve en ese mismo fotograma.
  `stage: 'after'` se ejecuta cuando ya está todo dibujado, post incluido, y lo que dibuja se ve en
  el fotograma siguiente. Las pasadas de una misma etapa van en el orden en que se crearon.
- **Una vez por fotograma.** Aunque el fotograma dibuje varias cámaras, minimapas o capturas.
  Mientras se ejecuta no hay abierta ninguna cámara ni ninguna pasada del motor.
- **Su tiempo.** `time` es el tiempo de juego de la escena y `delta`, lo que este fotograma la
  avanzó. Una escena en pausa sigue dibujando, con `delta` a 0; una escena retenida detrás de una
  transición no ejecuta sus pasadas. Ocultar el componente no la para, igual que no para sus
  actualizaciones.
- **La pantalla.** `width` y `height` son la pantalla en píxeles reales, no la vista de una cámara.

El fotograma que recibe una pasada es el mismo objeto en cada fotograma: si quiere guardar un
valor, lo copia.

## Ejemplo: una imagen escrita desde compute, y lo mismo en WebGL2

El plugin crea una imagen verde de 64 por 64. En WebGPU se escribe desde compute; WebGL2 no tiene
compute shaders, así que allí limpia un framebuffer propio.

```ts
import { createScene, createSprite } from 'nacatamalon';
import { useGpuPass } from 'nacatamalon/extend/gpu';

export const useGpuColorTexture = () => {
    const pass = useGpuPass({
        name: 'GPU color texture',
        outputs: [{ width: 64, height: 64 }],
        webgpu: ({ device, outputs }) => {
            const pipeline = device.createComputePipeline({
                layout: 'auto',
                compute: {
                    entryPoint: 'main',
                    module: device.createShaderModule({ code: `
                        @group(0) @binding(0)
                        var image: texture_storage_2d<rgba8unorm, write>;

                        @compute @workgroup_size(8, 8)
                        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
                            let size = textureDimensions(image);
                            if (id.x >= size.x || id.y >= size.y) { return; }
                            textureStore(image, vec2<i32>(id.xy), vec4<f32>(0, 1, 0, 1));
                        }
                    ` }),
                },
            });
            const bindings = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: outputs[0].createView() }],
            });
            return {
                render: ({ encoder }) => {
                    const compute = encoder.beginComputePass();
                    compute.setPipeline(pipeline);
                    compute.setBindGroup(0, bindings);
                    compute.dispatchWorkgroups(8, 8);
                    compute.end();
                },
            };
        },
        webgl2: ({ gl, outputs }) => {
            const framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputs[0], 0);
            return {
                render: () => {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                    gl.disable(gl.SCISSOR_TEST);
                    gl.colorMask(true, true, true, true);
                    gl.clearColor(0, 1, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                },
                destroy: () => gl.deleteFramebuffer(framebuffer),
            };
        },
    });
    return pass.outputs[0];
};

// Lo que devuelve el plugin es una imagen más del juego.
const Level = () => {
    createSprite({ texture: useGpuColorTexture(), width: 128, height: 128 });
    return createScene();
};
```

Esta puerta nombra los tipos de WebGPU. TypeScript 6 los trae; en TypeScript 5, el proyecto del
plugin añade `@webgpu/types` y lo pone en `compilerOptions.types`. Un juego que solo usa el hook del
plugin nunca importa esta puerta y no necesita ninguno de los dos.

## Lo que crea y quién lo suelta

`outputs` son las imágenes en las que dibuja la pasada, de un tamaño fijo al crearla: RGBA, 8 bits
por canal (`rgba8unorm` en WebGPU), una muestra, que se pueden leer, dibujar y copiar, y en WebGPU
también escribir desde compute. El juego las recibe enseguida como sus propios `TTexture`, y se van
con la pasada: no con `releaseAsset`, y nunca destruyéndolas en la GPU.

La fábrica recibe el lado de GPU de esas mismas imágenes. Para leer una imagen del juego,
`texture(imagen)` da su lado de GPU, o `null` mientras se carga o después de soltarla. Hay que
pedirla cada vez en lugar de guardarla: cuando la imagen se vuelve a cargar, la guardada ya no
existe. Una pasada nunca comparte lo que creó con otro juego.

Los buffers, pipelines, bind groups, vertex arrays y framebuffers se crean en la fábrica, una vez,
y se guardan. Lo que hay que destruir se destruye en el `destroy` que devuelve la fábrica. Una
fábrica que falla a medias suelta lo que creó ella; las imágenes las suelta el motor. Una fábrica
devuelve enseguida: no puede esperar a nada.

`pass.enabled = false` deja de ejecutarla y conserva lo que creó. `pass.destroy()` la suelta antes
de que se vaya su componente, y llamarlo dos veces no hace nada más. Otro tamaño es otra pasada: se
destruye y se crea una nueva. Nada de una pasada va a un documento de escena: el plugin la vuelve a
crear cada vez que se crea su componente.

Una pasada destruida desde su propio `render` espera a que el fotograma se envíe a la GPU, para que
lo que el fotograma ya grabó no se quede leyendo algo que ya no existe.

## Lo que cuida el motor y lo que hace la pasada

**En WebGPU** la pasada recibe el encoder del fotograma sin ninguna pasada del motor abierta.
Termina todas las pasadas que empieza, y nunca llama a `finish`, ni envía nada, ni destruye el
dispositivo: el motor envía el fotograma, una vez, con todo lo demás. Escribir un buffer con
`queue.writeBuffer` no ocurre entre dos dispatches grabados en el mismo fotograma (los dos leen lo
último que se escribió), así que dos dispatches que necesitan números distintos los leen de dos
sitios distintos.

**En WebGL2** el motor deja como estaban sus bindings, unidades de textura, samplers, buffers
uniformes y estado de dibujo después de todo lo que ejecuta la pasada: la fábrica, cada fotograma y
`destroy`, aunque fallen. La pasada recibe un `gl` que apunta lo que cambia, así que cuesta lo que
cambia: unos 12 µs por fotograma una pasada que no cambia nada caro de leer, y unos 40 µs más por
cada valor caro que sí cambia (el color de limpiado es uno, el scissor uno, el blend cuatro, el
stencil catorce). Sigue
siendo un `WebGL2RenderingContext` para `instanceof`, pero no para lo que necesita el del propio
navegador (`new XRWebGLLayer`), y es el camino de la pasada al contexto: `gl.canvas.getContext('webgl2')`
da uno que no apunta nada. Un juego que nunca importa esta puerta no lleva nada de esto.

Una pasada de WebGL2 pone el estado que necesita, y enlaza su propio vertex array, framebuffer y
transform feedback antes de cambiarlos. Termina cualquier query o transform feedback que empiece.
De las extensiones, lo que cambian `OES_draw_buffers_indexed` y `EXT_polygon_offset_clamp` se
restaura; lo que cambian `EXT_clip_control`, `WEBGL_provoking_vertex`, `WEBGL_polygon_mode` y
`EXT_depth_clamp`, no, y una pasada que lo cambie lo deja como estaba ella misma.
Lo que hay dentro de los objetos no se restaura: el contenido de los buffers, los uniforms de un
programa, dónde dibuja un framebuffer, los parámetros de una textura. Una pasada nunca cambia los
objetos del propio motor. Tener la GPU en las manos no impide romperla.

Las imágenes están del derecho para el motor: la primera fila guardada es la de arriba. WebGPU las
escribe así sin más. Un framebuffer dibuja de abajo arriba, así que una pasada de WebGL2 que dibuja
algo con arriba y abajo tiene que darle la vuelta ella misma.

Un `render` que falla apaga su pasada y lo dice una vez, y las demás siguen. Lo que ya grabó se
queda grabado. En WebGPU, uno que falla con una pasada propia todavía abierta deja inservible el
encoder del fotograma: ese fotograma se pierde, también lo que dibuja el motor. Un error de la GPU que llega más
tarde se dice como lo diga el backend. Una pasada que no dice nada para el backend con el que dibuja
el juego falla al crearla, en lugar de no dibujar nada.

## Contexto perdido, headless y nativo

Cuando se pierde el contexto de WebGL2, la pasada suelta lo que creó y sus imágenes dicen
`loading`. Cuando vuelve, las imágenes se crean de nuevo y la fábrica se ejecuta otra vez, con los
mismos `TTexture`, antes de que se dibuje el siguiente fotograma. Una pasada creada con el contexto
perdido lo espera. Lo que tenían las imágenes se pierde: la pasada lo vuelve a dibujar. Una pasada
que no se puede volver a crear se apaga y lo dice una vez. Un dispositivo WebGPU perdido para
siempre deja el juego sin dibujar, como siempre, y suelta las pasadas.

Un juego sin navegador (headless) no tiene GPU, aunque diga que es WebGPU: no se ejecuta ninguna
fábrica, cada pasada lo dice una vez al crearla y sus imágenes nunca están listas
(`status: 'error'`).

Los runtimes nativos tienen casi todo WebGPU, pero todavía no compute (`createComputePipeline`,
`beginComputePass`), así que el ejemplo de arriba funciona en un navegador y no en nativo. Un plugin
que corre en un host con parte de WebGPU comprueba lo que usa.
