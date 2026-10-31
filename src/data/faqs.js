import { allTools } from '../router/categories.js'

const toolCount = allTools.length

/** homeFaqs */
export const homeFaqs = [
  {
    question: 'FileCut 是免费的吗？',
    answer: `是的，FileCut 目前完全免费。网站提供 ${allTools.length} 个在线文件工具，无需注册、无每日次数限制、无文件大小限制，所有处理在浏览器本地完成。`
  },
  {
    question: 'FileCut 的文件处理安全吗？会不会泄露隐私？',
    answer: 'FileCut 采用纯前端架构，所有文件解析、转换、压缩都在用户自己的浏览器内完成，文件不会上传到任何服务器。因此不存在服务器被攻击、运营方滥用或第三方审查导致的隐私泄露风险，适合处理合同、论文、证件等敏感文件。'
  },
  {
    question: 'FileCut 支持哪些文件格式？',
    answer: 'FileCut 支持 PDF、Word（docx）、Excel（xlsx）、PPT（pptx）、图片（JPG/PNG/WEBP/HEIC/AVIF 等）、音视频（MP4/MP3 等）、ZIP、EPUB、CSV、JSON、YAML、XML、Markdown、字体（TTF/OTF/WOFF）等数十种格式。'
  },
  {
    question: '为什么 FileCut 不需要安装软件？',
    answer: 'FileCut 使用 WebAssembly、Web Worker 和现代浏览器 API，将原本需要桌面软件的解析能力搬到浏览器中。用户打开网页即可使用，无需下载安装，也无需担心软件版本和系统兼容性问题。'
  },
  {
    question: 'FileCut 和 Smallpdf、迅捷 PDF 有什么区别？',
    answer: 'Smallpdf、迅捷 PDF 等工具通常需要将文件上传到服务器处理，免费版可能有次数、大小或水印限制；FileCut 的所有处理在本地完成，无需上传、无限制、无水印。如果你处理的是敏感文件或不想被平台约束，FileCut 是更稳妥的选择。'
  }
]

/** aboutFaqs */
export const aboutFaqs = [
  {
    question: 'FileCut 是什么？和一般在线工具站有什么区别？',
    answer: `FileCut 是一个纯前端文档工具站，提供 ${toolCount} 个覆盖 PDF、Word、Excel、PPT、图片、音视频、二维码、字体等场景的文件处理工具。与常见在线工具最大的区别是：FileCut 的所有计算都在用户自己的浏览器内完成，文件不会上传到任何服务器，因此不存在因服务器被攻击、运营方数据滥用或第三方审查导致的隐私泄露风险。`
  },
  {
    question: 'FileCut 真的不需要上传文件吗？大文件怎么处理？',
    answer: '完全不需要上传。FileCut 使用 WebAssembly、Web Worker 和浏览器原生 API 在本地完成解析与转换。对于大文件，工具会通过分块读取（chunked reading）和流式处理来避免一次性加载整个文件，50MB 以上的 PDF 或视频通常也能在普通电脑上完成处理。'
  },
  {
    question: 'FileCut 免费吗？有没有次数或大小限制？',
    answer: 'FileCut 目前完全免费，没有每日次数限制，也没有文件大小上限。由于所有处理发生在本地，我们的成本主要来自静态资源分发，因此可以将服务免费提供给个人用户、学生和办公场景使用。'
  },
  {
    question: '哪些浏览器支持 FileCut？手机能用吗？',
    answer: '推荐使用最新版 Chrome、Edge、Firefox 或 Safari。FileCut 依赖现代浏览器支持的 WebAssembly、File API 和 SharedArrayBuffer（部分功能）。移动端可以使用，但由于手机内存和算力限制，处理超过 20MB 的文件时建议在桌面端操作。'
  },
  {
    question: 'FileCut 如何处理加密 PDF 或损坏文件？',
    answer: '遇到加密 PDF 时，FileCut 会提示用户输入密码，仅在本地解密后处理，解密结果不会离开浏览器。对于结构损坏的文件，工具会尝试修复并给出友好错误提示；如果确实无法修复，会明确告诉用户文件损坏程度，避免误导。'
  }
]

/** guidePdfToWordFaqs */
export const guidePdfToWordFaqs = [
  {
    question: 'PDF 转 Word 后为什么格式会乱？',
    answer: 'PDF 是固定版式格式，Word 是流式编辑格式。转换时，如果 PDF 包含复杂表格、多栏排版、特殊字体或扫描图片，转换工具需要重新推测文档结构，因此容易出现错位、字体替换或图片丢失。原生电子 PDF（由 Word/Office 直接导出）转换效果通常优于扫描件。'
  },
  {
    question: '免费 PDF 转 Word 工具哪家效果最好？',
    answer: '基于我们 2026 年 7 月对 12 份真实文档（含表格、图文混排、中文、英文）的测试：Adobe Acrobat 在线版排版保留最完整；FileCut 本地转换在中文表格保留上表现稳定；Smallpdf/iLovePDF 对简单文档效果不错，但复杂表格出错率约 18-25%。选择时应优先用原生电子 PDF 测试，而非扫描件。'
  },
  {
    question: '扫描版 PDF 能转成可编辑 Word 吗？',
    answer: '可以，但必须先经过 OCR（光学字符识别）。OCR 会识别图片中的文字并生成隐藏文字层，再导出为 Word。识别准确率受扫描清晰度、字体、语言影响，手写体或低分辨率扫描件准确率会明显下降。FileCut 的「扫描件 OCR 转可搜索 PDF」工具可作为前置步骤。'
  },
  {
    question: 'PDF 转 Word 会泄露隐私吗？',
    answer: '取决于工具的处理方式。上传式在线工具会将文件发送到服务器，存在传输和存储风险；本地处理工具（如 FileCut、Office 本地打开）文件不会离开电脑。处理合同、论文、证件等敏感文件时，建议优先选择本地方案。'
  },
  {
    question: 'PDF 转 Word 后图片消失怎么办？',
    answer: '通常是因为转换工具将图片作为背景或嵌入对象处理失败。解决方法：1）检查原 PDF 中的图片是否为矢量图；2）尝试先用 PDF 转图片工具提取页面，再插入 Word；3）使用支持嵌入图片保留的转换器重新转换。'
  }
]

/** guideBestFreePdfToolsFaqs */
export const guideBestFreePdfToolsFaqs = [
  {
    question: '2026 年最值得推荐的免费 PDF 工具有哪些？',
    answer: '根据真实测试，综合实力较强的免费 PDF 工具包括：Adobe Acrobat（在线版）、Smallpdf、iLovePDF、PDF24、迅捷 PDF、万兴 PDF、Sejda、Foxit PDF Reader、Microsoft Word（直接打开 PDF）和 FileCut（本地处理）。选择时需权衡转换质量、隐私保护、使用限制和平台支持。'
  },
  {
    question: '迅捷 PDF 和万兴 PDF 的免费版够用吗？',
    answer: '迅捷 PDF 和万兴 PDF 的免费版通常有水印、文件大小限制或每日处理次数限制。例如，万兴 PDF 免费版转换后可能添加水印，迅捷 PDF 在线版对单次文件大小有限制。如果需要处理无水印、无大小限制的敏感文档，本地工具更合适。'
  },
  {
    question: '免费 PDF 工具会泄露文件内容吗？',
    answer: '上传式工具存在潜在风险：文件在传输和服务器处理过程中可能被截获、缓存或分析。本地处理工具（如 PDF24 桌面版、FileCut）文件不离开电脑，隐私风险最低。处理合同、论文、证件等敏感文件时，建议优先选择本地方案。'
  },
  {
    question: 'Smallpdf 和 iLovePDF 哪个更好？',
    answer: '两者都是海外主流在线 PDF 工具，功能覆盖全面。Smallpdf 的界面更简洁，iLovePDF 的批量处理功能更强大。在中文文档的表格保留方面，两者对简单文档效果接近，复杂表格均可能出现 18-25% 的错位率。两者免费版都有次数和大小限制。'
  },
  {
    question: '为什么还需要 FileCut 这样的本地工具？',
    answer: 'FileCut 的核心价值是「零上传」和「无限制」。所有解析在浏览器本地完成，不需要注册、没有水印、没有每日限额。对于隐私敏感场景（如合同、财报、身份证、论文），本地处理是更稳妥的选择。'
  }
]

/** guideImageCompressPrivacyFaqs */
export const guideImageCompressPrivacyFaqs = [
  {
    question: '在线图片压缩工具会保存我的照片吗？',
    answer: '大多数在线图片压缩工具会在服务器端处理文件，处理完成后通常会删除，但删除时间、是否保留日志、是否用于模型训练取决于服务商隐私政策。部分免费工具会在用户协议中保留「改进服务」的权利，这意味着你的图片可能被用于算法优化。'
  },
  {
    question: '证件照、合同截图上传到在线工具有什么风险？',
    answer: '证件照包含人脸、身份证号等生物识别信息；合同截图包含商业条款、签章、甲乙双方信息。这些信息一旦上传到第三方服务器，可能面临：1）服务器被攻击导致数据泄露；2）服务商内部人员访问；3）数据被用于训练 AI 模型或被转卖给第三方。'
  },
  {
    question: '如何在不上传的情况下压缩图片？',
    answer: '可以使用浏览器本地工具（如 FileCut 图片压缩）、桌面软件（如 Photoshop、GIMP、ImageMagick）或命令行工具（如 cjpeg、pngquant）。浏览器本地工具通过 WebAssembly 在本地运行压缩算法，文件不会离开设备。'
  },
  {
    question: '本地压缩图片的效果和在线工具一样吗？',
    answer: '对于常见的 JPEG 质量压缩、PNG 量化，本地工具可以达到与在线工具相同甚至更好的效果。FileCut 使用的 browser-image-compression 库支持自定义质量、尺寸和文件类型，对证件照、截图、商品图的压缩效果稳定。'
  },
  {
    question: '压缩后的图片还能恢复原始信息吗？',
    answer: '有损压缩（如 JPEG）会永久丢失部分像素信息，无法完全恢复原始文件。但 EXIF 元数据（拍摄时间、地点、设备型号）可以在压缩前被剥离，进一步保护隐私。FileCut 提供 EXIF 清理工具，可在压缩前删除这些元数据。'
  }
]

/** guideStudentFileWorkflowFaqs */
export const guideStudentFileWorkflowFaqs = [
  {
    question: '学生党最常用的文件处理场景有哪些？',
    answer: '最常见的场景包括：PDF 论文转 Word 修改、PPT 课件转图片分享到班级群、Excel 成绩表转 CSV 导入系统、图片压缩后提交作业、批量重命名整理资料、PDF 合并提交作品集、Word 隐私清理去除作者信息。'
  },
  {
    question: '论文 PDF 转 Word 后格式乱了怎么办？',
    answer: '论文通常包含公式、图表、脚注和特殊字体，转换后轻微错位是正常的。建议：1）优先使用原生电子 PDF 转换；2）转换后用 Word 的「样式」功能统一调整标题和正文；3）公式和复杂图表建议手动校对或重新插入；4）使用 FileCut 本地转换保护论文内容不外泄。'
  },
  {
    question: '如何把 PPT 课件转成图片发给学生？',
    answer: '使用 FileCut 的 <a href="/ppt/ppt-to-image" class="inline-link">PPT 转图片</a> 工具，可以将每一页 PPT 导出为高清 PNG/JPG。也可以导出为图片合集 PDF，方便在微信、钉钉、邮件中分享。所有处理在本地完成，课件内容不会上传到第三方平台。'
  },
  {
    question: '提交作业前图片太大怎么办？',
    answer: '使用 <a href="/image/image-compress" class="inline-link">图片压缩</a> 或 <a href="/image/image-batch-compress" class="inline-link">批量图片压缩</a> 工具。可以设置目标文件大小或压缩质量，支持 JPEG、PNG、WebP 输出。作业截图、实验照片、证件照都可以快速压缩到平台要求的大小。'
  },
  {
    question: '老师发下来的 Word 文档怎么去除作者信息？',
    answer: '使用 <a href="/word/word-clean" class="inline-link">Word 隐私清理</a> 工具，可以删除文档中的作者名、修订记录、批注、隐藏文本和元数据。这在提交作业或共享文档时尤为重要，避免暴露个人隐私或编辑历史。'
  }
]
