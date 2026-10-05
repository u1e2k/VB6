import {installStudioRendering} from '../rendering/studio.js';
import {VB6Studio, StudioAPI} from '../ide/main.js';
import {installMcp} from './studio.js';
import {installCodingAgents} from '../agents/studio.js';
if (globalThis.vb6Studio) {
  installMcp(globalThis.vb6Studio, StudioAPI);
  installCodingAgents(globalThis.vb6Studio, StudioAPI);
  installStudioRendering(globalThis.vb6Studio);
}
export {installStudioRendering, VB6Studio, StudioAPI, installMcp};
