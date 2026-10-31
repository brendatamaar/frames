<script setup lang="ts">
import { ref } from "vue";
import Card from "./Card.vue";

const visible = ref(true);
const tasks = ["Design review", "Accessibility pass", "Release notes"];
</script>
<template><main><h1>Project dashboard</h1><Card><button @click="visible = !visible">Toggle tasks</button><ul v-if="visible"><li v-for="task in tasks" :key="task">{{ task }}</li></ul></Card></main></template>
