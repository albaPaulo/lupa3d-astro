// @ts-check
import { setDefaultResultOrder } from 'node:dns';
import { defineConfig } from 'astro/config';

// Nesta máquina a rota IPv6 não funciona (curl --ipv6 nem resolve host), mas
// o fetch do Node tenta IPv6 primeiro e demora/falha (522 do Cloudflare) em
// vez de cair pro IPv4 rápido como o curl faz — isso travava build e dev
// server em qualquer chamada à Supabase.
setDefaultResultOrder('ipv4first');

// https://astro.build/config
export default defineConfig({
  site: 'https://lupa3d.com.br',
});
