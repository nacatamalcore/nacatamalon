import { getColor } from '../color/get_color';
import { lerpColor } from '../color/lerp_color';
import type { TColorOption } from '../color';
import type { TTexture } from '../loaders';
import { rim, unlitLighting } from '../shader_composer/surface/looks';
import type { TMeshMaterialOptions } from './types/t_material_options';

/**
 * What a material recipe is asked for: its colour, and the surroundings it reflects. Both optional.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialRecipeOptions = {
    /**
     * Its colour. Each recipe has its own when this is left out.
     */
    tint?: TColorOption;
    /**
     * The surroundings it reflects: a round picture of them (`studioEnvironment` paints one, `useStudio`
     * gives one), or the scene around it captured with `useEnvironment`. Left out, it shines but
     * reflects nothing.
     */
    environment?: TTexture | { readonly texture: TTexture; readonly read: 'cube' | 'round' };
};

/**
 * The options a recipe gives back: those of a model's material, ready for `createMaterial` or to be
 * opened with a spread and changed.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialRecipe = TMeshMaterialOptions & { shader: 'mesh3d' };

/**
 * What makes each recipe: its surface, and how much it reflects of what it is given.
 */
type TRecipeSurface = {
    tint: TColorOption;
    shininess: number;
    /** How much it reflects in front and at the edge, and how much of its colour it reflects with. */
    front: number;
    edge: number;
    metal?: number;
    /** The colour of its shine: white unless it says, its own colour for a metal (`'tint'`). */
    specular?: TColorOption | 'tint';
    /** It glows its own colour (`'tint'`), as a lit tube does. */
    emissive?: 'tint';
    alpha?: number;
    blend?: 'additive';
    steps?: TMeshMaterialOptions['steps'];
};

const recipe = (options: TMaterialRecipeOptions, surface: TRecipeSurface): TMaterialRecipe => {
    const tint = options.tint ?? surface.tint;
    return {
        shader: 'mesh3d',
        tint,
        specular: surface.specular === 'tint' ? tint : surface.specular ?? '#ffffff',
        shininess: surface.shininess,
        perPixel: true,
        ...(surface.emissive === 'tint' ? { emissive: tint } : {}),
        ...(surface.alpha !== undefined ? { alpha: surface.alpha, transparent: true } : {}),
        ...(surface.blend !== undefined ? { blend: surface.blend } : {}),
        ...(surface.steps !== undefined ? { steps: surface.steps } : {}),
        ...(options.environment !== undefined
            ? {
                reflection: {
                    ...('read' in options.environment ? { texture: options.environment.texture, read: options.environment.read } : { texture: options.environment }),
                    front: surface.front,
                    edge: surface.edge,
                    ...(surface.metal !== undefined ? { metal: surface.metal } : {}),
                },
            }
            : {}),
    };
};

/**
 * Glossy plastic, the toy and the product shot of the era's computer graphics: its own colour, a
 * tight white shine, and the surroundings only towards its edge.
 *
 * Nothing but options of a model's material (`perPixel`, `specular`, `shininess` and a `reflection`
 * that reflects little in front, `0.04`, and much at the edge, `0.9`), so what it does is what they
 * do, and any of it can be changed with a spread.
 *
 * @param options Its colour (red by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * import { createMaterial, createMesh, plastic, useSphereGeometry } from 'nacatamalon';
 * import { createPixelTexture, studioEnvironment } from 'nacatamalon/pixels';
 *
 * const studio = createPixelTexture(studioEnvironment());
 * createMesh({ geometry: useSphereGeometry(), material: createMaterial(plastic({ tint: '#2a7bd8', environment: studio })) });
 * createMaterial({ ...plastic({ environment: studio }), shininess: 30 });
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const plastic = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#d8322a', shininess: 60, front: 0.04, edge: 0.9 });

/**
 * Glazed ceramic: a pale colour, a very tight shine and a little more of the surroundings than
 * plastic, softer at the edge. A teapot, a tile, a figurine.
 *
 * Options of a model's material, like `plastic`: `reflection` `front: 0.06`, `edge: 0.7`.
 *
 * @param options Its colour (an off-white by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(ceramic({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ceramic = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#f2efe8', shininess: 120, front: 0.06, edge: 0.7 });

/**
 * Chrome: nearly all of it is what it reflects, everywhere, with the lamp's spot on top. The logos,
 * the robots and the spaceships of the era's computer graphics. Without `environment` it has
 * nothing to reflect and reads as grey metal.
 *
 * Options of a model's material, like `plastic`: `reflection` `front: 0.9`, `edge: 1`.
 *
 * @param options Its colour (a cool grey by default, which shows where the reflection is thin) and
 * the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(chrome({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const chrome = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#c0c4cc', shininess: 140, front: 0.9, edge: 1 });

/**
 * Matte rubber: a wide, grey shine and almost nothing of the surroundings, a faint sheen at the edge.
 * Tyres, handles, the soft parts of a toy.
 *
 * Options of a model's material, like `plastic`: `shininess: 8`, a grey `specular`, `reflection`
 * `front: 0.01`, `edge: 0.25`.
 *
 * @param options Its colour (a near-black grey by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(rubber({ tint: '#2a2a2e', environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rubber = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#2e2e34', shininess: 8, specular: '#505050', front: 0.01, edge: 0.25 });

/**
 * Car paint, or any deep lacquer: its colour under a clear coat, a very tight shine and the
 * surroundings strong towards the edge, more than plastic. The sports car of every demo reel.
 *
 * Options of a model's material, like `plastic`: `shininess: 200`, `reflection` `front: 0.08`,
 * `edge: 1`.
 *
 * @param options Its colour (a deep red by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(carPaint({ tint: '#1a3fb0', environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const carPaint = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#b0121e', shininess: 200, front: 0.08, edge: 1 });

/**
 * Glass: see-through, a tight shine, and the surroundings little in front and nearly all at the edge,
 * where what it reflects also makes it less see-through, so its outline shows. Without the bending
 * of what is behind it, as the era's renders mostly drew it.
 *
 * Options of a model's material: `alpha: 0.2` and `transparent`, `shininess: 220`, `reflection`
 * `front: 0.1`, `edge: 1`. A glass with nothing to reflect is a faint tint.
 *
 * @param options Its colour (a pale blue by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(glass({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const glass = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#d8ecf4', shininess: 220, front: 0.1, edge: 1, alpha: 0.2 });

/**
 * A lit neon tube: it glows its own colour, whatever lights it, with a little of the surroundings
 * at the edge, the glass of the tube. In the CGI style (`RENDER.STYLES.cgi`) the bloom makes it glow
 * round itself.
 *
 * Options of a model's material: `emissive` its own colour, `shininess: 60`, `reflection`
 * `front: 0.02`, `edge: 0.3`.
 *
 * @param options Its colour (a hot pink by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(neon({ tint: '#3cf0ff' }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const neon = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#ff3cac', shininess: 60, emissive: 'tint', front: 0.02, edge: 0.3 });

/**
 * Pearl, or satin: a soft pale surface whose rim turns another colour as it turns away, the shimmer
 * of mother-of-pearl, a bathroom of the era, a trophy.
 *
 * Options of a model's material: `shininess: 40`, a `rim` step in a cool blue, `reflection`
 * `front: 0.05`, `edge: 0.6`. The rim is its own colour: change it with a spread and a `rim()` of
 * your own in `steps`.
 *
 * @param options Its colour (an ivory by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(pearl({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pearl = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, {
        tint: '#f4ece4',
        shininess: 40,
        front: 0.05,
        edge: 0.6,
        steps: [rim({ color: '#a8c8ff', power: 2, amount: 0.5 })],
    });

/**
 * A hologram: see-through light, added to what is behind it rather than covering it, with a bright
 * rim where it turns away, the blue projection of every science-fiction film of the nineties. It
 * reflects nothing: it is light.
 *
 * Options of a model's material: `alpha: 0.5`, `transparent`, `blend: 'additive'`, a dim shine
 * and a strong `rim` step, which is where its light is. `environment` is not used.
 *
 * @param options Its colour (a cyan by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(hologram());
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const hologram = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe({ ...options, environment: undefined }, {
        tint: '#1e7aa8',
        shininess: 40,
        specular: '#205060',
        alpha: 0.5,
        blend: 'additive',
        front: 0,
        edge: 0,
        steps: [rim({ color: '#bff4ff', power: 1.5, amount: 1 })],
    });

/**
 * Gold: nearly all of it is what it reflects, tinted gold, with a gold shine. The trophy, the coin,
 * the idol of every adventure.
 *
 * A metal reflects in its own colour (`reflection.metal: 1`) and shines in it too (`specular` its
 * own colour): `shininess: 90`, `reflection` `front: 0.85`, `edge: 1`, `metal: 1`.
 * Without `environment` it has nothing to reflect and reads as dull ochre.
 *
 * @param options Its colour (gold by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(gold({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gold = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#e8b84a', specular: 'tint', shininess: 90, front: 0.85, edge: 1, metal: 1 });

/**
 * Copper: a warm, reddish metal, a little less of a mirror than gold. Pipes, pans, wires, robots.
 *
 * A metal reflects in its own colour (`reflection.metal: 1`) and shines in it too (`specular` its
 * own colour): `shininess: 70`, `reflection` `front: 0.75`, `edge: 1`, `metal: 1`.
 *
 * @param options Its colour (copper by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(copper({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const copper = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#d8805a', specular: 'tint', shininess: 70, front: 0.75, edge: 1, metal: 1 });

/**
 * Brass: a pale yellow metal, softer than gold. Instruments, door handles, the fittings of a ship.
 *
 * A metal reflects in its own colour (`reflection.metal: 1`) and shines in it too (`specular` its
 * own colour): `shininess: 60`, `reflection` `front: 0.7`, `edge: 1`, `metal: 1`.
 *
 * @param options Its colour (brass by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(brass({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const brass = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#c8a84e', specular: 'tint', shininess: 60, front: 0.7, edge: 1, metal: 1 });

/**
 * Anodized metal: chrome in a colour, the blue, red or violet aluminium of a bike part, a phone, a
 * futuristic interface. Give it any `tint`.
 *
 * A metal reflects in its own colour (`reflection.metal: 1`) and shines in it too (`specular` its
 * own colour): `shininess: 120`, `reflection` `front: 0.8`, `edge: 1`, `metal: 1`.
 *
 * @param options Its colour (a blue by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(anodized({ tint: '#a02ad8', environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const anodized = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#3a6ad8', specular: 'tint', shininess: 120, front: 0.8, edge: 1, metal: 1 });

/**
 * Steel, or iron: a grey metal that is not polished, a wide shine in its own colour and only some of
 * the surroundings, so it reads as metal without being a mirror. Machines, tools, weapons, robots,
 * the plates of a ship.
 *
 * A metal reflects in its own colour (`reflection.metal: 1`) and shines in it too (`specular` its
 * own colour): `shininess: 30`, `reflection` `front: 0.35`, `edge: 0.8`, `metal: 1`.
 *
 * @param options Its colour (a mid steel grey by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(steel({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const steel = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#8a9098', specular: 'tint', shininess: 30, front: 0.35, edge: 0.8, metal: 1 });

/**
 * Ice: a block of it, pale and half see-through, a tight shine, the surroundings strong at the edge
 * and a cold glow along its outline, where light runs through it. An ice level, a frozen lake, a
 * crystal. Glass is a window; this is solid.
 *
 * Options of a model's material: `alpha: 0.7` and `transparent`, `shininess: 160`, `reflection`
 * `front: 0.08`, `edge: 0.9`, and a strong `rim` step in a pale cyan.
 *
 * @param options Its colour (a pale blue by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(ice({ environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ice = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, {
        tint: '#d4f0fa',
        shininess: 160,
        front: 0.08,
        edge: 0.9,
        alpha: 0.7,
        steps: [rim({ color: '#e8fcff', power: 2, amount: 0.6 })],
    });

/**
 * Felt, or any cloth with a nap: no shine and almost nothing of the surroundings, only a soft sheen
 * of its own colour, lighter, where it turns away, as the fibres catch the light at the edge. The top
 * of a card table, a pool table, a hat, a stuffed toy.
 *
 * Options of a model's material: a near-black `specular` with `shininess: 6`, `reflection`
 * `front: 0`, `edge: 0.08`, and a soft `rim` step in its own colour made lighter. The sheen does not
 * follow the lamp: the side away from it keeps a sheen at its edge too, as the era's renders gave it.
 *
 * @param options Its colour (a card table's green by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(felt({ tint: '#7a1626', environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const felt = (options: TMaterialRecipeOptions = {}): TMaterialRecipe => {
    const tint = options.tint ?? '#1f6b3a';
    const sheen = lerpColor(getColor(tint), { r: 1, g: 1, b: 1, a: 1 }, 0.45);
    return recipe(options, {
        tint,
        shininess: 6,
        specular: '#101010',
        front: 0,
        edge: 0.08,
        steps: [rim({ color: [sheen.r, sheen.g, sheen.b], power: 2.5, amount: 0.35 })],
    });
};

/**
 * Varnished wood: its colour under a thin clear coat, a tight white shine and a little of the
 * surroundings, more towards the edge. A table's rail, a guitar, a cabinet.
 *
 * Options of a model's material, like `plastic`: `shininess: 80`, `reflection` `front: 0.04`,
 * `edge: 0.6`. The grain is a picture of it given with a spread (`texture`), which the tint
 * multiplies: give a white `tint` for the picture's own colours.
 *
 * @param options Its colour (a warm brown by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 * declare const grain: TTexture;
 *
 * createMaterial(wood({ environment: studio }));
 * createMaterial({ ...wood({ tint: '#ffffff', environment: studio }), texture: grain });
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wood = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#8a5a32', shininess: 80, front: 0.04, edge: 0.6 });

/**
 * Leather: a dark colour with a soft, low shine, wider than plastic's and grey rather than white, and
 * a little of the surroundings at the edge. A chair, a jacket, a book's cover, a ball.
 *
 * Options of a model's material, like `plastic`: `shininess: 24`, a grey `specular`, `reflection`
 * `front: 0.02`, `edge: 0.35`.
 *
 * @param options Its colour (a dark brown by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 *
 * createMaterial(leather({ tint: '#1c1c20', environment: studio }));
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const leather = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#4a2c1c', shininess: 24, specular: '#6a625c', front: 0.02, edge: 0.35 });

/**
 * Paper, or card: matte, a faint wide shine and almost nothing of the surroundings. A playing card, a
 * page, a box, a sign. What is printed on it is a picture given with a spread (`texture`), which the
 * tint multiplies: give a white `tint` for the picture's own colours.
 *
 * Options of a model's material, like `plastic`: `shininess: 6`, a dark grey `specular`,
 * `reflection` `front: 0`, `edge: 0.12`.
 *
 * @param options Its colour (an off-white by default) and the surroundings it reflects.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * declare const studio: TTexture;
 * declare const aceOfSpades: TTexture;
 *
 * createMaterial({ ...paper({ tint: '#ffffff', environment: studio }), texture: aceOfSpades });
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const paper = (options: TMaterialRecipeOptions = {}): TMaterialRecipe =>
    recipe(options, { tint: '#f2eee2', shininess: 6, specular: '#383838', front: 0, edge: 0.12 });

/**
 * What `matcap` is asked for besides its picture.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMatcapOptions = {
    /**
     * A colour the matcap is multiplied by, so one white matcap colours many things. Left out, the
     * matcap's own colours.
     */
    tint?: TColorOption;
};

/**
 * A matcap: a picture of a ball already lit (its colour, its shadow and its shine) that colours the
 * whole model by which way each part of it faces the camera. No lamp is needed, nor read: the light
 * is the painted one, so it always comes from the same side of the screen as the model turns, and a
 * scene of them is as cheap as it gets. The soft, toy-like look of a clay model or a product shot.
 *
 * The picture is the ball seen from in front, round in its square, as a 3D program renders one or
 * `paintMatcap` paints one; any such picture loaded with `useLoadTexture` works.
 *
 * Nothing but options of a model's material: `lighting: unlitLighting()` and a `reflection` of the
 * picture at full, `front: 1`, `edge: 1`, `metal: 1`, so the tint and the model's own picture
 * multiply it, and its `alpha` fades it as any surface's. A scene document keeps it when the picture
 * is a file. Steps go on top: `groundBounce()` for the floor's colour coming up, `rim()` for a lit
 * edge.
 *
 * @param texture The matcap.
 * @param options A colour to multiply it by.
 * @returns The options, for `createMaterial`.
 *
 * @example
 * ```ts
 * import { createMaterial, createMesh, matcap, useSphereGeometry } from 'nacatamalon';
 * import { createPixelTexture, paintMatcap } from 'nacatamalon/pixels';
 * import { groundBounce } from 'nacatamalon/shader';
 *
 * const clay = createPixelTexture(paintMatcap({ base: '#e2414b' }));
 * createMesh({ geometry: useSphereGeometry(), material: createMaterial(matcap(clay)) });
 * createMaterial({ ...matcap(clay), steps: [groundBounce({ color: '#ff7a33' })] });
 * ```
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const matcap = (texture: TTexture, options: TMatcapOptions = {}): TMaterialRecipe => ({
    shader: 'mesh3d',
    ...(options.tint !== undefined ? { tint: options.tint } : {}),
    lighting: unlitLighting(),
    reflection: {
        texture,
        front: 1,
        edge: 1,
        metal: 1,
    },
});
