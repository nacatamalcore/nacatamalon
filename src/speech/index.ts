/**
 * The engine's synthetic voice: words spoken and sung, made sample by sample rather than recorded,
 * the way the machines of the eighties talked.
 *
 * A throat buzzes at a pitch and a mouth shapes it, formant by formant, into vowels; noise beside it
 * makes the s and the sh; the nose, the stops and the trills are built from the same pieces. Text is
 * read by the rules of its language, and anything can be written as phonemes instead. What comes
 * out is a sound a game plays like any other, with `useSound`.
 *
 * A song can be sung, too: its voice written apart in a `.vocal` file and sung over a `.song` with
 * `accompany`, made as it plays, at the song's tempo and in its key.
 *
 * It is the door `nacatamalon/speech`, apart from the front one so that a game that never speaks
 * carries none of it.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export { renderSpeech } from './render_speech';
export { renderSinging } from './render_singing';
export { textToPhonemes } from './text_to_phonemes';
export { accompany } from './accompany';
export { lyricsAt } from './lyrics_at';
export { useLoadVocal } from './use_load_vocal';
export { parseVocalDoc, VOCAL_FORMAT } from './parse_vocal_doc';
export type { TSpeechLanguage, TSpeechVoice, TSpeechOptions, TSungNote, TSungSound, TSingingOptions } from './types/t_speech';
export type { TVocalDoc, TVocalFile, TVocalLine, TVocalSinger, TLyricsAt } from './types/t_vocal';
export type { TAccompanyOptions } from './accompany';
export type { TUseLoadVocalOptions } from './use_load_vocal';
