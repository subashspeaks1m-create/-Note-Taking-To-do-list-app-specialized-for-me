import { useId, useMemo } from 'react';
import { useReducedMotion } from '../../app/displayPrefs';
import { Icon } from '../Icon';
import { LIVE_ICONS, type LiveIconName } from './liveIcons';

/**
 * An icon that draws itself (line-md, MIT). Change `play` to replay the
 * drawing: a new key remounts the <svg>, which restarts its SMIL timeline.
 * With reduced motion it falls back to the matching static icon.
 */
export function LiveIcon({ name, size = 22, play = 0 }: { name: LiveIconName; size?: number; play?: number | string }) {
  const reduced = useReducedMotion();
  // Masks inside the icons carry fixed ids; scope them so two copies (rail and bottom bar) never clash.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const body = useMemo(() => LIVE_ICONS[name].replace(/id="([^"]+)"/g, `id="$1-${uid}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-${uid})`), [name, uid]);
  if (reduced) return <Icon name={name} size={size} />;
  return (
    <svg
      key={play}
      className={`live-icon live-icon--${name}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      // Static, build-time icon data from the bundled pack; never user input.
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
