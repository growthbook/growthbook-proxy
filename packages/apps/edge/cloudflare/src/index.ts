/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		/**
		 * code goes here for url redirect
		 */
		const response = await fetch(url);

		const rewriter = new HTMLRewriter().on('head', {
			element(element: Element) {
				/**
				 * code goes here for injecting into the response
				 *
				 */
			},
		});
		return rewriter.transform(response);
	},
};
