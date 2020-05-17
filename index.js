const fs = require('fs');
const yargs = require("yargs")
    .command("info [-d=device] [-f=firmware]", "Get details about a device, a firmware or both", yargs => {
        yargs
            .option("device", {
                alias: "d",
                type: "string",
                description: "Get details about a device"
            })
            .option("ipsw", {
                alias: "f",
                type: "string",
                description: "Get details about a firmware (specify it either with the Major.minor.patch format or the Build ID)"
            })
    })
    .command("list <type> [-p=number] [-s]", "Lists everything in the database of the specified type", yargs => {
        yargs
            .positional("type", {
                type: "string",
                choices: ["ipsw", "ipsw", "device", "device"],
                description: "The type of data you're trying to list"
            })
            .option("page", {
                alias: "p",
                type: "number",
                description: "The page to view"
            })
    })
    .option("help", {
        alias: "h",
        type: "boolean",
        description: "Shows this help screen"
    })
    .option("version", {
        alias: "v",
        type: "boolean",
        description: "Shows the version number and exits"
    })
    .option("identifier", {
        alias: "i",
        type: "string",
        description: "The device you're downloading the IPSW for"
    })
    .option("build", {
        alias: "b",
        type: "string",
        description: "The Build ID of the IPSW",
    })
    .option("latest", {
        alias: "l",
        type: "boolean",
        description: "Use it in place of --build to get the latest IPSW for the device."
    })
    .option("rebuild", {
        alias: "r",
        type: "boolean",
        description: "Rebuild the cache"
    });
const args = yargs.argv;
console.dir(args)
const JSDOM = require("jsdom").JSDOM;
const fetch = require('node-fetch');
const cliProgress = require('cli-progress');
const colors = require('colors');
const Table = require('cli-table');
const ora = require('ora');
const cliSpinners = require('cli-spinners');

const Device = require("./device");
const IPSW = require("./ipsw");

const chars = { 'top': '═', 'top-mid': '═', 'top-left': '╔', 'top-right': '╗', 'bottom': '═', 'bottom-mid': '═', 'bottom-left': '╚', 'bottom-right': '╝', 'left': '║', 'left-mid': '', 'mid': '', 'mid-mid': '', 'right': '║', 'right-mid': '', 'middle': ' ' }

/**
 * Downloads a file in a specified location with a nice colored progress bar.
 * 
 * @param {String} url The URL from which to download the file
 * @param {String} filename The path of the file to save
 * @param {(error: String) => void} callback Deprecated
 */
async function download(url, filename, callback) {

    const progressBar = new cliProgress.SingleBar({
        format: '[' + '{bar}'.yellow + ']' + ' {percentage}% | ETA: {eta}s | {value}/{total} bytes',
        fps: 2,
    }, cliProgress.Presets.shades_classic);

    var receivedBytes = 0;

    const res = await fetch(url);
    await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filename);
        const totalBytes = parseInt(res.headers.raw()["content-length"][0]);
        progressBar.start(totalBytes);
        res.body.pipe(fileStream);
        res.body.on("error", (err) => {
            progressBar.stop();
            console.error("There was an error!".red + "\n" + error.toString().yellow);
            fileStream.close();
            reject(err);
        });
        res.body.on("data", (chunk) => {
            receivedBytes += chunk.length;

            progressBar.update(receivedBytes);
        })
        fileStream.on("finish", function() {
            progressBar.stop();
            console.log("The file ".green + filename.yellow + " was successfully downloaded!".green);
            fileStream.close();
            resolve();
        });
    });
}

var ires;
var ibody;
var ipsws;

/**
 * Returns an array of IPSW objects
 * 
 * @param {Device} device 
 * @returns {Array.<IPSW>}
 */
async function getIPSWs(device) {
    ires = (await fetch(`https://api.ipsw.me/v4/device/${device.internalName}?type=ipsw`));
    ibody = await ires.json();
    ipsws = ibody.firmwares;
    var i = ipsws.map(fw => new IPSW(fw.buildid, device, fw.version, fw.signed));

    return i;
}

/**
 * @type {IPSW[]}
 */
var allIPSWs = [];
var spinner = ora({
    text: 'Initializing...'.cyan,
    spinner: cliSpinners.dots12,
    color: 'yellow'
}).start();

spinner.text = "Checking the cache...".cyan;

if (fs.existsSync("./ipsw.cache") && !args.rebuild) {
    try {
        var json = JSON.parse(fs.readFileSync("./ipsw.cache"));
    } catch (e) {
        return getDevicesAndEntryPoint();
    }
    // If the last time we checked the cache was more than 1 week ago, ...
    if (json.lastChecked <= Date.now() - (86400000 * 7)) {
        // ...rebuild it.
        return getDevicesAndEntryPoint();
    }
    // Else, we can keep it.
    allIPSWs = json.ipsws.map(raw => {
        return new IPSW(
            raw.build,
            new Device(raw.device),
            raw.version,
            raw.signed
        );
    });
    // Go ahead.
    entryPoint();
} else {
    // There's no cache, or the user opted to rebuild it.
    getDevicesAndEntryPoint();
}

/**
 * It's the appropriately named entry point of the program.
 */
function entryPoint() {
    // Stop the loading icon.
    spinner.succeed('Loaded all data!'.green);

    // Subcommands
    if (args._.includes("info")) {
        info(args.device, args.ipsw);
    } else if (args._.includes("list")) { // args.typqe is the --list flag
        list(args.type.endsWith("s") ? args.type.substr(0, args.type.length-1) : args.type);
    } else {
        main();
    }
}

/**
 * Writes Device+IPSW data to cache and then calls `entryPoint()`
 */
function getDevicesAndEntryPoint() {
    spinner.text = "Generating new cache...";
    // Fetch the devices, then with the data...
    getDevices().then(async devices => {
        // ...loop over the devices, ...
        for (const device of devices) {
            spinner.text = "(".cyan + (devices.indexOf(device)+1).toString().yellow + "/".cyan + devices.length.toString().yellow + ") Loading all data for device ".cyan + device.commercialName.yellow + "...".cyan;
            // ...download all the firmwares of the device...
            var ipsws = await getIPSWs(device);
            // ...and append them to the other firmwares.
            allIPSWs = allIPSWs.concat(ipsws);
        }
    
        spinner.text = "Saving cache to disk...".cyan;
        // Save the data to cache.
        fs.writeFileSync('./ipsw.cache', JSON.stringify({ipsws: allIPSWs, lastChecked: Date.now()}));
        spinner.text = "Saved cache to disk.".cyan;
    }).then(() => {
        // Now that the cache is loaded, run the program.
        entryPoint();
    }).catch(e => {
        spinner.fail("There was an error. Check your Internet connection and retry.".red + "\n" + e.toString().yellow);
    });
}

/**
 * The main interface: the IPSW downloader.
 */
async function main() {
    var device, ipsw;

    var devices = await getDevices();

    if (args.identifier && devices.map(d => d.internalName).includes(args.identifier)) {
        device = devices.filter(d => d.internalName == args.identifier)[0];
    } else {
        return printDevices(devices)
    }

    if (args.build && /^\d{0,2}[a-zA-Z]\d{0,3}$/.test(args.build) && ipsws.map(f => f.build).includes(args.build) && !args.latest) {
        ipsw = allIPSWs.filter(fw => fw.build.toUpperCase() == args.build.toUpperCase())[0];
    } else {
        var ipsws = allIPSWs.filter(fw => fw.device.internalName == device.internalName);
        if (args.latest) {
            ipsw = ipsws[0];
        } else {
            return printIPSWs(ipsws);
        }
    }

    console.log("Alright! " + `Now downloading ${`${ipsw.OS} ${ipsw.version}`.yellow} ${"for".cyan} ${`${device.commercialName}`.green}.`.cyan);

    var filename = `${ipsw.OS.replace(" ", "_")}_${ipsw.version}_${device.commercialName.split(" ").join("_")}.ipsw`;

    download(ipsw.url, filename, (err) => {
        if (err) {
            console.error("An error occurred: " + err.toString().red);
        } else {
            console.log("The file ".green + filename.yellow + " was successfully downloaded!".green);
        }
    });
}

/**
 * Get information about a particular device.
 * 
 * @param {String} device 
 * @param {String} firmware
 */
async function info(device, firmware) {
    
}

async function list(type) {
    if (type == "ipsw") {
        const ELEMENTS_PER_PAGE = Math.max(process.stdout.rows-12, 10);
        var pages = Math.ceil(allIPSWs.length/ELEMENTS_PER_PAGE);
        var page = Math.max(Math.min(args.page || 1, pages), 0);
        var from = (page-1)*ELEMENTS_PER_PAGE;

        printIPSWs(args.signed ? allIPSWs.filter(f => f.signed) : allIPSWs.slice(from, from+ELEMENTS_PER_PAGE));
        if (!args.signed) console.log("\nPage " + page.toString().yellow + " of " + pages.toString().yellow + " (" + ELEMENTS_PER_PAGE.toString().yellow + " elements per page)\n\nUse the --page=<page> flag to navigate the pages.")
    } else {
        return getDevices().then(printDevices);
    }
}

/**
 * Prints a pretty table with device information.
 * 
 * @param {Device[]} devices An array of devices
 */
var printDevices = (devices) => {
    var table = new Table({
        head: [ 'Device'.cyan, 'Identifier'.cyan],
        colWidths: [55, 20],
        chars
    });

    devices.forEach(device => {
        table.push([device.commercialName, device.internalName]);
    })

    return console.log(table.toString());
}

/**
 * Prints a pretty table of all IPSWs in the database
 * 
 * @param {IPSW[]} ipsws 
 */
function printIPSWs(ipsws) {
    var prettyVer = (f) => (`${f.OS} ${f.version}`);
    var table = new Table({
        head: ['Version'.cyan, 'Device'.cyan, 'Build ID'.cyan, 'Signed?'.cyan],
        colWidths: [ipsws.reduce((c, f) => Math.max(prettyVer(f).length + 5, c), 0), ipsws.reduce((c, f) => Math.max(f.device.commercialName.length + 5, c), 0), 10, 10],
        chars
    });

    ipsws.forEach(fw => {
        table.push([prettyVer(fw), fw.device.commercialName, fw.build, fw.signed ? "Yes".green : "No".red]);
    })

    return console.log(table.toString());
}

/**
 * Returns an array of devices.
 * 
 * @returns {Promise<Device[]>}
 */
async function getDevices() {
    var dres = await fetch("https://api.ipsw.me/v4/devices");
    var dbody = await dres.json();
    var devices = dbody
        .map(device => {
            return new Device({
                commercialName: device.name,
                internalName: device.identifier,
                platform: device.platform,
                boardConfig: device.boardConfig,
                ipsws: allIPSWs.length ? allIPSWs.filter(i => i.device.internalName == device.identifier) : null
            });
        });

    return devices;
}
