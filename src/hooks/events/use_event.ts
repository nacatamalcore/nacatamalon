import { getActiveBox } from '../../store';
import { sendObjectEvent } from '../../events/object_events';

/**
 * Declares an event this object can tell whoever holds it, and gives back the function that sends it.
 *
 * Call it in a behaviour or a component body, where the object is being built; send it whenever you
 * like, from a click, a key, a collision or a timer. It travels up the tree to the first object that
 * listens (`onEvent`, or `on` in `createPack`) and stops there, so a pack's button can say it was
 * pressed and the game that placed it hears it, and nothing above that.
 *
 * The function answers whether anybody heard it, which a behaviour can use to do something by itself
 * when nobody is listening.
 *
 * @param name What the event is called. The one who listens uses the same name.
 * @returns The function that sends it, with whatever should come along.
 *
 * @example
 * ```ts
 * registerScript('button', (self, props) => {
 *     const pressed = useEvent<{ label: string }>('pressed');
 *     listen(self, { onClick: () => pressed({ label: String(props.label) }) });
 * });
 * ```
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useEvent = <T = void>(name: string): ((payload: T) => boolean) => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useEvent: call it inside a scene body or a behaviour, where the object is being built.');
    }
    return (payload: T) => sendObjectEvent(box, name, payload);
};
