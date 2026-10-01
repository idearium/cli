'use strict';

const print = (line) => process.stdout.write(`${line}\n`);

const program = require('commander');
const { loadConfig, reportError } = require('./lib/c');
const {
    assertKnownEnv,
    getSecretsContract,
    opRef,
    resolveIdentity,
    resolveServiceKey,
} = require('./lib/c-secrets');
const {
    assertGcloudAuth,
    assertOpSession,
    gsmPushVerified,
    opRead,
    resolveOwnerItem,
} = require('./lib/c-secrets-io');

program
    .arguments('<service> <env> <key>')
    .description(
        "Push the key's 1Password value to GSM: create the secret (with labels, pinned-global replication) if needed, add a version otherwise, and verify the readback by hash."
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

        assertOpSession();
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

        // Unbound services resolve their item lazily (reads never create);
        // the shared block resolves too but is never auto-created.
        const ref =
            resolved.opRef ||
            opRef({
                contract,
                env,
                key,
                opItem: resolveOwnerItem({
                    owner: resolved.owner,
                    title: `${contract.organisation}-${contract.name}/${resolved.owner.name}`,
                }).id,
            });

        const value = opRead({ ref });

        return gsmPushVerified({
            contract,
            env,
            id: resolved.gsmId,
            owner: resolved.owner.name,
            value,
        }).then(({ created, readbackSha, sourceSha }) =>
            print(
                `${created ? 'created' : 'version added to'} ${
                    resolved.gsmId
                } op:${sourceSha} gsm:${readbackSha} VERIFIED`
            )
        );
    })
    .catch((e) => reportError(e, false, true));
