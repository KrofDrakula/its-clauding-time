<script lang="ts">
  import favicon from '#lib/assets/favicon.png';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} type="image/png" sizes="192x192" />
</svelte:head>

{@render children()}

<style>
  :global(body, html) {
    margin: 0;
    padding: 0;
    background: black;
    color: white;
    font-family: system-ui, sans-serif;
  }
  /* Form controls do not inherit the page font by default. */
  :global(button, input, select, textarea) {
    font-family: inherit;
  }
</style>
