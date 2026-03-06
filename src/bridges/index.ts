/**
 * Bridges - Exporta todos os bridges de comunicação
 */

export { BrowserBridge } from './browserBridge.js';
export type { DomElement, ActionResult } from './browserBridge.js';

export { DesktopBridge } from './desktopBridge.js';
export type { DesktopAction, DesktopResult } from './desktopBridge.js';
