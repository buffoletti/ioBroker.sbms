// for html and serial
async function handleDebugStates(adapter, source) {
    // sbms variable
    const states = {
        "sbms.timeStr": { name: "Reported Timestamp of last Scrapping", unit: "", role: "value", type: "string" },
        "sbms.currentMA.battery": { name: "Battery current", unit: "mA", role: "value.current" },
        "sbms.currentMA.pv1": { name: "PV1 current", unit: "mA", role: "value.current" },
        "sbms.currentMA.pv2": { name: "PV2 current", unit: "mA", role: "value.current" },
        "sbms.currentMA.extLoad": { name: "External load current", unit: "mA", role: "value.current" },
        "sbms.soc": { name: "State of charge", unit: "%", role: "value.battery" },
        "sbms.tempInt": { name: "SBMS Internal temperature", unit: "°C", role: "value.temperature" },
        "sbms.tempExt": { name: "External temperature (if connected)", unit: "°C", role: "value.temperature" },
        //ad2: { name: "ad2", unit: "V", role: "value" }, //undefined
        "sbms.ad3": { name: "ADC3", unit: "mV", role: "value" }, //ADC3
        "sbms.ad4": { name: "ADC2", unit: "mV", role: "value" }, //ADC2
        "sbms.heat1": { name: "heat1", unit: "", role: "value" },
        "sbms.dualPVLevel": { name: "dualPv", unit: "", role: "value" },
        // "sbms.cellsMV.delta": { name: "Cell delta", unit: "mV", role: "value.voltage" },
    };
    states["sbms"] = { type: "folder", common: { name: "SBMS Variable" } };
    states["sbms.cellsMV"] = { type: "channel", common: { name: "" } };
    states["sbms.currentMA"] = { type: "channel", common: { name: "" } };

    // 8 Zellen
    for (let i = 1; i <= 8; i++) {
        states[`sbms.cellsMV.${i}`] = { name: `Cell ${i}`, unit: "mV", role: "value.voltage" };
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
    states["sbms.flags"] = { type: "channel", common: { name: "" } };

    for (const [flag, description] of Object.entries(flagDescriptions)) {
        states[`sbms.flags.${flag}`] = {
            name: description,
            type: "boolean",
            role: "indicator",
        };
    }
    states["s1"] = { type: "folder", common: { name: "s1 Variable" } };

    states["s1.model"] = { name: "SBMS Model", unit: "", role: "value", type: "string" };

    // s2 Variable
    states["s2"] = { type: "folder", common: { name: "s2 Variable" } };
    states["s2.cellsBalancing"] = { type: "channel", common: { name: "" } };

    for (let i = 1; i <= 8; i++) {
        states[`s2.cellsBalancing.${i}`] = { name: `Cell Balancing ${i}`, type: "boolean", role: "indicator" };
    }

    states["s2.cellsMin"] = { name: "Minimum Voltage Cell ID", unit: "", role: "value", type: "number" };
    states["s2.cellsMax"] = { name: "Maximum Voltage Cell ID", unit: "", role: "value", type: "number" };
    states["s2.pvOn"] = { name: "PV Input On", type: "boolean", role: "indicator" };
    states["s2.loadOn"] = { name: "Load On", type: "boolean", role: "indicator" };

    // eW Counter Wh
    states["eW"] = { type: "folder", common: { name: "eW Variable" } };

    states["eW.eBatt"] = { name: "Energy Battery", unit: "Wh", role: "value.energy", type: "number" };
    states["eW.ePV1"] = { name: "Energy PV1", unit: "Wh", role: "value.energy", type: "number" };
    states["eW.ePV2"] = { name: "Energy PV2", unit: "Wh", role: "value.energy", type: "number" };
    states["eW.eLoad"] = { name: "Energy Load", unit: "Wh", role: "value.energy", type: "number" };
    states["eW.eExtLd"] = { name: "Energy External Load", unit: "Wh", role: "value.energy", type: "number" };

    //xsbms - Battery details
    states["xsbms"] = { type: "folder", common: { name: "xsbms Variable" } };

    states["xsbms.type"] = { name: "Battery Type", role: "value", type: "number" };
    states["xsbms.capacity"] = { name: "Battery Capacity", unit: "Ah", role: "value", type: "number" };
    states["xsbms.cvmin"] = { name: "Undervoltage Lock", unit: "mV", role: "value.voltage", type: "number" };
    states["xsbms.cvmax"] = { name: "Overvoltage Lock", unit: "mV", role: "value.voltage", type: "number" };
    states["xsbms.cv"] = { name: "cv", unit: "", role: "value", type: "number" };

    //additional debug states
    states["crcErrorCount"] = { name: "CRC Error Count", unit: "", role: "value", type: "number" };
    states["crcSuccessCount"] = { name: "CRC Success Count", unit: "", role: "value", type: "number" };

    // Delete states if disabled
    if (
        !adapter.config.fullMessage ||
        (source === "html" && !adapter.config.useHtml) ||
        (source === "html" && adapter.config.useSerial) ||
        (source === "serial" && !adapter.config.useSerial)
    ) {
        for (const id of Object.keys(states)) {
            const fullId = `${source}.${id}`;
            adapter.delObject(fullId, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}: ${err}`);
            });
        }
        return;
    }

    // Create source folder
    await adapter.setObjectNotExistsAsync(source, {
        type: "folder",
        common: { name: source },
        native: {},
    });
    // Create states

    for (const [id, def] of Object.entries(states)) {
        const fullId = `${source}.${id}`;

        const objectType = def.type && ["state", "channel", "folder"].includes(def.type) ? def.type : "state";

        const common = {
            name: def.common?.name || def.name || id,
            role: def.role || def.common?.role || "value",
            unit: def.unit || def.common?.unit || "",
            read: def.read ?? true,
            write: def.write ?? false,
        };

        if (objectType === "state") {
            common.type =
                def.common?.type || (["number", "string", "boolean"].includes(def.type) ? def.type : "number");
        }

        await adapter.setObjectNotExistsAsync(fullId, {
            type: objectType,
            common,
            native: {},
        });
    }
}

async function handleMqttDebugStates(adapter) {
    const source = "mqtt"; // fix

    const states = {
        timeStr: { name: "Reported Timestamp of last MQTT message", unit: "", role: "value", type: "string" },
        "currentMA.battery": { name: "Battery current", unit: "mA", role: "value.current" },
        "currentMA.pv1": { name: "PV1 current", unit: "mA", role: "value.current" },
        "currentMA.pv2": { name: "PV2 current", unit: "mA", role: "value.current" },
        "currentMA.extLoad": { name: "External load current", unit: "mA", role: "value.current" },
        soc: { name: "State of charge", unit: "%", role: "value.battery" },
        tempInt: { name: "SBMS Internal temperature", unit: "°C", role: "value.temperature" },
        tempExt: { name: "External temperature (if connected)", unit: "°C", role: "value.temperature" },
        //ad2: { name: "ad2", unit: "V", role: "value" }, //undefined
        ad3: { name: "ADC3", unit: "V", role: "value" }, //ADC3
        ad4: { name: "ADC2", unit: "V", role: "value" }, //ADC2
        heat1: { name: "heat1", unit: "", role: "value" },
        heat2: { name: "heat2", unit: "", role: "value" }, //actually dualPV Level (first digit) and additional values (sencond and third digit) in th raw encrypted)
        "cellsMV.delta": { name: "Cell delta", unit: "mV", role: "value.voltage" },
    };
    states["currentMA"] = { type: "channel", common: { name: "" } };

    states["cellsMV"] = { type: "channel", common: { name: "" } };
    // 8 Zellen
    for (let i = 1; i <= 8; i++) {
        states[`cellsMV.${i}`] = { name: `Cell ${i}`, unit: "mV", role: "value.voltage" };
    }

    // Flags
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
    states["flags"] = { type: "channel", common: { name: "" } };

    // Create states with descriptive names
    for (const [flag, description] of Object.entries(flagDescriptions)) {
        states[`flags.${flag}`] = {
            name: description,
            type: "boolean",
            role: "indicator",
        };
    }

    // Delete all objects if full message is false
    if (!adapter.config.fullMessage || !adapter.config.useMQTT || adapter.config.useSerial) {
        for (const id of Object.keys(states)) {
            const fullId = `${source}.${id}`;
            adapter.delObject(fullId, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}: ${err}`);
            });
        }
        return; // exit early
    }

    // Otherwise create states
    // Create source folder
    await adapter.setObjectNotExistsAsync(source, {
        type: "folder",
        common: { name: source },
        native: {},
    });

    //states
    for (const [id, def] of Object.entries(states)) {
        const fullId = `${source}.${id}`;

        const objectType = def.type && ["state", "channel", "folder"].includes(def.type) ? def.type : "state";

        const common = {
            name: def.common?.name || def.name || id,
            role: def.role || def.common?.role || "value",
            unit: def.unit || def.common?.unit || "",
            read: def.read ?? true,
            write: def.write ?? false,
        };

        if (objectType === "state") {
            common.type =
                def.common?.type || (["number", "string", "boolean"].includes(def.type) ? def.type : "number");
        }

        await adapter.setObjectNotExistsAsync(fullId, {
            type: objectType,
            common,
            native: {},
        });
    }
}

module.exports = { handleDebugStates, handleMqttDebugStates };
