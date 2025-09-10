async function createNormalStates(adapter) {
    const { usePV1, usePV2, useADCX, useHeat1, useTempExt } = adapter.config;

    const states = {
        "current.battery": { name: "Battery current", unit: "A", role: "value.current" },
        "power.battery": { name: "Battery Power", unit: "W", role: "value.power" },
        voltage: { name: "Battery voltage", unit: "V", role: "value.voltage" },
        soc: { name: "State of charge", unit: "%", role: "value.battery" },
        tempInt: { name: "SBMS Internal temperature", unit: "°C", role: "value.temperature" },
        "cells.min": { name: "Cell min", unit: "mV", role: "value.voltage" },
        "cells.max": { name: "Cell max", unit: "mV", role: "value.voltage" },
        "cells.min.ID": { name: "Cell ID min", unit: "", role: "value", type: "number" },
        "cells.max.ID": { name: "Cell ID max", unit: "", role: "value", type: "number" },
        "cells.delta": { name: "Cell delta", unit: "mV", role: "value.voltage" },
    };

    // Conditionally add states
    if (usePV1) {
        states["current.pv1"] = { name: "PV1 current", unit: "A", role: "value.current" };
        states["power.pv1"] = { name: "PV1 Power", unit: "W", role: "value.power" };
        states["current.load"] = { name: "Load current", unit: "A", role: "value.current" };
        states["power.load"] = { name: "Load Power", unit: "W", role: "value.power" };
    }

    if (usePV2) {
        states["current.pv2"] = { name: "PV2 current", unit: "A", role: "value.current" };
        states["power.pv2"] = { name: "PV2 Power", unit: "W", role: "value.power" };
    }

    if (useADCX) {
        states.adc3 = { name: "Analog Input ADC3 / ad3", unit: "V", role: "value" };
        states.adc2 = { name: "Analog Input ADC2 / ad4", unit: "V", role: "value" };
    }

    if (useHeat1) {
        states.heat1 = { name: "heat1", unit: "", role: "value" };
    }

    if (useTempExt) {
        states.tempExt = { name: "Battery temperature", unit: "°C", role: "value.temperature" };
    }

    for (let i = 1; i <= 8; i++) {
        states[`cells.${i}`] = { name: `Cell ${i}`, unit: "mV", role: "value.voltage" };
    }

    // Flag descriptions
    const flagDescriptions = {
        OV: "Overvoltage (no error)",
        OVLK: "Overvoltage Lock",
        UV: "Undervoltage (no error)",
        UVLK: "Undervoltage Lock",
        IOT: "Internal Overtemperature",
        COC: "Carge Over Current",
        DOC: "Discharge Over Current",
        DSC: "Short Circuit",
        CELF: "Cell Failure",
        OPEN: "Open Cell Wire",
        LVC: "Low Voltage Cutoff",
        ECCF: "ECC Fault",
        CFET: "Charge FET Enabled",
        EOC: "End of Charge (may still be charging)",
        DFET: "Discharge FET Enabled",
    };

    // Create states with descriptive names
    for (const [flag, description] of Object.entries(flagDescriptions)) {
        states[`flags.${flag}`] = {
            name: description,
            type: "boolean",
            role: "indicator",
        };
    }

    await createStatesFromObject(adapter, states, `Creating ${Object.keys(states).length} normal states...`);
}

async function handleHtmlAdditionalStates(adapter) {
    const { usePV1, usePV2 } = adapter.config;

    const states = {};
    states["parameter.model"] = { name: "SBMS Model", unit: "", role: "value", type: "string" };
    states["parameter.type"] = { name: "Cell Type (Chemistry)", unit: "", role: "value", type: "number" };
    states["parameter.capacity"] = { name: "Cell Capacity", unit: "Ah", role: "value.energy", type: "number" };
    states["parameter.cvmin"] = { name: "Under Voltage Lock", unit: "mV", role: "value.voltage", type: "number" };
    states["parameter.cvmax"] = { name: "Over Voltage Lock", unit: "mV", role: "value.voltage", type: "number" };

    states["counter.battery"] = { name: "Battery Discharge", unit: "kWh", role: "value.energy", type: "number" };

    if (usePV1) {
        states["counter.pv1"] = { name: "PV1", unit: "kWh", role: "value.energy", type: "number" };
        states["counter.load"] = { name: "Total Load", unit: "kWh", role: "value.energy", type: "number" };
    }

    if (usePV2) {
        states["counter.pv2"] = { name: "PV2", unit: "kWh", role: "value.energy", type: "number" };
    }

    // Balancing states
    for (let i = 1; i <= 8; i++) {
        states[`cells.${i}.balancing`] = { name: `Cell Balancing ${i}`, type: "boolean", role: "indicator" };
    }

    // Delete all additional states if useHTML is false
    if (!adapter.config.useHtml) {
        for (const id of Object.keys(states)) {
            const fullId = `${id}`;
            adapter.delObject(fullId, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}: ${err}`);
            });
        }
        return; // exit early
    }

    // Otherwise create states
    await createStatesFromObject(adapter, states, `Creating ${Object.keys(states).length} addtional HTML states...`);

    // Delete balancing additional states if useHTML and useMQTT is true
    if (adapter.config.useHtml && adapter.config.useMQTT) {
        for (let i = 1; i <= 8; i++) {
            const fullId = `cells.${i}.balancing`;
            adapter.delObject(fullId, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}: ${err}`);
            });
        }
    }
}

async function createStatesFromObject(adapter, states, logMessage) {
    adapter.log.info(logMessage);
    for (const [id, def] of Object.entries(states)) {
        try {
            await adapter.setObjectNotExistsAsync(id, {
                type: "state",
                common: {
                    name: def.name,
                    type: def.type || "number",
                    role: def.role || "value",
                    unit: def.unit || "",
                    read: true,
                    write: false,
                },
                native: {},
            });
        } catch (e) {
            adapter.log.error(`Failed to create state ${id}: ${e.message}`);
        }
    }
}

module.exports = {
    createNormalStates,
    handleHtmlAdditionalStates,
};
