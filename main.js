"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const mqttHandler = require("./mqtt");
const webHandler = require("./web");

// Load your modules here, e.g.:
// const fs = require("fs");

class SbmsAdapter extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "sbms",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.log.info("SBMS Adapter ready");

		// States anlegen
            await this.createObjects();
            
        // mqtt aktivieren, falls konfiguriert
        if (this.config.useMQTT) {
			this.log.info("MQTT topic type: " + typeof this.config.mqttTopic + ", value: " + this.config.mqttTopic);

            mqttHandler.init(this, this.config.mqttTopic, this.config.debug);//this.config.debug);
        }

        // Webscraping aktivieren, falls konfiguriert
        // if (this.config.useWeb) {
        //     webHandler.init(this, this.config.deviceIP, this.config.debug);
        // }
	}

	async createObjects() {
        const states = {
            "currentMA.battery": {name: "Battery current", unit: "mA", role: "value.current"},
            "currentMA.pv1": {name: "PV1 current", unit: "mA", role: "value.current"},
            "currentMA.extLoad": {name: "External load current", unit: "mA", role: "value.current"},
            "currentMA.load": {name: "Calculated load current", unit: "mA", role: "value.current"},
            "voltage": {name: "Battery Pack Voltage", unit: "V", role: "value.voltage"},
            "soc": {name: "State of charge", unit: "%", role: "value.battery"},
            "tempInt": {name: "SBMS Internal temperature", unit: "°C", role: "value.temperature"},
            "tempExt": {name: "External temperature (if connected)", unit: "°C", role: "value.temperature"},
            "ad3": {name: "AD3", unit: "V", role: "value"},
            "ad4": {name: "AD4", unit: "V", role: "value"},
            "cellsMV.min": {name: "Cell min", unit: "mV", role: "value.voltage"},
            "cellsMV.max": {name: "Cell max", unit: "mV", role: "value.voltage"},
            "cellsMV.delta": {name: "Cell delta", unit: "mV", role: "value.voltage"},
        };

        // 8 Zellen
        for (let i = 1; i <= 8; i++) {
            states[`cellsMV.${i}`] = {name: `Cell ${i}`, unit: "mV", role: "value.voltage"};
        }

        // Flags
        const flags = ["OV","OVLK","UV","UVLK","IOT","COC","DOC","DSC","CELF","OPEN","LVC","ECCF","CFET","EOC","DFET"];
        for (const flag of flags) {
            states[`flags.${flag}`] = {name: `Flag ${flag}`, type: "boolean", role: "indicator"};
        }

        // Jetzt alle States anlegen
        for (const [id, def] of Object.entries(states)) {
            await this.setObjectNotExistsAsync(id, {
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

		// Debug-States anlegen (pro Quelle)
		const sources = ["mqtt"];
		for (const src of sources) {
			for (const [id, def] of Object.entries(states)) {
				const debugId = `${src}.${id}`;
				await this.setObjectNotExistsAsync(debugId, {
					type: "state",
					common: {
						name: `${def.name} (${src} debug)`,
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
    }



	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
        try {
            this.log.info("SBMS Adapter shutting down...");
            if (mqttHandler.cleanup) mqttHandler.cleanup();
            //if (webHandler.cleanup) webHandler.cleanup();
            callback();
        } catch (e) {
            callback();
        }
    }



	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}


	writeState(state, value, source = "main") {
		// Haupt-States
		const base = `sbms.${this.instance}.${state}`;
		this.setState(base, value, true);

		// Debug-States pro Quelle
		if (this.config.debug && (source === "mqtt" || source === "web")) {
			const dbgBase = `sbms.${this.instance}.${source}.${state}`;
			this.setState(dbgBase, value, true);
		}
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new SbmsAdapter(options);
} else {
	// otherwise start the instance directly
	new SbmsAdapter();
}
