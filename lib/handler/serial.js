"use strict";

const { SerialPort } = require("serialport");
const { writeCommonStates } = require("../commonStatesWriter");
const { checkIntegrity, parseSBMS, parseS1, parseS2, parseEW, parseXSBMS } = require("../decode");
const { handleExtendedStates } = require("../states");

let port;
let timeout = null;
let processSerialLine;
let interval = 10000; // fallback 10s

async function init(adapter) {
    adapter.log.info("Initializing SBMS Serial handler");

    const device = adapter.config.serialPort || "/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0";
    const baudRate = adapter.config.serialBaudRate || 921600;
    interval = adapter.config.serialUpdateInterval * 1000 || 10000; // fallback 10s
    if (interval < 1000) interval = 1000;
    if (interval > 3600 * 1000) {
        adapter.log.warn(`Configured serialUpdateInterval too large (${interval}ms). Limiting to ${3600}s`);
        interval = 3600 * 1000;
    }

    try {
        port = new SerialPort({ path: device, baudRate }, (err) => {
            if (err) {
                adapter.log.error("Error opening serial port: " + err.message);
                adapter.setState("info.connection", false, true);
            }
        });

        let buffer = "";
        let modeLocked = false; // once set → never changes again

        // fallback if no valid USART frame within 5s
        timeout = adapter.setTimeout(() => {
            if (!modeLocked) {
                adapter.log.info(`No valid USART Data Log var sbms detected within 5s, trying WiFi mode...`);
                processSerialLine = (line) => processSerialLineWifiMode(adapter, line);
                modeLocked = true;
            }
        }, 5 * 1000);

        // start optimistic with USART mode
        processSerialLine = async (line) => {
            const ok = processSerialLineUSARTMode(adapter, line);
            if (!modeLocked && ok) {
                modeLocked = true;
                adapter.log.info("Detected SBMS sennding in USART Data Log format (sbms var only).");
                adapter.setState("info.connection", true, true);
                adapter.log.info("Adapter connected");

                // replace handler permanently
                processSerialLine = (line) => processSerialLineUSARTMode(adapter, line);
                adapter.clearTimeout(timeout);
                await handleExtendedStates(adapter, true);
            }
        };

        port.on("open", () => {
            adapter.log.info(`Serial port opened at ${device} (${baudRate} baud)`);
            adapter.log.info("Detecting SBMS sending mode, trying USART...");
        });

        port.on("data", (data) => {
            buffer += data.toString("utf8");
            const parts = buffer.split("\n");
            buffer = parts.pop() || "";
            for (const line of parts) {
                processSerialLine(line.trim());
            }
        });

        port.on("error", (err) => {
            adapter.log.error("Serial port error: " + err.message);
        });
    } catch (err) {
        adapter.log.error("Failed to initialize serial port: " + err.message);
    }
}

// store last values until we have a full set
let frame = { sbms: null, s1: null, s2: null, eW: null, xsbms: null };
let frameTimer = null;

let timeoutConnectionWatchdog; // watchdog timer

function processSerialLineWifiMode(adapter, line) {
    if (!line) return;

    try {
        let matched = false;

        if (line.startsWith("var sbms=")) {
            const m = line.match(/var sbms="([^"]+)"/);
            if (m) frame.sbms = m[1].replace(/\\\\/g, "\\");
            matched = true;
        } else if (line.startsWith("var s1=")) {
            const m = line.match(/var s1=\[(.*?)\];/);
            if (m) frame.s1 = m[1];
            matched = true;
        } else if (line.startsWith("var s2=")) {
            const m = line.match(/var s2=\[(.*?)\];/);
            if (m) frame.s2 = m[1];
            matched = true;
        } else if (line.startsWith("var eW=")) {
            const m = line.match(/var eW="([^"]+)"/);
            if (m) frame.eW = m[1].replace(/\\\\/g, "\\");
            matched = true;
        } else if (line.startsWith("var xsbms=")) {
            const m = line.match(/var xsbms="([^"]+)"/);
            if (m) frame.xsbms = m[1].replace(/\\\\/g, "\\");
            matched = true;
        }

        // if (matched && debug) adapter.log.debug("Serial line: " + line);

        // (Re)start the 500ms frame timeout on each new relevant var
        if (matched) {
            if (frameTimer) adapter.clearTimeout(frameTimer);
            frameTimer = adapter.setTimeout(() => {
                const keys = ["sbms", "s1", "s2", "eW", "xsbms"];
                const present = keys.filter((k) => frame[k] !== null && frame[k] !== undefined);
                const missing = keys.filter((k) => frame[k] === null || frame[k] === undefined);
                adapter.log.warn(
                    `Discarding incomplete serial frame (timeout). Present: ${present.join(", ") || "none"}; Missing: ${missing.join(", ") || "none"}`,
                );
                frame = { sbms: null, s1: null, s2: null, eW: null, xsbms: null };
            }, 500);
        }

        // Check for completeness
        if (frame.sbms && frame.s1 && frame.s2 && frame.eW && frame.xsbms) {
            if (frameTimer) {
                adapter.clearTimeout(frameTimer);
                frameTimer = null;
            }
            adapter.clearTimeout(timeout);

            handleCompleteFrame(adapter, frame);
            frame = { sbms: null, s1: null, s2: null, eW: null, xsbms: null };
        }
    } catch (err) {
        adapter.log.error("Error parsing serial line Wifi Mode: " + err.message);
    }
}

let firstFrameProcessed = false;
let lastProcessed = 0; // timestamp of last processed frame (true ms)
let lastProcessedTimeStr = 0; // timestamp of last processed frame (reported)

function handleCompleteFrame(adapter, frame) {
    const now = Date.now();

    // skip processing if interval not reached
    if (interval > 1000 && now - lastProcessed < interval && firstFrameProcessed) {
        adapter.log.debug(`Serial frame skipped (interval ${interval * 0.001}s not reached)`);
        return;
    }
    lastProcessed = now;

    if (!checkIntegrity(frame.sbms)) {
        adapter.log.debug("CRC check failed for serial sbms");
        if (adapter.config.fullMessage) adapter.incrementState("serial.crcErrorCount");
        return;
    }

    if (adapter.config.fullMessage) adapter.incrementState("serial.crcSuccessCount");

    // reset watchdog: if no CRC success in 5 times interval → set connection false
    adapter.clearTimeout(timeoutConnectionWatchdog);
    timeoutConnectionWatchdog = adapter.setTimeout(() => {
        adapter.setState("info.connection", false, true);
        adapter.log.warn(`No valid serial fram Wifi Mode for 10s`);
        firstFrameProcessed = false;
    }, interval * 5);

    try {
        const sbms = parseSBMS(frame.sbms);
        const s1 = parseS1(frame.s1);
        const s2 = parseS2(frame.s2);
        const eW = parseEW(frame.eW);
        const xsbms = parseXSBMS(frame.xsbms);

        if (!firstFrameProcessed) {
            processFirstFrame(adapter, { s1, xsbms });
            adapter.setState("info.connection", true, true);
            adapter.log.info("Detected SBMS sennding in Wifi Mode format (sbms, s1, s2, xsbms, eA vars).");
            adapter.log.info(`Adapter connected, update interval ${interval * 0.001}s`);
            firstFrameProcessed = true;
        }

        if (sbms.timeStr == lastProcessedTimeStr) {
            adapter.log.debug(`Serial frame Wifi Mode skipped, CRC good, no new Timestamp: ${sbms.timeStr} `);
            return;
        }
        lastProcessedTimeStr = sbms.timeStr;

        adapter.log.debug(`Decoded complete serial frame Wifi Mode, CRC good, Timestamp: ${sbms.timeStr}`);

        processDecoded(adapter, sbms, s1, s2, eW, xsbms);
    } catch (err) {
        adapter.log.error("Error decoding serial frame Wifi Mode: " + err.message);
    }
}

function processDecoded(adapter, sbms, s1, s2, eW, xsbms) {
    //WRTING BALANCING STATES
    const values = Object.values(s2.cellsBalancing);
    const anyBalancing = values.some((v) => v);
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
        adapter.setState("balancing.max", maxV !== -Infinity ? maxV : 0, true);
        adapter.setState("balancing.min", minV !== Infinity ? minV : 0, true);
        adapter.setState("balancing.maxID", maxID !== null ? maxID : 0, true);
        adapter.setState("balancing.minID", minID !== null ? minID : 0, true);
    }

    // write overall states
    adapter.setState("balancing.anyActive", anyBalancing, true);
    adapter.setState("balancing.activeCount", activeCount, true);

    // COMMON STATES
    writeCommonStates(adapter, sbms, anyBalancing);

    // MIN MAX
    if (!anyBalancing) {
        adapter.setState("cells.min", sbms.cellsMV[s2.cellsMin - 1], true);
        adapter.setState("cells.minID", s2.cellsMin, true);
        adapter.setState("cells.max", sbms.cellsMV[s2.cellsMax - 1], true);
        adapter.setState("cells.maxID", s2.cellsMax, true);
        adapter.setState("cells.delta", sbms.cellsMV[s2.cellsMax - 1] - sbms.cellsMV[s2.cellsMin - 1], true);
    }

    adapter.setState("counter.battery", eW.eBatt / 1000, true);
    if (adapter.config.usePV1) {
        adapter.setState("counter.pv1", eW.ePV1 / 1000, true);
        adapter.setState("counter.load", eW.eLoad / 1000 + eW.eExtLd / 1000, true);
    }
    if (adapter.config.usePV2) {
        adapter.setState("counter.pv2", eW.ePV2 / 1000, true);
    }

    if (adapter.config.fullMessage) {
        writeStates(adapter, "serial.sbms", sbms);
        writeStates(adapter, "serial.s1", s1);
        writeStates(adapter, "serial.s2", s2);
        writeStates(adapter, "serial.eW", eW);
        writeStates(adapter, "serial.xsbms", xsbms);
    }
}

function processFirstFrame(adapter, parsed) {
    const { s1, xsbms } = parsed;
    adapter.setState("info.model", s1.model, true);
    adapter.setState("info.type", xsbms.type, true);
    adapter.setState("info.capacity", xsbms.capacity, true);
    adapter.setState("info.cvmin", xsbms.cvmin, true);
    adapter.setState("info.cvmax", xsbms.cvmax, true);
}

let connectionAlive = false;
function processSerialLineUSARTMode(adapter, line) {
    if (!line) return;
    const now = Date.now();
    let interval = adapter.config.serialUpdateInterval * 1000 || 10000; // fallback 10s
    if (interval <= 1000) interval = 0;

    // skip processing if interval not reached
    if (now - lastProcessed < interval && connectionAlive) {
        adapter.log.debug(`Serial line skipped (interval ${interval * 0.001}s not reached)`);
        return;
    }
    lastProcessed = now;

    try {
        const m = line.replace(/\\\\/g, "\\");

        if (!checkIntegrity(m)) {
            adapter.log.debug("CRC check failed for USART sbms var");
            if (adapter.config.fullMessage) adapter.incrementState("serial.crcErrorCount");
            return;
        }
        adapter.setState("info.connection", true, true);
        if (!connectionAlive) {
            adapter.log.info(`Reconnected with valid USART sbms var`);
            connectionAlive = true;
        }

        if (adapter.config.fullMessage) adapter.incrementState("serial.crcSuccessCount");

        // reset watchdog: if no CRC success in 5x Updateintervall → set connection false
        adapter.clearTimeout(timeoutConnectionWatchdog);
        timeoutConnectionWatchdog = adapter.setTimeout(
            () => {
                adapter.setState("info.connection", false, true);
                connectionAlive = false;
                adapter.log.warn(`No valid USART sbms var for ${adapter.config.serialUpdateInterval * 5}s`);
            },
            adapter.config.serialUpdateInterval * 5 * 1000,
        );

        const sbms = parseSBMS(m);
        if (sbms.timeStr === lastProcessedTimeStr) return;
        lastProcessedTimeStr = sbms.timeStr;

        adapter.log.debug(`Decoded USART sbms var, Timestamp: ${sbms.timeStr}`);
        writeCommonStates(adapter, sbms, false);
        //WRTING min/max/delta  STATES
        let max = sbms.cellsMV[0],
            min = sbms.cellsMV[0];
        let maxID = 1,
            minID = 1;

        for (let i = 0; i < sbms.cellsMV.length; i++) {
            const v = sbms.cellsMV[i];

            if (v > max) {
                max = v;
                maxID = i + 1; // +1 because cell numbering starts at 1
            }

            if (v < min) {
                min = v;
                minID = i + 1;
            }
        }

        adapter.setState("cells.min", min, true);
        adapter.setState("cells.minID", minID, true);
        adapter.setState("cells.max", max, true);
        adapter.setState("cells.maxID", maxID, true);
        adapter.setState("cells.delta", max - min, true);
        return true;
    } catch (err) {
        adapter.log.error("Error parsing USART line: " + err.message);
        return false;
    }
}
function writeStates(adapter, prefix, obj) {
    for (const key in obj) {
        const val = obj[key];
        const stateId = `${prefix}.${key}`;

        if (val !== null && typeof val === "object") {
            if (Array.isArray(val)) {
                const numbered = Object.fromEntries(val.map((v, i) => [i + 1, v]));
                writeStates(adapter, stateId, numbered);
            } else {
                writeStates(adapter, stateId, val);
            }
        } else {
            adapter.setState(stateId, val, true);
        }
    }
}

function cleanup(adapter) {
    if (timeout) {
        adapter.clearTimeout(timeout);
        timeout = null;
    }
    if (frameTimer) {
        adapter.clearTimeout(frameTimer);
        frameTimer = null;
    }
    if (timeoutConnectionWatchdog) {
        adapter.clearTimeout(timeoutConnectionWatchdog);
        timeoutConnectionWatchdog = null;
    }

    if (port && port.isOpen) {
        port.close();
        port = null;
        adapter.log.info("Serial Port closed");
        adapter.setState("info.connection", false, true);
    } else {
        adapter.setState("info.connection", { val: null, ack: true });
    }
}

module.exports = { init, cleanup };
