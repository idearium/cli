'use strict';

const print = (line) => process.stdout.write(`${line}\n`);

const { readFileSync, writeFileSync } = require('fs');

const program = require('commander');
const { loadConfig, reportError } = require('./lib/c');
const {
    assertKnownEnv,
    getSecretsContract,
    gsmId,
    resolveIdentity,
} = require('./lib/c-secrets');
const {
    addKeyToServiceInCjs,
    assertGcloudAuth,
    assertOpSession,
    cjsPath,
    generateValueForProgram,
    gsmDelete,
    gsmPushVerified,
    opUpsertField,
    registerServiceInCjs,
    resolveOwnerItem,
    setOpItemInCjs,
} = require('./lib/c-secrets-io');

program
    .arguments('<service> <env> <key>')
    .option('-g, --generate', 'Generate a value instead of reading stdin.')
    .option(
        '-t [type]',
        'Value type for --generate: hex, base64, alphanumeric.'
    )
    .option('-l [length]', 'Value length for --generate.')
    .description(
        'Add a key end to end, in order: 1Password, GSM (created with labels if missing, verified by hash), then the c.js contract (re-validated after the edit). Rolls back what it can on failure. Never touches the cluster.'
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

const readStdin = () => {
    if (process.stdin.isTTY) {
        throw new Error(
            'Pipe the value via stdin (printf "value" | ...) or use --generate.'
        );
    }

    return readFileSync(0, 'utf8').replace(/\r?\n$/, '');
};

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

        const value = program.generate
            ? generateValueForProgram({ program })
            : readStdin();

        const backup = readFileSync(cjsPath(), 'utf8');

        let id;
        let binding = { created: false, id: null, persisted: false };
        let borrowedKey = false;
        let isNewService = false;
        let item;
        let ownerName;
        let section;

        // Step 1: 1Password - upsert the field; unbound services resolve
        // (or create) their item and persist the binding.
        try {
            const identity = resolveIdentity({ contract, env, name });

            if (identity.kind !== 'service') {
                throw new Error(
                    `Dev consumers have no GSM presence ('${name}') - use \`c op set\`.`
                );
            }

            const { service } = identity;
            const borrowed = service.sharedKeys.find(
                (shared) => shared.key === key
            );
            borrowedKey = Boolean(borrowed);
            const known = service.keys.includes(key) || borrowed;

            ownerName = (borrowed || {}).owner
                ? borrowed.owner.name
                : service.name;

            binding = resolveOwnerItem({
                owner: borrowed ? borrowed.owner : service,
                title: `${contract.organisation}-${contract.name}/${ownerName}`,
            });

            if (binding.persisted) {
                setOpItemInCjs({ name: ownerName, opItem: binding.id });
            }

            item = binding.id;
            section = env;

            id = known
                ? gsmId({
                      contract,
                      env,
                      key,
                      owner: borrowed ? borrowed.owner : service,
                  })
                : gsmId({ contract, env, key, owner: service });
        } catch (e) {
            if (!e.message.includes('No service or dev consumer')) {
                throw e;
            }

            if (!/^[a-z][a-z0-9-]*$/.test(name)) {
                throw new Error(
                    `New service names must be kebab-case ('${name}')`
                );
            }

            if (name === 'shared') {
                throw new Error(
                    "'shared' is reserved for the secrets.shared block - add the key there instead"
                );
            }

            binding = resolveOwnerItem({
                owner: null,
                title: `${contract.organisation}-${contract.name}/${name}`,
            });

            item = binding.id;
            id = gsmId({
                contract,
                env,
                key,
                owner: { name },
            });
            isNewService = true;
            ownerName = name;
            section = env;
        }

        opUpsertField({ field: key, item, section, value });

        // Step 2: GSM - create (with labels) if missing, add a version,
        // verify the readback by hash.
        return gsmPushVerified({
            contract,
            env,
            id,
            owner: ownerName,
            value,
        }).then(({ created, readbackSha, sourceSha }) => {
            const gsmSummary = `${
                created ? 'created' : 'version added to'
            } ${id} op:${sourceSha} gsm:${readbackSha} VERIFIED`;

            // Step 3: c.js - register (a new service, or a new owned key;
            // a borrowed key is already declared by its owner), then
            // re-load and re-validate.
            try {
                if (isNewService) {
                    registerServiceInCjs({ key, name, opItem: item });
                }

                if (!isNewService && !borrowedKey) {
                    addKeyToServiceInCjs({ key, name });
                }

                delete require.cache[require.resolve(cjsPath())];

                const fresh = getSecretsContract({
                    config: require(cjsPath()),
                });
                const freshService =
                    name === 'shared' ? fresh.shared : fresh.services[name];

                if (!freshService) {
                    throw new Error(
                        `service '${name}' missing from the edited contract`
                    );
                }

                const owned = freshService.keys.includes(key);
                const borrowedFresh = freshService.sharedKeys.find(
                    (shared) => shared.key === key
                );

                if (!owned && !borrowedFresh) {
                    throw new Error(
                        `key '${key}' not resolvable in the edited contract`
                    );
                }

                const freshId = gsmId({
                    contract: fresh,
                    env,
                    key,
                    owner: borrowedFresh ? borrowedFresh.owner : freshService,
                });

                if (freshId !== id) {
                    throw new Error(
                        `edited contract derives '${freshId}', expected '${id}'`
                    );
                }
            } catch (e) {
                writeFileSync(cjsPath(), backup);

                const rollback = created
                    ? `; GSM secret ${id} deleted`
                    : `; GSM version for ${id} left in place`;

                const orphans = created
                    ? gsmDelete({ id, project: contract.project }).then(
                          () => '',
                          () =>
                              ' (WARNING: deleting the created GSM secret failed - delete it manually)'
                      )
                    : Promise.resolve('');

                return orphans.then((warning) => {
                    throw new Error(
                        `Rolled back c.js (edit failed: ${e.message})${rollback}. The 1Password field remains - re-run to complete.${warning}`
                    );
                });
            }

            const opSummary = binding.created
                ? `1Password item ${contract.organisation}-${contract.name}/${ownerName} created (${item}); field ${section}/${key} upserted`
                : `1Password ${item}/${section}/${key} upserted${
                      binding.persisted ? `; item bound into c.js` : ''
                  }`;

            let cjsSummary = 'c.js key registered';

            if (isNewService) {
                cjsSummary = 'c.js service registered';
            }

            if (borrowedKey) {
                cjsSummary =
                    'borrowed key - the owner already declares it in c.js';
            }

            return print(`${opSummary}; ${gsmSummary}; ${cjsSummary}`);
        });
    })
    .catch((e) => reportError(e, false, true));
