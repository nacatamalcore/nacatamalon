/**
 * The engine's synthetic voice: words spoken and sung, made sample by sample rather than recorded,
 * the way the machines of the eighties talked.
 *
 * A throat buzzes at a pitch and a mouth shapes it, formant by formant, into vowels; noise beside it
 * makes the s and the sh; the nose, the stops and the trills are built from the same pieces. Text is
 * read by the rules of its language, and anything can be written as phonemes instead. What comes
 * out is a sound a game plays like any other, with `useSound`.
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
export type { TSpeechLanguage, TSpeechVoice, TSpeechOptions, TSungNote, TSungSound, TSingingOptions } from './types/t_speech';
