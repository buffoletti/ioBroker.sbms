async function createNormalStates(adapter) {
    const states = {
        "current.battery": { name: "Battery current", unit: "A", role: "value.current" },
        "current.pv1": { name: "PV1 current", unit: "A", role: "value.current" },
        "current.pv2": { name: "PV2 current", unit: "A", role: "value.current" },
        "current.load": { name: "Load current", unit: "A", role: "value.current" },

        "power.battery": { name: "Battery Power", unit: "W", role: "value.power" },
        "power.pv1": { name: "PV1 Power", unit: "W", role: "value.power" },
        "power.pv2": { name: "PV2 Power", unit: "W", role: "value.power" },
        "power.load": { name: "Load Power", unit: "W", role: "value.power" },

        voltage: { name: "Battery voltage", unit: "V", role: "value.voltage" },
        soc: { name: "State of charge", unit: "%", role: "value.battery" },
        tempInt: { name: "SBMS Internal temperature", unit: "°C", role: "value.temperature" },
        tempExt: { name: "Battery temperature (if connected)", unit: "°C", role: "value.temperature" },
        ad3: { name: "AD3", unit: "V", role: "value" },
        ad4: { name: "AD4", unit: "V", role: "value" },
        "cells.min": { name: "Cell min", unit: "mV", role: "value.voltage" },
        "cells.max": { name: "Cell max", unit: "mV", role: "value.voltage" },
        "cells.min.ID": { name: "Cell ID min", unit: "", role: "value", type: "number" },
        "cells.max.ID": { name: "Cell ID max", unit: "", role: "value", type: "number" },
        "cells.delta": { name: "Cell delta", unit: "mV", role: "value.voltage" },
    };

    for (let i = 1; i <= 8; i++) {
        states[`cells.${i}`] = { name: `Cell ${i}`, unit: "mV", role: "value.voltage" };
    }

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
        states[`flags.${flag}`] = { name: `Flag ${flag}`, type: "boolean", role: "indicator" };
    }

    for (const [id, def] of Object.entries(states)) {
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
    }
}

module.exports = { createNormalStates };
