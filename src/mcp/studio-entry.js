import {installStudioRendering} from '../rendering/studio.js';
import {VB6Studio, StudioAPI} from '../ide/main.js';
import {installApplicationExport} from '../ide/application-export.js';
import {installMcp} from './studio.js';
import {installAutoLayout} from '../ide/auto-layout.js';
import {installCodingAgents} from '../agents/studio.js';
if (globalThis.vb6Studio) {
  installApplicationExport(globalThis.vb6Studio, StudioAPI);
  installMcp(globalThis.vb6Studio, StudioAPI);
  installCodingAgents(globalThis.vb6Studio, StudioAPI);
  installAutoLayout(globalThis.vb6Studio);
  installStudioRendering(globalThis.vb6Studio);
}
export {installStudioRendering, installAutoLayout, VB6Studio, StudioAPI, installMcp};
