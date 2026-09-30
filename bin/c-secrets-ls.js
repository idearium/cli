'use strict';

const print = (line) => process.stdout.write(`${line}\n`);

const program = require('commander');
const { loadConfig, reportError } = require('./lib/c');
const {
    assertKnownEnv,
    getSecretsContract,
    serviceKeys,
} = require('./lib/c-secrets');
const { assertGcloudAuth, gsmList } = require('./lib/c-secrets-io');

program
    .arguments('<env>')
    .description(
        "List an environment's contract-derived GSM secrets and whether each exists in the project."
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

        assertGcloudAuth();
        assertKnownEnv({ config, env });

        return gsmList({ project: contract.project }).then((ids) => {
            const existing = new Set(ids);

            Object.values(contract.services)
                .concat(contract.shared ? [contract.shared] : [])
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach((service) => {
                    serviceKeys({ contract, env, service }).forEach(
                        (resolved) => {
                            print(
                                `${
                                    existing.has(resolved.gsmId)
                                        ? 'EXISTS  '
                                        : 'MISSING '
                                } ${service.name} ${resolved.key} ${
                                    resolved.gsmId
                                }`
                            );
                        }
                    );
                });

            if (env === 'local') {
                print(
                    '\nNote: local Secrets resolve 1Password references at dev time; GSM existence is only expected for function/workflow-consumed secrets.'
                );
            }

            return null;
        });
    })
    .catch((e) => reportError(e, false, true));
