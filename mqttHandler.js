"use strict";

let lastWrite = 0;
let updateIntervalMilliSeconds = 10000; // fallback

function init(adapter, topic, debug = false) {
    adapter.log.info(`Initializing MQTT handler for topic ${topic}`);
    // take the value from config (in seconds) and convert to ms
    if (adapter.config && adapter.config.updateInterval) {
        if (adapter.config.updateInterval <= 1) {
            updateIntervalMilliSeconds = 0; // no rate limit
            adapter.log.info("No rate limit for MQTT messages configured.");
        } else {
            updateIntervalMilliSeconds = adapter.config.updateInterval * 1000;
            adapter.log.info(`Using update interval: ${updateIntervalMilliSeconds} ms`);
        }
    }

    adapter.subscribeForeignStates(topic);

    adapter.on("stateChange", (id, state) => {
        if (!state || !state.val || id !== topic) return;

        try {
            const obj = JSON.parse(state.val);
            const now = Date.now();
            if (now - lastWrite > updateIntervalMilliSeconds) {
                // ---- Normal states ----
                adapter.writeState("current.battery", Math.round(obj.currentMA.battery / 10) / 100);
                adapter.writeState("current.pv1", Math.round(obj.currentMA.pv1 / 10) / 100);
                adapter.writeState("current.pv2", Math.round(obj.currentMA.pv2 / 10) / 100);
                let load = 0;
                load = (obj.currentMA.pv1 + obj.currentMA.pv2 - obj.currentMA.battery) * 0.001;
                adapter.writeState("current.load", Math.round(load * 100) / 100);

                lastWrite = now;

                let voltage = 0;
                let max = obj.cellsMV[0],
                    min = obj.cellsMV[0];
                let maxID = 1,
                    minID = 1;

                for (let i = 0; i < obj.cellsMV.length; i++) {
                    const v = obj.cellsMV[i];
                    voltage += v;

                    if (v > max) {
                        max = v;
                        maxID = i + 1; // +1 because cell numbering starts at 1
                    }

                    if (v < min) {
                        min = v;
                        minID = i + 1;
                    }
                }
                voltage /= 1000;

                adapter.writeState("voltage", Math.round(voltage * 100) / 100);

                adapter.writeState("power.battery", Math.round(obj.currentMA.battery * 0.001 * voltage));
                adapter.writeState("power.pv1", Math.round(obj.currentMA.pv1 * 0.001 * voltage));
                adapter.writeState("power.pv2", Math.round(obj.currentMA.pv2 * 0.001 * voltage));
                adapter.writeState("power.load", Math.round(load * voltage));

                adapter.writeState("cells.min", min);
                adapter.writeState("cells.min.ID", minID);
                adapter.writeState("cells.max", max);
                adapter.writeState("cells.max.ID", maxID);
                adapter.writeState("soc", obj.soc);
                adapter.writeState("tempInt", obj.tempInt);
                adapter.writeState("tempExt", obj.tempExt);
                adapter.writeState("ad3", obj.ad3 / 1000);
                adapter.writeState("ad4", obj.ad4 / 1000);
                adapter.writeState("cells.delta", obj.flags.delta);
                for (let i = 0; i < obj.cellsMV.length; i++) {
                    adapter.writeState(`cells.${i + 1}`, obj.cellsMV[i]);
                }
                for (const key in obj.flags) {
                    if (key === "delta") continue;
                    adapter.writeState(`flags.${key}`, obj.flags[key]);
                }
                // ---- Debug states ----
                if (debug) {
                    // Create a string in YYYY-MM-DD HH:mm:ss format
                    const timeStr =
                        `${2000 + obj.time.year}-` +
                        `${String(obj.time.month).padStart(2, "0")}-` +
                        `${String(obj.time.day).padStart(2, "0")} ` +
                        `${String(obj.time.hour).padStart(2, "0")}:` +
                        `${String(obj.time.minute).padStart(2, "0")}:` +
                        `${String(obj.time.second).padStart(2, "0")}`;
                    adapter.writeState("mqtt.timeStr", timeStr, true);
                    adapter.writeState("mqtt.soc", obj.soc);
                    adapter.writeState("mqtt.tempInt", obj.tempInt);
                    adapter.writeState("mqtt.tempExt", obj.tempExt);
                    adapter.writeState("mqtt.currentMA.battery", obj.currentMA.battery);
                    adapter.writeState("mqtt.currentMA.pv1", obj.currentMA.pv1);
                    adapter.writeState("mqtt.currentMA.pv2", obj.currentMA.pv2);
                    adapter.writeState("mqtt.currentMA.extLoad", obj.currentMA.extLoad);
                    for (const key in obj.flags) {
                        if (key === "delta") continue;
                        adapter.writeState(`mqtt.flags.${key}`, obj.flags[key]);
                    }
                    for (let i = 0; i < obj.cellsMV.length; i++) {
                        adapter.writeState(`mqtt.cellsMV.${i + 1}`, obj.cellsMV[i]);
                    }
                    adapter.writeState("mqtt.cellsMV.delta", obj.flags.delta);
                    adapter.writeState("mqtt.ad3", obj.ad3);
                    adapter.writeState("mqtt.ad4", obj.ad4);
                    adapter.writeState("mqtt.heat1", obj.heat1);
                    adapter.writeState("mqtt.heat2", obj.heat2);

                    adapter.log.debug(`New SBMS MQTT Message processed: ${state.val}`);
                }
            }
        } catch (err) {
            adapter.log.error("Invalid JSON from MQTT: " + err);
        }
    });
}

function cleanup() {
    // ggf. hier MQTT unsubscribe / cleanup
}

module.exports = {
    init,
    cleanup,
};
