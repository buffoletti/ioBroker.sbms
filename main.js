"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const mqttHandler = require("./mqtt");
//const webHandler = require("./web");
const { createNormalStates } = require("./states");
const { createDebugStates } = require("./mqttDebugStates");

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
                await createDebugStates(this);
            }
            if (this.config.useHtml) {
                await createDebugStates(this);
            }
        }

        // mqtt aktivieren, falls konfiguriert
        if (this.config.useMQTT) {
            this.log.info("MQTT topic: " + this.config.mqttTopic);

            mqttHandler.init(this, this.config.mqttTopic, this.config.debug); //this.config.debug);
        }

        // Webscraping aktivieren, falls konfiguriert
        // if (this.config.useWeb) {
        //     webHandler.init(this, this.config.deviceIP, this.config.debug);
        // }
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
