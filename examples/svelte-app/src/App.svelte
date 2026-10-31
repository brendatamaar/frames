<script lang="ts">
import Card from "./Card.svelte";

let visible = $state(true);
const tasks = ["Design review", "Accessibility pass", "Release notes"];
</script>
<main><h1>Project dashboard</h1><Card><button onclick={()=>visible=!visible}>Toggle tasks</button>{#if visible}<ul>{#each tasks as task (task)}<li>{task}</li>{/each}</ul>{/if}</Card></main>
