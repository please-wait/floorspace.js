/* eslint-disable */

// was moved to the main HTML so that dev works. Figure out how to include it as an asset in `npm run dev` then put it back here. Then for build embedable copy it to dist

// window.api = {
//   config: {},
//   initAlreadyRun: false,
//   openFloorplan: function openFloorplan(data, _options) {
//     var options = _options || { noReloadGrid: false };
//     try {
//       window.application.$store.dispatch('importFloorplan', {
//         clientWidth: document.getElementById('svg-grid').clientWidth,
//         clientHeight: document.getElementById('svg-grid').clientHeight,
//         data: JSON.parse(data),
//         options: options
//       });
//     } catch (err) {
//       console.error(err);
//       return false;
//     }
//     return true;
//   },
//   importLibrary: function importLibrary(data) {
//     try {
//       window.application.$store.dispatch('importLibrary', { data: JSON.parse(data) });
//     } catch (err) {
//       console.error(err);
//       return false;
//     }
//     return true;
//   },
//   exportFloorplan: function exportFloorplan() {
//     return window.application.$store.getters['exportData'];
//   },
//   setConfig: function setConfig(config) {
//     if (window.api.initAlreadyRun) {
//       throw new Error('The application has already been started, configuration cannot be changed.');
//     }

//     if (config === undefined) {
//       config = {}; // eslint-disable-line
//     }
//     if (config.snapMode && !['grid-strict', 'grid-verts-edges'].includes(config.snapMode)) {
//       throw new Error('unrecognized value for snapMode: ' + config.snapMode + '. expected \'grid-strict\' or \'grid-verts-edges\'');
//     }
//     window.api.config = Object.assign({
//       properateMode: true,
//       showImportExport: false,
//       units: 'ip',
//       unitsEditable: true,
//       enable3DPreview: true,
//       showMapDialogOnStart: false,
//       showMap: true,
//       online: true,
//       initialGridSize: 1,
//       initialNorthAxis: 0,
//       defaultLocation: {
//         latitude: 49.2827,
//         longitude: -123.1207
//       },
//       snapMode: 'grid-verts-edges',
//       onChange: function onChange() {
//         window.versionNumber += 1;
//       },
//     }, config);
//   },
//   init: function init() {
//     if (window.api.initAlreadyRun) {
//       throw new Error('This method can only be run once!');
//     }
//     window.versionNumber = 0;
//     window.startApp();
//     delete window.startApp;

//     // don't dispatch actions until the application and data store are instantiated
//     window.application.$store.dispatch('project/setUnits', { units: window.api.config.units, editable: window.api.config.unitsEditable });
//     window.application.$store.dispatch('project/setShowImportExport', window.api.config.showImportExport);
//     window.application.$store.dispatch('project/setSpacing', { spacing: window.api.config.initialGridSize });
//     window.application.$store.dispatch('project/setNorthAxis', { north_axis: window.api.config.initialNorthAxis });

//     window.application.$store.dispatch('project/setPreview3DEnabled', { enabled: window.api.config.enable3DPreview });
//     window.application.$store.dispatch('project/setMapEnabled', { enabled: window.api.config.showMap });
//     window.application.$store.dispatch('project/setMapVisible', { visible: window.api.config.showMap });

//     window.application.$store.dispatch('project/setMapLatitude', { latitude: window.api.config.defaultLocation.latitude });
//     window.application.$store.dispatch('project/setMapLongitude', { longitude: window.api.config.defaultLocation.longitude });

//     window.application.$store.dispatch('application/setCurrentSnapMode', { snapMode: window.api.config.snapMode });
//     window.api.initAlreadyRun = true;
//   },
// };
// window.api.setConfig(); 