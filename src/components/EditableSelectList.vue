<template>
  <div
    class="editable-select-list"
    :class="{ 'expanded': !compact }"
    :data-object-type="selectedObjectType"
  >
    <div class="controls">
      <div class="control-group">
        <PrettySelect v-if="objectTypes.length > 1"
          @change="val => $emit('selectObjectType', val)"
          :options="objectTypes"
          :value="selectedObjectType"
        />
        <span v-else>{{ objectTypes[0].display || objectTypes[0].displayName }}</span>
      </div>
      <div class="control-group">
        <a @click="toggleCompact" :title="compact ? 'expand' : 'contract'">
          <DoubleArrows
            class="button"
            :transform="compact ? '' : 'scale(-1, 1)'"
          />
        </a>
      </div>
    </div>
    <div class="input-text search-spot">
      <input v-if="searchAvailable"
        v-model="search"
        class="search-bar"
        placeholder="search"
      />
    </div>
    <LibrarySelect
      v-if="compact"
      :rows="searchedRows"
      :selectItem="selectRow"
      :destroyItem="destroyRow"
      :selectedItemId="selectedRowId"
      :duplicateRow="duplicateRow"
    />
    <EditableTable
      v-else
      :selectRow="selectRow"
      :selectedItemId="selectedRowId"
      :columns="visibleColumns"
      :rows="searchedRows"
      :deleteRow="destroyRow"
      :updateRow="editRow"
      :duplicateRow="duplicateRow"
    />
    <a @click="addRow" v-if="addRow" class="add-new" title="Create new">
      <AddNew class="button"/> Add New
    </a>
  </div>
</template>
<script>
import EditableTable from './EditableTable.vue';
import LibrarySelect from './LibrarySelect.vue';
import PrettySelect from './PrettySelect.vue';
import DoubleArrows from './../assets/svg-icons/double_arrows.svg';
import AddNew from './../assets/svg-icons/add_new.svg';

export default {
  name: 'EditableSelectList',
  props: [
    'columns', 'rows', 'addRow', 'editRow', 'destroyRow', 'selectRow', 'selectedRowId',
    'objectTypes', 'selectedObjectType', 'searchAvailable', 'compact', 'duplicateRow',
  ],
  data() {
    return {
      search: '',
    };
  },
  computed: {
    visibleColumns() {
      return _.reject(this.columns, 'private');
    },
    searchedRows() {
      return this.rows.filter(
        row => _.chain(row)
          .omit(['color'])
          .values()
          .compact()
          .some(val => val.toLowerCase && val.toLowerCase().includes(this.search.toLowerCase()))
          .value()
      );
    },
  },
  methods: {
    toggleCompact() {
      this.$emit('toggleCompact', !this.compact)
    },
  },
  watch: {
    rows(newRows, oldRows) {
      if (newRows !== oldRows) {
        // looking at a different array, ignore.
        return;
      }
      if (newRows.length > oldRows.length) {
        this.selectRow(_.maxBy(this.rows, r => +r.id));
      }
    },
  },
  components: {
    EditableTable,
    LibrarySelect,
    PrettySelect,
    DoubleArrows,
    AddNew,
  },
}
</script>
<style lang="scss" scoped>
@import "./../scss/config";
.controls {
  display: flex;
  justify-content: space-between;
  flex-direction: row;
}
.control-group {
  display: flex;
  align-items: center;
  svg {
    margin-top: 4px;
    width: 1.7rem;
    height: 1.7rem;
    margin-left: 4px;
  }
}
.search-spot {
  height: 2rem;
  input {
    height: 1.5rem;
  }
}
.add-new {
  display: block;
  margin: 10px;
  font-size: 1.4em;
  svg {
    width: 20px;
    height: 20px;
  }
}
</style>
