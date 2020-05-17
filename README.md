# IPSWTool

A small tool that interfaces with the ipsw.me API.

## How it works

It works by "caching" the response of the calls to the ipsw.me API (specifically, the ones to `/devices` and `/device/buildid?type=ipsw`). I said "caching" but it really is saving it to a JSON file in the script's directory. Nevertheless, it's downloaded once every week, or if the user requests so using the `--rebuild` flag.

## How to use

To use it, run `node ./index.js` without arguments. You should see a table of devices ordered by release date. Simply identify the one you need and note the identifier. You'll need it.
Next, run

```
node ./index.js -i <the ID you noted earlier>
```

This should list all the releases for that device. Now, if you just want the latest version, run:

```
node ./index.js -i <ID of device> -l
```

and it'll start downloading right away. Otherwise, if you want a specific firmware, note the Build ID and pass it to the `--build` flag, like so:

```
node ./index.js -i <ID of device> -b <build ID>
```

So, a sample call to IPSWTool would look like so:

```
node ./index.js -i iPad7,5 -b 17E262
```

## Other functions

IPSWTool also includes a `list` option and an `info` option. The `list` option works like so:

```
node ./index.js --list <ipsw|device> [-s] [-p=number]
```

where `-s` is a flag for `ipsw` to only show signed firmwares and `-p` lets you select a page number.

The info option, on the other hand, works this way:

```
node ./index.js --info <ID of device>
```

and shows you a bunch of info regarding a device.