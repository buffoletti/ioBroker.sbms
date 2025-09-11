"use strict";

const { SerialPort } = require("serialport");
const { writeCommonStates } = require("../commonStatesWriter");
const { checkIntegrity, parseSBMS, parseS1, parseS2, parseEW, parseXSBMS } = require("../decode");

let port;

async function init(adapter, debug = false) {
    adapter.log.info("Initializing SBMS Serial handler");

    const device = adapter.config.serialPort || "/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0";
    const baudRate = adapter.config.serialBaudRate || 921600;

    try {
        port = new SerialPort({ path: device, baudRate }, (err) => {
            if (err) {
                adapter.log.error("Error opening serial port: " + err.message);
            }
        });

        port.on("open", () => {
            adapter.log.info(`Serial port opened at ${device} (${baudRate} baud)`);
        });

        let buffer = "";

        port.on("data", (data) => {
            buffer += data.toString("utf8");

            // Messages are usually terminated (e.g. with \n or ;) → adjust to your device
            const parts = buffer.split("\n");
            buffer = parts.pop() || ""; // save last partial

            for (const line of parts) {
                processSerialLine(adapter, line.trim(), debug);
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

function processSerialLine(adapter, line, debug) {
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
            handleCompleteFrame(adapter, frame, debug);
            frame = { sbms: null, s1: null, s2: null, eW: null, xsbms: null };
        }
    } catch (err) {
        adapter.log.error("Error parsing serial line: " + err.message);
    }
}

let firstFrameProcessed = false;

function handleCompleteFrame(adapter, frame, debug) {
    if (!checkIntegrity(frame.sbms)) {
        if (debug) adapter.log.warn("CRC check failed for serial sbms");
        return;
    }

    try {
        const sbms = parseSBMS(frame.sbms);
        const s1 = parseS1(frame.s1);
        const s2 = parseS2(frame.s2);
        const eW = parseEW(frame.eW);
        const xsbms = parseXSBMS(frame.xsbms);

        if (!firstFrameProcessed) {
            processFirstFrame(adapter, { s1, xsbms });
            firstFrameProcessed = true;
        }

        if (debug) adapter.log.info("Decoded complete serial frame, CRC good, reported timestamp");

        processDecoded(adapter, sbms, s1, s2, eW, xsbms);
    } catch (err) {
        adapter.log.error("Error decoding serial frame: " + err.message);
    }
}

function processDecoded(adapter, sbms, s1, s2, eW, xsbms) {
    // COMMON STATES
    writeCommonStates(adapter, sbms);

    for (let i = 1; i <= sbms.cellsMV.length; i++) {
        adapter.writeState(`cells.${i}.balancing`, s2.cellsBalancing[i]);
    }

    const anyBalancing = Object.values(s2.cellsBalancing).some((b) => b === true);
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
    adapter.writeState("parameter.model", s1.model);
    adapter.writeState("parameter.type", xsbms.type);
    adapter.writeState("parameter.capacity", xsbms.capacity);
    adapter.writeState("parameter.cvmin", xsbms.cvmin);
    adapter.writeState("parameter.cvmax", xsbms.cvmax);
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

function cleanup() {
    if (port && port.isOpen) {
        port.close();
        port = null;
    }
}

module.exports = { init, cleanup };
