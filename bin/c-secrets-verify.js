'use strict';

const print = (line) => process.stdout.write(`${line}\n`);

const program = require('commander');
const { loadConfig, reportError } = require('./lib/c');
const { assertKnownEnv, getSecretsContract } = require('./lib/c-secrets');
const {
    assertGcloudAuth,
    assertKubectl,
    assertOpSession,
} = require('./lib/c-secrets-io');
const { kubernetesEnv, verifyEnv } = require('./lib/c-secrets-verify');

program
    .arguments('<env>')
    .description(
        'Verify an environment against the contract: GSM secrets exist and hash-match 1Password, Kubernetes Secrets (for synced services) match structure and hashes, and deployed Cloud Functions reference only contract-derived secret ids (STALE findings otherwise).'
    )
    .parse(process.argv);

const [env] = program.args;

if (!env) {
    return reportError(new Error('You need to provide <env>'), program, true);
}

return loadConfig()
    .then((config) => {
        const contract = getSecretsContract({ config });

        if (!contract) {
            throw new Error(
                'No secrets contract in c.js. See https://github.com/idearium/cli#configuration'
            );
        }

        assertOpSession();
        assertGcloudAuth();

        const kenv = kubernetesEnv({ config, env });

        if (kenv && kenv.context) {
            assertKubectl({ context: kenv.context });
        }

        assertKnownEnv({ config, env });

        return verifyEnv({ config, contract, env });
    })
    .then(({ ok, problems }) => {
        if (ok) {
            return print('\nVERIFIED');
        }

        return reportError(
            new Error(`\n${problems.length} PROBLEM(S) FOUND`),
            false,
            true
        );
    })
    .catch((e) => reportError(e, false, true));
