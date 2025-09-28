'use strict';

/**
 * Write common SBMS states into ioBroker.
 *
 * @param {object} adapter - ioBroker adapter instance
 * @param {object} sbms - Parsed SBMS object
 * @param anyBalancing - Any Cells Balancing
 */
function writeCommonStates(adapter, sbms, anyBalancing = false) {
    const { usePV1, usePV2, useADCX, useHeat1, useTempExt } = adapter.config;
    const voltage = Object.values(sbms.cellsMV).reduce((sum, v) => sum + v, 0) / 1000;

    // ---- Normal  states ----
    adapter.setState('voltage', Math.round(voltage * 100) / 100, true);
    adapter.setState('power.battery', Math.round(sbms.currentMA.battery * 0.001 * voltage), true);
    adapter.setState('current.battery', Math.round(sbms.currentMA.battery / 10) / 100, true);

    if (usePV1) {
        adapter.setState('current.pv1', Math.round(sbms.currentMA.pv1 / 10) / 100, true);
        let load = 0;
        load = Math.max(0, (sbms.currentMA.pv1 + sbms.currentMA.pv2 - sbms.currentMA.battery) * 0.001);
        adapter.setState('current.load', Math.round(load * 100) / 100, true);
        adapter.setState('power.pv1', Math.round(sbms.currentMA.pv1 * 0.001 * voltage), true);
        adapter.setState('power.load', Math.round(load * voltage), true);
    }
    if (usePV2) {
        adapter.setState('current.pv2', Math.round(sbms.currentMA.pv2 / 10) / 100, true);
        adapter.setState('power.pv2', Math.round(sbms.currentMA.pv2 * 0.001 * voltage), true);
    }

    adapter.setState('soc', sbms.soc, true);
    adapter.setState('tempInt', sbms.tempInt, true);
    if (useTempExt) {
        adapter.setState('tempExt', sbms.tempExt, true);
    }

    if (useADCX) {
        adapter.setState('adc2', sbms.ad4 / 1000, true);
        adapter.setState('adc3', sbms.ad3 / 1000, true);
    }
    if (useHeat1) {
        adapter.setState('heat1', sbms.heat1, true);
    }

    // adapter.setState("cells.delta", sbms.flags.delta);
    if (!anyBalancing) {
        for (let i = 0; i < sbms.cellsMV.length; i++) {
            adapter.setState(`cells.${i + 1}`, sbms.cellsMV[i], true);
        }
    }

    const infoFlags = ['OV', 'UV', 'CFET', 'DFET', 'EOC', 'OVLK', 'UVLK'];
    const errorFlags = ['IOT', 'COC', 'DOC', 'DSC', 'CELF', 'OPEN', 'LVC', 'ECCF'];
    const activeErrors = [];

    for (const key in sbms.flags) {
        if (key === 'delta') {
            continue;
        }

        let path;
        if (infoFlags.includes(key)) {
            path = `flags.info.${key}`;
        } else if (errorFlags.includes(key)) {
            path = `flags.errors.${key}`;
            if (sbms.flags[key]) {
                activeErrors.push(key);
            } // collect active error
        }
        adapter.setState(path, sbms.flags[key], true);
    }
    // Update consolidated error states
    adapter.setState('flags.errors.errorActive', activeErrors.length > 0, true);
    adapter.setState('flags.errors.errorCount', activeErrors.length, true);
    adapter.setState('flags.errors.activeErrors', activeErrors.length ? JSON.stringify(activeErrors) : 'none', true);
}

module.exports = { writeCommonStates: writeCommonStates };
