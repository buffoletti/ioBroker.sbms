"use strict";

/**
 * Write common SBMS states into ioBroker.
 * @param {object} adapter - ioBroker adapter instance
 * @param {object} sbms - Parsed SBMS object
 */
function writeCommonStates(adapter, sbms) {
    const { usePV1, usePV2, useADCX, useHeat1, useTempExt } = adapter.config;
    const voltage = Object.values(sbms.cellsMV).reduce((sum, v) => sum + v, 0) / 1000;

    // ---- Normal  states ----
    adapter.writeState("voltage", Math.round(voltage * 100) / 100);
    adapter.writeState("power.battery", Math.round(sbms.currentMA.battery * 0.001 * voltage));
    adapter.writeState("current.battery", Math.round(sbms.currentMA.battery / 10) / 100);

    if (usePV1) {
        adapter.writeState("current.pv1", Math.round(sbms.currentMA.pv1 / 10) / 100);
        let load = 0;
        load = (sbms.currentMA.pv1 + sbms.currentMA.pv2 - sbms.currentMA.battery) * 0.001;
        adapter.writeState("current.load", Math.round(load * 100) / 100);
        adapter.writeState("power.pv1", Math.round(sbms.currentMA.pv1 * 0.001 * voltage));
        adapter.writeState("power.load", Math.round(load * voltage));
    }
    if (usePV2) {
        adapter.writeState("current.pv2", Math.round(sbms.currentMA.pv2 / 10) / 100);
        adapter.writeState("power.pv2", Math.round(sbms.currentMA.pv2 * 0.001 * voltage));
    }

    adapter.writeState("soc", sbms.soc);
    adapter.writeState("tempInt", sbms.tempInt);
    if (useTempExt) {
        adapter.writeState("tempExt", sbms.tempExt);
    }

    if (useADCX) {
        adapter.writeState("adc2", sbms.ad4 / 1000);
        adapter.writeState("adc3", sbms.ad3 / 1000);
    }
    if (useHeat1) {
        adapter.writeState("heat1", sbms.heat1);
    }

    // adapter.writeState("cells.delta", sbms.flags.delta);
    for (let i = 0; i < sbms.cellsMV.length; i++) {
        adapter.writeState(`cells.${i + 1}`, sbms.cellsMV[i]);
    }

    const infoFlags = ["OV", "UV", "CFET", "DFET", "EOC", "OVLK", "UVLK"];
    const errorFlags = ["IOT", "COC", "DOC", "DSC", "CELF", "OPEN", "LVC", "ECCF"];
    const activeErrors = [];

    for (const key in sbms.flags) {
        if (key === "delta") continue;

        let path;
        if (infoFlags.includes(key)) {
            path = `flags.info.${key}`;
        } else if (errorFlags.includes(key)) {
            path = `flags.errors.${key}`;
            if (!sbms.flags[key]) activeErrors.push(key); // collect active error
        }
        adapter.writeState(path, sbms.flags[key]);
    }
    // Update consolidated error states
    adapter.writeState("flags.errors.errorActive", activeErrors.length > 0, true);
    adapter.writeState("flags.errors.errorCount", activeErrors.length, true);
    adapter.writeState("flags.errors.activeErrors", activeErrors.length ? JSON.stringify(activeErrors) : "none", true);
}

module.exports = { writeCommonStates: writeCommonStates };
