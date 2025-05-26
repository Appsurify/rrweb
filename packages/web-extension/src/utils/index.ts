import type { BrowserInfo } from '~/types';

export function isFirefox(): boolean {
  return (
    (typeof window !== 'undefined' &&
      window.navigator?.userAgent.toLowerCase().includes('firefox')) ||
    false
  );
}

export function isInCrossOriginIFrame(): boolean {
  if (window.parent !== window) {
    try {
      void window.parent.location.origin;
    } catch (error) {
      return true;
    }
  }
  return false;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export function formatTime(ms: number): string {
  if (ms <= 0) {
    return '00:00';
  }
  const hour = Math.floor(ms / HOUR);
  ms = ms % HOUR;
  const minute = Math.floor(ms / MINUTE);
  ms = ms % MINUTE;
  const second = Math.floor(ms / SECOND);
  if (hour) {
    return `${padZero(hour)}:${padZero(minute)}:${padZero(second)}`;
  }
  return `${padZero(minute)}:${padZero(second)}`;
}

function padZero(num: number, len = 2): string {
  let str = String(num);
  const threshold = Math.pow(10, len - 1);
  if (num < threshold) {
    while (String(threshold).length > str.length) {
      str = `0${num}`;
    }
  }
  return str;
}

function detectFamily(name: string): string {
  switch (name.toLowerCase()) {
    case 'chrome':
    case 'edge':
    case 'opera':
    case 'brave':
    case 'vivaldi':
      return 'chromium';
    case 'firefox':
      return 'firefox';
    case 'safari':
      return 'webkit';
    default:
      return 'unknown';
  }
}

export function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;

  let name = 'Unknown';
  let version = 'Unknown';

  if (ua.includes('Firefox/')) {
    name = 'firefox';
    version = ua.match(/Firefox\/(\d+\.\d+)/)?.[1] ?? 'Unknown';
  } else if (ua.includes('Edg/')) {
    name = 'edge';
    version = ua.match(/Edg\/(\d+\.\d+)/)?.[1] ?? 'Unknown';
  } else if (ua.includes('Chrome/')) {
    name = 'chrome';
    version = ua.match(/Chrome\/(\d+\.\d+)/)?.[1] ?? 'Unknown';
  } else if (ua.includes('Safari/') && ua.includes('Version/')) {
    name = 'safari';
    version = ua.match(/Version\/(\d+\.\d+)/)?.[1] ?? 'Unknown';
  }

  const family = detectFamily(name);

  return {
    name,
    version,
    majorVersion: version.split('.')[0],
    displayName: name[0].toUpperCase() + name.slice(1),
    family,
  };
}
