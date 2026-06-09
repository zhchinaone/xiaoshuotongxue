# 小硕科研绘图网站维护说明

现在这个项目已经升级成“官网 + 可视化后台 + 飞书多维表格后端”结构。

## 你平时怎么用

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

在后台里你可以直接：

- 上传首页三张图
- 上传作品缩略图和大图
- 填写学校、期刊、作品说明
- 勾选分类
- 新增、复制、删除作品
- 导出和导入配置

## 飞书接入前要做什么

先复制一份 `.env.example`，改名为 `.env`，然后填这几个参数：

```text
PORT=3000
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxxxxx
FEISHU_BITABLE_APP_TOKEN=appxxxxxxxx
FEISHU_HERO_TABLE_NAME=首页主视觉
FEISHU_WORKS_TABLE_NAME=作品库
```

其中：

- `FEISHU_APP_ID` / `FEISHU_APP_SECRET`：飞书开放平台自建应用的凭证
- `FEISHU_BITABLE_APP_TOKEN`：多维表格链接里 `/base/` 后面的那段
- `FEISHU_HERO_TABLE_NAME`：首页图对应的数据表名
- `FEISHU_WORKS_TABLE_NAME`：作品库对应的数据表名

## 飞书多维表格会存什么

程序第一次保存时，会自动在你指定的多维表格里寻找或创建两张表：

- `首页主视觉`
- `作品库`

大致字段如下：

- `首页主视觉`
  `排序`、`图片说明`、`图片附件`

- `作品库`
  `排序`、`学校机构`、`期刊年份`、`作品说明`、`分类`、`图片替代文字`、`缩略图`、`大图`、`是否发布`

## 现在的保存逻辑

- 官网优先从后端 API 读取内容
- 后端优先从飞书多维表格读取内容
- 后台点击“保存修改”后，会把内容同步到飞书
- 首页展示图和作品缩略图会自动落到本地 `assets` 缓存，官网优先走本地文件
- 作品大图继续走飞书附件，方便你在飞书里统一管理和同步
- 如果 `.env` 还没配置，官网会先展示默认内容，后台会提示你当前还没连上飞书

## 重要提醒

当前版本需要通过 `http://localhost:3000` 访问，不要再直接双击打开 `index.html` 或 `admin.html`，因为飞书版后台依赖后端 API。

## 文件说明

- `server.js`：本地后端，负责静态文件服务和飞书 API 同步
- `admin.html` / `admin.js`：可视化内容管理页
- `index.html` / `script.js`：官网展示页
- `content-store.js`：图片压缩、内容结构工具
- `site-config.js`：默认展示内容，飞书未配置时会作为回退内容
