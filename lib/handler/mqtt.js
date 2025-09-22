"use strict";

const { writeCommonStates } = require("../commonStatesWriter");

let lastWrite = 0;
let updateIntervalMilliSeconds = 10000; // fallback

function init(adapter, topic, debug) {
    adapter.log.info(`Initializing MQTT handler for topic ${topic}`);
    // take the value from config (in seconds) and convert to ms
    if (adapter.config && adapter.config.mqttUpdateInterval) {
        if (adapter.config.mqttUpdateInterval <= 1) {
            updateIntervalMilliSeconds = 0; // no rate limit
            adapter.log.info("No rate limit for MQTT messages configured.");
        } else if (adapter.config.mqttUpdateInterval > 3600) {
            updateIntervalMilliSeconds = 3600 * 1000; // limiting update rate to 1hr
            adapter.log.warn(
                `Configured mqttUpdateInterval too large (${adapter.config.mqttUpdateInterval}s). Limiting to ${3600}s`,
            );
        } else {
            updateIntervalMilliSeconds = adapter.config.mqttUpdateInterval * 1000;
            adapter.log.info(`Using MQTT update interval: ${adapter.config.mqttUpdateInterval} s`);
        }
    }

    // Check if the topic is a valid state
    adapter.getForeignState(topic, (err, state) => {
        if (err) {
            adapter.log.error(`Error checking state ${topic}: ${err.message}`);
            adapter.setState("info.connection", false, true);
            return;
        }
        if (state === null || state === undefined) {
            adapter.log.error(`State ${topic} does not exist or is not accessible.`);
            adapter.setState("info.connection", false, true);
        } else {
            adapter.log.info(`State ${topic} exists. Subscribing...`);
            adapter.setState("info.connection", true, true);
        }
        adapter.subscribeForeignStates(topic);
    });

    adapter.on("stateChange", (id, state) => {
        if (!state || !state.val || id !== topic || !state.ack) return;

        try {
            const sbms = JSON.parse(state.val);
            const now = Date.now();
            if (now - lastWrite > updateIntervalMilliSeconds) {
                lastWrite = now;

                //WRTING COMMON STATES
                writeCommonStates(adapter, sbms);

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
                adapter.setState("cells.min.ID", minID, true);
                adapter.setState("cells.max", max, true);
                adapter.setState("cells.max.ID", maxID, true);
                adapter.setState("cells.delta", sbms.flags.delta, true);

                // Create a string in YYYY-MM-DD HH:mm:ss format
                const timeStr =
                    `${2000 + sbms.time.year}-` +
                    `${String(sbms.time.month).padStart(2, "0")}-` +
                    `${String(sbms.time.day).padStart(2, "0")} ` +
                    `${String(sbms.time.hour).padStart(2, "0")}:` +
                    `${String(sbms.time.minute).padStart(2, "0")}:` +
                    `${String(sbms.time.second).padStart(2, "0")}`;

                if (debug) {
                    adapter.log.info(`New SBMS MQTT Message processed: ${timeStr}`);
                }

                // ---- Full Messages states ----
                if (adapter.config.fullMessage) {
                    adapter.setState("mqtt.timeStr", timeStr, true);
                    adapter.setState("mqtt.soc", sbms.soc, true);
                    adapter.setState("mqtt.tempInt", sbms.tempInt, true);
                    adapter.setState("mqtt.tempExt", sbms.tempExt, true);
                    adapter.setState("mqtt.currentMA.battery", sbms.currentMA.battery, true);
                    adapter.setState("mqtt.currentMA.pv1", sbms.currentMA.pv1, true);
                    adapter.setState("mqtt.currentMA.pv2", sbms.currentMA.pv2, true);
                    adapter.setState("mqtt.currentMA.extLoad", sbms.currentMA.extLoad, true);
                    for (const key in sbms.flags) {
                        if (key === "delta") continue;
                        adapter.setState(`mqtt.flags.${key}`, sbms.flags[key], true);
                    }
                    for (let i = 0; i < sbms.cellsMV.length; i++) {
                        adapter.setState(`mqtt.cellsMV.${i + 1}`, sbms.cellsMV[i], true);
                    }
                    adapter.setState("mqtt.cellsMV.delta", sbms.flags.delta, true);
                    adapter.setState("mqtt.ad3", sbms.ad3, true);
                    adapter.setState("mqtt.ad4", sbms.ad4, true);
                    adapter.setState("mqtt.heat1", sbms.heat1, true);
                    adapter.setState("mqtt.heat2", sbms.heat2, true);
                }
            }
        } catch (err) {
            adapter.log.error("Invalid JSON from MQTT: " + err);
            adapter.setState("info.connection", false, true);
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
