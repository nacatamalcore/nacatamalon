/**
 * The page names a development server answers on: Vite, Next, `bun --hot` and the like all serve on
 * one of these while a game is being made.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/**
 * Whether this page is where a game is being made rather than played: a development server on this
 * machine, or a browser driven by a test or an assistant checking its work (`navigator.webdriver`).
 *
 * @internal
 */
export const isDevelopmentPage = (
    page: { hostname: string } | undefined = globalThis.location,
    browser: { webdriver?: boolean } | undefined = globalThis.navigator,
): boolean => {
    if (browser?.webdriver === true) {
        return true;
    }
    const host = page?.hostname ?? '';
    return LOCAL_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.localhost');
};

/**
 * Whether a game with this `splash` option opens with the splash on this page: `'always'` does,
 * `true` does except while the game is being made, and anything else does not.
 *
 * @internal
 */
export const shouldShowSplash = (splash: boolean | 'always', developing: boolean = isDevelopmentPage()): boolean =>
    splash === 'always' || (splash === true && !developing);
