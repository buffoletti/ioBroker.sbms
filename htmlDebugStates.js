async function handleHtmlDebugStates(adapter) {
    const source = "html"; // festgelegt, weil diese Datei nur web scraping behandelt

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
    for (const [flag, description] of Object.entries(flagDescriptions)) {
        states[`sbms.flags.${flag}`] = {
            name: description,
            type: "boolean",
            role: "indicator",
        };
    }

    states["s1.model"] = { name: "SBMS Model", unit: "", role: "value", type: "string" };

    // s2 Variable
    for (let i = 1; i <= 8; i++) {
        states[`s2.cellsBalancing.${i}`] = { name: `Cell Balancing ${i}`, type: "boolean", role: "indicator" };
    }

    states["s2.cellsMin"] = { name: "Minimum Voltage Cell ID", unit: "", role: "value", type: "number" };
    states["s2.cellsMax"] = { name: "Maximum Voltage Cell ID", unit: "", role: "value", type: "number" };
    states["s2.pvOn"] = { name: "PV Input On", type: "boolean", role: "indicator" };
    states["s2.loadOn"] = { name: "Load On", type: "boolean", role: "indicator" };

    // eW Counter Wh
    states["eW.eBatt"] = { name: "Energy Battery", unit: "Wh", role: "value.energy", type: "number" };
    states["eW.ePV1"] = { name: "Energy PV1", unit: "Wh", role: "value.energy", type: "number" };
    states["eW.ePV2"] = { name: "Energy PV2", unit: "Wh", role: "value.energy", type: "number" };
    states["eW.eLoad"] = { name: "Energy Load", unit: "Wh", role: "value.energy", type: "number" };
    states["eW.eExtLd"] = { name: "Energy External Load", unit: "Wh", role: "value.energy", type: "number" };

    //xsbms - Battery details
    states["xsbms.type"] = { name: "Battery Type", role: "value", type: "number" };
    states["xsbms.capacity"] = { name: "Battery Capacity", unit: "Ah", role: "value", type: "number" };
    states["xsbms.cvmin"] = { name: "Undervoltage Lock", unit: "mV", role: "value.voltage", type: "number" };
    states["xsbms.cvmax"] = { name: "Overvoltage Lock", unit: "mV", role: "value.voltage", type: "number" };
    states["xsbms.cv"] = { name: "cv", unit: "", role: "value", type: "number" };

    //additional debug states
    states["crcErrorCount"] = { name: "CRC Error Count", unit: "", role: "value", type: "number" };
    states["crcSuccessCount"] = { name: "CRC Success Count", unit: "", role: "value", type: "number" };

    // Delete all objects if debug is false
    if (!adapter.config.fullMessage || !adapter.config.htmlDebug) {
        for (const id of Object.keys(states)) {
            const fullId = `${source}.${id}`;
            adapter.delObject(fullId, (err) => {
                if (err) adapter.log.warn(`Could not delete ${fullId}: ${err}`);
            });
        }
        return; // exit early
    }

    for (const [id, def] of Object.entries(states)) {
        const fullId = `${source}.${id}`;
        await adapter.setObjectNotExistsAsync(fullId, {
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
    }
}

module.exports = { handleHtmlDebugStates };
