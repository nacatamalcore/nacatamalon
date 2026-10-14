import { MOTION_FORMAT, MOTION_VERSION } from './types/t_motion_doc';
import type { TMotionDoc, TMotionEvent, TMotionKey, TMotionTrack } from './types/t_motion_doc';

const line = (value: unknown): string => JSON.stringify(value);

/**
 * Writes a motion back out as the text of a `.motion` file, for a tool that saves one.
 *
 * Each key and each event goes on a line of its own, so a change of one key is one line to review.
 * What is not there (a key's curve, a track's component) is not written.
 *
 * @param doc - The motion.
 * @returns The file's text.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const serializeMotionDoc = (doc: TMotionDoc): string => {
    const key = (k: TMotionKey): string => line({ t: k.t, v: k.v, ...(k.ease !== undefined && k.ease !== 'linear' ? { ease: k.ease } : {}) });
    const track = (t: TMotionTrack): string => {
        const head = line({ box: t.box, ...(t.name !== undefined ? { name: t.name } : {}), ...(t.component !== undefined ? { component: t.component } : {}), ...(t.post !== undefined ? { post: t.post } : {}), path: t.path });
        return `        ${head.slice(0, -1)}, "keys": [\n${t.keys.map((k) => `            ${key(k)}`).join(',\n')}\n        ]}`;
    };
    const event = (e: TMotionEvent): string => `        ${line(e)}`;
    return [
        '{',
        `    "format": ${line(MOTION_FORMAT)},`,
        `    "version": ${MOTION_VERSION},`,
        `    "duration": ${line(doc.duration)},`,
        ...(doc.loop === true ? ['    "loop": true,'] : []),
        doc.tracks.length === 0 ? '    "tracks": [],' : `    "tracks": [\n${doc.tracks.map(track).join(',\n')}\n    ],`,
        doc.events.length === 0 ? '    "events": []' : `    "events": [\n${doc.events.map(event).join(',\n')}\n    ]`,
        '}',
        '',
    ].join('\n');
};
