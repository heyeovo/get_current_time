import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "cloud-time-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 1. 注册工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_current_time",
        description: "获取当前的北京时间（GMT+8）与日期",
        inputSchema: { type: "object", properties: {} }
      }
    ]
  };
});

// 2. 工具逻辑处理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_current_time") {
    // 手机端在云端运行，强行指定时区为中国标准时间
    const options = { timeZone: 'Asia/Shanghai', hour12: false };
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      ...options,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const nowStr = formatter.format(new Date());

    return {
      content: [{ type: "text", text: `当前北京时间: ${nowStr} (时区: Asia/Shanghai)` }]
    };
  }
  throw new Error("Tool not found");
});

// 3. 核心：通过 HTTP/SSE 协议暴露接口
let transport = null;

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Kelivo 首次连接时会发送 GET 请求建立长连接
    transport = new SSEServerTransport("/api/mcp", res);
    await server.connect(transport);
  } else if (req.method === "POST") {
    // 之后客户端的所有工具请求都通过 POST 发送到这里
    if (transport) {
      await transport.handleMessage(req, res);
    } else {
      res.status(400).send("SSE transport not initialized");
    }
  } else {
    res.status(405).send("Method Not Allowed");
  }
}