import type { TFrameContext } from '../../render';

/**
 * Creates the frame context a game reuses every frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createFrameContext = (): TFrameContext => ({ passes: [{}], time: 0, progress: 0, phase: 0 });
