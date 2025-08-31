"use strict";
const axios = require("axios");
const { writeCommonStates } = require("./commonStatesWriter");

let timer;

function init(adapter, debug = false) {
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
    let running = false;

    timer = setInterval(async () => {
        if (running) return; // skip if previous fetch not finished
        running = true;

        try {
            // adapter.log.info(`url: ${url}`);
            const response = await axios.get(url);
            const data = response.data;
            let match = data.match(/var sbms="([^"]+)"/);
            const sbms_raw = match && match[1] ? match[1].replace(/\\\\/g, "\\") : null; // Replace double backslashes with a single backslash
            if (!sbms_raw) return;
            if (!checkIntegrity(sbms_raw)) {
                // Call the increment method from the adapter instance
                await adapter.incrementState("html.crcErrorCount");
                return; // stop further processing
            }
            await adapter.incrementState("html.crcSuccessCount");

            const sbmsTime = {};
            sbmsTime.year = dcmp(0, 1, sbms_raw);
            sbmsTime.month = dcmp(1, 1, sbms_raw);
            sbmsTime.day = dcmp(2, 1, sbms_raw);
            sbmsTime.hour = dcmp(3, 1, sbms_raw);
            sbmsTime.min = dcmp(4, 1, sbms_raw);
            sbmsTime.sec = dcmp(5, 1, sbms_raw);
            const dt = new Date(
                2000 + sbmsTime.year,
                sbmsTime.month - 1, // JS months are 0-based
                sbmsTime.day,
                sbmsTime.hour,
                sbmsTime.min,
                sbmsTime.sec,
            );

            const sbms = {};
            sbms.timeStr = dt.toLocaleString();
            if (debug) {
                adapter.log.info(`New HTML Scraping with reported Timestamp: ${sbms.timeStr}`);
            }
            sbms.soc = dcmp(6, 2, sbms_raw);
            sbms.cellsMV = {};
            // sbms.cellsMVmin = dcmp(8, 2, sbms_raw);
            // sbms.cellsMVmax = 0;

            for (let i = 0; i < 8; i++) {
                const cellValue = dcmp(8 + i * 2, 2, sbms_raw);
                sbms.cellsMV[i + 1] = cellValue;
            }
            sbms.tempInt = (dcmp(24, 2, sbms_raw) - 450) / 10;
            sbms.tempExt = (dcmp(26, 2, sbms_raw) - 450) / 10;
            sbms.currentMA = {};
            sbms.currentMA.battery = dcmp(29, 3, sbms_raw) * (sbms_raw.charAt(28) + 1);
            sbms.currentMA.pv1 = dcmp(32, 3, sbms_raw);
            sbms.currentMA.pv2 = dcmp(35, 3, sbms_raw);
            sbms.currentMA.extLoad = dcmp(38, 3, sbms_raw);
            //sbms.ad2 = dcmp(41, 3, sbms_raw);
            sbms.ad3 = dcmp(44, 3, sbms_raw);
            sbms.ad4 = dcmp(47, 3, sbms_raw);
            sbms.heat1 = dcmp(50, 3, sbms_raw);
            sbms.dualPVLevel = dcmp(53, 1, sbms_raw);
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
            // sbms.flags.delta = sbms.cellsMVmax - sbms.cellsMVmin ;

            /////////////////s2
            let regex = /var s2=\[(.*?)\];/;
            match = data.match(regex);
            const s2_raw = match && match[1] ? match[1] : null;
            if (!s2_raw) return;
            const s2_values = s2_raw.split(",").map(Number); // Convert all values to numbers
            const s2 = { cellsBalancing: {} };

            // Handle cell balancing (first 8 values)
            for (let i = 0; i < 8; i++) {
                const cell = !!s2_values[i]; // Convert to boolean
                s2.cellsBalancing[i + 1] = cell;
            }

            // Map remaining values → min, max, PV/load flags
            const keys = ["cellsMin", "cellsMax", "pvOn", "loadOn"];
            for (let i = 0; i < keys.length; i++) {
                s2[keys[i]] = i < 2 ? s2_values[8 + i] : !!s2_values[8 + i]; // first 2 numeric, last 2 boolean
            }

            /////////////////s1
            regex = /var s1=\[(.*?)\];/;
            match = data.match(regex);
            const s1_raw = match && match[1] ? match[1] : null;
            if (!s1_raw) return;
            const s1_values = s1_raw.split(",");
            const s1 = {};
            s1.model = s1_values[2].replace(/^["']|["']$/g, "").trim();

            /////////////////    eW Counter Wh
            match = data.match(/var eW="([^"]+)"/);
            const eW_raw = match && match[1] ? match[1].replace(/\\\\/g, "\\") : null; // Replace double backslashes with a single backslash
            if (!eW_raw) return;
            const eW = {};
            eW.eBatt = dcmp(0 * 6, 6, eW_raw) / 10;
            eW.ePV1 = dcmp(1 * 6, 6, eW_raw) / 10;
            eW.ePV2 = dcmp(2 * 6, 6, eW_raw) / 10;
            eW.eLoad = dcmp(5 * 6, 6, eW_raw) / 10;
            eW.eExtLd = dcmp(6 * 6, 6, eW_raw) / 10;

            ///////////////////xsbms - Battery details
            match = data.match(/var xsbms="([^"]+)"/);
            const xsbms_raw = match && match[1] ? match[1].replace(/\\\\/g, "\\") : null; // Replace double backslashes with a single backslash
            if (!xsbms_raw) return;
            const xsbms = {};
            xsbms.type = dcmp(7, 1, xsbms_raw);
            xsbms.capacity = dcmp(8, 3, xsbms_raw);
            xsbms.cvmin = dcmp(5, 2, xsbms_raw);
            xsbms.cvmax = dcmp(3, 2, xsbms_raw);
            xsbms.cv = dcmp(0, 3, xsbms_raw);

            //WRTING COMMON STATES
            writeCommonStates(adapter, sbms);

            //WRTING DEBUG STATES
            if (debug) {
                writeStates("html.sbms", sbms);
                writeStates("html.s1", s1);
                writeStates("html.s2", s2);
                writeStates("html.eW", eW);
                writeStates("html.xsbms", xsbms);
            }
        } catch (error) {
            adapter.log.error("Error fetching SBMS rawData: " + error);
        } finally {
            running = false;
        }
    }, fetchInterval);

    // Helper function to write nested objects recursively
    function writeStates(prefix, obj) {
        for (const key in obj) {
            const val = obj[key];
            const stateId = `${prefix}.${key}`;

            if (typeof val === "object" && val !== null && !Array.isArray(val)) {
                // Nested object → recurse
                writeStates(stateId, val);
            } else {
                // Primitive value → write state
                adapter.writeState(stateId, val);
            }
        }
    }
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
