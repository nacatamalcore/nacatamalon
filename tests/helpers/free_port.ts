/**
 * A port nothing is listening on now, chosen by the system rather than guessed: a guessed one may
 * already be taken, and the test would fail for a reason that is not the engine's.
 */
export const freePort = (): number => {
    const probe = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = probe.port!;
    probe.stop(true);
    return port;
};
