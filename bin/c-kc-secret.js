'use strict';

const program = require('commander');
const { newline, reportError } = require('./lib/c');

program
    .arguments('<secret>')
    .option('-d', 'Decrypt the string.')
    .option('-n', 'Do not print the trailing newline character.')
    .description('Base64 encode a string ready for a Kubernetes secret.')
    .parse(process.argv);

const [secret] = program.args;

if (!secret) {
    return reportError(
        new Error('You need to provide a secret'),
        program,
        true
    );
}

const decoded = secret.toString('base64');
const encoded = Buffer.from(secret).toString('base64');

const cmd = program.D ? decoded : encoded;

process.stdout.write(`${cmd}${newline(program.N)}`);
