'use strict';

/**
 * Decode raw SBMS string
 *
 * @param {number} p - start position
 * @param {number} s - length
 * @param {string} d - raw data string
 * @returns {number}
 */
function dcmp(p, s, d) {
    let xx = 0;
    for (let z = 0; z < s; z++) {
        xx += (d.charCodeAt(p + s - 1 - z) - 35) * Math.pow(91, z);
    }
    return xx;
}

/**
 * Calculate CRC for SBMS raw string
 *
 * @param {string} sbms_raw
 * @returns {number}
 */
function calculateCRC(sbms_raw) {
    let crc = 0;
    for (let i = 0; i <= 53; i++) {
        crc += dcmp(i, 1, sbms_raw);
    }
    crc += dcmp(56, 1, sbms_raw);
    crc += dcmp(57, 1, sbms_raw);
    crc += dcmp(58, 1, sbms_raw);
    crc += 1995;
    return crc;
}

/**
 * Check integrity (CRC) of SBMS raw string
 *
 * @param {string} sbms_raw
 * @returns {boolean}
 */
function checkIntegrity(sbms_raw) {
    const storedCRC = dcmp(54, 2, sbms_raw);
    const calculatedCRC = calculateCRC(sbms_raw);
    return storedCRC === calculatedCRC;
}
/**
 * Parse SBMS raw string into structured object
 *
 * @param {string} sbms_raw
 * @returns {object} Parsed SBMS object
 */
function parseSBMS(sbms_raw) {
    if (!sbms_raw) {
        return null;
    }

    // Parse timestamp
    const sbmsTime = {
        year: dcmp(0, 1, sbms_raw),
        month: dcmp(1, 1, sbms_raw),
        day: dcmp(2, 1, sbms_raw),
        hour: dcmp(3, 1, sbms_raw),
        min: dcmp(4, 1, sbms_raw),
        sec: dcmp(5, 1, sbms_raw),
    };

    const dt = new Date(
        2000 + sbmsTime.year,
        sbmsTime.month - 1,
        sbmsTime.day,
        sbmsTime.hour,
        sbmsTime.min,
        sbmsTime.sec,
    );

    const sbms = {};
    sbms.timeStr = dt.toLocaleString();

    sbms.soc = dcmp(6, 2, sbms_raw);
    sbms.cellsMV = [];
    for (let i = 0; i < 8; i++) {
        sbms.cellsMV[i] = dcmp(8 + i * 2, 2, sbms_raw);
    }

    sbms.tempInt = (dcmp(24, 2, sbms_raw) - 450) / 10;
    sbms.tempExt = (dcmp(26, 2, sbms_raw) - 450) / 10;

    sbms.currentMA = {
        battery: dcmp(29, 3, sbms_raw) * (sbms_raw.charAt(28) === '-' ? -1 : 1),
        pv1: dcmp(32, 3, sbms_raw),
        pv2: dcmp(35, 3, sbms_raw),
        extLoad: dcmp(38, 3, sbms_raw),
    };

    sbms.ad3 = dcmp(44, 3, sbms_raw);
    sbms.ad4 = dcmp(47, 3, sbms_raw);
    sbms.heat1 = dcmp(50, 3, sbms_raw);
    sbms.dualPVLevel = dcmp(53, 1, sbms_raw);

    // Flags
    const flagsDec = dcmp(56, 3, sbms_raw);
    const paddedflagsString = flagsDec.toString(2).padStart(14, '0');
    sbms.flags = {
        OV: paddedflagsString[14] === '1',
        OVLK: paddedflagsString[13] === '1',
        UV: paddedflagsString[12] === '1',
        UVLK: paddedflagsString[11] === '1',
        IOT: paddedflagsString[10] === '1',
        COC: paddedflagsString[9] === '1',
        DOC: paddedflagsString[8] === '1',
        DSC: paddedflagsString[7] === '1',
        CELF: paddedflagsString[6] === '1',
        OPEN: paddedflagsString[5] === '1',
        LVC: paddedflagsString[4] === '1',
        ECCF: paddedflagsString[3] === '1',
        CFET: paddedflagsString[2] === '1',
        EOC: paddedflagsString[1] === '1',
        DFET: paddedflagsString[0] === '1',
    };

    return sbms;
}

/**
 * Parse raw s2 array string into structured object
 *
 * @param {string} s2_raw
 * @returns {object} Parsed s2 object
 */
function parseS2(s2_raw) {
    if (!s2_raw) {
        return null;
    }

    const s2_values = s2_raw.split(',').map(Number); // convert all to numbers
    const s2 = { cellsBalancing: {} };

    // First 8 values → cell balancing (boolean)
    for (let i = 0; i < 8; i++) {
        s2.cellsBalancing[i + 1] = !!s2_values[i];
    }

    // Remaining values → min, max, PV/load flags
    const keys = ['cellsMax', 'cellsMin', 'pvOn', 'loadOn'];
    for (let i = 0; i < keys.length; i++) {
        s2[keys[i]] = i < 2 ? s2_values[8 + i] : !!s2_values[8 + i];
    }

    return s2;
}

/**
 * Parse raw s1 array string into structured object
 *
 * @param {string} s1_raw
 * @returns {object} Parsed s1 object
 */
function parseS1(s1_raw) {
    if (!s1_raw) {
        return null;
    }

    const s1_values = s1_raw.split(',');
    const s1 = {
        model: s1_values[2].replace(/^["']|["']$/g, '').trim(),
    };

    return s1;
}
/**
 * Parse raw eW string into structured object
 *
 * @param {string} eW_raw
 * @returns {object} Parsed eW object
 */
function parseEW(eW_raw) {
    if (!eW_raw) {
        return null;
    }

    return {
        eBatt: dcmp(0 * 6, 6, eW_raw) / 10,
        ePV1: dcmp(1 * 6, 6, eW_raw) / 10,
        ePV2: dcmp(2 * 6, 6, eW_raw) / 10,
        eLoad: dcmp(5 * 6, 6, eW_raw) / 10,
        eExtLd: dcmp(6 * 6, 6, eW_raw) / 10,
    };
}

/**
 * Parse raw xsbms string into structured object
 *
 * @param {string} xsbms_raw
 * @returns {object} Parsed xsbms object
 */
function parseXSBMS(xsbms_raw) {
    if (!xsbms_raw) {
        return null;
    }

    return {
        type: dcmp(7, 1, xsbms_raw),
        capacity: dcmp(8, 3, xsbms_raw),
        cvmin: dcmp(5, 2, xsbms_raw),
        cvmax: dcmp(3, 2, xsbms_raw),
        cv: dcmp(0, 3, xsbms_raw),
    };
}

module.exports = { dcmp, checkIntegrity, parseSBMS, parseS1, parseS2, parseEW, parseXSBMS };
