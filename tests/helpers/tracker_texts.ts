/**
 * Tracker text exports written for the tests, a few rows each, in the layout each tracker exports.
 */

/** A row of five channels, empty but for what is given. */
export const row = (index: number, cells: Partial<Record<number, string>>): string =>
    `ROW ${index.toString(16).toUpperCase().padStart(2, '0')} : ${[0, 1, 2, 3, 4].map((channel) => cells[channel] ?? '... .. . ...').join(' : ')}`;

const pattern = (index: number, rows: Record<number, Partial<Record<number, string>>>): string =>
    [`PATTERN ${index.toString(16).toUpperCase().padStart(2, '0')}`, ...Array.from({ length: 16 }, (_, i) => row(i, rows[i] ?? {}))].join('\n');

export const FAMITRACKER = `# FamiTracker text export 0.4.2

# Song information
TITLE           "Test tune"
AUTHOR          "Nacatamal"
COPYRIGHT       ""

# Global settings
MACHINE         0
FRAMERATE       0
EXPANSION       0
VIBRATO         1
SPLIT           32

# Macros
MACRO       0   0  -1  -1   0 : 15 12 10 8
MACRO       0   1   2  -1   0 : 15 12 9 6
MACRO       1   0   0  -1   0 : 0 4 7
MACRO       2   0  -1  -1   0 : 0 -8 -8
MACRO       4   0  -1  -1   0 : 0 1 2

# DPCM samples
DPCMDEF   0    2 "kick"
DPCM : FF 00

# Instruments
INST2A03   0     0    -1    -1    -1     0 "Lead 1"
INST2A03   1     1     0    -1    -1    -1 "Chord"
INST2A03   2    -1    -1     0    -1    -1 "Kick"
INST2A03   3    -1    -1    -1    -1    -1 "Drums"
KEYDPCM   3   3   0   0  15   0     0  -1

# Tracks

TRACK  16   6 150 "Song"
COLUMNS : 1 1 1 1 1

ORDER 00 : 00 00 00 00 00
ORDER 01 : 01 01 01 01 01

${pattern(0, {
    0: { 0: 'C-4 00 F ...', 1: 'C-4 01 . ...', 2: 'C-3 .. . ...', 3: '4-# 02 . ...', 4: 'C-3 03 . ...' },
    4: { 0: 'E-4 .. 8 ...', 3: '4-# .. . ...' },
    8: { 0: 'G-4 .. . 4A3', 3: '4-# .. . ...' },
    12: { 0: '--- .. . ...', 3: '4-# .. . 1A0' },
})}

${pattern(1, {
    0: { 0: 'C-5 .. F 400', 1: 'C-4 .. . ...', 3: '4-# .. . F05' },
    15: { 0: '... .. . B01' },
})}
`;


export const FAMISTUDIO = (times: [number, number, number]) => `Project Version="4.2.0" TempoMode="FamiStudio" Name="Test" Author="Nacatamal"
\tDPCMSample Name="snare" Data="F00F"
\tDPCMMapping Note="C3" Sample="snare" Pitch="15" Loop="False"
\tInstrument Name="Lead"
\t\tEnvelope Type="Volume" Length="4" Loop="2" Values="15,12,9,6"
\t\tEnvelope Type="DutyCycle" Length="1" Values="1"
\tInstrument Name="Bass"
\t\tEnvelope Type="Pitch" Length="3" Relative="True" Values="0,8,8"
\tSong Name="Song 1" Length="2" LoopPoint="1" PatternLength="16" BeatLength="4" NoteLength="10" Groove="10" GroovePaddingMode="Middle"
\t\tChannel Type="Square1"
\t\t\tPattern Name="A"
\t\t\t\tNote Time="${times[0]}" Value="C4" Duration="${times[1] / 2}" Instrument="Lead"
\t\t\t\tNote Time="${times[1]}" Value="E4" Volume="8"
\t\t\t\tNote Time="${times[2]}" Value="Stop"
\t\t\tPatternInstance Time="0" Pattern="A"
\t\t\tPatternInstance Time="1" Pattern="A"
\t\tChannel Type="Triangle"
\t\t\tPattern Name="B"
\t\t\t\tNote Time="0" Value="C3" Instrument="Bass"
\t\t\tPatternInstance Time="0" Pattern="B"
\t\tChannel Type="DPCM"
\t\t\tPattern Name="D"
\t\t\t\tNote Time="0" Value="C3"
\t\t\tPatternInstance Time="0" Pattern="D"
\t\tChannel Type="VRC6Square1"
`;
