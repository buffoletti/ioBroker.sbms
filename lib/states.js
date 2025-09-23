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
        "cells.minID": { name: "Cell ID min", unit: "", role: "value", type: "number" },
        "cells.maxID": { name: "Cell ID max", unit: "", role: "value", type: "number" },
        "cells.delta": { name: "Cell delta", unit: "mV", role: "value.voltage" },
    };
    states["current"] = { type: "channel", common: { name: "Current" } };
    states["power"] = { type: "channel", common: { name: "Power" } };
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

    states["cells"] = { type: "channel", common: { name: "Cells" } };
    for (let i = 1; i <= 8; i++) {
        states[`cells.${i}`] = { name: `Cell ${i}`, unit: "mV", role: "value.voltage" };
    }

    // Flag definitions
    states["flags"] = { type: "channel", common: { name: "Flags" } };
    states["flags.errors"] = { type: "channel", common: { name: "Error Flags" } };
    states["flags.info"] = { type: "channel", common: { name: "Info Flags" } };
    const flagDescriptions = {
        // Info / non-critical
        OV: "Overvoltage",
        UV: "Undervoltage",
        CFET: "Charge FET Enabled",
        DFET: "Discharge FET Enabled",
        EOC: "End of Charge (may still be charging)",
        OVLK: "Overvoltage Lock",
        UVLK: "Undervoltage Lock",

        // Errors / critical
        IOT: "Internal Overtemperature",
        COC: "Charge Over Current",
        DOC: "Discharge Over Current",
        DSC: "Short Circuit",
        CELF: "Cell Failure",
        OPEN: "Open Cell Wire",
        LVC: "Low Voltage Cutoff",
        ECCF: "ECC Fault",
    };

    // Define which flags are errors vs info
    // const errorFlagsList = ["IOT", "COC", "DOC", "DSC", "CELF", "OPEN", "LVC", "ECCF"];
    const infoFlagsList = ["OVLK", "UVLK", "OV", "UV", "CFET", "DFET", "EOC"];

    // Create states
    for (const [flag, description] of Object.entries(flagDescriptions)) {
        const folder = infoFlagsList.includes(flag) ? "flags.info" : "flags.errors";
        states[`${folder}.${flag}`] = {
            name: description,
            type: "boolean",
            role: "indicator",
        };
    }

    // Consolidated states under flags.errors
    states["flags.errors.errorActive"] = {
        name: "Any Error Active",
        type: "boolean",
        role: "indicator.error",
    };

    states["flags.errors.errorCount"] = {
        name: "Error Count",
        type: "number",
        role: "value.error",
        min: 0,
    };

    states["flags.errors.activeErrors"] = {
        name: "Active Error Flags",
        type: "string",
        role: "json",
    };

    await createStatesFromObject(adapter, states, `Creating ${Object.keys(states).length} normal states...`);
}

async function handleExtendedStates(adapter, remove = false) {
    const { usePV1, usePV2 } = adapter.config;

    const states = {};
    states["info"] = { type: "folder", common: { name: "Info" } };

    states["info.model"] = { name: "SBMS Model", unit: "", role: "value", type: "string" };
    states["info.type"] = { name: "Cell Type (Chemistry)", unit: "", role: "value", type: "number" };
    states["info.capacity"] = { name: "Cell Capacity", unit: "Ah", role: "value.energy", type: "number" };
    states["info.cvmin"] = {
        name: "Under Voltage Lock Threshold",
        unit: "mV",
        role: "value.voltage",
        type: "number",
    };
    states["info.cvmax"] = {
        name: "Over Voltage Lock Threshold",
        unit: "mV",
        role: "value.voltage",
        type: "number",
    };

    // Counters
    states["counter"] = { type: "channel", common: { name: "Counter" } };
    states["counter.battery"] = { name: "Battery Discharge", unit: "kWh", role: "value.energy", type: "number" };
    if (usePV1) {
        states["counter.pv1"] = { name: "PV1", unit: "kWh", role: "value.energy", type: "number" };
        states["counter.load"] = { name: "Total Load", unit: "kWh", role: "value.energy", type: "number" };
    }
    if (usePV2) {
        states["counter.pv2"] = { name: "PV2", unit: "kWh", role: "value.energy", type: "number" };
    }

    // Balancing states
    states["balancing"] = { type: "channel", common: { name: "Balancing" } };
    for (let i = 1; i <= 8; i++) {
        states[`balancing.${i}`] = { type: "channel", common: { name: `Cell ${i} Balancing` } };
        states[`balancing.${i}.voltage`] = { name: `Cell ${i} Balancing Voltage`, unit: "mV", role: "value.voltage" };
        states[`balancing.${i}.active`] = { name: `Cell ${i} Balancing`, type: "boolean", role: "indicator" };
    }
    states[`balancing.anyActive`] = { name: `Any Cell Balancing`, type: "boolean", role: "indicator" };
    states[`balancing.max`] = { name: `Max Cell Balancing Voltage`, unit: "mV", role: "value.voltage" };
    states[`balancing.min`] = { name: `Min Cell Balancing Voltage`, unit: "mV", role: "value.voltage" };
    states[`balancing.minID`] = { name: "Cell ID min", unit: "", role: "value", type: "number" };
    states[`balancing.maxID`] = { name: "Cell ID max", unit: "", role: "value", type: "number" };
    states[`balancing.activeCount`] = { name: "Count of Balancing Cells", role: "value", type: "number", min: 0 };

    // Delete all additional states if not using HTML or Serial
    if (!(adapter.config.useHtml || adapter.config.useSerial) || remove) {
        for (const id of Object.keys(states)) {
            const fullId = `${id}`;
            adapter.delObject(fullId, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}: ${err}`);
            });
        }
        return; // exit early
    }

    // Otherwise create states
    await createStatesFromObject(adapter, states, `Creating ${Object.keys(states).length} addtional states...`);

    // Delete balancing additional states if useHTML and useMQTT is true
    if (adapter.config.useHtml && adapter.config.useMQTT && !adapter.config.useSerial) {
        // delete per-cell states
        for (let i = 1; i <= 8; i++) {
            const fullId = `balancing.${i}`;
            adapter.delObject(fullId, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}: ${err}`);
            });
            // also delete nested .active and .voltage just in case
            adapter.delObject(`balancing.${i}.active`, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}.active: ${err}`);
            });
            adapter.delObject(`balancing.${i}.voltage`, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}.voltage: ${err}`);
            });
        }

        // delete overall states
        const overall = ["anyActive", "max", "min", "min.ID", "max.ID", "activeCount"];
        overall.forEach((id) => {
            adapter.delObject(`balancing.${id}`, (err) => {
                if (err) adapter.log.warn(`Could not delete balancing.${id}: ${err}`);
            });
        });
    }
}

async function createStatesFromObject(adapter, states, logMessage) {
    adapter.log.info(logMessage);
    for (const [id, def] of Object.entries(states)) {
        const objectType = def.type && ["state", "channel", "folder"].includes(def.type) ? def.type : "state";

        const common = {
            name: def.common?.name || def.name || id,
            role: def.role || def.common?.role || "value",
            unit: def.unit || def.common?.unit || "",
            read: def.read ?? true,
            write: def.write ?? false,
        };

        if (objectType === "state") {
            common.type = def.common?.type || def.type || "number";
        }

        try {
            await adapter.setObjectNotExistsAsync(id, {
                type: objectType,
                common,
                native: {},
            });
        } catch (e) {
            adapter.log.error(`Failed to create ${objectType} ${id}: ${e.message}`);
        }
    }
}

module.exports = {
    createNormalStates,
    handleExtendedStates,
};
