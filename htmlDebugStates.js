async function createHtmlDebugStates(adapter) {
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
        "sbms.ad3": { name: "ad3", unit: "mV", role: "value" }, //ADC3
        "sbms.ad4": { name: "ad4", unit: "mV", role: "value" }, //ADC2
        "sbms.heat1": { name: "heat1", unit: "", role: "value" },
        "sbms.dualPVLevel": { name: "dualPv", unit: "", role: "value" },
        // "sbms.cellsMV.delta": { name: "Cell delta", unit: "mV", role: "value.voltage" },
    };

    // 8 Zellen
    for (let i = 1; i <= 8; i++) {
        states[`sbms.cellsMV.${i}`] = { name: `Cell ${i}`, unit: "mV", role: "value.voltage" };
    }

    // Flags
    const flags = [
        "OV",
        "OVLK",
        "UV",
        "UVLK",
        "IOT",
        "COC",
        "DOC",
        "DSC",
        "CELF",
        "OPEN",
        "LVC",
        "ECCF",
        "CFET",
        "EOC",
        "DFET",
    ];
    for (const flag of flags) {
        states[`sbms.flags.${flag}`] = { name: `Flag ${flag}`, type: "boolean", role: "indicator" };
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

module.exports = { createHtmlDebugStates };
