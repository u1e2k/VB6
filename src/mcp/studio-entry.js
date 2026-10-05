import {installStudioRendering} from '../rendering/studio.js';
import {VB6Studio, StudioAPI} from '../ide/main.js';
import {installMcp} from './studio.js';
if (globalThis.vb6Studio) installMcp(globalThis.vb6Studio, StudioAPI);
if (globalThis.vb6Studio) installStudioRendering(globalThis.vb6Studio);
export {installStudioRendering, VB6Studio, StudioAPI, installMcp};
