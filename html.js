"use strict";
const axios = require("axios");

let timer;

function init(adapter) {
    adapter.log.info("Initializing SBMS HTML scraping");
    const url = `http://${adapter.config.deviceIP}/rawData`;

    // Determine interval in milliseconds
    let interval = 10000; // fallback
    if (adapter.config && adapter.config.updateInterval) {
        interval = adapter.config.updateInterval <= 1 ? 0 : adapter.config.updateInterval * 1000;
    }

    if (timer) clearInterval(timer);

    // If interval is 0, fetch once per second
    const fetchInterval = interval || 1000;

    timer = setInterval(async () => {
        try {
            // adapter.log.info(`url: ${url}`);
            const response = await axios.get(url);
            const data = response.data;
            const match = data.match(/var sbms="([^"]+)"/);
            const sbms_raw = match && match[1] ? match[1].replace(/\\\\/g, "\\") : null; // Replace double backslashes with a single backslash
            if (!sbms_raw) return;
            if (!checkIntegrity(sbms_raw)) return; // CRC check failed

            const sbms = {};
            sbms.year = dcmp(0, 1, sbms_raw);
            sbms.month = dcmp(1, 1, sbms_raw);
            sbms.day = dcmp(2, 1, sbms_raw);
            sbms.hour = dcmp(3, 1, sbms_raw);
            sbms.min = dcmp(4, 1, sbms_raw);
            sbms.sec = dcmp(5, 1, sbms_raw);
            adapter.log.info(`year: ${sbms.year}`);
            sbms.soc = dcmp(6, 2, sbms_raw);
            sbms.cellsMV = [];
            sbms.cellsMVmin = dcmp(8, 2, sbms_raw);
            sbms.cellsMVmax = 0;
            for (let i = 0; i < 8; i++) {
                sbms.cellsMV[i] = dcmp(8 + i * 2, 2, sbms_raw);
                if (sbms.cellsMV[i] > sbms.cellsMVmax) {
                    sbms.cellsMVmax = sbms.cellsMV[i];
                    sbms.cellsMVmaxID = i + 1;
                }
                if (sbms.cellsMV[i] < sbms.cellsMVmin) {
                    sbms.cellsMVmin = sbms.cellsMV[i];
                    sbms.cellsMVminID = i + 1;
                }
            }

            sbms.tempint = (dcmp(24, 2, sbms_raw) - 450) / 10;
            sbms.tempext = (dcmp(26, 2, sbms_raw) - 450) / 10;
            sbms.battdir = sbms_raw.charAt(28) + 1;
            sbms.batt = dcmp(29, 3, sbms_raw) * sbms.battdir;
            sbms.PV1 = dcmp(32, 3, sbms_raw);
            sbms.PV2 = dcmp(35, 3, sbms_raw);
            sbms.extload = dcmp(38, 3, sbms_raw);
            sbms.ad2 = dcmp(41, 3, sbms_raw);
            sbms.ad3 = dcmp(44, 3, sbms_raw);
            sbms.ad4 = dcmp(47, 3, sbms_raw);
            sbms.heat1 = dcmp(50, 3, sbms_raw);
            sbms.dualPVlevel = dcmp(53, 1, sbms_raw);
            // sbms.zz = dcmp(54,2,sbms_raw);

            sbms.flags = {};
            const flagsDec = dcmp(56, 3, sbms_raw);
            const flagsString = flagsDec.toString(2);
            const paddedflagsString = flagsString.padStart(14, "0");
            sbms.flags.OV = paddedflagsString[14] === "1";
            sbms.flags.OVLK = paddedflagsString[13] === "1";
            sbms.flags.UV = paddedflagsString[12] === "1";
            sbms.flags.UVLK = paddedflagsString[11] === "1";
            sbms.flags.IOT = paddedflagsString[10] === "1";
            sbms.flags.COC = paddedflagsString[9] === "1";
            sbms.flags.DOC = paddedflagsString[8] === "1";
            sbms.flags.DSC = paddedflagsString[7] === "1";
            sbms.flags.CELF = paddedflagsString[6] === "1";
            sbms.flags.OPEN = paddedflagsString[5] === "1";
            sbms.flags.LVC = paddedflagsString[4] === "1";
            sbms.flags.ECCF = paddedflagsString[3] === "1";
            sbms.flags.CFET = paddedflagsString[2] === "1";
            sbms.flags.EOC = paddedflagsString[1] === "1";
            sbms.flags.DFET = paddedflagsString[0] === "1";
            sbms.flags.delta = sbms.cellsMVmax - sbms.cellsMVmin;
        } catch (error) {
            adapter.log.error("Error fetching SBMS rawData: " + error);
        }
    }, fetchInterval);
}

function cleanup() {
    if (timer) clearInterval(timer);
}

// decode raw SBMS string
function dcmp(p, s, d) {
    let xx = 0;
    for (let z = 0; z < s; z++) {
        xx += (d.charCodeAt(p + s - 1 - z) - 35) * Math.pow(91, z);
    }
    return xx;
}

// CRC calculation
function calculateCRC(sbms_raw) {
    let crc = 0;
    for (let i = 0; i <= 53; i++) crc += dcmp(i, 1, sbms_raw);
    crc += dcmp(56, 1, sbms_raw);
    crc += dcmp(57, 1, sbms_raw);
    crc += dcmp(58, 1, sbms_raw);
    crc += 1995;
    return crc;
}

function checkIntegrity(sbms_raw) {
    const storedCRC = dcmp(54, 2, sbms_raw);
    const calculatedCRC = calculateCRC(sbms_raw);
    return storedCRC === calculatedCRC;
}
module.exports = { init, cleanup };
