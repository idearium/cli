# @idearium/cli

The Idearium cli, which makes working with our projects, super easy :)

## Documentation

The cli is self documenting and you'll find limited information about the commands within the cli here.

## Install

Via NPM:

```
$ npm install -DE [-g] @idearium/cli
```

We actually recommend installing `@idearium/cli` locally in your project. This allows each project to use a different version of the cli. If you do however, we also recommend adding `./node_modules/.bin` to your path, so that you can run the cli via `c` without a global install.

## Usage

Once installed, simply run `c`, and you'll get the help output for all commands. Running a sub-command and then `--help` will give you the help output for that command (i.e. `c dc --help`).

## Commands

The following is a summary of the top level commands.

- `c d` is for everything Docker.
- `c dc` is for everything Docker Compose.
- `c hosts` helps with hosts management.
- `c mk` is for everything Minikube.
- `c npm` is for everything NPM.
- `c project` is for project nanagement.
- `c yarn` is for everything is for everything Yarn.

## Configuration

The Idearium cli can be customised through configurations. Configurations are provided through a `c.json` file located in projects root folder.

### NPM configuration

The Idearium cli supports an NPM configuration. The configuration can be used to provide the cli without information about where NPM commands can be run. To provide this information, add an `npm` property in `c.json` like so:

```
{
    "npm": {
        "locations": {
            "name": "./app/root/app/",
            "project": "./"
        }
    }
}
```

You should customise it, but you need to provide a `locations` key, containing an object with a name and folder for each NPM location in your project. You'll use the name to reference the location.

For example, the `c npm proxy` command can be used to run a NPM command, at a specific location or all locations:

- Execute `c npm proxy all install -SE logentries` to install the `logentries` module at all NPM locations in your project.
- Execute `c npm proxy project install -DE jest` to install the `jest` module at the `project` location in your project.

## State

The Idearium cli, understands the concept of state. The only state it manages at present is the environment of your project. The current environment of your project will be used in certain commands, but not all commands.

State is stored in a JSON file at `./devops/state.json`, and is created and written to by the `c project env set` and `c project setup` commands.
