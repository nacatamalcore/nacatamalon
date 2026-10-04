/**
 * Takes a volume to `target`, in a straight line over `seconds`, or at once when there is no time.
 *
 * Whatever was scheduled on it before is dropped first, and the ramp starts from where the volume is
 * **now**, not from where the last ramp was heading: a fade-out asked for halfway through a fade-in
 * goes down from halfway, rather than jumping up to full and then going down.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rampTo = (param: AudioParam, target: number, now: number, seconds = 0): void => {
    const from = param.value;
    param.cancelScheduledValues(now);
    if (seconds <= 0) {
        param.value = target;
        return;
    }
    param.setValueAtTime(from, now);
    param.linearRampToValueAtTime(target, now + seconds);
};
