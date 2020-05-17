var ArgumentParser = require('argparse').ArgumentParser;
var parser = new ArgumentParser({
    version: '0.0.2',
    addHelp: true,
    description: 'IPSWTool – A tool for downloading IPSWs from ipsw.me'
})
parser.addArgument(
    ["-i", '--identifier'],
    {
        help: 'The device you\'re downloading an IPSW for.',
        metavar: "iDeviceX,X"
    }
);
parser.addArgument(
    ["-b", '--build'],
    {
        help: 'The build number of the IPSW you\'re downloading.',
        metavar: "00A000"
    }
);
parser.addArgument(
    ["-l", '--latest'],
    {
        help: 'Use it in place of --build to get the latest IPSW for the device.',
        action: "storeTrue"
    }
);
parser.addArgument(
    ["-d", '--device'],
    {
        help: 'The internal name of a device.',
        metavar: "iDeviceX,X"
    }
);
parser.addArgument(
    ["-f", '--ipsw'],
    {
        help: 'Either the major.minor.patch version or the build number of a firmware.',
        metavar: "iDeviceX,X"
    }
);
parser.addArgument(
    ["-r", '--rebuild'],
    {
        help: 'Rebuilds the IPSW cache.',
        action: "storeTrue"
    }
);

// List
parser.addArgument(
    ["--list"],
    {
        help: 'List something',
        action: "store",
        dest: "type",
        choices: ["ipsw", "ipsws", "device", "devices"]
    }
);
parser.addArgument(
    ["-p", "--page"],
    {
        help: 'Page for the "ipsw" type.',
        action: "store",
        type: "int"
    }
);
parser.addArgument(
    ["-s", "--signed"],
    {
        help: 'If the type is "ipsw", it only shows signed firmwares',
        action: "storeTrue"
    }
);
const args = parser.parseArgs();

const JSDOM = require("jsdom").JSDOM;
const fetch = require('node-fetch');
const fs = require('fs');
const cliProgress = require('cli-progress');
const colors = require('colors');
const Table = require('cli-table');
const ora = require('ora');
const cliSpinners = require('cli-spinners');

const Device = require("./device");
const IPSW = require("./ipsw");

const chars = { 'top': '═', 'top-mid': '═', 'top-left': '╔', 'top-right': '╗', 'bottom': '═', 'bottom-mid': '═', 'bottom-left': '╚', 'bottom-right': '╝', 'left': '║', 'left-mid': '', 'mid': '', 'mid-mid': '', 'right': '║', 'right-mid': '', 'middle': ' ' }

function secondsToHms(s) {
    var hours = (((s - s % 3600) / 3600) % 60).toString().padStart(2, '0')
    var minutes = (((s - s % 60) / 60) % 60).toString().padStart(2, '0')
    var seconds = (s % 60).toString().padStart(2, '0')

    return `${hours}:${minutes}:${seconds}`
}

async function download(url, filename, callback, onFinish) {

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
    if (args.info) {
        info(args.info);
    } else if (args.list) {
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
        printDevices(devices)
    }

    

    if (args.build && /^\d{0,2}[a-zA-Z]\d{0,3}$/.test(args.build) && ipsws.map(f => f.build).includes(args.build) && !args.latest) {
        ipsw = allIPSWs.filter(fw => fw.build.toUpperCase() == args.build.toUpperCase())[0];
    } else {
        var ipsws = allIPSWs.filter(fw => fw.device.internalName == device.internalName);
        if (args.latest) {
            ipsw = ipsws[0];
        } else {
            printIPSWs(ipsws);
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
 */
async function info(device) {
    var devices = await getDevices();
    
    if (!devices.map(d => d.internalName).includes(device)) {
        return printDevices(devices)
    }

    var dev = devices.filter(d => d.internalName == device)[0];

    var thisIPSWs = allIPSWs.filter(i => {return i.device.internalName == dev.internalName})

    console.log(`
Name: ${dev.commercialName.yellow}
ID: ${dev.internalName.yellow}
Board Config: ${(dev.boardConfig || "None known").yellow}
Application Processor: ${(dev.platform || "None known").yellow}

Latest Version: ${thisIPSWs[0].version.yellow}
First Version: ${thisIPSWs[thisIPSWs.length-1].version.yellow}
Versions Released: ${thisIPSWs.length.toString().yellow}
`);
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

    console.log(devices);

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
            });
        });

    return devices;
}


