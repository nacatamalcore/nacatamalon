/**
 * Where a path written *inside* an asset file actually points.
 *
 * A `.atlas` names its image and a `.tilemap` names its sheet, and both write that name relative to
 * themselves, not to the page: a map and its sheet live next to each other, and moving the pair has
 * to keep working. So the answer is worked out from the file that named it, never from wherever the
 * game happens to be running.
 *
 * Two things this has to get right at once, and they pull in opposite directions:
 *
 * - **The page may be served from a subdirectory.** A game published to a host that puts it under
 *   `/html/1234/` asks for its files from there, so the answer has to keep that piece. Resolving
 *   against a made-up root would drop it and every sheet would come back a 404, with nothing in the
 *   console to say why: the map loads, the image does not.
 * - **There may be no page at all.** Under a test runner there is no `location`, and reading it
 *   would throw before the first assertion. A made-up root is fine there, because with every path
 *   absolute the root cancels out anyway.
 *
 * Hence: the page when there is one, a stand-in when there is not, read at every call rather than
 * once when this module loads, so a test that sets up a fake page afterwards still gets it. What
 * comes back is a path and not a host, **unless the file that named it came from another host**:
 * then it is the whole address. An editor serves a project's files from a server of its own, and a
 * bare path there sent a model's `.bin` to the page's host, which answered with its own HTML page
 * and a 200, read as vertices.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resolveAssetPath = (fromSrc: string, path: string): string => {
    const page = typeof location === 'undefined' ? 'http://nacatamalon.local/' : location.href;
    const url = new URL(path, new URL(fromSrc, page));
    return url.origin === new URL(page).origin ? url.pathname + url.search : url.href;
};
