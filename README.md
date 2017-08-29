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

- `c dc` is for everything Docker Compose.
