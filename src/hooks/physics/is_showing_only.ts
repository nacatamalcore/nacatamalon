import { getActiveGame } from '../../store';

/**
 * Whether the scene being built is being shown rather than played (`sceneFromDoc` with
 * `scripts: 'attach'`, which is what an editor's viewport does).
 *
 * A scene shown that way keeps every collider and world it declares, written down so it saves, and
 * hands none of them to what simulates: nothing in it may move from where it was put, and a body
 * falling is something moving. It matters because what simulates is installed for the whole page,
 * so a play window running beside the viewport would otherwise make the scene being edited fall.
 */
export const isShowingOnly = (): boolean => getActiveGame()?.get('world').buildScripts === 'attach';
