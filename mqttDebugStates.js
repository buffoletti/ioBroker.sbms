async function createMqttDebugStates(adapter) {
    const source = "mqtt"; // festgelegt, weil diese Datei nur MQTT behandelt

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

    // Create states with descriptive names
    for (const [flag, description] of Object.entries(flagDescriptions)) {
        states[`flags.${flag}`] = {
            name: description,
            type: "boolean",
            role: "indicator",
        };
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

module.exports = { createMqttDebugStates };
