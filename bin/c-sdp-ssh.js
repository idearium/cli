'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');
const { reportError } = require('./lib/c');

program
    .allowExcessArguments(true)
    .allowUnknownOption(true)
    .arguments('<cmd...>')
    .description(
        "Provide the command to run on the minikube instance for Section's devpop."
    )
    .parse(process.argv);

const cmd = program.args.join(' ');

if (!cmd) {
    return reportError(new Error('You must pass the cmd argument.'), program);
}

// Use "" to stop the arguments being altered
exec(`c mk ssh -p section "${cmd}"`);
