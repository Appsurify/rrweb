// src/utils/injectRrwebPlayerStyle.ts
import Browser from 'webextension-polyfill';
import cssContent from '../../../rrweb-player/dist/style.css?raw';

export function injectRrwebPlayerStyle(): void {
  if (document.getElementById('rrweb-player-style')) {
    return;
  }
  const linkEl = document.createElement('link');
  linkEl.id = 'rrweb-player-style';
  linkEl.rel = 'stylesheet';
  linkEl.href = Browser.runtime.getURL('rrweb-player/dist/style.css');
  document.head.appendChild(linkEl);
}

export function injectRrwebPlayerStyleInline(): void {
  if (document.getElementById('rrweb-player-style-inline')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'rrweb-player-style-inline';
  styleEl.innerHTML = cssContent;
  document.head.appendChild(styleEl);
}
