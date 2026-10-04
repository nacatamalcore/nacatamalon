import type { TAssetEntry } from './t_asset_entry';
import type { TComponentDoc } from './t_component_doc';
import type { TTransform3d } from '../../../gameobjects/types/t_transform_3d';

/**
 * What this format is called on disk, so a file can say what it is.
 *
 * It is checked on the way in, and a file that does not say this is refused rather than half read.
 * That sounds obvious and it is the thing the draft this engine replaces got wrong: its scene
 * documents carried no discriminant at all, so a `.scene.json` could not be told apart from any
 * other JSON by looking at it, and the only way to know was where it was found.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SCENE_FORMAT = 'nacatamalon-scene';

/**
 * The version of this format, raised when a document written today would be misread by an older
 * engine.
 *
 * **It is read, not merely written.** A document claiming a higher number is loaded anyway and
 * warned about once, because refusing outright helps nobody: most of a newer document is still
 * readable, and what is not lands in `extra` rather than being lost.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SCENE_VERSION = 1;

/**
 * One piece of state a box asked for with `useData`, written down.
 *
 * **Matched by position**, which is the whole design and its whole risk. There is no name to match
 * on because `useData` does not take one: the first `useData` in a body is the first entry here,
 * the second is the second. Reading a scene back therefore assumes the body still asks for them in
 * the same order, and adding one in the middle of a body that has already been saved hands the old
 * values to the wrong places.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDataEntry = {
    value: unknown;
};

/**
 * One box, written down: an identity, a place, what it is, and what is under it.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBoxNode = {
    /**
     * Stable for the life of the box, and the only thing anything outside the engine can address it
     * by. A tool that remembers a selection, an undo step or a link between two boxes remembers
     * this, so regenerating it on load would quietly break every one of them.
     */
    id: string;
    /**
     * What it is called where it was placed. Not unique: two enemies can share it.
     */
    name: string;
    /**
     * Where it is, which moves everything under it.
     *
     * `null` means it is **not anywhere in particular**, which is what an empty box used only to
     * group things should cost: nothing. Writing an identity transform instead would make every
     * grouping box pay for a placement it does not have and cannot use.
     */
    transform: TTransform3d | null;
    /**
     * What this box is: its picture, its shape, its camera, its lamp.
     */
    components: TComponentDoc[];
    /**
     * The boxes placed relative to it. A child is another object, never a part of this one.
     */
    children: TBoxNode[];
    /**
     * The state the box asked for with `useData`, in the order it asked for it.
     *
     * Absent when there is none, which is most boxes: a `data: []` on every node in a level would
     * be noise in the file and one more thing to read past.
     */
    data?: TDataEntry[];
    /**
     * Absent means drawn. Only ever written when it is `false`.
     */
    visible?: boolean;
    /**
     * Absent means it lives in the world. Only ever written when it is `true`.
     */
    screenSpace?: boolean;
    /**
     * Whatever else the file said about this box, kept exactly as written and **not acted on**.
     *
     * Two things land here, and both would otherwise be lost. A field from a newer version of this
     * format, which this engine cannot use but has no business deleting. And a field belonging to
     * somebody else entirely: a tool's link back to a reusable box, a note an importer left. The
     * engine ignores all of it and writes it back out untouched.
     *
     * This is not the same mistake as inventing a field nobody reads. The difference is who wrote
     * it: **throwing it away would quietly rewrite somebody's file the first time a tool saved it**,
     * and that is exactly how the draft this replaces lost the link between a scene and the reusable
     * boxes it was built from.
     */
    extra?: Record<string, unknown>;
};

/**
 * One scene, written down.
 *
 * **The unit is the scene and never the game.** What belongs to the whole game (the size of the
 * window, its background, the input map, the look of the screen) is the project's, because "this
 * game looks like a Mega Drive" is not a fact about whichever room happens to be open.
 *
 * The three fields, in the order they are read:
 *
 * 1. `format` and `version` say what this is, so a file that is not one of these is refused instead
 *    of half read.
 * 2. `assets` is everything the scene needs fetched, named. It is walked **first**, before a single
 *    box is built, so that by the time something says "my texture is `hero`" the slot for `hero`
 *    already exists, possibly still arriving.
 * 3. `root` is the tree.
 *
 * @example
 * ```json
 * {
 *   "format": "nacatamalon-scene",
 *   "version": 1,
 *   "name": "Level1",
 *   "assets": [{ "type": "texture", "key": "hero", "src": "/assets/hero.png" }],
 *   "root": {
 *     "id": "root", "name": "Level1", "transform": null, "components": [],
 *     "children": [{
 *       "id": "player", "name": "Player",
 *       "transform": { "x": 40, "y": 120, "z": 0, "rotation": 0, "rotationX": 0, "rotationY": 0, "scaleX": 1, "scaleY": 1, "scaleZ": 1 },
 *       "components": [{ "type": "sprite", "id": "art", "texture": "hero", "tint": { "r": 1, "g": 1, "b": 1, "a": 1 } }],
 *       "children": []
 *     }]
 *   }
 * }
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneDoc = {
    format: typeof SCENE_FORMAT;
    version: number;
    /**
     * What the scene is called, and what it is started by.
     *
     * Here rather than smuggled in as the root box's name, which is where the draft this replaces
     * kept it. A scene in this engine is named by the key it was registered under, and
     * `createScene()` deliberately takes no name at all, so without this field a document would
     * have no way to say what it is and would only be identifiable by its file name.
     */
    name: string;
    /**
     * Everything the scene needs fetched, by the key the tree refers to it by.
     */
    assets: TAssetEntry[];
    root: TBoxNode;
};
