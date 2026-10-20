/**
 * A picture in the scene, as `createSprite` gives it back. Plain data: change any field
 * (`transform.x`, `tint`, `visible`...) and the next frame shows it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSprite = {
    id: string;
    type: 'sprite';
    /**
     * Width in pixels, before scale. Omitted, it is drawn as wide as what it shows of its texture
     * (one frame of a sheet, not the whole sheet), and stays omitted: the field is not filled in when
     * the picture loads. That width is `texture.width * (uvScale?.x ?? 1)` once it has.
     */
    width?: number;
    /**
     * Height in pixels, before scale. Omitted, it is drawn as tall as what it shows of its texture,
     * and stays omitted, as `width` does: `texture.height * (uvScale?.y ?? 1)` once it has loaded.
     */
    height?: number;
    transform: TTransform2d;
    /**
     * Where it ends up once everything above it has moved it, worked out once a frame while the tree
     * is walked. Left off when nothing above it has a placement of its own, which is the ordinary
     * case: then its own `transform` is already where it is.
     *
     * Set by the engine every frame and never authored or saved. Ask `worldOf` rather than reading
     * either field by hand.
     */
    worldTransform?: TTransform2d;
    /**
     * The image it shows, or `null` for a plain rectangle of its `tint`.
     */
    texture: TTexture | null;
    tint: TColor;
    /**
     * The sheet its picture came from, if it came from one. Set another and it shows the same frame
     * of that one, image and all (the first, when the new sheet is shorter): walking to attacking
     * is `hero.atlas = attacking`.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas` it shows. Set it and that frame shows, as with any other field:
     * `chest.frame = 1`. An animation sets it too, so a scene saved halfway through a run keeps the
     * picture that was on screen.
     */
    frame?: number;
    /**
     * The run a scene document asked it to play, and how fast: what it plays, not how far it has got.
     * Written back when the scene is saved, which is all it is for. The player itself is behaviour
     * and lives in the scene, never in the record.
     */
    animation?: TSpriteAnimationDoc;
    /**
     * Which point of the sprite sits on its transform, in 0-1. Omitted is its middle.
     */
    anchor?: { x: number; y: number };
    /**
     * The point it turns and grows about, in 0-1 like `anchor`, when that is not its anchor: a
     * motorbike anchored under its back wheel that spins about its middle when it crashes. Unturned
     * and ungrown it sits as its anchor says; turned, it turns about this point, anchor and all.
     * Omitted is its anchor. Can be changed at any moment, and taken away (`undefined`).
     */
    pivot?: { x: number; y: number };
    /**
     * Where the window into the texture starts, in 0-1. Omitted is the top-left corner.
     */
    uvOffset?: { x: number; y: number };
    /**
     * How big that window is, in 0-1. Omitted is the whole image.
     */
    uvScale?: { x: number; y: number };
    /**
     * Shows its picture mirrored left to right: a character facing the other way, with one drawing
     * instead of two. Omitted is not mirrored.
     *
     * It mirrors the **picture**, never the place: a mirrored sprite sits exactly where it sat, and
     * is touched in the same place. That is what tells it apart from a negative scale.
     */
    flipX?: boolean;
    /**
     * The same top to bottom.
     */
    flipY?: boolean;
    /**
     * Repeats its picture across its size instead of stretching it: a wall of bricks, a strip of
     * grass, clouds. Set `width` and `height` to the size to cover; the picture (or its frame, from an
     * atlas) is laid as many times as fits. Omitted is stretched.
     */
    repeat?: boolean;
    /**
     * With `repeat`, where the pattern starts inside the sprite, in its picture's pixels: moving it
     * every frame scrolls the pattern while the sprite stays put. `{ x: 0, y: 0 }` by default.
     */
    repeatOffset?: { x: number; y: number };
    /**
     * How much it moves with the camera: `1` (the default) as everything else, `0` not at all, as if
     * pinned to the screen, and in between further away: `{ x: 0.3, y: 0 }` is a far range of
     * mountains that slides slowly by and keeps its height. Only how it is drawn and touched by the
     * pointer: its placement stays what it says.
     */
    parallax?: { x: number; y: number };
    /**
     * What it is, for something drawn on its own rather than a piece: `['wall']`. What `useTag` adds and
     * finds, and what collisions are asked by. Absent is none.
     */
    tags?: string[];
    /**
     * Whether it is drawn at all. Omitted is drawn.
     *
     * For something that exists and is not on screen: the coins of a level made once and shown as
     * they are needed, the second picture of a character who is facing the other way. Cheaper than
     * making it and destroying it over and over, and it keeps whatever it was carrying.
     *
     * Hidden is not gone: it is still in the scene, its box still runs every frame, and it is not
     * touched by the pointer while it cannot be seen.
     */
    visible?: boolean;
    /**
     * How its image is read when it does not land on whole pixels: `false` keeps it crisp and
     * blocky, `true` blends. Omitted, the game's `smooth` decides.
     */
    smooth?: boolean;
    /**
     * How it lands on what is behind it. `'alpha'` (the default) covers it as far as its alpha says.
     * `'additive'` adds its colour instead, so it can only brighten: a halo, a flash, a beam of
     * light, a lamp at night. Two additive sprites over each other are brighter than one. Can be
     * changed any frame.
     */
    blend?: 'alpha' | 'additive';
    /**
     * An effect of its own, from `createMaterial`. Omitted is the built-in shader, which is what
     * nearly every sprite wants.
     *
     * It carries the effect and nothing else: the picture and the colour above stay the sprite's,
     * because those vary per sprite and travel with it. Two sprites handed the same material share
     * one compiled shader, and still draw in **one** call as long as they also share a sheet.
     */
    material?: TSpriteMaterial;
    /**
     * This sprite's own values for its material's knobs, laid over the material's every frame.
     *
     * What it buys: fifteen sprites, one compiled effect, fifteen different settings of it. Without
     * it, varying one number would mean a material apiece, and a material apiece is a compile of the
     * identical shader apiece.
     *
     * The cost is a draw of its own: its numbers are written per run, so a sprite with its own set
     * cannot share one. Fifteen is nothing; a thousand would be worth knowing about.
     */
    uniforms?: TUniformValues;
    /**
     * Draw order within its scene: higher on top, ties in creation order. Omitted counts as `0`,
     * and a scene where no sprite says it is not sorted at all.
     */
    zIndex?: number;
    /**
     * Set by `destroy` and never cleared. True means it is on its way out and nothing should
     * treat it as part of the game any more, even in the gap before the frame sweeps it away.
     */
    destroyed: boolean;
};

import type { TColor } from "../../../color";
import type { TTransform2d } from "../../types/t_transform_2d";
import type { TTexture } from "../../../loaders";
import type { TSpriteAtlas } from "../../../atlas";
import type { TSpriteAnimationDoc } from "../../../scene/document/types/t_component_doc";
import type { TSpriteMaterial, TUniformValues } from "../../../materials";
