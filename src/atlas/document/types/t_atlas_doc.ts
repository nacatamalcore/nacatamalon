/**
 * How a sheet laid out in a regular grid is cut: the size of a cell, or how many there are, and
 * the gaps round and between them.
 *
 * Give the cell size or the count on each axis, and the other is worked out from the image. That
 * is what lets the same file describe a sheet whose size is not a whole number of cells, a common
 * thing in sheets made by hand: whatever is left over at the edge is simply not a frame.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAtlasGridSpec = {
    /**
     * Width of one cell in pixels.
     */
    frameWidth?: number;
    /**
     * Height of one cell in pixels.
     */
    frameHeight?: number;
    /**
     * Cells across. Worked out from the image when left out.
     */
    columns?: number;
    /**
     * Cells down. Worked out from the image when left out.
     */
    rows?: number;
    /**
     * Empty pixels round the whole sheet. Default `0`.
     */
    margin?: number;
    /**
     * Empty pixels between two cells. Default `0`.
     */
    spacing?: number;
    /**
     * How many cells are frames, counting row by row, for a last row that is not full.
     */
    count?: number;
};

/**
 * One frame of a packed sheet, in the sheet's pixels.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAtlasPixelRect = { x: number; y: number; w: number; h: number };

/**
 * A named run of frames: which ones, how fast, and what comes after.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAtlasSequenceDoc = {
    /**
     * The frames to play in order: numbers in a grid, names in a packed sheet, mixed freely.
     * Repeats are allowed.
     */
    frames: Array<number | string>;
    /**
     * Frames per second. Default `12`.
     */
    fps?: number;
    /**
     * Starts again at the end. Default `true`; `false` rests on the last frame.
     */
    loop?: boolean;
    /**
     * The run to play when this one ends: a punch that drops back to standing. Only means something
     * with `loop: false`, since a run that loops never ends.
     *
     * In the file and not in the script that starts the punch, because what follows a punch is a
     * decision about the animation, and one written into code makes retiming a character a code
     * change. A name no run answers to is said once and the run rests on its last frame.
     */
    next?: string;
};

/**
 * What an `.atlas` file holds: which image, how it is cut, and the named runs its frames make.
 *
 * Cut one of two ways and never both: a regular `grid`, or a `packed` table of rectangles, which
 * is what a packing tool writes.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAtlasDoc = {
    format: number;
    kind: 'atlas';
    /**
     * The image, relative to the `.atlas` file.
     */
    texture: string;
    grid?: TAtlasGridSpec;
    /**
     * Frame name to rectangle, in the order the frames are numbered.
     */
    packed?: Record<string, TAtlasPixelRect>;
    sequences?: Record<string, TAtlasSequenceDoc>;
};

/**
 * One frame of a sheet as a document cuts it: the window into the image in 0-1, and its size in
 * pixels, with its name when the sheet is packed.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAtlasDocFrame = {
    name?: string;
    uvOffset: { x: number; y: number };
    uvScale: { x: number; y: number };
    width: number;
    height: number;
};
