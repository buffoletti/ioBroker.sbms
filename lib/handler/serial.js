"use strict";

const { SerialPort } = require("serialport");
const { writeCommonStates } = require("../commonStatesWriter");
const { checkIntegrity, parseSBMS, parseS1, parseS2, parseEW, parseXSBMS } = require("../decode");
const { handleExtendedStates } = require("../states");

let port;
let timeout = null;
let processSerialLine;

async function init(adapter, debug = false) {
    adapter.log.info("Initializing SBMS Serial handler");

    const device = adapter.config.serialPort || "/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0";
    const baudRate = adapter.config.serialBaudRate || 921600;

    try {
        port = new SerialPort({ path: device, baudRate }, (err) => {
            if (err) {
                adapter.log.error("Error opening serial port: " + err.message);
                adapter.setState("info.connection", false, true);
            }
        });

        let buffer = "";
        let modeLocked = false; // once set → never changes again

        // fallback if no valid USART frame within 3s
        timeout = setTimeout(() => {
            if (!modeLocked) {
                adapter.log.info(`No valid USART Data Log var sbms detected within 5s, trying WiFi mode...`);
                processSerialLine = (line) => processSerialLineWifiMode(adapter, line, debug);
                modeLocked = true;
            }
        }, 5 * 1000);

        // start optimistic with USART mode
        processSerialLine = async (line) => {
            const ok = processSerialLineUSARTMode(adapter, line, debug);
            if (!modeLocked && ok) {
                adapter.log.info("Detected SBMS sennding in USART Data Log format (sbms var only).");
                modeLocked = true;
                adapter.setState("info.connection", true, true);

                // replace handler permanently
                processSerialLine = (line) => processSerialLineUSARTMode(adapter, line, debug);
                clearTimeout(timeout);
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

function processSerialLineWifiMode(adapter, line, debug) {
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
            if (frameTimer) clearTimeout(frameTimer);
            frameTimer = setTimeout(() => {
                if (debug) adapter.log.warn("Discarding incomplete serial frame (timeout)");
                frame = { sbms: null, s1: null, s2: null, eW: null, xsbms: null };
            }, 500);
        }

        // Check for completeness
        if (frame.sbms && frame.s1 && frame.s2 && frame.eW && frame.xsbms) {
            if (frameTimer) {
                clearTimeout(frameTimer);
                frameTimer = null;
            }
            clearTimeout(timeout);

            handleCompleteFrame(adapter, frame, debug);
            frame = { sbms: null, s1: null, s2: null, eW: null, xsbms: null };
        }
    } catch (err) {
        adapter.log.error("Error parsing serial line Wifi Mode: " + err.message);
    }
}

let firstFrameProcessed = false;
let lastProcessed = 0; // timestamp of last processed frame (true ms)
let lastProcessedTimeStr = 0; // timestamp of last processed frame (reported)

function handleCompleteFrame(adapter, frame, debug) {
    const now = Date.now();
    let interval = adapter.config.serialUpdateInterval * 1000 || 10000; // fallback 10s
    if (interval <= 1000) interval = 0;
    // skip processing if interval not reached
    if (now - lastProcessed < interval) {
        if (debug) adapter.log.debug(`Serial frame skipped (interval ${interval * 0.001}s not reached)`);
        return;
    }
    lastProcessed = now;

    if (!checkIntegrity(frame.sbms)) {
        if (debug) adapter.log.warn("CRC check failed for serial sbms");
        if (adapter.config.fullMessage) adapter.incrementState("serial.crcErrorCount");
        return;
    }
    if (adapter.config.fullMessage) adapter.incrementState("serial.crcSuccessCount");

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
            firstFrameProcessed = true;
        }

        if (sbms.timeStr == lastProcessedTimeStr) {
            if (debug)
                adapter.log.debug(`Serial frame Wifi Mode skipped, CRC good, no new Timestamp: ${sbms.timeStr} `);
            return;
        }
        lastProcessedTimeStr = sbms.timeStr;

        if (debug) adapter.log.info(`Decoded complete serial frame Wifi Mode, CRC good, Timestamp: ${sbms.timeStr}`);

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
            adapter.writeState(`balancing.${i}.active`, active);
            const v = sbms.cellsMV[i - 1];
            adapter.writeState(`balancing.${i}`, v);

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
        adapter.writeState("balancing.max", maxV !== -Infinity ? maxV : 0, true);
        adapter.writeState("balancing.min", minV !== Infinity ? minV : 0, true);
        adapter.writeState("balancing.max.ID", maxID !== null ? maxID : 0, true);
        adapter.writeState("balancing.min.ID", minID !== null ? minID : 0, true);
    }

    // write overall states
    adapter.writeState("balancing.anyActive", anyBalancing, true);
    adapter.writeState("balancing.activeCount", activeCount, true);

    // COMMON STATES
    writeCommonStates(adapter, sbms, anyBalancing);

    // MIN MAX
    if (!anyBalancing) {
        adapter.writeState("cells.min", sbms.cellsMV[s2.cellsMin - 1]);
        adapter.writeState("cells.min.ID", s2.cellsMin);
        adapter.writeState("cells.max", sbms.cellsMV[s2.cellsMax - 1]);
        adapter.writeState("cells.max.ID", s2.cellsMax);
        adapter.writeState("cells.delta", sbms.cellsMV[s2.cellsMax - 1] - sbms.cellsMV[s2.cellsMin - 1]);
    }

    adapter.writeState("counter.battery", eW.eBatt / 1000);
    if (adapter.config.usePV1) {
        adapter.writeState("counter.pv1", eW.ePV1 / 1000);
        adapter.writeState("counter.load", eW.eLoad / 1000 + eW.eExtLd / 1000);
    }
    if (adapter.config.usePV2) {
        adapter.writeState("counter.pv2", eW.ePV2 / 1000);
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
    adapter.writeState("info.model", s1.model);
    adapter.writeState("info.type", xsbms.type);
    adapter.writeState("info.capacity", xsbms.capacity);
    adapter.writeState("info.cvmin", xsbms.cvmin);
    adapter.writeState("info.cvmax", xsbms.cvmax);
}

function processSerialLineUSARTMode(adapter, line, debug) {
    if (!line) return;
    const now = Date.now();
    let interval = adapter.config.serialUpdateInterval * 1000 || 10000; // fallback 10s
    if (interval <= 1000) interval = 0;
    // skip processing if interval not reached
    if (now - lastProcessed < interval) {
        if (debug) adapter.log.debug(`Serial line skipped (interval ${interval * 0.001}s not reached)`);
        return;
    }
    lastProcessed = now;

    try {
        const m = line.replace(/\\\\/g, "\\");

        if (!checkIntegrity(m)) {
            if (debug) adapter.log.warn("CRC check failed for USART sbms var");
            if (adapter.config.fullMessage) adapter.incrementState("serial.crcErrorCount");
            return;
        }
        if (adapter.config.fullMessage) adapter.incrementState("serial.crcSuccessCount");
        clearTimeout(timeout);

        const sbms = parseSBMS(m);
        if (sbms.timeStr === lastProcessedTimeStr) return;
        lastProcessedTimeStr = sbms.timeStr;

        if (debug) adapter.log.info(`Decoded USART sbms var, Timestamp: ${sbms.timeStr}`);
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

        adapter.writeState("cells.min", min);
        adapter.writeState("cells.min.ID", minID);
        adapter.writeState("cells.max", max);
        adapter.writeState("cells.max.ID", maxID);
        adapter.writeState("cells.delta", max - min);
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
            adapter.writeState(stateId, val);
        }
    }
}

function cleanup(adapter) {
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
