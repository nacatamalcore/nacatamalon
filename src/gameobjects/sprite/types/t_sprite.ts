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
     * Width in pixels, before scale. Omitted: the texture's width once it has loaded.
     */
    width?: number;
    /**
     * Height in pixels, before scale. Omitted: the texture's height once it has loaded.
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
     * The sheet its picture came from, if it came from one. Kept so anything that changes which
     * frame it shows, an animation above all, does not have to be handed the sheet again.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas` it shows, kept in step by whatever changes it, an animation above all,
     * so a scene saved halfway through a run keeps the picture that was on screen.
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
