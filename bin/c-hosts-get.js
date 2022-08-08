'use strict';

const program = require('commander');
const hostile = require('hostile');
const { newline, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('<value>')
    .option('-n', 'Do not print the trailing newline character.')
    .option('-l', 'Return the last result only.')
    .description(
        'Search /etc/hosts for an IP or a domain. Searching for an IP will return the matching domain. Searching for a domain will return the matching IP.'
    )
    .parse(process.argv);

const [value] = program.args;
let found = false;

if (!value) {
    return reportError(new Error('You must pass the value argument.'), program);
}

/**
 * If a match is found, report it and record the match.
 * @param {String} result Either an ip, or a host.
 * @returns {void}
 */
const reportFound = (result) => {
    found = true;

    process.stdout.write(`${result}${newline(program.N)}`);
};

// Create the record
hostile.get(false, (err, lines) => {
    if (err) {
        return reportError(err);
    }

    const regexp = new RegExp(value);
    const matchingLines = lines.filter(
        ([ip, hosts]) => ip === value || regexp.test(hosts)
    );
    const linesToReport = program.L
        ? [matchingLines[matchingLines.length - 1]]
        : matchingLines;

    linesToReport.forEach(([ip, hosts]) => {
        if (ip === value) {
            return reportFound(hosts);
        }

        if (regexp.test(hosts)) {
            return reportFound(ip);
        }
    });

    if (!found) {
        // eslint-disable-next-line no-process-exit
        process.exit(1);
    }
});
