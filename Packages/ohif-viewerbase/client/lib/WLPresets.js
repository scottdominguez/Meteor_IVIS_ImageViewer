import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { Tracker } from 'meteor/tracker';
import { _ } from 'meteor/underscore';
import { OHIF } from 'meteor/ohif:core';
import { cornerstone } from 'meteor/ohif:cornerstone';
import { viewportUtils } from './viewportUtils';

const WL_PRESET_CUSTOM = 'Custom';
const WL_PRESET_DEFAULT = 'Default';
const WL_STORAGE_KEY = `WindowLevelPresetsDefinitions`;

OHIF.viewer.defaultWLPresets = {
    0: {
        id: 'SoftTissue',
        wc: 40,
        ww: 400
    },
    1: {
        id: 'Lung',
        wc: 40,
        ww: 400
    },
    2: {
        id: 'Liver',
        wc: 90,
        ww: 150
    },
    3: {
        id: 'Bone',
        wc: 90,
        ww: 150
    },
    4: {
        id: 'Brain',
        wc: 480,
        ww: 2500
    },
    5: {
        id:'Abdomen',
        wc: 250,
        ww: 120
    },
    6: {

    },
    7: {},
    8: {},
    9: {}
};

class WindowLevelPresetsManager {
    constructor() {
        this.defaults = {};
        this.retrieveFunction = null;
        this.storeFunction = null;
        this.changeObserver = new Tracker.Dependency();
    }

    setRetrieveFunction(retrieveFunction) {
        this.retrieveFunction = retrieveFunction;
    }

    setStoreFunction(storeFunction) {
        this.storeFunction = storeFunction;
    }

    updateElementWLPresetData(element) {
        const wlPresetData = cornerstone.getElementData(element, 'wlPreset');
        const enabledElement = cornerstone.getEnabledElement(element);
        const { viewport, image } = enabledElement;
        const { windowCenter, windowWidth } = viewport.voi;
        let preset, presetName;

        if (windowWidth === image.windowWidth && windowCenter === image.windowCenter) {
            presetName = WL_PRESET_DEFAULT;
        } else {
            const WLPresets = OHIF.viewer.wlPresets;
            for (let index in WLPresets) {
                if (!WLPresets.hasOwnProperty(index)) continue;
                const currentPreset = WLPresets[index];
                if (windowCenter === currentPreset.wc && windowWidth === currentPreset.ww) {
                    preset = currentPreset;
                    presetName = preset.id;
                    break;
                }
            }
        }

        wlPresetData.name = presetName || WL_PRESET_CUSTOM;
        wlPresetData.ww = windowWidth;
        wlPresetData.wc = windowCenter;

        if (wlPresetData.name === WL_PRESET_CUSTOM) {
            const custom = wlPresetData.custom || (wlPresetData.custom = Object.create(null));
            custom.ww = windowWidth;
            custom.wc = windowCenter;
        }
    }

    /**
     * Set specified W/L preset on given element on fallback to default W/L preset if the specified preset is not valid.
     * @param {String} presetName The desired W/L preset to be applied
     * @param {DOMElement} element An enabled viewport DOM Element.
     */
    applyWLPreset(presetName, element) {
        const wlPresets = OHIF.viewer.wlPresets;
        const wlPresetData = cornerstone.getElementData(element, 'wlPreset');
        const viewport = cornerstone.getViewport(element);

        const preset = wlPresets[presetName] || _.findWhere(wlPresets, { id: presetName });
        if (presetName === WL_PRESET_CUSTOM && wlPresetData.custom) {
            viewport.voi.windowWidth = wlPresetData.custom.ww;
            viewport.voi.windowCenter = wlPresetData.custom.wc;
        } else if (preset && !_.isEmpty(preset) && preset.id) {
            presetName = preset.id;
            viewport.voi.windowWidth = preset.ww;
            viewport.voi.windowCenter = preset.wc;
        } else {
            const enabledElement = cornerstone.getEnabledElement(element);
            viewport.voi.windowWidth = enabledElement.image.windowWidth;
            viewport.voi.windowCenter = enabledElement.image.windowCenter;
            presetName = WL_PRESET_DEFAULT;
        }

        wlPresetData.name = presetName;
        wlPresetData.ww = viewport.voi.windowWidth;
        wlPresetData.wc = viewport.voi.windowCenter;

        // Update the viewport
        cornerstone.setViewport(element, viewport);

        OHIF.log.info('WLPresets::Applying WL Preset: ' + presetName);

        // Notify other components about W/L Preset changes
        Session.set('OHIFWlPresetApplied', presetName);
    }

    store(wlPresets) {
        return new Promise((resolve, reject) => {
            if (this.storeFunction) {
                this.storeFunction.call(this, WL_STORAGE_KEY, wlPresets).then(resolve).catch(reject);
            } else if (Meteor.userId()) {
                OHIF.user.setData(WL_STORAGE_KEY, wlPresets).then(resolve).catch(reject);
            } else {
                Session.setPersistent(WL_STORAGE_KEY, wlPresets);
                resolve();
            }
        }).then(() => this.setOHIFWLPresets.call(this, wlPresets));
    }

    retrieve() {
        return new Promise((resolve, reject) => {
            if (this.retrieveFunction) {
                this.retrieveFunction.call(this).then(resolve).catch(reject);
            } else if (OHIF.user) {
                try {
                    resolve(OHIF.user.getData(WL_STORAGE_KEY));
                } catch(error) {
                    reject(error);
                }
            } else {
                resolve(Session.get(WL_STORAGE_KEY));
            }
        });
    }

    load() {
        return new Promise((resolve, reject) => {
            this.retrieve().then(wlPresets => {
                if (wlPresets) {
                    this.setOHIFWLPresets.call(this, wlPresets);
                } else {
                    this.loadDefaults.call(this);
                }
            }).catch(() => this.loadDefaults.call(this));
        });
    }

    applyWLPresetToActiveElement(presetName) {
        const element = viewportUtils.getActiveViewportElement();
        if (!element) {
            return;
        }

        this.applyWLPreset(presetName, element);
    }

    /**
     * Overrides OHIF's wlPresets
     * @param  {Object} wlPresets Object with wlPresets mapping
     */
    setOHIFWLPresets(wlPresets) {
        const hasOwn = Object.prototype.hasOwnProperty;
        const presetMap = Object.create(null); // Objects without prototype have much faster lookup times
        for (let index in wlPresets) {
            if (hasOwn.call(wlPresets, index)) {
                presetMap[index] = wlPresets[index];
            }
        }

        OHIF.viewer.wlPresets = presetMap;
        this.changeObserver.changed();
    }

    loadDefaults() {
        this.setOHIFWLPresets(OHIF.viewer.defaultWLPresets);
    }

    resetDefaults() {
        return this.store(OHIF.viewer.defaultWLPresets);
    }
}

/**
 * Export functions inside WLPresets namespace.
 */
const WLPresets = new WindowLevelPresetsManager();

Meteor.startup(() => {
    WLPresets.loadDefaults();
    WLPresets.load();
});

export { WLPresets };
