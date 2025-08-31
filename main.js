"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const mqttHandler = require("./mqttHandler");
const htmlHandler = require("./htmlHandler");
const { createNormalStates } = require("./states");
const { createHtmlAdditionalStates } = require("./states");
const { createMqttDebugStates } = require("./mqttDebugStates");
const { createHtmlDebugStates } = require("./htmlDebugStates");

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

        // States anlegen
        // Normale States immer anlegen
        await createNormalStates(this);

        // Debug nur bei Bedarf
        if (this.config.debug) {
            if (this.config.useMQTT) {
                await createMqttDebugStates(this);
            }
            if (this.config.useHtml) {
                await createHtmlDebugStates(this);
            }
        }

        // mqtt aktivieren, falls konfiguriert
        if (this.config.useMQTT) {
            mqttHandler.init(this, this.config.mqttTopic, this.config.debug);
        }

        //HTML scraping aktivieren, falls konfiguriert
        if (this.config.useHtml) {
            this.log.info("HTML Scraping enabled");
            await createHtmlAdditionalStates(this);
            htmlHandler.init(this, this.config.debug);
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
            if (mqttHandler.cleanup) mqttHandler.cleanup();
            //if (webHandler.cleanup) webHandler.cleanup();
            callback();
        } catch (e) {
            callback();
        }
    }

    // /**
    //  * Is called if a subscribed state changes
    //  * @param {string} id
    //  * @param {ioBroker.State | null | undefined} state
    //  */
    // onStateChange(id, state) {
    //     if (state) {
    //         // The state was changed
    //         this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    //     } else {
    //         // The state was deleted
    //         this.log.info(`state ${id} deleted`);
    //     }
    // }

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
