'use strict';

const axios = require('axios');
const { writeCommonStates } = require('../commonStatesWriter');
const { checkIntegrity, parseSBMS, parseS1, parseS2, parseEW, parseXSBMS } = require('../decode');

let backoffDelay = 1000; // Start
const maxBackoffDelay = 10 * 60 * 1000; // Cap

let timer;

async function init(adapter) {
    adapter.log.info('Initializing SBMS HTML scraping');
    const ip = adapter.config.deviceIP;
    if (!isValidIP(ip)) {
        adapter.log.error(`Invalid IP address/format: ${ip}. Please check adapter configuration.`);
        return; // Block further execution
    }
    // Proceed with initialization
    const url = `http://${ip}/rawData`;

    const { usePV1, usePV2 } = adapter.config;

    // first scrape must succeed before starting interval
    try {
        const parsed = await scrape(adapter);
        if (parsed) {
            processFirstScrape(parsed);

            adapter.log.info('First scrape successful. Starting polling loop...');
        } else {
            adapter.log.error('First scrape returned no data. Aborting startup.');
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
    if (interval > 3600 * 1000) {
        adapter.log.warn(`Configured htmlUpdateInterval too large (${interval}ms). Limiting to ${3600}s`);
        interval = 3600 * 1000;
    }
    adapter.log.info(`Using HTML polling interval: ${interval / 1000} s`);

    if (timer) {
        adapter.clearInterval(timer);
    }
    let running = false;
    let lastTimestamp = null;

    timer = adapter.setInterval(async () => {
        if (running) {
            return;
        } // Skip if busy
        running = true;

        try {
            const parsed = await scrape(adapter);
            if (parsed) {
                const { sbms, s1, xsbms, s2, eW } = parsed;

                // Skip processing if timestamp hasn't changed
                if (sbms.timeStr === lastTimestamp) {
                    adapter.log.debug(`Scraping skipped with reported Timestamp: ${sbms.timeStr}`);

                    running = false;
                    return;
                }
                lastTimestamp = sbms.timeStr;

                adapter.log.debug(`New HTML Scraping with reported Timestamp: ${sbms.timeStr}`);

                processRepeatScrapes(sbms, s1, xsbms, s2, eW);
            }
        } catch (error) {
            adapter.log.error(`Error fetching SBMS rawData: ${error}`);
        } finally {
            running = false;
        }
    }, interval);

    // process first scrape
    function processFirstScrape(parsed) {
        const { s1, xsbms } = parsed;
        adapter.setState('info.model', s1.model, true);
        adapter.setState('info.type', xsbms.type, true);
        adapter.setState('info.capacity', xsbms.capacity, true);
        adapter.setState('info.cvmin', xsbms.cvmin, true);
        adapter.setState('info.cvmax', xsbms.cvmax, true);
    }

    // process repeat scrapes
    function processRepeatScrapes(sbms, s1, xsbms, s2, eW) {
        if (!adapter.config.useMQTT) {
            //WRTING BALANCING STATES
            const values = Object.values(s2.cellsBalancing);
            const anyBalancing = values.some(v => v);
            let activeCount = 0;
            let maxV = -Infinity;
            let minV = Infinity;
            let maxID = null;
            let minID = null;

            if (anyBalancing) {
                for (let i = 1; i <= sbms.cellsMV.length; i++) {
                    const active = !!s2.cellsBalancing[i - 1]; // convert 1/0 to boolean
                    adapter.setState(`balancing.${i}.active`, active, true);
                    const v = sbms.cellsMV[i - 1];
                    adapter.setState(`balancing.${i}.voltage`, v, true);

                    if (v > maxV) {
                        maxV = v;
                        maxID = i;
                    }
                    if (v < minV) {
                        minV = v;
                        minID = i;
                    }
                    if (active) {
                        activeCount++;
                    }
                }
                adapter.setState('balancing.max', maxV !== -Infinity ? maxV : 0, true);
                adapter.setState('balancing.min', minV !== Infinity ? minV : 0, true);
                adapter.setState('balancing.maxID', maxID !== null ? maxID : 0, true);
                adapter.setState('balancing.minID', minID !== null ? minID : 0, true);
            }

            // write overall states
            adapter.setState('balancing.anyActive', anyBalancing, true);
            adapter.setState('balancing.activeCount', activeCount, true);

            //WRTING COMMON STATES
            writeCommonStates(adapter, sbms, anyBalancing);

            // MIN MAX
            if (!anyBalancing) {
                adapter.setState('cells.min', sbms.cellsMV[s2.cellsMin - 1], true);
                adapter.setState('cells.minID', s2.cellsMin, true);
                adapter.setState('cells.max', sbms.cellsMV[s2.cellsMax - 1], true);
                adapter.setState('cells.maxID', s2.cellsMax, true);
                adapter.setState('cells.delta', sbms.cellsMV[s2.cellsMax - 1] - sbms.cellsMV[s2.cellsMin - 1], true);
            }
        }

        //MINIMUM HTML STATES
        adapter.setState('counter.battery', eW.eBatt / 1000, true);
        if (usePV1) {
            adapter.setState('counter.pv1', eW.ePV1 / 1000, true);
            adapter.setState('counter.load', eW.eLoad / 1000 + eW.eExtLd / 1000, true);
        }
        if (usePV2) {
            adapter.setState('counter.pv2', eW.ePV2 / 1000, true);
        }

        //WRTING FULL MESSAGES STATES
        if (adapter.config.fullMessage) {
            writeStates('html.sbms', sbms);
            writeStates('html.s1', s1);
            writeStates('html.s2', s2);
            writeStates('html.eW', eW);
            writeStates('html.xsbms', xsbms);
        }
    }

    // Helper Scrapping function
    async function scrape(adapter) {
        try {
            const response = await axios.get(url, { timeout: 5000 });
            const data = response.data;
            let match = data.match(/var sbms="([^"]+)"/);
            const sbms_raw = match && match[1] ? match[1].replace(/\\\\/g, '\\') : null; // Replace double backslashes with a single backslash
            if (!sbms_raw) {
                adapter.setState('info.connection', false, true); // yellow: no valid SBMS data
                return;
            }
            if (!checkIntegrity(sbms_raw)) {
                // Call the increment method from the adapter instance

                adapter.log.warn('CRC check failed for HTML data');
                if (adapter.config.fullMessage) {
                    await adapter.incrementState('html.crcErrorCount');
                }
                adapter.setState('info.connection', false, true); // yellow: no valid SBMS data

                return; // stop further processing
            }

            if (adapter.config.fullMessage) {
                await adapter.incrementState('html.crcSuccessCount');
            }

            const sbms = parseSBMS(sbms_raw);

            /////////////////s2
            let regex = /var s2=\[(.*?)\];/;
            match = data.match(regex);
            const s2_raw = match && match[1] ? match[1] : null;
            if (!s2_raw) {
                return;
            }
            const s2 = parseS2(s2_raw);

            /////////////////s1
            regex = /var s1=\[(.*?)\];/;
            match = data.match(regex);
            const s1_raw = match && match[1] ? match[1] : null;
            if (!s1_raw) {
                return;
            }
            const s1 = parseS1(s1_raw);

            /////////////////    eW Counter Wh
            match = data.match(/var eW="([^"]+)"/);
            const eW_raw = match && match[1] ? match[1].replace(/\\\\/g, '\\') : null; // Replace double backslashes with a single backslash
            if (!eW_raw) {
                return;
            }
            const eW = parseEW(eW_raw);

            ///////////////////xsbms - Battery details
            match = data.match(/var xsbms="([^"]+)"/);
            const xsbms_raw = match && match[1] ? match[1].replace(/\\\\/g, '\\') : null; // Replace double backslashes with a single backslash
            if (!xsbms_raw) {
                return;
            }
            const xsbms = parseXSBMS(xsbms_raw);

            // Successfully fetched & parsed → connection OK
            adapter.setState('info.connection', true, true); // green
            backoffDelay = 1000;

            return { sbms, s1, xsbms, s2, eW };
        } catch (error) {
            adapter.log.warn(`Error fetching/parsing SBMS rawData: ${error}`);
            adapter.setState('info.connection', false, true); // yellow on fetch error
            // Trigger backoff retry
            adapter.log.info(`Retrying scrape in ${backoffDelay / 1000}s...`);

            return new Promise(resolve => {
                adapter.setTimeout(async () => {
                    backoffDelay = Math.min(backoffDelay * 2, maxBackoffDelay);
                    try {
                        const result = await scrape(adapter);
                        resolve(result);
                    } catch {
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

            if (val !== null && typeof val === 'object') {
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
                adapter.setState(stateId, val, true);
            }
        }
    }
}

const isValidIP = ip => {
    const ipRegex =
        /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
};

function cleanup(adapter) {
    if (timer) {
        adapter.clearInterval(timer);
        timer = null;
    }
}

module.exports = { init, cleanup };
