#!/usr/bin/env node
import {runMigrationCli} from '../src/migration/cli.mjs';
runMigrationCli(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(error=>{
  console.error(error.diagnostics?JSON.stringify({success:false,diagnostics:error.diagnostics},null,2):error.code==='EEXIST'?'Output already exists. Nothing was overwritten.':error.message);
  process.exitCode=1;
});
