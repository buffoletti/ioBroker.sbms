"use strict";

let lastWrite = 0;

function init(adapter, topic, debug = false) {
    adapter.log.info(`Initializing MQTT handler for topic ${topic}`);

    adapter.subscribeForeignStates(topic);

    adapter.on("stateChange", (id, state) => {
        if (!state || !state.val || id !== topic) return;

        try {
            const obj = JSON.parse(state.val);

            // currentMA
            adapter.writeState("currentMA.battery", obj.currentMA.battery, "mqtt");
            adapter.writeState("currentMA.pv1", obj.currentMA.pv1, "mqtt");
            adapter.writeState("currentMA.extLoad", obj.currentMA.extLoad, "mqtt");
            const load = obj.currentMA.pv1 - Math.max(0, obj.currentMA.battery);
            adapter.writeState("currentMA.load", load, "mqtt");

            // flags
            for (const key in obj.flags) {
                if (key === "delta") continue;
                adapter.writeState(`flags.${key}`, obj.flags[key], "mqtt");
            }

            // Voltage and cells only every 10 seconds
            const now = Date.now();
            if (now - lastWrite > 10000) {
                lastWrite = now;

                let voltage = 0;
                let max = obj.cellsMV[0];
                let min = obj.cellsMV[0];

                for (let i = 0; i < obj.cellsMV.length; i++) {
                    const v = obj.cellsMV[i];
                    adapter.writeState(`cellsMV.${i + 1}`, v, "mqtt");
                    voltage += v;
                    max = Math.max(max, v);
                    min = Math.min(min, v);
                }

                adapter.writeState("cellsMV.delta", obj.flags.delta, "mqtt");
                adapter.writeState("soc", obj.soc, "mqtt");
                adapter.writeState("tempInt", obj.tempInt, "mqtt");
                adapter.writeState("tempExt", obj.tempExt, "mqtt");
                adapter.writeState("ad3", obj.ad3 / 1000, "mqtt");
                adapter.writeState("ad4", obj.ad4 / 1000, "mqtt");

                voltage = voltage / 1000; // in Volt
                adapter.writeState("cellsMV.min", min, "mqtt");
                adapter.writeState("cellsMV.max", max, "mqtt");
                adapter.writeState("voltage", voltage, "mqtt");
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
    cleanup
};
