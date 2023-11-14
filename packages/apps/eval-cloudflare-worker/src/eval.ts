export default {
    async fetch(request, env, ctx) {
        const value = await env.GB_FEATURES.list();
        return new Response(value.keys);
    },
};