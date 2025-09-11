![Logo](admin/sbms.png)

# ioBroker.sbms

[![NPM version](https://img.shields.io/npm/v/iobroker.sbms.svg)](https://www.npmjs.com/package/iobroker.sbms)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sbms.svg)](https://www.npmjs.com/package/iobroker.sbms)
![Number of Installations](https://iobroker.live/badges/sbms-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/sbms-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.sbms.png?downloads=true)](https://nodei.co/npm/iobroker.sbms/)

**Tests:** ![Test and Release](https://github.com/buffoletti/ioBroker.sbms/workflows/Test%20and%20Release/badge.svg)

## Electrodacus SBMS adapter for ioBroker

Simple adapter to make data from [Electrodacus SBMS](https://electrodacus.com/) available as states from MQTT, the rawData html page or the serial port.

Units and structure was a little customized from original data stream. If full message option is enabled, original data is additionally pushed to sbms.x.mqtt/html/serial folders.

# Serial POrt

1. In SBMS check Baudrate (default 921600 with Wifi activated, if not reliable deactived wifi and reduce Baudrate)
2. Connect host to SBMS USB (or use USB to Serial Adapter and connect diretly if you dont have Wifi Extension Board)
3. On host ddentify serial port with `ls /dev/serial/by-id`
4. Configure in the adapter admin page accordingly
5. Adjust Updating intervall (1s: full stream is processed)

Notes:

- Wifi / MQTT
- If Serial Port is configured, MQTT and HTML is deactived.

# MQTT

1. Setup MQTT Broker and connect iobroker
2. Connect SBMS to wifi and MQTT broker
3. Identify ioBroker state that receives the SBMS JSON (default root/sbms)
4. In the SBMS adapter configuration name topic in the iobroker format with dots
5. Adjust Updating intervall (1s: every update of the topic state is processed)

# rawData

rawData html page has additional infos (eg. counters and balancing)

1. Connect SBMS to wifi
2. Identify IP and set static (wifi router)
3. In the SBMS adapter name IP adress
4. Adjust Updateinterval (<2s is not reliable)

If MQTT and HTML options are enabled, basic info is updated from MQTT stream whereas battery parameters and counters from the rawPage. balancing is not put in the general datastructure.

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

### 0.0.1 (2025-09-02)

- Initial Release

## License

MIT License

Copyright (c) 2025 buffoletti <asd@asd.asd>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
