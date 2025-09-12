"use strict";

const axios = require("axios");
const { writeCommonStates } = require("../commonStatesWriter");
const { checkIntegrity, parseSBMS, parseS1, parseS2, parseEW, parseXSBMS } = require("../decode");

let backoffDelay = 1000; // Start
const maxBackoffDelay = 10 * 60 * 1000; // Cap

let timer;

async function init(adapter, debug = false) {
    adapter.log.info("Initializing SBMS HTML scraping");
    const ip = adapter.config.deviceIP;
    if (!isValidIP(ip)) {
        adapter.log.error(`Invalid IP address: ${ip}. Please check your configuration.`);
        return; // Block further execution
    }
    // Proceed with initialization
    const url = `http://${ip}/rawData`;

    const { usePV1, usePV2 } = adapter.config;

    // first scrape must succeed before starting interval
    try {
        const parsed = await scrape(adapter, debug);
        if (parsed) {
            processFirstScrape(parsed);

            adapter.log.info("First scrape successful. Starting polling loop...");
        } else {
            adapter.log.error("First scrape returned no data. Aborting startup.");
            return; // don’t start interval if first scrape fails
        }
    } catch (err) {
        adapter.log.error(`First scrape failed: ${err.message}`);
        return; // don’t start interval if first scrape fails
    }

    // Determine interval in milliseconds
    let interval = 10000; // fallback
    if (adapter.config && adapter.config.htmlUpdateInterval) {
        interval = adapter.config.htmlUpdateInterval <= 1 ? 1000 : adapter.config.htmlUpdateInterval * 1000;
    }
    adapter.log.info(`Using HTML polling interval: ${interval / 1000} s`);

    if (timer) clearInterval(timer);
    let running = false;
    let lastTimestamp = null;

    timer = setInterval(async () => {
        if (running) return; // Skip if busy
        running = true;

        try {
            const parsed = await scrape(adapter, debug);
            if (parsed) {
                const { sbms, s1, xsbms, s2, eW } = parsed;

                // Skip processing if timestamp hasn't changed
                if (sbms.timeStr === lastTimestamp) {
                    if (debug) {
                        adapter.log.info(`Scraping skipped with reported Timestamp: ${sbms.timeStr}`);
                    }
                    running = false;
                    return;
                }
                lastTimestamp = sbms.timeStr;

                if (debug) {
                    adapter.log.info(`New HTML Scraping with reported Timestamp: ${sbms.timeStr}`);
                }

                processRepeatScrapes(sbms, s1, xsbms, s2, eW);
            }
        } catch (error) {
            adapter.log.error("Error fetching SBMS rawData: " + error);
        } finally {
            running = false;
        }
    }, interval);

    // process first scrape
    function processFirstScrape(parsed) {
        const { s1, xsbms } = parsed;
        adapter.writeState("parameter.model", s1.model);
        adapter.writeState("parameter.type", xsbms.type);
        adapter.writeState("parameter.capacity", xsbms.capacity);
        adapter.writeState("parameter.cvmin", xsbms.cvmin);
        adapter.writeState("parameter.cvmax", xsbms.cvmax);
    }

    // process repeat scrapes
    function processRepeatScrapes(sbms, s1, xsbms, s2, eW) {
        if (!adapter.config.useMQTT) {
            //WRTING COMMON STATES
            writeCommonStates(adapter, sbms);

            //WRTING BALANCING STATES

            // Write balancing states only if useHtml and not useMQTT
            for (let i = 1; i <= sbms.cellsMV.length; i++) {
                adapter.writeState(`cells.${i}.balancing`, s2.cellsBalancing[i]);
            }

            // Only update min/max if NO balancing is active
            const anyBalancing = Object.values(s2.cellsBalancing).some((b) => b === true);

            if (!anyBalancing) {
                adapter.writeState("cells.min", sbms.cellsMV[s2.cellsMin - 1]);
                adapter.writeState("cells.min.ID", s2.cellsMin);
                adapter.writeState("cells.max", sbms.cellsMV[s2.cellsMax - 1]);
                adapter.writeState("cells.max.ID", s2.cellsMax);
                adapter.writeState("cells.delta", sbms.cellsMV[s2.cellsMax - 1] - sbms.cellsMV[s2.cellsMin - 1]);
            }
        }

        //MINIMUM HTML STATES
        adapter.writeState("counter.battery", eW.eBatt / 1000);
        if (usePV1) {
            adapter.writeState("counter.pv1", eW.ePV1 / 1000);
            adapter.writeState("counter.load", eW.eLoad / 1000 + eW.eExtLd / 1000);
        }
        if (usePV2) {
            adapter.writeState("counter.pv2", eW.ePV2 / 1000);
        }

        //WRTING FULL MESSAGES STATES
        if (adapter.config.fullMessage) {
            writeStates("html.sbms", sbms);
            writeStates("html.s1", s1);
            writeStates("html.s2", s2);
            writeStates("html.eW", eW);
            writeStates("html.xsbms", xsbms);
        }
    }

    // Helper Scrapping function
    async function scrape(adapter, debug) {
        try {
            const response = await axios.get(url, { timeout: 5000 });
            const data = response.data;
            let match = data.match(/var sbms="([^"]+)"/);
            const sbms_raw = match && match[1] ? match[1].replace(/\\\\/g, "\\") : null; // Replace double backslashes with a single backslash
            if (!sbms_raw) return;
            if (!checkIntegrity(sbms_raw)) {
                // Call the increment method from the adapter instance
                if (debug) {
                    adapter.log.warn("CRC check failed for HTML data");
                    if (adapter.config.fullMessage) await adapter.incrementState("html.crcErrorCount");
                }
                return; // stop further processing
            }

            if (adapter.config.fullMessage) await adapter.incrementState("html.crcSuccessCount");

            const sbms = parseSBMS(sbms_raw);

            /////////////////s2
            let regex = /var s2=\[(.*?)\];/;
            match = data.match(regex);
            const s2_raw = match && match[1] ? match[1] : null;
            if (!s2_raw) return;
            const s2 = parseS2(s2_raw);

            /////////////////s1
            regex = /var s1=\[(.*?)\];/;
            match = data.match(regex);
            const s1_raw = match && match[1] ? match[1] : null;
            if (!s1_raw) return;
            const s1 = parseS1(s1_raw);

            /////////////////    eW Counter Wh
            match = data.match(/var eW="([^"]+)"/);
            const eW_raw = match && match[1] ? match[1].replace(/\\\\/g, "\\") : null; // Replace double backslashes with a single backslash
            if (!eW_raw) return;
            const eW = parseEW(eW_raw);

            ///////////////////xsbms - Battery details
            match = data.match(/var xsbms="([^"]+)"/);
            const xsbms_raw = match && match[1] ? match[1].replace(/\\\\/g, "\\") : null; // Replace double backslashes with a single backslash
            if (!xsbms_raw) return;
            const xsbms = parseXSBMS(xsbms_raw);

            backoffDelay = 1000;

            return { sbms, s1, xsbms, s2, eW };
        } catch (error) {
            adapter.log.warn("Error fetching/parsing SBMS rawData: " + error);

            // Trigger backoff retry
            adapter.log.info(`Retrying scrape in ${backoffDelay / 1000}s...`);

            return new Promise((resolve) => {
                setTimeout(async () => {
                    backoffDelay = Math.min(backoffDelay * 2, maxBackoffDelay);
                    try {
                        const result = await scrape(adapter, debug);
                        resolve(result);
                    } catch (err) {
                        resolve(null); // Give up if recursive scrape fails again
                    }
                }, backoffDelay);
            });
        }
    }

    // Helper function to write nested objects recursively
    function writeStates(prefix, obj) {
        for (const key in obj) {
            const val = obj[key];
            const stateId = `${prefix}.${key}`;

            if (val !== null && typeof val === "object") {
                if (Array.isArray(val)) {
                    // Convert array to numbered object temporarily
                    const numbered = Object.fromEntries(val.map((v, i) => [i + 1, v]));
                    writeStates(stateId, numbered);
                } else {
                    // Nested object → recurse
                    writeStates(stateId, val);
                }
            } else {
                // Primitive value → write state
                adapter.writeState(stateId, val);
            }
        }
    }
}

const isValidIP = (ip) => {
    const ipRegex =
        /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
};

function cleanup() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

module.exports = { init, cleanup };
