<script lang="ts">import type { Snippet } from "svelte";

let { children }: { children: Snippet } = $props();
</script>
<article><h2>Release board</h2>{@render children()}</article>
