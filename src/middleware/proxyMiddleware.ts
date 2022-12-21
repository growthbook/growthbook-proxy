import {createProxyMiddleware} from "http-proxy-middleware";

export default ({
  targetUrl
}: {
  targetUrl: string;
}) => createProxyMiddleware({
  target: targetUrl,
  changeOrigin: true,
  selfHandleResponse: true,
});