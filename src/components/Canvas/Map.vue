<!-- Floorspace.js, Copyright (c) 2016-2017, Alliance for Sustainable Energy, LLC. All rights reserved.
Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
(1) Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
(2) Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
(3) Neither the name of the copyright holder nor the names of any contributors may be used to endorse or promote products derived from this software without specific prior written permission from the respective party.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER, THE UNITED STATES GOVERNMENT, OR ANY CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. -->

<template>
    <div id="map-container">
        <div id="map" ref="map" :style="{ 'pointer-events': tool === 'Map' ? 'all': 'none' }"></div>

        <div v-show="tool === 'Map'" id="autocomplete">
            <span class="input-text">
                <input ref="addressSearch" type="text" placeholder="Search for a location"/>
            </span>
        </div>
        <div v-show="tool === 'Map'" id="help-text">
            <p>Drag the map and/or search to set desired location.  Use alt+shift to rotate the north axis. Click 'Done' when finished.</p>
            <button @click="finishSetup">Done</button>
        </div>

        <map-modal v-if="mapModalVisible && !mapInitialized" @close="mapModalVisible = false; showReticle()"></map-modal>
        <svg id="reticle"></svg>
    </div>
</template>

<script>

import { mapState } from 'vuex';
import { ResizeEvents } from 'src/components/Resize'
import MapModal from 'src/components/Modals/MapModal'

const googleMaps = require('google-maps-api')('AIzaSyDIja3lnhq63SxukBm9_mA-jn5R0Bj9RN8', ['places']);
const ol = require('openlayers');
const d3 = require('d3');

export default {
  name: 'map-view',
  data() {
    return {
      view: null,
      map: null,
      startResolution: null,
      autocomplete: null,
      mapModalVisible: window.api ? window.api.config.showMapDialogOnStart : true,
      showGrid: false,
    };
  },

  /*
  * load the openlayers map, google maps autocomplete, and register a listener for view resizing
  */
  mounted() {
    this.showGrid = this.gridVisible;

    this.initAutoComplete();
    this.loadMap();
    ResizeEvents.$on('resize', this.updateMapView);
    window.eventBus.$on('boundsResolved', this.clearStartResolution);
  },

  /*
  * remove listener for view resizing
  */
  beforeDestroy() {
    ResizeEvents.$off('resize', this.updateMapView);
    window.eventBus.$off('boundsResolved', this.clearStartResolution);
  },

  methods: {
    clearStartResolution() {
      this.startResolution = null;
      this.updateMapView();
    },
    /*
    * Asynchronously load google maps autocomplete
    * attatch to address search field
    */
    initAutoComplete() {
      googleMaps().then((maps) => {
        // attatch to address search field
        const autocomplete = new maps.places.Autocomplete(this.$refs.addressSearch);
        // when an address is selected from the dropdown update the component lat/long coordinates
        autocomplete.addListener('place_changed', () => {
          // check that the selected place has associated lat/log data
          const place = autocomplete.getPlace();
          if (place.geometry) {
            this.latitude = place.geometry.location.lat();
            this.longitude = place.geometry.location.lng();
            this.updateMapView();
          }
        });
      });
    },

    /*
    * empty the map element and (re)load openlayers map canvas inside of it
    */
    loadMap() {
      window.ol = ol;
      this.$refs.map.innerHTML = '';
      this.view = new ol.View();
      this.map = new ol.Map({
        layers: [new ol.layer.Tile({ source: new ol.source.OSM() })],
        target: 'map',
        view: this.view,
      });
      this.view.on('propertychange', (e) => {
        if (e.key === 'rotation') {
          this.rotation = this.view.getRotation();
        }
      });

      this.updateMapView();
      // this.view.getCenter() is not always available at first render.
      // this seems to fix some problems with scale *shrug*
      _.defer(() => this.updateMapView());
    },

    /*
    * position the map
    */
    updateMapView() {
      console.log('updateMapView');
      this.map.updateSize();

      // current long/lat map position in meters
      const mapCenter = ol.proj.fromLonLat([this.longitude, this.latitude]);

      let resolution = this.unAdjustedResolution;
      let deltaY = this.unAdjustedDelta.y;
      let deltaX = this.unAdjustedDelta.x;
      // Web Mercator projections use different resolutions at different latitudes
      // if the map has been placed, adjust the values for the current latitude
      if (this.view.getCenter()) {
        this.startResolution = this.startResolution || ol.proj.getPointResolution(this.view.getProjection(), this.view.getResolution(), this.view.getCenter());
        const resolutionAdjustment = 1 / ol.proj.getPointResolution(this.view.getProjection(), 1, this.view.getCenter());

        resolution *= resolutionAdjustment;
        deltaY *= resolutionAdjustment;
        deltaX *= resolutionAdjustment;
      }

      // adjust map position based on size of grid
      mapCenter[0] += deltaY;
      mapCenter[1] += deltaX;

      this.view.setResolution(resolution);
      this.view.setCenter(mapCenter);
      this.view.setRotation(this.rotation);
    },

    /*
    * after the user places the map, save the latitude, longitude, and rotation
    */
    finishSetup() {
      const center = ol.proj.transform(this.view.getCenter(), 'EPSG:3857', 'EPSG:4326')
      this.longitude = center[0];
      this.latitude = center[1];

      const resolution = ol.proj.getPointResolution(this.view.getProjection(), this.view.getResolution(), this.view.getCenter());
      const scale = this.startResolution / resolution;
      console.log(`scaling to ${this.startResolution} / ${resolution} == ${scale}`);
      window.eventBus.$emit('scaleTo', scale);

      this.rotation = this.view.getRotation();

      this.$store.dispatch('project/setMapInitialized', { initialized: true });

      this.tool = 'Rectangle';

      // remove reticle
      d3.select('#reticle').remove();

      this.gridVisible = this.showGrid;
    },

    /*
    * render an svg reticle, hide the grid
    */
    showReticle() {
      if (this.tool !== 'Map') { return; }
      // hide grid
      this.gridVisible = false;

      // draw reticle
      const size = 100;
      const x = this.$refs.map.clientWidth / 2;
      const y = this.$refs.map.clientHeight / 2;

      d3.select('#reticle')
        .selectAll('#reticle path')
        .data([
          [{ x, y: y - size }, { x, y: y + size }],
          [{ x: x - size, y }, { x: x + size, y }],
        ])
        .enter()
        .append('path')
        .attr('stroke-width', '1')
        .attr('stroke', 'gray')
        .attr('d', d3.line().x(d => d.x).y(d => d.y));
    },
  },
  computed: {
    ...mapState({
      projectView: state => state.project.view,
      min_x: state => state.project.view.min_x,
      max_x: state => state.project.view.max_x,
      min_y: state => state.project.view.min_y,
      max_y: state => state.project.view.max_y,
      units: state => state.project.config.units,
      mapInitialized: state => state.project.map.initialized,
    }),
    mPerFt() { return ol.proj.METERS_PER_UNIT['us-ft']; },
    unAdjustedResolutionMeters() {
      // default map resolution RWU/px
      return (this.max_x - this.min_x) / this.$refs.map.clientWidth;
    },
    unAdjustedResolution() {
      return this.units === 'ip' ? this.mPerFt * this.unAdjustedResolutionMeters : this.unAdjustedResolutionMeters;
    },
    gridCenterMeters() {
      // center of grid in RWU
      return {
        x: (this.min_x + this.max_x) / 2,
        y: (this.min_y + this.max_y) / 2,
      };
    },
    gridCenter() {
      return this.units === 'ip' ? _.mapValues(this.gridCenterMeters, v => v * this.mPerFt) : this.gridCenterMeters;
    },
    unAdjustedDelta() {
      // openlayers places the center in the bottom left of the screen, so add the grid center (m) to the openlayers center
      // adjust for rotation
      // subtract the vertical grid center from the y adjustment because the y axis is inverted
      const deltaY = ((this.gridCenter.x * Math.cos(this.rotation)) - (this.gridCenter.y * Math.sin(this.rotation)));
      const deltaX = ((this.gridCenter.y * Math.cos(this.rotation)) + (this.gridCenter.x * Math.sin(this.rotation)));
      return { x: deltaX, y: deltaY };
    },

    gridVisible: {
      get() { return this.$store.state.project.grid.visible; },
      set(val) { this.$store.dispatch('project/setGridVisible', { visible: val }); },
    },
    tool: {
      get() { return this.$store.state.application.currentSelections.tool; },
      set(val) { this.$store.dispatch('application/setCurrentTool', { tool: val }); },
    },
    latitude: {
      get() { return this.$store.state.project.map.latitude; },
      set(val) { this.$store.dispatch('project/setMapLatitude', { latitude: val }); },
    },
    longitude: {
      get() { return this.$store.state.project.map.longitude; },
      set(val) { this.$store.dispatch('project/setMapLongitude', { longitude: val }); },
    },
    rotation: {
      get() { return this.$store.state.project.map.rotation; },
      set(val) { this.$store.dispatch('project/setMapRotation', { rotation: val }); },
    },
  },
  watch: {
    units() { this.updateMapView(); },
    rotation() { this.updateMapView(); },
    projectView: {
      handler() { this.updateMapView(); },
      deep: true,
    },
  },
  components: {
    MapModal,
  },
};

</script>
<style lang="scss" scoped>
@import "./../../scss/config";

#map-container {
    position: relative;
    height: 100%;
    width: 100%;

    #map {
        height: 100%;
        min-width: 100%;
    }
}

#autocomplete {
    z-index: 100;
    position: absolute;
    right: 0;
    top: 10px;

    > * {
        float: left;
        margin-right: 10px;
    }

    input {
      &:focus {
          outline: none;
      }
      padding-top: 0.5rem;
      padding-bottom: 0.5rem;
      font-size: medium;
    }
}

#help-text {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    z-index: 3;

    p {
        color: $gray-darkest;
        background: white;
        padding: 2px 4px;
        margin: 10px;
        width: calc(100% - 110px);
        border: 2px solid $gray-darkest;
        display: inline-block;
        // float: left;
    }

    button {
      display: inline-block;
      margin: 10px;
    }
}

#reticle {
    position: absolute;
    top: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

</style>
