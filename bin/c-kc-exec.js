'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program.arguments('<location>').arguments('[command]').parse(process.argv);

const [location, command] = program.args;

if (!location) {
    return reportError(new Error('Please provide a location'), program);
}

if (!command) {
    return reportError(new Error('Please provide a command'), program);
}

// Update the command to be all extra arguments
const fullCommand = [].concat(program.args);

fullCommand.splice(0, 1);

spawn(`c kc cmd exec $(c kc pod ${location}) -it -- ${fullCommand.join(' ')}`, {
    shell: true,
    stdio: 'inherit',
});
