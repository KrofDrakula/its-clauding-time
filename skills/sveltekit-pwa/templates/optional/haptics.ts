// Short vibrations that make presses feel physical. Only some browsers vibrate
// (Android Chrome); iOS Safari has no Vibration API, so these do nothing there.

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined') navigator.vibrate?.(pattern);
};

/** A key going down. */
export const tap = () => vibrate(8);
/** A firmer press: start, pause, a drag being picked up. */
export const press = () => vibrate(15);
/** A wheel or drag passing one notch. */
export const notch = () => vibrate(3);
/** An edit that was refused. */
export const deny = () => vibrate([20, 40, 20]);
