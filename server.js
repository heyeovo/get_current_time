import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(express.json());

// 创建 MCP 服务器实例（可以复用，但每个 transport 要独立）
const server = new Server(
  { name: "cloud-time-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_current_time",
      description: "获取当前的北京时间（GMT+8）与日期",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

// 工具调用处理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_current_time") {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const nowStr = formatter.format(new Date());
    return {
      content: [{ type: "text", text: `当前北京时间: ${nowStr} (时区: Asia/Shanghai)` }]
    };
  }
  throw new Error("Tool not found");
});

// 存储当前活跃的 transport（简单起见只支持一个客户端）
let currentTransport = null;

// SSE 端点：建立长连接
app.get('/sse', async (req, res) => {
  // 如果已有 transport，先关闭它（优雅关闭）
  if (currentTransport) {
    try {
      // 调用 close 方法断开旧连接
      await currentTransport.close();
    } catch (e) {
      // 忽略关闭错误
    }
    currentTransport = null;
  }

  // 创建新的 transport，注意路径要与 POST 端点匹配
  const transport = new SSEServerTransport('/messages', res);
  currentTransport = transport;

  // 连接 server 和 transport
  await server.connect(transport);

  // 注意：连接建立后，transport 会保持 res 打开，直到客户端断开
  // 当客户端断开时，我们可以清理引用
  // 但这里简单起见，当连接关闭时置空
  // 可以监听 close 事件
  res.on('close', () => {
    if (currentTransport === transport) {
      currentTransport = null;
    }
  });
});

// 消息接收端点：处理工具调用请求
app.post('/messages', async (req, res) => {
  if (currentTransport) {
    // 这个 handleMessage 会处理请求并自动响应
    await currentTransport.handleMessage(req, res);
  } else {
    res.status(400).send('No active SSE session');
  }
});

// 健康检查（可选）
app.get('/', (req, res) => {
  res.send('MCP time server is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});