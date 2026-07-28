/**
 * FileCut 工具元数据 - 共112个功能页面
 * 每个工具对应一个独立页面，可无限扩展
 *
 * 字段说明：
 * - id: 工具唯一标识
 * - title: 显示标题
 * - path: 路由路径
 * - keywords: 搜索关键词
 * - desc: 简短描述
 * - inputs: 接受的文件类型
 * - icon: 图标(emoji或字符)
 */

export const categories = [
  {
    id: 'pdf',
    name: 'PDF工具',
    icon: '📕',
    desc: 'PDF转换·编辑·安全',
    tools: [
      // 转换类
      { id: 'pdf-to-word', title: 'PDF转Word', path: '/pdf/pdf-to-word', keywords: 'pdf转word docx 转换', desc: 'PDF转可编辑Word文档，保留表格与文本', inputs: ['pdf'], icon: 'W' },
      { id: 'pdf-to-excel', title: 'PDF转Excel', path: '/pdf/pdf-to-excel', keywords: 'pdf转excel xlsx 表格', desc: 'PDF表格转Excel，保留单元格结构', inputs: ['pdf'], icon: 'X' },
      { id: 'pdf-to-ppt', title: 'PDF转PPT', path: '/pdf/pdf-to-ppt', keywords: 'pdf转ppt pptx 演示', desc: 'PDF转PPT演示文稿', inputs: ['pdf'], icon: 'P' },
      { id: 'pdf-to-image', title: 'PDF转图片', path: '/pdf/pdf-to-image', keywords: 'pdf转图片 jpg png webp', desc: 'PDF每页转为高清图片', inputs: ['pdf'], icon: 'I' },
      { id: 'pdf-to-html', title: 'PDF转HTML', path: '/pdf/pdf-to-html', keywords: 'pdf转html 网页', desc: 'PDF转网页，中文不乱码', inputs: ['pdf'], icon: 'H' },
      { id: 'pdf-to-txt', title: 'PDF转TXT', path: '/pdf/pdf-to-txt', keywords: 'pdf转txt 文本 提取', desc: '提取PDF纯文本', inputs: ['pdf'], icon: 'T' },
      { id: 'pdf-ocr-searchable', title: '扫描件OCR转可搜索PDF', path: '/pdf/pdf-ocr-searchable', keywords: '扫描件 ocr 识别 搜索', desc: '扫描PDF转可搜索文字层PDF', inputs: ['pdf'], icon: 'S' },
      { id: 'pdf-to-pdfa', title: 'PDF转PDF/A', path: '/pdf/pdf-to-pdfa', keywords: 'pdf/a 归档 合规', desc: '转换为PDF/A长期归档格式', inputs: ['pdf'], icon: 'A' },
      { id: 'pdf-to-epub', title: 'PDF转EPUB', path: '/pdf/pdf-to-epub', keywords: 'pdf转epub 电子书', desc: 'PDF转电子书EPUB格式', inputs: ['pdf'], icon: 'E' },
      { id: 'pdf-to-markdown', title: 'PDF转Markdown', path: '/pdf/pdf-to-markdown', keywords: 'pdf转md markdown 知识库', desc: 'PDF转Markdown文档', inputs: ['pdf'], icon: 'M' },
      // 编辑类
      { id: 'pdf-merge', title: 'PDF合并', path: '/pdf/pdf-merge', keywords: 'pdf合并 拼接 多个', desc: '多个PDF合并为一个', inputs: ['pdf'], icon: '+' },
      { id: 'pdf-split', title: 'PDF拆分', path: '/pdf/pdf-split', keywords: 'pdf拆分 分页', desc: 'PDF按页拆分为多个文件', inputs: ['pdf'], icon: '÷' },
      { id: 'pdf-compress', title: 'PDF压缩', path: '/pdf/pdf-compress', keywords: 'pdf压缩 减小 优化', desc: '压缩PDF文件大小', inputs: ['pdf'], icon: '↓' },
      { id: 'pdf-rotate', title: 'PDF旋转', path: '/pdf/pdf-rotate', keywords: 'pdf旋转 翻转', desc: '旋转PDF页面方向', inputs: ['pdf'], icon: '↻' },
      { id: 'pdf-delete-pages', title: 'PDF删除页面', path: '/pdf/pdf-delete-pages', keywords: 'pdf删除 页面 提取', desc: '删除指定页面或提取页', inputs: ['pdf'], icon: '×' },
      { id: 'pdf-reorder', title: 'PDF页面重排', path: '/pdf/pdf-reorder', keywords: 'pdf重排 顺序 调整', desc: '拖拽调整页面顺序', inputs: ['pdf'], icon: '⇄' },
      { id: 'pdf-watermark', title: 'PDF加水印', path: '/pdf/pdf-watermark', keywords: 'pdf水印 文字 图片', desc: '为PDF添加文字或图片水印', inputs: ['pdf'], icon: '◐' },
      { id: 'pdf-page-number', title: 'PDF加页码', path: '/pdf/pdf-page-number', keywords: 'pdf页码 编号', desc: '为PDF添加页码', inputs: ['pdf'], icon: '#' },
      { id: 'pdf-header-footer', title: 'PDF加页眉页脚', path: '/pdf/pdf-header-footer', keywords: 'pdf页眉 页脚', desc: '添加页眉页脚', inputs: ['pdf'], icon: '☰' },
      { id: 'pdf-form-fill', title: 'PDF表单填写', path: '/pdf/pdf-form-fill', keywords: 'pdf表单 填写 form', desc: '填写PDF交互表单', inputs: ['pdf'], icon: '▤' },
      { id: 'pdf-metadata', title: 'PDF元数据编辑', path: '/pdf/pdf-metadata', keywords: 'pdf元数据 信息 标题', desc: '编辑PDF标题作者等元信息', inputs: ['pdf'], icon: 'ⓘ' },
      // 安全类
      { id: 'pdf-encrypt', title: 'PDF加密解密', path: '/pdf/pdf-encrypt', keywords: 'pdf加密 解密 密码', desc: 'PDF加密或解密', inputs: ['pdf'], icon: '⚿' },
      { id: 'pdf-sign', title: 'PDF数字签名', path: '/pdf/pdf-sign', keywords: 'pdf签名 证书 pades', desc: 'PDF数字签名（PAdES）', inputs: ['pdf'], icon: '✎' },
      { id: 'pdf-redact', title: 'PDF隐私脱敏', path: '/pdf/pdf-redact', keywords: 'pdf脱敏 隐藏 删除', desc: '删除隐藏内容/元数据', inputs: ['pdf'], icon: '▣' },
    ]
  },
  {
    id: 'word',
    name: 'Word工具',
    icon: '📘',
    desc: 'Word预览·转换·编辑',
    tools: [
      { id: 'word-preview', title: 'Word预览', path: '/word/word-preview', keywords: 'word预览 docx 查看', desc: '高保真预览Word文档', inputs: ['docx'], icon: '👁' },
      { id: 'word-to-pdf', title: 'Word转PDF', path: '/word/word-to-pdf', keywords: 'word转pdf docx', desc: 'Word转PDF，保留中文字体', inputs: ['docx'], icon: '⇒' },
      { id: 'word-to-html', title: 'Word转HTML', path: '/word/word-to-html', keywords: 'word转html 网页', desc: 'Word转网页HTML', inputs: ['docx'], icon: 'H' },
      { id: 'word-to-image', title: 'Word转图片', path: '/word/word-to-image', keywords: 'word转图片 jpg png', desc: 'Word转图片不可编辑分享', inputs: ['docx'], icon: 'I' },
      { id: 'word-to-txt', title: 'Word转TXT', path: '/word/word-to-txt', keywords: 'word转txt 文本', desc: '提取Word纯文本', inputs: ['docx'], icon: 'T' },
      { id: 'word-template', title: 'Word模板填充', path: '/word/word-template', keywords: 'word模板 合同 报价单', desc: '基于模板批量生成文档', inputs: ['docx'], icon: '▤' },
      { id: 'word-edit', title: 'Word文档编辑', path: '/word/word-edit', keywords: 'word编辑 修改 docx', desc: '在线编辑Word文档', inputs: ['docx'], icon: '✎' },
      { id: 'word-compare', title: 'Word文档对比', path: '/word/word-compare', keywords: 'word对比 diff 版本', desc: '对比两份文档差异', inputs: ['docx'], icon: '⇄' },
      { id: 'word-count', title: 'Word字数统计', path: '/word/word-count', keywords: 'word字数 字符 统计', desc: '统计字数段落等', inputs: ['docx'], icon: '#' },
      { id: 'word-clean', title: 'Word隐私清理', path: '/word/word-clean', keywords: 'word清理 作者 修订', desc: '删除作者修订记录等元信息', inputs: ['docx'], icon: '✕' },
    ]
  },
  {
    id: 'excel',
    name: 'Excel工具',
    icon: '📗',
    desc: 'Excel预览·转换·编辑',
    tools: [
      { id: 'excel-preview', title: 'Excel预览', path: '/excel/excel-preview', keywords: 'excel预览 xlsx 查看', desc: '在线预览Excel', inputs: ['xlsx'], icon: '👁' },
      { id: 'excel-to-pdf', title: 'Excel转PDF', path: '/excel/excel-to-pdf', keywords: 'excel转pdf 打印', desc: 'Excel转PDF', inputs: ['xlsx'], icon: '⇒' },
      { id: 'excel-to-csv', title: 'Excel转CSV', path: '/excel/excel-to-csv', keywords: 'excel转csv 导出', desc: 'Excel导出为CSV', inputs: ['xlsx'], icon: 'C' },
      { id: 'excel-to-json', title: 'Excel转JSON', path: '/excel/excel-to-json', keywords: 'excel转json api', desc: 'Excel转JSON数据', inputs: ['xlsx'], icon: 'J' },
      { id: 'excel-to-html', title: 'Excel转HTML', path: '/excel/excel-to-html', keywords: 'excel转html 表格', desc: 'Excel转HTML表格', inputs: ['xlsx'], icon: 'H' },
      { id: 'csv-to-excel', title: 'CSV转Excel', path: '/excel/csv-to-excel', keywords: 'csv转excel xlsx', desc: 'CSV转Excel', inputs: ['csv'], icon: 'X' },
      { id: 'excel-edit', title: 'Excel在线编辑', path: '/excel/excel-edit', keywords: 'excel编辑 修改 xlsx', desc: '在线编辑Excel', inputs: ['xlsx'], icon: '✎' },
      { id: 'excel-filter', title: 'Excel筛选排序', path: '/excel/excel-filter', keywords: 'excel筛选 排序', desc: '在线筛选排序数据', inputs: ['xlsx'], icon: '⇅' },
      { id: 'excel-formula', title: 'Excel公式校验', path: '/excel/excel-formula', keywords: 'excel公式 校验 错误', desc: '校验Excel公式错误', inputs: ['xlsx'], icon: 'ƒ' },
      { id: 'excel-chart', title: 'Excel图表生成', path: '/excel/excel-chart', keywords: 'excel图表 可视化', desc: 'Excel数据生成图表', inputs: ['xlsx'], icon: '📊' },
      { id: 'excel-merge', title: '多Excel合并', path: '/excel/excel-merge', keywords: 'excel合并 多文件', desc: '合并多个Excel文件', inputs: ['xlsx'], icon: '+' },
      { id: 'excel-clean', title: 'Excel隐私清理', path: '/excel/excel-clean', keywords: 'excel清理 隐藏 sheet', desc: '删除隐藏sheet和元信息', inputs: ['xlsx'], icon: '✕' },
    ]
  },
  {
    id: 'ppt',
    name: 'PPT工具',
    icon: '📙',
    desc: 'PPT预览·转换·提取',
    tools: [
      { id: 'ppt-preview', title: 'PPT预览', path: '/ppt/ppt-preview', keywords: 'ppt预览 pptx 查看', desc: '在线预览PPT', inputs: ['pptx'], icon: '👁' },
      { id: 'ppt-to-pdf', title: 'PPT转PDF', path: '/ppt/ppt-to-pdf', keywords: 'ppt转pdf', desc: 'PPT转PDF', inputs: ['pptx'], icon: '⇒' },
      { id: 'ppt-to-image', title: 'PPT转图片', path: '/ppt/ppt-to-image', keywords: 'ppt转图片 png', desc: 'PPT转图片缩略图', inputs: ['pptx'], icon: 'I' },
      { id: 'ppt-to-pdf-album', title: 'PPT转图片PDF', path: '/ppt/ppt-to-pdf-album', keywords: 'ppt pdf 图片合集', desc: 'PPT转图片合集PDF', inputs: ['pptx'], icon: '▤' },
      { id: 'ppt-template', title: 'PPT模板填充', path: '/ppt/ppt-template', keywords: 'ppt模板 vi 企业', desc: '基于模板生成PPT', inputs: ['pptx'], icon: '▤' },
      { id: 'ppt-extract-media', title: 'PPT提取媒体', path: '/ppt/ppt-extract-media', keywords: 'ppt提取 媒体 视频', desc: '提取嵌入的图片视频', inputs: ['pptx'], icon: '⇪' },
      { id: 'ppt-to-markdown', title: 'PPT转Markdown', path: '/ppt/ppt-to-markdown', keywords: 'ppt转md markdown', desc: 'PPT转Markdown', inputs: ['pptx'], icon: 'M' },
    ]
  },
  {
    id: 'image',
    name: '图片工具',
    icon: '🖼',
    desc: '图片转换·编辑·优化',
    tools: [
      { id: 'image-convert', title: '图片格式转换', path: '/image/image-convert', keywords: '图片转换 heic webp avif', desc: 'HEIC/AVIF/WEBP/TIFF互转', inputs: ['image'], icon: '⇄' },
      { id: 'image-compress', title: '图片压缩', path: '/image/image-compress', keywords: '图片压缩 减小', desc: '压缩图片体积', inputs: ['image'], icon: '↓' },
      { id: 'image-batch-compress', title: '批量图片压缩', path: '/image/image-batch-compress', keywords: '批量 压缩 多图', desc: '批量压缩多张图片', inputs: ['image'], icon: '▤' },
      { id: 'image-crop', title: '图片裁剪旋转', path: '/image/image-crop', keywords: '图片裁剪 旋转', desc: '裁剪旋转图片', inputs: ['image'], icon: '✂' },
      { id: 'image-watermark', title: '图片加水印', path: '/image/image-watermark', keywords: '图片水印 版权', desc: '为图片加水印', inputs: ['image'], icon: '◐' },
      { id: 'image-collage', title: '图片拼图', path: '/image/image-collage', keywords: '图片拼图 拼接', desc: '多图拼接拼图', inputs: ['image'], icon: '⊞' },
      { id: 'image-bg-remove', title: '图片抠图去背景', path: '/image/image-bg-remove', keywords: '抠图 去背景 透明', desc: 'AI抠图去背景', inputs: ['image'], icon: '◇' },
      { id: 'image-exif', title: 'EXIF查看编辑', path: '/image/image-exif', keywords: 'exif 元数据 gps', desc: '查看/编辑EXIF元数据', inputs: ['image'], icon: 'ⓘ' },
      { id: 'gif-maker', title: 'GIF制作分解', path: '/image/gif-maker', keywords: 'gif 制作 分解', desc: '制作或分解GIF', inputs: ['image','gif'], icon: '◲' },
      { id: 'svg-edit', title: 'SVG编辑优化', path: '/image/svg-edit', keywords: 'svg 编辑 优化', desc: 'SVG矢量图编辑优化', inputs: ['svg'], icon: '◇' },
      { id: 'image-ocr', title: '图片OCR识别', path: '/image/image-ocr', keywords: '图片ocr 识别 文字', desc: '图片文字识别', inputs: ['image'], icon: 'T' },
      { id: 'image-long-screenshot', title: '长图拼接', path: '/image/image-long-screenshot', keywords: '长图 拼接 截图', desc: '多图垂直拼接成长图', inputs: ['image'], icon: '⫴' },
      { id: 'image-batch-rename', title: '批量图片重命名', path: '/image/image-batch-rename', keywords: '批量 重命名 图片', desc: '按EXIF/序号批量重命名', inputs: ['image'], icon: '#' },
      { id: 'image-exif-clean', title: 'EXIF批量清理', path: '/image/image-exif-clean', keywords: 'exif 清理 隐私', desc: '批量清除EXIF隐私', inputs: ['image'], icon: '✕' },
      { id: 'image-adjust', title: '图片色彩调整', path: '/image/image-adjust', keywords: '色彩 调整 滤镜', desc: '调整亮度对比度等', inputs: ['image'], icon: '◐' },
    ]
  },
  {
    id: 'archive',
    name: '压缩文件',
    icon: '🗜',
    desc: 'ZIP压缩·解压',
    tools: [
      { id: 'zip-create', title: 'ZIP压缩', path: '/archive/zip-create', keywords: 'zip 压缩 打包', desc: '多文件打包为ZIP', inputs: ['*'], icon: '+z' },
      { id: 'zip-extract', title: 'ZIP解压', path: '/archive/zip-extract', keywords: 'zip 解压 提取', desc: '解压ZIP文件', inputs: ['zip'], icon: '-z' },
      { id: 'zip-preview', title: '压缩包预览', path: '/archive/zip-preview', keywords: '压缩包 预览 查看', desc: '不解压查看内容', inputs: ['zip'], icon: '👁' },
      { id: 'zip-edit', title: '压缩包内编辑', path: '/archive/zip-edit', keywords: '压缩包 编辑 修改', desc: '编辑压缩包内文件', inputs: ['zip'], icon: '✎' },
    ]
  },
  {
    id: 'text',
    name: '文本编码',
    icon: '📝',
    desc: '文本·编码·格式',
    tools: [
      { id: 'text-encoding', title: '文本编码转换', path: '/text/text-encoding', keywords: '编码 gbk utf-8 转换', desc: 'GBK/UTF-8/UTF-16互转', inputs: ['txt'], icon: '⇄' },
      { id: 'text-detect', title: '编码自动检测', path: '/text/text-detect', keywords: '检测 编码 识别', desc: '自动检测文件编码', inputs: ['txt'], icon: '?' },
      { id: 'csv-json-excel', title: 'CSV/JSON/Excel互转', path: '/text/csv-json-excel', keywords: 'csv json excel 转换', desc: '三种格式互转', inputs: ['csv','json','xlsx'], icon: '⇄' },
      { id: 'json-format', title: 'JSON格式化校验', path: '/text/json-format', keywords: 'json 格式化 校验', desc: 'JSON美化/校验/压缩', inputs: ['json'], icon: '{}' },
      { id: 'yaml-json', title: 'YAML/JSON互转', path: '/text/yaml-json', keywords: 'yaml json 转换', desc: 'YAML与JSON互转', inputs: ['yaml','json'], icon: '⇄' },
      { id: 'xml-json', title: 'XML/JSON互转', path: '/text/xml-json', keywords: 'xml json 转换', desc: 'XML与JSON互转', inputs: ['xml','json'], icon: '⇄' },
      { id: 'md-html', title: 'Markdown/HTML互转', path: '/text/md-html', keywords: 'markdown html 转换', desc: 'Markdown与HTML互转', inputs: ['md','html'], icon: '⇄' },
      { id: 'text-diff', title: '文本比对Diff', path: '/text/text-diff', keywords: '文本对比 diff', desc: '对比两段文本差异', inputs: ['txt'], icon: '⇄' },
      { id: 'text-encrypt', title: '文本加密解密', path: '/text/text-encrypt', keywords: '加密 解密 aes base64', desc: 'AES/Base64等加密', inputs: ['txt'], icon: '⚿' },
      { id: 'text-hash', title: '文本哈希计算', path: '/text/text-hash', keywords: '文本哈希 md5 sha', desc: '计算文本哈希值', inputs: ['txt'], icon: '#' },
    ]
  },
  {
    id: 'ebook',
    name: '电子书',
    icon: '📚',
    desc: 'EPUB阅读·转换',
    tools: [
      { id: 'epub-reader', title: 'EPUB阅读器', path: '/ebook/epub-reader', keywords: 'epub 阅读 在线', desc: '在线阅读EPUB电子书', inputs: ['epub'], icon: '📖' },
      { id: 'epub-to-pdf', title: 'EPUB转PDF', path: '/ebook/epub-to-pdf', keywords: 'epub转pdf', desc: 'EPUB转PDF打印', inputs: ['epub'], icon: '⇒' },
      { id: 'epub-to-txt', title: 'EPUB转TXT', path: '/ebook/epub-to-txt', keywords: 'epub转txt 提取', desc: '提取EPUB文本', inputs: ['epub'], icon: 'T' },
    ]
  },
  {
    id: 'media',
    name: '音视频',
    icon: '🎬',
    desc: '音频·视频处理',
    tools: [
      { id: 'media-convert', title: '音视频格式转换', path: '/media/media-convert', keywords: '音视频 转换 mp4 mp3', desc: '音视频格式互转', inputs: ['video','audio'], icon: '⇄' },
      { id: 'video-compress', title: '视频压缩', path: '/media/video-compress', keywords: '视频压缩 减小', desc: '压缩视频体积', inputs: ['video'], icon: '↓' },
      { id: 'video-trim', title: '视频剪辑', path: '/media/video-trim', keywords: '视频剪辑 截取 片段', desc: '截取视频片段', inputs: ['video'], icon: '✂' },
      { id: 'video-to-gif', title: '视频转GIF', path: '/media/video-to-gif', keywords: '视频转gif', desc: '视频转GIF动图', inputs: ['video'], icon: '◲' },
      { id: 'video-extract-audio', title: '视频提取音频', path: '/media/video-extract-audio', keywords: '提取音频 bgm', desc: '从视频提取音频', inputs: ['video'], icon: '♪' },
      { id: 'audio-edit', title: '音频剪辑合并', path: '/media/audio-edit', keywords: '音频剪辑 合并', desc: '音频剪辑合并', inputs: ['audio'], icon: '♪' },
    ]
  },
  {
    id: 'qrcode',
    name: '二维码',
    icon: '📱',
    desc: '二维码·条形码',
    tools: [
      { id: 'qr-generate', title: '二维码生成', path: '/qrcode/qr-generate', keywords: '二维码 生成 制作', desc: '生成二维码', inputs: [], icon: '▢' },
      { id: 'qr-recognize', title: '二维码识别', path: '/qrcode/qr-recognize', keywords: '二维码 识别 解码', desc: '识别图片二维码', inputs: ['image'], icon: '▣' },
      { id: 'barcode-generate', title: '条形码生成识别', path: '/qrcode/barcode-generate', keywords: '条形码 生成 识别', desc: '条形码生成与识别', inputs: ['image'], icon: '▬' },
      { id: 'qr-batch', title: '批量二维码生成', path: '/qrcode/qr-batch', keywords: '批量 二维码', desc: '批量生成二维码', inputs: [], icon: '▤' },
    ]
  },
  {
    id: 'font',
    name: '字体工具',
    icon: '🔤',
    desc: '字体转换·预览',
    tools: [
      { id: 'font-convert', title: '字体格式转换', path: '/font/font-convert', keywords: '字体 转换 ttf woff', desc: 'TTF/OTF/WOFF/WOFF2互转', inputs: ['font'], icon: '⇄' },
      { id: 'font-preview', title: '字体预览对比', path: '/font/font-preview', keywords: '字体 预览 对比', desc: '预览对比多种字体', inputs: ['font'], icon: '👁' },
      { id: 'font-subset', title: '字体子集化', path: '/font/font-subset', keywords: '字体 子集 瘦身', desc: '中文字体瘦身', inputs: ['font'], icon: '↓' },
    ]
  },
  {
    id: 'file',
    name: '文件通用',
    icon: '📂',
    desc: '文件·哈希·检测',
    tools: [
      { id: 'file-hash', title: '文件哈希计算', path: '/file/file-hash', keywords: '文件哈希 md5 sha', desc: '计算MD5/SHA1/SHA256', inputs: ['*'], icon: '#' },
      { id: 'file-type', title: '文件类型识别', path: '/file/file-type', keywords: '文件类型 识别 检测', desc: '真实文件类型检测', inputs: ['*'], icon: '?' },
      { id: 'file-compress', title: '文件大小压缩', path: '/file/file-compress', keywords: '文件 压缩 综合', desc: '通用文件压缩', inputs: ['*'], icon: '↓' },
      { id: 'file-rename', title: '文件批量重命名', path: '/file/file-rename', keywords: '文件 重命名 批量', desc: '批量重命名文件', inputs: ['*'], icon: '#' },
      { id: 'file-search', title: '文件内容搜索', path: '/file/file-search', keywords: '文件 搜索 内容', desc: '全文检索文件内容', inputs: ['*'], icon: '🔍' },
      { id: 'file-timestamp', title: '文件时间戳修改', path: '/file/file-timestamp', keywords: '文件 时间戳 修改', desc: '修改文件时间属性', inputs: ['*'], icon: '⏱' },
    ]
  },
  {
    id: 'special',
    name: '特殊场景',
    icon: '⚠',
    desc: '加密·修复·容错',
    tools: [
      { id: 'pdf-decrypt-helper', title: '加密PDF解密助手', path: '/special/pdf-decrypt-helper', keywords: '加密 解密 密码', desc: '忘记密码的合法恢复', inputs: ['pdf'], icon: '⚿' },
      { id: 'pdf-repair', title: '损坏PDF修复', path: '/special/pdf-repair', keywords: '损坏 修复 pdf', desc: '修复结构损坏的PDF', inputs: ['pdf'], icon: '✚' },
      { id: 'compat-check', title: 'WPS/Office兼容检测', path: '/special/compat-check', keywords: 'wps office 兼容', desc: '检测跨软件兼容性', inputs: ['docx','xlsx','pptx'], icon: '✓' },
      { id: 'large-file-chunk', title: '大文件分块处理', path: '/special/large-file-chunk', keywords: '大文件 分块 流式', desc: '流式处理大文件', inputs: ['*'], icon: '▤' },
      { id: 'batch-center', title: '批量文件处理中心', path: '/special/batch-center', keywords: '批量 处理 多文件', desc: '批量处理多文件', inputs: ['*'], icon: '▤' },
      { id: 'chinese-font-embed', title: '中文字体嵌入工具', path: '/special/chinese-font-embed', keywords: '中文 字体 嵌入', desc: '解决中文乱码', inputs: ['pdf'], icon: '字' },
      { id: 'privacy-scanner', title: '文档隐私扫描仪', path: '/special/privacy-scanner', keywords: '隐私 扫描 元数据', desc: '扫描隐藏元数据', inputs: ['*'], icon: '🔍' },
      { id: 'convert-wizard', title: '文件转换向导', path: '/special/convert-wizard', keywords: '向导 推荐 转换', desc: '智能推荐合适工具', inputs: ['*'], icon: '★' },
    ]
  }
]

// 扁平化所有工具列表
export const allTools = categories.flatMap(c => c.tools.map(t => ({ ...t, categoryId: c.id, categoryName: c.name })))

// 通过ID查找工具
export function findTool(id) {
  return allTools.find(t => t.id === id)
}

// 通过路径查找工具
export function findToolByPath(path) {
  return allTools.find(t => t.path === path)
}
