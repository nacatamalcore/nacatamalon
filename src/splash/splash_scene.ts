import { getColor } from '../color/get_color';
import type { TColor } from '../color';
import { createSprite } from '../gameobjects/sprite/create_sprite';
import { createText } from '../gameobjects/text/create_text';
import { screenSizeOf } from '../DOM/screen_size';
import { useCamera2d } from '../hooks/camera/use_camera_2d';
import { useLoadTexture } from '../hooks/loaders/use_load_texture';
import { useSceneUnmount } from '../hooks/scene/use_scene_unmount';
import { useTween } from '../hooks/tween/use_tween';
import { useUpdate } from '../hooks/loop/use_update';
import { easeOutBack } from '../math/easing/functions/ease_out_back';
import { easeOutCubic } from '../math/easing/functions/ease_out_cubic';
import { createScene } from '../scene/create_scene';
import type { TSceneFn } from '../scene';
import { SPLASH_MARK, SPLASH_MARK_HEIGHT, SPLASH_MARK_WIDTH } from './splash_mark';

/**
 * The splash's colours: the website's near-black violet, the halo behind the N, and the logo's bone
 * and orange for the name.
 */
export const SPLASH_BACKGROUND = '#0b0710';
const HALO = '#2a1650';
const BONE = '#ede6f5';
const ORANGE = '#ff6b1a';
const MUTED = '#8c82a6';

/**
 * When each part arrives, in seconds from the start, and when the splash has said everything. It
 * is kept short on purpose: a splash a player sits through every time is the first thing anybody
 * complains about.
 */
const MARK_AT = 0.15;
const MARK_FOR = 0.5;
const MADE_WITH_AT = 0.55;
const NAME_AT = 0.65;
const NAME_FOR = 0.4;
const DONE_AT = 1.6;

/**
 * Every character of the engine's default font is 8 pixels wide with 1 pixel between them, both
 * times the text's scale: the name can be split into two colours without measuring anything.
 */
const GLYPH_ADVANCE = 9;

/**
 * A soft round glow, drawn once on a 2D canvas: the halo the website puts behind the logo. Null
 * where there is no canvas to draw it on, and the splash goes without.
 */
const haloImage = (): string | null => {
    if (typeof document === 'undefined') {
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context === null) {
        return null;
    }
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, HALO);
    gradient.addColorStop(1, 'rgba(42, 22, 80, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return canvas.toDataURL('image/png');
};

const withAlpha = (color: TColor, a: number): TColor => ({
    ...color,
    a,
});

/**
 * Whether the player asked their system for less motion: then everything is simply there, with
 * nothing growing or sliding in.
 */
const prefersStill = (): boolean =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The scene that says "Made with NacatamalOn" before the game: the N grows in, the name slides in
 * beside "Made with", and it is over in under two seconds. A key or a click ends it early.
 *
 * Everything is placed from the size the canvas really has, not the one the game asked for: with a
 * free side (`keep: 'none'`, `'width'` or `'height'`) the two differ, and a splash laid out in the
 * asked-for size would sit in a corner of the screen. It reads the same in a 320 x 240 game and in
 * a full-HD one. `done` is called once, when it has finished or been skipped; what comes after it is
 * not this scene's business.
 *
 * @internal
 */
export const createSplashScene = (canvas: HTMLCanvasElement, done: () => void): TSceneFn => () => {
    const { width, height } = screenSizeOf(canvas);
    const still = prefersStill();
    const tween = useTween();
    const bone = getColor(BONE);
    const orange = getColor(ORANGE);
    const muted = getColor(MUTED);

    // The name, in whole multiples of the font so it stays crisp: as wide as half the game, and
    // never taller than a tenth of it.
    const scale = Math.max(1, Math.min(Math.floor((width * 0.5) / (11 * GLYPH_ADVANCE)), Math.floor((height * 0.1) / 8)));
    const smallScale = Math.max(1, Math.round(scale / 2));
    const markHeight = Math.round(Math.min(height * 0.42, width * 0.35));
    const markWidth = Math.round((markHeight * SPLASH_MARK_WIDTH) / SPLASH_MARK_HEIGHT);

    // The block, centred: the N, a gap, "Made with", a smaller gap, the name.
    const gap = Math.round(height * 0.05);
    const nameHeight = 8 * scale;
    const smallHeight = 8 * smallScale;
    const blockHeight = markHeight + gap + smallHeight + Math.round(smallHeight * 0.6) + nameHeight;
    const top = Math.round((height - blockHeight) / 2);
    const markY = top + markHeight / 2;
    const madeWithY = top + markHeight + gap;
    const nameY = madeWithY + smallHeight + Math.round(smallHeight * 0.6);

    const background = createSprite({
        width,
        height,
        tint: getColor(SPLASH_BACKGROUND),
        transform: {
            x: width / 2,
            y: height / 2,
        },
        zIndex: 0,
    });

    const halo = haloImage();
    if (halo !== null) {
        createSprite({
            texture: useLoadTexture({
                src: halo,
                key: 'nacatamalon:splash-halo',
            }),
            width: markHeight * 2.4,
            height: markHeight * 2.4,
            smooth: true,
            transform: {
                x: width / 2,
                y: markY,
            },
            zIndex: 1,
        });
    }

    const mark = createSprite({
        texture: useLoadTexture({
            src: SPLASH_MARK,
            key: 'nacatamalon:splash-mark',
        }),
        width: markWidth,
        height: markHeight,
        // The N is a drawing, not pixel art: scaled smoothly whatever the game's own setting.
        smooth: true,
        // White, so the picture keeps its own colours and only its alpha changes.
        tint: withAlpha(getColor('#ffffff'), still ? 1 : 0),
        transform: {
            x: width / 2,
            y: markY,
        },
        zIndex: 2,
    });

    const madeWith = createText({
        text: 'Made with',
        style: {
            fontSize: smallHeight,
        },
        tint: withAlpha(muted, still ? 1 : 0),
        anchor: {
            x: 0.5,
            y: 0,
        },
        transform: {
            x: width / 2,
            y: madeWithY,
        },
        zIndex: 3,
    });

    // "Nacatamal" and "On", two texts so "On" can be orange as in the logo. Monospaced, so where
    // one ends is nine characters along.
    const nameWidth = 11 * GLYPH_ADVANCE * scale - scale;
    const nameX = Math.round(width / 2 - nameWidth / 2);
    const slide = still ? 0 : Math.round(width * 0.08);
    const nacatamal = createText({
        text: 'Nacatamal',
        style: {
            fontSize: nameHeight,
        },
        tint: withAlpha(bone, still ? 1 : 0),
        transform: {
            x: nameX + slide,
            y: nameY,
        },
        zIndex: 3,
    });
    const on = createText({
        text: 'On',
        style: {
            fontSize: nameHeight,
        },
        tint: withAlpha(orange, still ? 1 : 0),
        transform: {
            x: nameX + 9 * GLYPH_ADVANCE * scale + slide,
            y: nameY,
        },
        zIndex: 3,
    });

    if (!still) {
        tween({
            from: 0,
            to: 1,
            duration: MARK_FOR,
            delay: MARK_AT,
            ease: easeOutBack,
            onUpdate: (t) => {
                const size = 0.2 + 0.8 * t;
                mark.width = markWidth * size;
                mark.height = markHeight * size;
                mark.tint = withAlpha(mark.tint, Math.min(1, t * 1.6));
            },
        });
        tween({
            from: 0,
            to: 1,
            duration: 0.3,
            delay: MADE_WITH_AT,
            onUpdate: (t) => {
                madeWith.tint = withAlpha(muted, t);
            },
        });
        tween({
            from: 0,
            to: 1,
            duration: NAME_FOR,
            delay: NAME_AT,
            ease: easeOutCubic,
            onUpdate: (t) => {
                const offset = slide * (1 - t);
                nacatamal.transform.x = nameX + offset;
                on.transform.x = nameX + 9 * GLYPH_ADVANCE * scale + offset;
                nacatamal.tint = withAlpha(bone, t);
                on.tint = withAlpha(orange, t);
            },
        });
    }

    // Over when its time is up, or straight away on a key or a click. Listened to on the page
    // rather than through the game's input, which the game has not been told about yet and should
    // not see as its first key press.
    let finished = false;
    const finish = (): void => {
        if (finished) {
            return;
        }
        finished = true;
        done();
    };
    // The canvas can still change size while the splash is up (the window being resized, a free
    // side settling). Laying it all out again would fight the tweens, so the camera keeps the
    // block in the middle instead, and the background is stretched to cover the new size.
    const camera = useCamera2d();
    useUpdate((_delta, time) => {
        const now = screenSizeOf(canvas);
        camera.transform.x = Math.round((width - now.width) / 2);
        camera.transform.y = Math.round((height - now.height) / 2);
        background.width = now.width;
        background.height = now.height;
        if (time >= DONE_AT) {
            finish();
        }
    });
    globalThis.addEventListener?.('keydown', finish);
    canvas.addEventListener('pointerdown', finish);
    useSceneUnmount(() => {
        globalThis.removeEventListener?.('keydown', finish);
        canvas.removeEventListener('pointerdown', finish);
    });

    return createScene();
};
