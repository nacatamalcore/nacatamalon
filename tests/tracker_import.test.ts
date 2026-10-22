import { describe, expect, it } from 'bun:test';
import { renderSong } from '../src';
import { importFamiStudioText, importFamiTrackerText, importTrackerText, serializeSongDoc } from '../src/authoring';
import { parseSongDoc } from '../src/audio/synth/parse_song_doc';
import { parseSongNotes } from '../src/audio/synth/parse_song_notes';
import { FAMISTUDIO, FAMITRACKER, row } from './helpers/tracker_texts';
import type { TSongDoc, TSongVoiceName } from '../src';

/**
 * Songs brought in from a tracker's text export. The files here are written for these tests, a few
 * rows each, in the layout each tracker exports.
 */

const notesOf = (doc: TSongDoc, voice: TSongVoiceName) => parseSongNotes(doc.voices[voice]?.notes ?? '', voice, doc.meter).notes;

describe('a FamiTracker text export', () => {
    const { doc, samples, warnings } = importFamiTrackerText(FAMITRACKER);

    it('keeps its tempo, its bar of four beats of four rows, and goes back to the frame its Bxx names', () => {
        expect(doc.tempo).toBe(150);
        expect(doc.meter).toEqual([4, 4]);
        expect(doc.loop).toEqual({ bar: 2 });
    });

    it('brings its instruments over as our lists, from its macros', () => {
        expect(doc.instruments).toMatchObject({
            'lead-1': { volume: '15 12 10 8', duty: '0 1 2' },
            chord: { volume: '15 12 | 9 6', arpeggio: '| 0 4 7' },
            kick: { pitch: '0 0.5 1' },
        });
    });

    it('lays its notes out in time, each to the next thing on its voice, with its volume and effects', () => {
        const lead = notesOf(doc, 'pulse1');
        // The tracker's octaves start a C below ours: on a pulse its C-4 is our c' (72). The
        // triangle sounds an octave lower at the same note, so its C-3 is our c, (48).
        expect(lead.map((note) => [note.start, note.beats, note.pitch, note.instrument])).toEqual([
            [0, 1, 72, 'lead-1'],
            [1, 1, 76, 'lead-1'],
            [2, 1, 79, 'lead-1'],
            [4, 4, 84, 'lead-1'],
        ]);
        expect(lead[1]!.effects).toEqual({ volume: 8 });
        expect(lead[2]!.effects).toEqual({ volume: 8, vibrato: { speed: 9.38, depth: 0.3 } });
        // The volume column was put back to F, and 400 stopped the vibrato.
        expect(lead[3]!.effects).toBeUndefined();
        expect(notesOf(doc, 'pulse2').map((note) => [note.start, note.beats])).toEqual([[0, 4], [4, 4]]);
        expect(notesOf(doc, 'triangle')[0]).toMatchObject({ pitch: 48, beats: 8 });
        expect(notesOf(doc, 'noise').map((note) => note.pitch)).toEqual([52, 52, 52, 52, 52]);
    });

    it('saves its samples as sound at the speed they play, and plays them on the samples voice', () => {
        expect(samples).toEqual([{ path: '/samples/kick.wav', samples: expect.any(Float32Array), sampleRate: 33143.9 }]);
        // FF then 00: eight steps up, eight down.
        expect(Array.from(samples[0]!.samples, (v) => Math.round((v + 1) * 64))).toEqual([66, 68, 70, 72, 74, 76, 78, 80, 78, 76, 74, 72, 70, 68, 66, 64]);
        expect(doc.instruments!.drums).toBeUndefined();
        expect(doc.instruments![notesOf(doc, 'dpcm')[0]!.instrument!]).toEqual({ sample: '/samples/kick.wav' });
    });

    it('says, once each, what it could not bring over', () => {
        expect(warnings).toEqual([
            'it uses slide up (1xx), which has no equal here: left out.',
            'it changes speed or tempo partway (Fxx): here the whole song keeps the first one.',
        ]);
    });

    it('is a song that reads, plays and saves as one of ours', () => {
        const rendered = renderSong(doc, 44100, { samples: new Map(samples.map((sample) => [sample.path, sample])) });
        expect(rendered.errors).toEqual([]);
        expect(rendered.instrumentErrors).toEqual([]);
        expect(parseSongDoc(JSON.parse(serializeSongDoc(doc)), 'imported.song')).toEqual(doc);
    });

    it('refuses what is not one of its exports, and a song it does not have', () => {
        expect(() => importFamiTrackerText('hello')).toThrow(/not a text export of FamiTracker/);
        expect(() => importFamiTrackerText(FAMITRACKER, { song: 3 })).toThrow(/there is no song 3/);
    });

    it('ends a frame early at D00, and says when the loop cannot start on a bar', () => {
        const { doc, warnings } = importFamiTrackerText(FAMITRACKER.replace(row(6, {}), row(6, { 0: '... .. . D00' })));

        // Frame 0 is seven rows now, so frame 1 starts at row 7, which no bar starts at.
        expect(notesOf(doc, 'pulse1').map((note) => note.start)).toEqual([0, 1, 1.75]);
        expect(doc.loop).toBeUndefined();
        expect(warnings).toContain('it goes back to row 7, which is not where a bar starts, so here it goes back to the start.');
    });

    it('says that the cartridge chips are left out', () => {
        expect(importFamiTrackerText(FAMITRACKER.replace('EXPANSION       0', 'EXPANSION       1')).warnings[0]).toContain('VRC6');
    });
});


describe('a FamiStudio text export', () => {
    const { doc, samples, warnings } = importFamiStudioText(FAMISTUDIO([0, 4, 8]));

    it('keeps its tempo from the frames a note lasts, and goes back to its loop point', () => {
        // Ten frames a note, four notes a beat: forty frames a beat, ninety beats a minute.
        expect(doc.tempo).toBe(90);
        expect(doc.loop).toEqual({ bar: 2 });
    });

    it('brings its instruments over from their envelopes', () => {
        expect(doc.instruments).toMatchObject({ lead: { volume: '15 12 | 9 6', duty: '1' }, bass: { pitch: '0 -0.5 -1' } });
    });

    it('lays its notes out, a note with a length of its own going quiet when it is over, every time its pattern plays', () => {
        const lead = notesOf(doc, 'pulse1');
        // Named as FamiTracker names them: on a pulse C4 is our c' (72), on the triangle C3 our c, (48).
        expect(lead.map((note) => [note.start, note.beats, note.pitch, note.instrument, note.effects?.volume])).toEqual([
            [0, 0.5, 72, 'lead', undefined],
            [1, 1, 76, 'lead', 8],
            [4, 0.5, 72, 'lead', 8],
            [5, 1, 76, 'lead', 8],
        ]);
        expect(notesOf(doc, 'triangle')[0]).toMatchObject({ pitch: 48, beats: 8, instrument: 'bass' });
        expect(doc.instruments![notesOf(doc, 'dpcm')[0]!.instrument!]).toEqual({ sample: '/samples/snare.wav' });
        expect(samples.map((sample) => sample.path)).toEqual(['/samples/snare.wav']);
    });

    it('says a beat of three notes is rounded to what notes can say', () => {
        const { warnings } = importFamiStudioText(FAMISTUDIO([0, 4, 8]).replace('BeatLength="4"', 'BeatLength="3"'));
        expect(warnings).toContainEqual(expect.stringContaining('a beat here is 3 rows'));
    });

    it('reads notes placed by the frame the same as by the note', () => {
        expect(importFamiStudioText(FAMISTUDIO([0, 40, 80])).doc).toEqual(doc);
    });

    it('says what it left out', () => {
        expect(warnings).toEqual(['the channel VRC6Square1 belongs to a chip some cartridges added: left out.']);
    });

    it('plays as one of ours', () => {
        const rendered = renderSong(doc, 44100, { samples: new Map(samples.map((sample) => [sample.path, sample])) });
        expect([rendered.errors, rendered.instrumentErrors]).toEqual([[], []]);
    });
});

describe('a tracker text export, whichever wrote it', () => {
    it('is told apart by what is in it', () => {
        expect(importTrackerText(FAMITRACKER).from).toBe('famitracker');
        expect(importTrackerText(FAMISTUDIO([0, 4, 8])).from).toBe('famistudio');
        expect(() => importTrackerText('{ "tempo": 120 }')).toThrow(/FamiTracker or FamiStudio/);
    });
});
