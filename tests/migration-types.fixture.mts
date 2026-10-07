import {createVbNetMigrator, type MigrationPlugin, type MigrationExpression, type VB6Project} from '../packages/vbnet-migration/index.js';
import {parseMigrationArguments, runMigrationCli} from '../packages/vbnet-migration/cli.js';
const extension: MigrationPlugin = {
  id: 'typed-company-version',
  expression({node}) {
    if (node?.kind === 'id' && node.name.toLowerCase() === 'companyversion') return '"2026.10"';
    return undefined;
  },
  finalize(_files, context) { context.addFile?.('Company/notice.txt', 'Reviewed adapter'); }
};
const project: VB6Project = {name:'Typed',modules:[{name:'Program',kind:'module',code:'Public Sub Main()\nEnd Sub'}]};
const result = createVbNetMigrator({plugins:[extension]}).exportProject(project,{platform:'AnyCPU'});
const bytes: Uint8Array = result.bytes;
const node: MigrationExpression = {kind:'binary',op:'+',left:{kind:'literal',value:1},right:{kind:'id',name:'value'}};
const args = parseMigrationArguments(['--help']);
void runMigrationCli(['--help'], {stdout(message) { const text: string = message; void text; }});
void [bytes,node,args];
