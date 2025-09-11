"use strict";

const { writeCommonStates } = require("../commonStatesWriter");

let lastWrite = 0;
let updateIntervalMilliSeconds = 10000; // fallback

function init(adapter, topic, debug = false) {
    adapter.log.info(`Initializing MQTT handler for topic ${topic}`);
    // take the value from config (in seconds) and convert to ms
    if (adapter.config && adapter.config.mqttUpdateInterval) {
        if (adapter.config.mqttUpdateInterval <= 1) {
            updateIntervalMilliSeconds = 0; // no rate limit
            adapter.log.info("No rate limit for MQTT messages configured.");
        } else {
            updateIntervalMilliSeconds = adapter.config.mqttUpdateInterval * 1000;
            adapter.log.info(`Using MQTT update interval: ${adapter.config.mqttUpdateInterval} s`);
        }
    }

    // Check if the topic is a valid state
    adapter.getForeignState(topic, (err, state) => {
        if (err) {
            adapter.log.error(`Error checking state ${topic}: ${err.message}`);
            return;
        }
        if (state === null || state === undefined) {
            adapter.log.error(`State ${topic} does not exist or is not accessible.`);
        } else {
            adapter.log.info(`State ${topic} exists. Subscribing...`);
        }
        adapter.subscribeForeignStates(topic);
    });

    adapter.on("stateChange", (id, state) => {
        if (!state || !state.val || id !== topic) return;

        try {
            const sbms = JSON.parse(state.val);
            const now = Date.now();
            if (now - lastWrite > updateIntervalMilliSeconds) {
                lastWrite = now;

                //WRTING COMMON STATES
                writeCommonStates(adapter, sbms);

                //WRTING MQTT Specific STATES
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
                adapter.writeState("cells.delta", sbms.flags.delta);

                // ---- Full Messages states ----
                if (adapter.config.fullMessage) {
                    // Create a string in YYYY-MM-DD HH:mm:ss format
                    const timeStr =
                        `${2000 + sbms.time.year}-` +
                        `${String(sbms.time.month).padStart(2, "0")}-` +
                        `${String(sbms.time.day).padStart(2, "0")} ` +
                        `${String(sbms.time.hour).padStart(2, "0")}:` +
                        `${String(sbms.time.minute).padStart(2, "0")}:` +
                        `${String(sbms.time.second).padStart(2, "0")}`;
                    adapter.writeState("mqtt.timeStr", timeStr, true);
                    adapter.writeState("mqtt.soc", sbms.soc);
                    adapter.writeState("mqtt.tempInt", sbms.tempInt);
                    adapter.writeState("mqtt.tempExt", sbms.tempExt);
                    adapter.writeState("mqtt.currentMA.battery", sbms.currentMA.battery);
                    adapter.writeState("mqtt.currentMA.pv1", sbms.currentMA.pv1);
                    adapter.writeState("mqtt.currentMA.pv2", sbms.currentMA.pv2);
                    adapter.writeState("mqtt.currentMA.extLoad", sbms.currentMA.extLoad);
                    for (const key in sbms.flags) {
                        if (key === "delta") continue;
                        adapter.writeState(`mqtt.flags.${key}`, sbms.flags[key]);
                    }
                    for (let i = 0; i < sbms.cellsMV.length; i++) {
                        adapter.writeState(`mqtt.cellsMV.${i + 1}`, sbms.cellsMV[i]);
                    }
                    adapter.writeState("mqtt.cellsMV.delta", sbms.flags.delta);
                    adapter.writeState("mqtt.ad3", sbms.ad3);
                    adapter.writeState("mqtt.ad4", sbms.ad4);
                    adapter.writeState("mqtt.heat1", sbms.heat1);
                    adapter.writeState("mqtt.heat2", sbms.heat2);

                    if (debug) {
                        adapter.log.info(`New SBMS MQTT Message processed: ${timeStr}`);
                    }
                }
            }
        } catch (err) {
            adapter.log.error("Invalid JSON from MQTT: " + err);
        }
    });
}

function cleanup(adapter) {
    try {
        adapter.unsubscribeForeignStates(); // unsubscribes all
        adapter.log.info("Unsubscribed from all states.");
    } catch (err) {
        adapter.log.warn("Failed to unsubscribe from states: " + err.message);
    }
}

module.exports = {
    init,
    cleanup,
};
