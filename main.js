"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const serialHandler = require("./lib/handler/serial");
const mqttHandler = require("./lib/handler/mqtt");
const htmlHandler = require("./lib/handler/html");
const { createNormalStates } = require("./lib/states");
const { handleExtendedStates } = require("./lib/states");
const { handleDebugStates, handleMqttDebugStates } = require("./lib/debugStates");

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
        // this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        this.log.info("SBMS Adapter starting");

        // Normal States
        await createNormalStates(this);

        // Create or delete Debug Additional States
        await handleMqttDebugStates(this);
        await handleDebugStates(this, "html");
        await handleDebugStates(this, "serial");
        await handleExtendedStates(this);

        // serial enabled
        if (this.config.useSerial) {
            serialHandler.init(this, this.config.debug);
        } else {
            // serial not enabled
            this.setState("info.connection", { val: null, ack: true });

            // mqtt enabled
            if (this.config.useMQTT) {
                mqttHandler.init(this, this.config.mqttTopic, this.config.debug);
            }

            // html enabled
            if (this.config.useHtml) {
                htmlHandler.init(this, this.config.debug);
            }
        }
    }

    /**
     * Increment a numeric state by 1 (or a custom step).
     */
    async incrementState(state, step = 1) {
        const base = `sbms.${this.instance}.${state}`;

        await this.setObjectNotExistsAsync(base, {
            type: "state",
            common: {
                name: `Counter ${state}`,
                type: "number",
                role: "value",
                unit: "",
                def: 0,
                read: true,
                write: true,
            },
            native: {},
        });

        const current = (await this.getStateAsync(base)) || { val: 0 };
        const currentValue = Number(current.val) || 0;
        const newValue = currentValue + step;

        await this.setState(base, { val: newValue, ack: true });
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info("SBMS Adapter shutting down...");
            if (mqttHandler.cleanup) mqttHandler.cleanup(this);
            if (htmlHandler.cleanup) htmlHandler.cleanup();
            if (serialHandler.cleanup) serialHandler.cleanup(this);
            callback();
        } catch (e) {
            callback();
        }
    }

    writeState(state, value) {
        // Haupt-States
        const base = `sbms.${this.instance}.${state}`;
        this.setState(base, value, true);
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
