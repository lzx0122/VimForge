<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <section class="page-section">
    <h1>找不到頁面</h1>
    <p>這個網址不存在或已經移動。</p>
    <RouterLink to="/">
      返回首頁
    </RouterLink>
  </section>
</template>
