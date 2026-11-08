# 2D lighting

`useLight2d` lights sprites and tilemap layers without a normal map. It works on WebGPU and WebGL2,
including custom sprite materials, text, nine-slices, shapes (`createShapes`), polygons and particles
(`createParticles`). The lights are independent of 3D lighting.

```ts
import {
    createScene, createSprite, useAmbientLight2d, useLight2d,
} from 'nacatamalon';

const Cave = () => {
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

A scene with neither hook keeps its original colours. Lamps without an ambient light start on a
black base. The last `useAmbientLight2d` sets the base; declaring more than one gives a warning.

Once a scene has had a 2D light, it stays lit until it ends, even if every lamp is hidden or
destroyed: a cave lit only by the player's lantern stays dark when the player dies, rather than
turning to daylight. For daylight, set the ambient light to `intensity: 1`.

A lamp follows the position of the box holding it. Put `useLight2d` inside the player's component
for a light carried by the player. Parent transforms move its position, while its radius stays in
world pixels. A camera's zoom magnifies the lamp and the world together. Lights in hidden boxes
are inactive, and lights inside a sprite texture belong to that picture's world.

The returned light is a record: write `light.transform.x`, `light.color`, `light.intensity`,
`light.radius` or `light.falloff` to change it on the next frame. Assign colours with `getColor` when
changing the record, for example `light.color = getColor('#ffbb66')`. Set intensity or radius to zero
to switch it off. Falloff `1` fades linearly to the radius, `2` dims faster away from the centre,
and `0` gives a hard circular edge. Outside the radius there is no contribution.

A world can have as many lamps as it needs. Each camera's view is lit by up to eight, of the ones
that are on and reach what it shows: first those that shine most on its middle, measured by how far
the middle is from each out of how far it reaches. A torch right there comes first, and a big lamp
that covers the whole view, a moon, comes before the torches at its edges. A long level can have a
torch every few steps, and the ones behind the player give their place to the ones ahead. More than
eight reaching one view at once warns once. A lamp anywhere in the world makes it lit, even far from
the camera. Lights add their RGB contributions to the ambient level, then multiply the surface's
RGB; alpha is kept. For a custom material, lighting is applied after its fragment effect. Particles
are lit too: dust or smoke in a cave is dark; leave sparks and fire out with `useUnlit2d` so they
glow. These lights do not illuminate 3D meshes or 3D particles. They do not cast shadows, block at
walls, or calculate sprite relief.

Mark HUD boxes with `useScreenSpace()` to keep their colours unchanged by the world's lights; a lamp
placed in the HUD lights nothing. For something in the world that gives off its own light (a fire, a
neon sign, the glass of a lamp, eyes in the dark), call `useUnlit2d()` in its component: it and
everything under it keep their own colours and still move with the camera. Each lit scene with
something left out draws it through one more of the fifteen views a frame has for scenes; with none
left, it is drawn lit. World objects without a camera can still be lit. Lighting is stored with each
rendered view, so stacked scenes keep their own lamps. Scene documents preserve both kinds as light
components with kinds `point-2d` and `ambient-2d`, and what is left out as `unlit2d: true` on its
box.
