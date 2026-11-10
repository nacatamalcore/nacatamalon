/**
 * The retro half of physics for NacatamalOn: bodies that never turn, moved in pixels a fixed step at
 * a time and stopped against each other axis by axis, the way the old games did. Nothing to load,
 * and the same result on every machine.
 *
 * **The engine keeps the format and this moves it**, as for the full simulation: a scene declares a
 * `retro-world-2d` on its root and `retro-body-2d` on its objects (`useRetroWorld2d`,
 * `useRetroBody2d`), and installing this is what makes them move. It can be installed beside the
 * full simulation; each scene is moved by the kind of world it declares.
 *
 * It is the door `nacatamalon/retro-physics2d`.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export {
    installRetroPhysics2d, retroPhysics2dProvider, getRetroBody2d, castRetroRay2d, findRetroBodies2d, isRetroAreaFree2d,
} from './provider';
export type {
    TRetroBodyHandle2d, TRetroBlocked, TRetroTouching, TRetroSide, TRetroContact2d, TRetroTileTouch2d, TRetroArea2d,
    TRetroAreaOptions2d, TRetroTarget, TRetroRayHit2d, TRetroRayOptions2d,
} from './types';
