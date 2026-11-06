/**
 * How many pictures one batch of sprites can draw at once. The sprites keep their order, and each
 * one says which of these it reads.
 *
 * Eight because both backends promise at least sixteen pictures to a shader, and a sprite with an
 * effect also reads its four maps: eight and four fit with room to spare.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_TEXTURE_SLOTS = 8;

/**
 * A batch's list of pictures, holding `first`, made with room for all eight from the start.
 *
 * The list is cut back to one picture every frame and filled again. Some browsers move an array to
 * smaller storage when it is cut to well under what it has room for, and to new storage when it
 * grows again: garbage every frame for a batch of three pictures or more. With room for eight from
 * the start, cutting it to one keeps the room. Emptying it would not, so it is never emptied.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pictureList = <T>(first: T): T[] => {
    const list = new Array<T>(SPRITE_TEXTURE_SLOTS);
    list[0] = first;
    list.length = 1;
    return list;
};
