const Device = require("./device")

/** Represents a firmware blob.
 */
module.exports = class IPSW {

    /** 
     * Creates a firmware blob object.
     * 
     * @param {String} b - The ##X### Build Number of the version of this blob.
     * @param {Device} d - The device this blob applies to.
     * @param {String} v - The major.minor.patch version of this blob.
     * @param {Boolean} s - Whether the version of this firmware is signed by Apple for this device.
     */
    constructor(b, d, v, s) {
        this.build = b;
        this.device = d;
        this.version = v;
        this.signed = s;
    }

    get url() {
        return `https://api.ipsw.me/v4/ipsw/download/${this.device.internalName}/${this.build.toUpperCase()}`
    }

    /**
     * Returns the segment
     */
    get OS() {
        var os = "";
        switch (this.device.internalName.substr(0, 4)) {
            case "iPho":
            case "iPod":
                os = "i";
                break;
            case "iPad":
                os = parseInt(this.version.split(".")[0]) >= 13 ? "iPad" : "i";
                break;
            case "Audi":
                os = "HomePod ";
                break;
            case "Appl":
                os = "tv";
                break;
            case "Watc":
                os = "watch";
                break;
            case "iBri":
                os = "bridge";
                break;
            default:
                os = "";
        }
        return `${os}OS`;
    }
}