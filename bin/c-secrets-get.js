'use strict';

const print = (line) => process.stdout.write(`${line}\n`);

const program = require('commander');
const { loadConfig, newline, reportError } = require('./lib/c');
const {
    assertKnownEnv,
    getSecretsContract,
    resolveIdentity,
    resolveServiceKey,
} = require('./lib/c-secrets');
const {
    assertGcloudAuth,
    gsmRead,
    guardPlaintext,
    sha12,
} = require('./lib/c-secrets-io');

program
    .arguments('<service> <env> <key>')
    .option(
        '-f, --force',
        'Allow plaintext outside a personal terminal (discouraged).'
    )
    .option('-n', 'Do not print the trailing newline character.')
    .option('-p, --plaintext', 'Print the value itself instead of its hash.')
    .description(
        'Get a GSM secret value summary: a truncated sha256, the secret id and the length. Values are never displayed unless --plaintext is used.'
    )
    .parse(process.argv);

const [name, env, key] = program.args;

if (!name || !env || !key) {
    return reportError(
        new Error('You need to provide <service> <env> <key>'),
        program,
        true
    );
}

return loadConfig()
    .then((config) => {
        const contract = getSecretsContract({ config });

        if (!contract) {
            throw new Error(
                'No secrets contract in c.js. See https://github.com/idearium/cli#configuration'
            );
        }

        assertGcloudAuth();
        assertKnownEnv({ config, env });

        const identity = resolveIdentity({ contract, env, name });

        if (identity.kind !== 'service') {
            throw new Error(
                `Dev consumers have no GSM presence ('${name}') - use \`c op\`.`
            );
        }

        const resolved = resolveServiceKey({
            contract,
            env,
            key,
            service: identity.service,
        });

        return gsmRead({
            id: resolved.gsmId,
            project: contract.project,
        }).then((value) => {
            if (program.plaintext) {
                guardPlaintext({ force: program.force });

                return process.stdout.write(
                    `${value.toString('utf8')}${newline(program.N)}`
                );
            }

            return print(
                `${sha12({ value })} ${resolved.gsmId} len=${value.length}`
            );
        });
    })
    .catch((e) => reportError(e, false, true));
