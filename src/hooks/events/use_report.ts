import { getActiveBox } from '../../store';
import { sendReport } from '../../events/reports';

/**
 * Lets a piece report to whoever placed it, and gives back the function that sends the report: a
 * pack's button saying it was pressed, a behaviour saying its box is out of lives. It climbs to the
 * first object above that listens (`onReport`, or `on` in `createPack`) and stops there. Answers
 * whether anybody heard it.
 *
 * For pieces made of data, a pack's script or a behaviour, which cannot be handed a function. A
 * component of your own code takes a callback in its props instead; something the whole game hears
 * is a signal.
 *
 * @param name What the report is called. The one who listens uses the same name.
 * @returns The function that sends it, with whatever should come along.
 *
 * @example
 * ```ts
 * registerScript('button', (self, props) => {
 *     const pressed = useReport<{ label: string }>('pressed');
 *     listen(self, { onClick: () => pressed({ label: String(props.label) }) });
 * });
 * ```
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useReport = <T = void>(name: string): ((payload: T) => boolean) => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useReport: call it inside a behaviour or a scene body, where the object is being built.');
    }
    return (payload: T) => sendReport(box, name, payload);
};
