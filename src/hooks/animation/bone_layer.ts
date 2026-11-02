import { copyJointInto, restingJoint } from '../../animation';
import { blendJoint } from '../../math/skinning';
import type { TJointPose } from '../../animation';
import type { TModel } from '../../gameobjects/model';

/**
 * An animator with `only`: a movement laid over some of a model's bones.
 *
 * It never writes the skeleton's `pose`. That stays what the animators of the whole body wrote, so
 * nothing there has to be told apart from what a layer left behind, and a layer that lets go has
 * nothing to undo. What is drawn is worked out from it when the bones are needed: see `layBones`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBoneLayer = {
    only: readonly string[];
    /**
     * How far it shows over what is below, `0` to `1`.
     */
    reach: number;
    /**
     * The bones it moves, per skeleton. `null` until the model has its bones.
     */
    bones: Int32Array[] | null;
    /**
     * What it wants those bones to show. One set per skeleton, written over each time.
     */
    shown: TJointPose[][];
    /**
     * Writes its movement into `shown`, having started from what is below in skeleton `s`.
     */
    sample: (s: number, below: TJointPose[]) => void;
};

/**
 * The layers of a model, in the order they were made, and somewhere to work out what they add up to.
 */
type TModelLayers = {
    layers: TBoneLayer[];
    laid: TJointPose[][];
};

const layersOfModel = new WeakMap<TModel, TModelLayers>();

const roomFor = (model: TModel): TJointPose[][] =>
    model.skeletons.map((skeleton) => skeleton.pose.map(() => restingJoint()));

/**
 * Finds the bones named and all that hangs from them. Parents come before their children in the
 * list, so one pass from the front reaches every one.
 */
const bonesOf = (model: TModel, only: readonly string[]): Int32Array[] => {
    const found = new Set<string>();
    const bones = model.skeletons.map((skeleton) => {
        const inside = new Array<boolean>(skeleton.pose.length).fill(false);
        const list: number[] = [];
        for (let j = 0; j < inside.length; j++) {
            const name = skeleton.jointNames[j] ?? '';
            const parent = skeleton.parentIndex[j];
            if (only.includes(name)) {
                found.add(name);
                inside[j] = true;
            } else if (parent >= 0 && inside[parent]) {
                inside[j] = true;
            }
            if (inside[j]) {
                list.push(j);
            }
        }
        return Int32Array.from(list);
    });
    for (const name of only) {
        if (!found.has(name)) {
            const known = model.skeletons.flatMap((skeleton) => skeleton.jointNames);
            console.warn(`[NacatamalOn] useSkeletalAnimation: no bone called '${name}' for only. It knows: ${known.join(', ')}.`);
        }
    }
    return bones;
};

/**
 * Works out how skeleton `s` stands with every layer laid over what the body wrote, in the order they
 * were made. With none showing, that is the body's own pose and nothing is copied.
 */
const layBones = (model: TModel, s: number): TJointPose[] => {
    const { pose } = model.skeletons[s];
    const held = layersOfModel.get(model)!;
    if (!held.layers.some((layer) => layer.reach > 0)) {
        return pose;
    }

    const laid = held.laid[s];
    for (let j = 0; j < pose.length; j++) {
        copyJointInto(pose[j], laid[j]);
    }
    for (const layer of held.layers) {
        if (layer.reach <= 0 || layer.bones === null) {
            continue;
        }
        layer.sample(s, laid);
        const bones = layer.bones[s];
        const shown = layer.shown[s];
        for (let b = 0; b < bones.length; b++) {
            const j = bones[b];
            // The whole way is copied, so a bone shows exactly what the movement says.
            if (layer.reach >= 1) {
                copyJointInto(shown[j], laid[j]);
            } else {
                blendJoint(laid[j], shown[j], layer.reach, laid[j]);
            }
        }
    }
    return laid;
};

/**
 * Adds a layer to a model, on top of the ones it has.
 *
 * @returns What takes it off again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const addBoneLayer = (model: TModel, layer: TBoneLayer): (() => void) => {
    let held = layersOfModel.get(model);
    if (held === undefined) {
        held = { layers: [], laid: [] };
        layersOfModel.set(model, held);
    }
    held.layers.push(layer);
    const { layers } = held;
    return () => {
        layers.splice(layers.indexOf(layer), 1);
    };
};

/**
 * Gets a layer ready once the model has its bones, which may be long after it was made.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readyBoneLayer = (model: TModel, layer: TBoneLayer): void => {
    if (layer.bones !== null) {
        return;
    }
    layer.bones = bonesOf(model, layer.only);
    layer.shown = roomFor(model);
    const held = layersOfModel.get(model)!;
    if (held.laid.length === 0) {
        held.laid = roomFor(model);
        model.skeletons.forEach((skeleton, s) => {
            skeleton.laid = () => layBones(model, s);
        });
    }
};

/**
 * Starts a room off with what is below, on the bones of a layer, so one its movement does not turn
 * shows that.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const holdBelowIn = (layer: TBoneLayer, s: number, below: TJointPose[], room: TJointPose[][]): void => {
    const bones = layer.bones![s];
    for (let b = 0; b < bones.length; b++) {
        const j = bones[b];
        copyJointInto(below[j], room[s][j]);
    }
};
