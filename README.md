# 小硕科研绘图网站维护说明

现在这个项目同时支持两种运行方式：

- 本地 Node 版：适合你在电脑上直接维护和调试
- Cloudflare Pages 版：适合正式部署到公网

## 本地怎么用

1. 启动本地服务：

```bash
npm start
```

2. 打开官网：

```text
http://localhost:3000
```

3. 打开后台：

```text
http://localhost:3000/admin.html
```

后台里可以直接：

- 上传首页三张图
- 上传作品缩略图和大图
- 填写学校、期刊、作品说明
- 勾选分类
- 新增、复制、删除作品
- 导出和导入配置

## 本地 `.env` 怎么配

先复制一份 `.env.example`，改名为 `.env`，然后填写：

```text
PORT=3000
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxxxxx
FEISHU_BITABLE_APP_TOKEN=appxxxxxxxx
FEISHU_HERO_TABLE_NAME=首页主视觉
FEISHU_WORKS_TABLE_NAME=作品库
```

含义如下：

- `FEISHU_APP_ID` / `FEISHU_APP_SECRET`：飞书开放平台自建应用凭证
- `FEISHU_BITABLE_APP_TOKEN`：多维表格链接里 `/base/` 后面的那段
- `FEISHU_HERO_TABLE_NAME`：首页图对应的数据表名
- `FEISHU_WORKS_TABLE_NAME`：作品库对应的数据表名

## Cloudflare Pages 怎么部署

这个仓库现在已经补好了 Cloudflare Pages 所需结构：

- `functions/api/content.js`
- `functions/api/status.js`
- `functions/api/asset.js`
- `scripts/build-pages.js`
- `wrangler.toml`

部署时建议这样配：

1. 把仓库推到 GitHub。
2. 在 Cloudflare Pages 新建项目并连接这个仓库。
3. Build command 填：

```bash
npm run build:pages
```

4. Build output directory 填：

```text
dist
```

5. 在 Pages 项目的 Environment Variables 中配置：

```text
FEISHU_APP_ID
FEISHU_APP_SECRET
FEISHU_BITABLE_APP_TOKEN
FEISHU_HERO_TABLE_NAME
FEISHU_WORKS_TABLE_NAME
```

如果后两个表名不改，也可以不填，系统会默认使用：

- `首页主视觉`
- `作品库`

## 飞书多维表格会存什么

程序第一次保存时，会自动在你指定的多维表格里寻找或创建两张表：

- `首页主视觉`
- `作品库`

字段大致如下：

- `首页主视觉`
  `排序`、`图片说明`、`本地图片路径`、`图片附件`

- `作品库`
  `排序`、`缓存键`、`学校机构`、`期刊年份`、`作品说明`、`分类`、`图片替代文字`、`缩略图本地缓存`、`缩略图`、`大图`、`是否发布`

## 现在的图片逻辑

- 官网优先从 `/api/content` 读取内容
- 后端优先从飞书多维表格读取内容
- 后台点击“保存修改”后，会把内容同步到飞书
- 缩略图如果飞书里已经记录了本地缓存路径，会优先加载仓库里的静态文件
- 大图继续走飞书附件代理，方便你在飞书统一管理

要注意的一点：

- 本地 Node 版仍然可以继续做“运行时落本地缓存”
- Cloudflare Pages 版不能在运行时写入仓库里的 `assets/`
- 所以 Pages 上新上传的图片会保存到飞书并正常展示，但不会自动在服务器端新生成本地缩略图文件

如果你后面想把“新上传缩略图也自动转成本地静态缓存”继续保留，适合再升级成：

- Cloudflare R2 方案
- 或者增加一个构建期同步脚本

## 重要提醒

- 不要直接双击打开 `index.html` 或 `admin.html`
- 本地请通过 `http://localhost:3000`
- Cloudflare 上请通过 Pages 域名访问

## 主要文件说明

- `server.js`：本地 Node 后端
- `functions/api/*`：Cloudflare Pages Functions 接口
- `admin.html` / `admin.js`：可视化内容管理页
- `index.html` / `script.js`：官网展示页
- `content-store.js`：图片压缩、内容结构工具
- `site-config.js`：默认展示内容
- `scripts/build-pages.js`：把静态文件复制到 `dist/`
