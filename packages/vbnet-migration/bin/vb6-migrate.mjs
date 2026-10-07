#!/usr/bin/env node
import {runMigrationCli} from '../lib/src/migration/cli.mjs';
runMigrationCli(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.diagnostics?JSON.stringify(error.diagnostics,null,2):error.message);process.exitCode=1;});
