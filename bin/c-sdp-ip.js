'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { newline, reportError } = require('./lib/c');

program
    .option('-n', 'Do not print the trailing newline character.')
    .parse(process.argv);

exec('c mk ip -p section', { silent: true }, (err, stdout) => {
    if (err) {
        return reportError(err, false, true);
    }

    process.stdout.write(
        `${stdout.replace(/\n/, '', 'g')}${newline(program.N)}`
    );
});
