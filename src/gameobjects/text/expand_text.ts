import { fontGlyphs } from '../../loaders';
import { layoutText } from './layout_text';
import type { TDrawSprite } from '../../render/interface';
import type { TText } from './types/t_text';
import { worldOf } from '../../render/shared/world_of';

/**
 * A character of a text, shaped like a sprite so the renderer draws it like one. Never a record.
 */
type TGlyphSprite = {
    type: 'sprite';
    transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    width: number;
    height: number;
    texture: TText['font']['texture'];
    tint: TText['tint'];
    anchor: { x: number; y: number };
    uvOffset: { x: number; y: number };
    uvScale: { x: number; y: number };
    smooth?: boolean;
    material?: TText['material'];
    uniforms?: TText['uniforms'];
};

/**
 * Each text's character sprites, reused from one frame to the next so drawing a still text allocates nothing.
 */
const pools = new WeakMap<TText, TGlyphSprite[]>();

/**
 * Which text each character sprite belongs to, so pointer picking can turn a letter into its text.
 */
const glyphOwners = new WeakMap<object, TText>();

/**
 * Each text's block size from the last time it was laid out: the area the pointer touches.
 */
const blockSizes = new WeakMap<TText, { width: number; height: number }>();

/**
 * Font and size pairs already warned about.
 */
const warned = new Set<string>();

const TOP_LEFT = { x: 0, y: 0 };

/**
 * The text a character sprite belongs to, or `undefined` for anything else.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const textOfGlyph = (drawable: object): TText | undefined => glyphOwners.get(drawable);

/**
 * How big a text's block was the last time it was drawn. Zero before it has been drawn once.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const textBlockSize = (text: TText): { width: number; height: number } => blockSizes.get(text) ?? { width: 0, height: 0 };

const newGlyphSprite = (text: TText): TGlyphSprite => {
    const sprite: TGlyphSprite = {
        type: 'sprite',
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        width: 0,
        height: 0,
        texture: null as unknown as TGlyphSprite['texture'],
        tint: { r: 1, g: 1, b: 1, a: 1 },
        anchor: TOP_LEFT,
        uvOffset: { x: 0, y: 0 },
        uvScale: { x: 1, y: 1 },
    };
    glyphOwners.set(sprite, text);
    return sprite;
};

/**
 * Turns a text into one sprite per visible character, placed where the renderer should draw them.
 *
 * The text's own position, anchor, turn and scale apply to the whole block: each character's point
 * inside the block is moved off the anchor, scaled, turned, and added to the text's position. Every
 * character keeps the text's turn and scale itself, so it is drawn turned and scaled around its own
 * top-left corner, which is exactly where that point landed.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const expandText = (text: TText): readonly TDrawSprite[] => {
    const { font, style } = text;
    // Where the block ends up, so a text inside a box that moved takes its characters with it.
    const transform = worldOf(text);
    const layout = layoutText(text.text, style, font.meta, fontGlyphs(font));

    if (font.meta !== null && !Number.isInteger(layout.scale)) {
        const id = `${font.key}:${style.fontSize}`;
        if (!warned.has(id)) {
            warned.add(id);
            const height = font.meta.glyphHeight;
            // The multiples either side of what was asked, never below the font's own size.
            const below = height * Math.max(1, Math.floor(layout.scale));
            const above = height * Math.max(1, Math.ceil(layout.scale));
            const suggestion = below === above ? `${below}` : `${below} or ${above}`;
            console.warn(
                `[NacatamalOn] createText: '${font.meta.name}' is ${height} px tall, so fontSize ${style.fontSize} draws its pixels unevenly. ` +
                `Use a multiple, such as ${suggestion}, for it to look crisp.`,
            );
        }
    }

    let pool = pools.get(text);
    if (pool === undefined) {
        pool = [];
        pools.set(text, pool);
    }
    while (pool.length < layout.placements.length) {
        pool.push(newGlyphSprite(text));
    }
    pool.length = layout.placements.length;

    const size = blockSizes.get(text);
    if (size === undefined) {
        blockSizes.set(text, { width: layout.width, height: layout.height });
    } else {
        size.width = layout.width;
        size.height = layout.height;
    }

    const anchorX = (text.anchor?.x ?? 0) * layout.width;
    const anchorY = (text.anchor?.y ?? 0) * layout.height;
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    const { atlasWidth, atlasHeight, glyphHeight } = font.meta ?? { atlasWidth: 1, atlasHeight: 1, glyphHeight: 1 };

    for (let i = 0; i < layout.placements.length; i++) {
        const placement = layout.placements[i];
        const sprite = pool[i];

        const localX = (placement.x - anchorX) * transform.scaleX;
        const localY = (placement.y - anchorY) * transform.scaleY;
        sprite.transform.x = transform.x + localX * cos - localY * sin;
        sprite.transform.y = transform.y + localX * sin + localY * cos;
        sprite.transform.rotation = transform.rotation;
        sprite.transform.scaleX = transform.scaleX;
        sprite.transform.scaleY = transform.scaleY;

        sprite.width = placement.width;
        sprite.height = placement.height;
        sprite.texture = font.texture;
        sprite.tint = text.tint;
        sprite.smooth = text.smooth;
        // Every letter of one text carries the same material object, so they all land in a single
        // batch rather than one draw per letter.
        sprite.material = text.material;
        sprite.uniforms = text.uniforms;
        sprite.uvOffset.x = placement.glyph.x / atlasWidth;
        sprite.uvOffset.y = placement.glyph.y / atlasHeight;
        sprite.uvScale.x = placement.glyph.w / atlasWidth;
        sprite.uvScale.y = glyphHeight / atlasHeight;
    }

    return pool;
};
