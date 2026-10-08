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
const typedSupport: MigrationPlugin = {
  id: 'declared-support', requires: [], representationSafe: true,
  expression({node}, context) {
    if (node?.kind === 'id' && node.name === 'Pad') {
      context.requireRuntime('VbRuntime.FixedString');
      return {code: 'VbRuntime.FixedString("x", 4)', requires: ['VbRuntime.FixedString']};
    }
    return undefined;
  }
};
const nativeResult = createVbNetMigrator({plugins:[typedSupport]}).convertProject(project, {
  codeStyle: 'native', runtime: 'minimal', semanticPolicy: 'modernize', acceptedRules:['currency-decimal'],
  runtimePackage: {id:'Company.Compatibility',version:'0.2.0'}
});
const featureNames: readonly string[] | undefined = nativeResult.report.runtime?.features;
void featureNames;
