const IPSW = require("./ipsw");

/** 
 * Represents a device.
 */
module.exports = class Device {

    /**
     * Creates an instance of a Device
     * 
     * @constructor
     * @param {Object} options A map of options.
     * @param {String} options.commercialName The common name (such as iPhone 11 Pro).
     * @param {String} options.internalName The internal name (such as iPhone12,3).
     * @param {String} [options.boardConfig] The device's board config (sudh as d421ap).
     * @param {String} [options.platform] The device's CPU platform ID (?)
     * @param {{identifier: String, version: String, buildid: String, signed: Boolean}[]} [options.ipsws] An array of raw firmware blob objects
     */
    constructor(options) {
        this.commercialName = options.commercialName;
        this.internalName = options.internalName;
        this.boardConfig = options.boardConfig;
        this.platform = options.platform;

        /**
         * An array of IPSWs
         * 
         * @type {?IPSW[]}
         */
        if (options.ipsws) this.ipsws = options.ipsws.map(o => new IPSW(o.buildid, this, o.version, o.signed));
    }
}