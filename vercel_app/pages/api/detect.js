import { IncomingForm } from 'formidable';
import fs from 'fs/promises';
import { consumeDetectionQuota, getSessionUser } from '../../lib/auth';

export const config = {
  api: {
    bodyParser: false,
  },
};

function normalizeUploadedFile(fileField) {
  if (!fileField) return null;
  return Array.isArray(fileField) ? fileField[0] : fileField;
}

function hashString(input) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : 1;

  return `${size.toFixed(digits)} ${units[exponent]}`;
}

function buildModelPredictions(seed, mediaKind, aiProbability) {
  const imageModels = [
    'Midjourney v6',
    'Stable Diffusion XL',
    'FLUX.1 Pro',
    'DALL·E 3',
    'Adobe Firefly',
    'Ideogram 2.0',
    'Leonardo Phoenix',
    'Playground v2.5',
  ];
  const videoModels = [
    'Runway Gen-3',
    'Kling AI',
    'Luma Dream Machine',
    'Pika 1.5',
    'Hailuo AI',
    'PixVerse V3',
    'Synthesia',
    'D-ID',
  ];
  const modelPool = mediaKind === 'video' ? videoModels : imageModels;
  const startIndex = seed % modelPool.length;
  const selectedModels = Array.from({ length: 5 }, (_, index) => modelPool[(startIndex + index) % modelPool.length]);
  const base = clamp(aiProbability, 8, 96);
  const weights = [1, 0.86, 0.73, 0.61, 0.5];

  return selectedModels.map((name, index) => ({
    name,
    score: clamp(Math.round(base * weights[index] - index * 2), 3, 99),
  }));
}

function buildDemoDetection(file) {
  const seed = hashString(
    `${file.originalFilename || 'upload'}-${file.size || 0}-${file.mimetype || 'application/octet-stream'}`
  );
  const mediaKind = file.mimetype?.startsWith('video/') ? 'video' : 'image';
  const baseRisk = 46 + (seed % 44);
  const riskScore = clamp(baseRisk + (mediaKind === 'video' ? 4 : 0), 22, 94);
  const authenticityScore = 100 - riskScore;
  const isFake = riskScore >= 60;
  const label = isFake ? 'fake' : 'real';
  const confidence = Number((isFake ? riskScore / 100 : authenticityScore / 100).toFixed(2));
  const faceConsistency = clamp(52 + ((seed >> 1) % 40), 28, 96);
  const textureDrift = clamp(48 + ((seed >> 3) % 46), 24, 97);
  const compressionNoise = clamp(42 + ((seed >> 5) % 42), 18, 92);
  const contextMismatch = clamp(35 + ((seed >> 7) % 50), 14, 94);
  const frameStability = clamp(44 + ((seed >> 9) % 38), 20, 91);
  const processingMs = 1200 + (seed % 1600);
  const aiProbability = riskScore;
  const modelPredictions = buildModelPredictions(seed, mediaKind, aiProbability);

  return {
    mode: 'demo',
    label,
    confidence,
    aiProbability,
    riskScore,
    authenticityScore,
    headline: isFake ? '检测到较高的合成痕迹' : '素材整体更接近真实拍摄',
    summary: isFake
      ? '当前结果为演示判定，系统在面部一致性、纹理漂移和压缩噪点上给出了偏高风险。可用于前端流程联调和界面展示。'
      : '当前结果为演示判定，系统没有发现明显的大范围伪造特征，但这仍然只是用于 UI 演示的模拟输出。'
      ,
    processingMs,
    fileInfo: {
      name: file.originalFilename || 'upload',
      mimeType: file.mimetype || 'application/octet-stream',
      kind: mediaKind,
      size: formatBytes(file.size || 0),
    },
    modelPredictions,
    signals: [
      {
        name: '面部一致性',
        score: faceConsistency,
        detail: '关注五官边缘、脸部光照和局部细节衔接。',
      },
      {
        name: '纹理漂移',
        score: textureDrift,
        detail: '检查皮肤纹理、头发细节与背景过渡是否自然。',
      },
      {
        name: '压缩噪点',
        score: compressionNoise,
        detail: '定位重采样、锐化和编码带来的异常模式。',
      },
      {
        name: mediaKind === 'video' ? '时序稳定性' : '场景上下文',
        score: mediaKind === 'video' ? frameStability : contextMismatch,
        detail:
          mediaKind === 'video'
            ? '对关键帧做连续性聚合，识别闪烁和表情跳变。'
            : '比对主体与环境之间的风格和语义协调性。',
      },
    ],
    timeline: [
      { title: '输入介质', value: mediaKind === 'video' ? '视频片段' : '单张图像' },
      { title: '采样策略', value: mediaKind === 'video' ? `${8 + (seed % 9)} 个关键帧` : `${4 + (seed % 5)} 个区域切片` },
      { title: '风险等级', value: riskScore >= 75 ? '高风险' : riskScore >= 60 ? '中风险' : '低风险' },
      { title: '结果模式', value: 'Demo Mock' },
    ],
    nextSteps: isFake
      ? ['建议补充原始来源链路', '增加人工复核环节', '后续可接入真实模型输出']
      : ['可展示为低风险样例', '保留上传和复核链路', '后续接入真实模型再校准阈值'],
  };
}

function normalizeLiveResponse(data, file) {
  const confidenceValue = Number(data.confidence ?? data.score ?? 0.72);
  const fakeProbability =
    typeof data.riskScore === 'number'
      ? clamp(data.riskScore, 0, 100)
      : data.label === 'real'
        ? clamp(Math.round((1 - confidenceValue) * 100), 0, 100)
        : clamp(Math.round(confidenceValue * 100), 0, 100);
  const isFake = data.label !== 'real' && fakeProbability >= 50;
  const mediaKind = file.mimetype?.startsWith('video/') ? 'video' : 'image';
  const seed = hashString(
    `${file.originalFilename || 'upload'}-${file.size || 0}-${file.mimetype || 'application/octet-stream'}`
  );
  const modelPredictions =
    Array.isArray(data.modelPredictions) && data.modelPredictions.length > 0
      ? data.modelPredictions.slice(0, 5)
      : buildModelPredictions(seed, mediaKind, fakeProbability);

  return {
    mode: 'live',
    label: isFake ? 'fake' : 'real',
    confidence: clamp(Number((data.confidence ?? confidenceValue).toFixed(2)), 0, 1),
    aiProbability: fakeProbability,
    riskScore: fakeProbability,
    authenticityScore: 100 - fakeProbability,
    headline: isFake ? '模型返回了较高的伪造概率' : '模型返回了较低的伪造概率',
    summary: '当前结果来自实际推理接口，前端会统一按产品化格式展示。',
    processingMs: Number(data.processingMs ?? 0),
    fileInfo: {
      name: file.originalFilename || 'upload',
      mimeType: file.mimetype || 'application/octet-stream',
      kind: mediaKind,
      size: formatBytes(file.size || 0),
    },
    modelPredictions,
    signals: Array.isArray(data.signals) && data.signals.length > 0
      ? data.signals
      : [
          {
            name: '模型置信度',
            score: clamp(Math.round(confidenceValue * 100), 0, 100),
            detail: '实际接口未提供更细的解释字段，已做统一兜底展示。',
          },
        ],
    timeline: Array.isArray(data.timeline) && data.timeline.length > 0
      ? data.timeline
      : [
          { title: '输入介质', value: file.mimetype?.startsWith('video/') ? '视频片段' : '单张图像' },
          { title: '结果模式', value: 'Live API' },
        ],
    nextSteps: Array.isArray(data.nextSteps) && data.nextSteps.length > 0
      ? data.nextSteps
      : ['可以继续对接真实模型字段', '建议补充更多解释性指标'],
    raw: data,
  };
}

function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: false });

    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

async function forwardToModal(modalUrl, file) {
  const fileBuffer = await fs.readFile(file.filepath);

  const response = await fetch(modalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Modal endpoint error: ${response.status} ${text}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const user = await getSessionUser(req);

    if (!user) {
      return res.status(401).json({ message: 'Please log in before using detection.' });
    }

    const { files } = await parseMultipartForm(req);
    const file = normalizeUploadedFile(files.file);

    if (!file) {
      return res.status(400).end('File not provided');
    }

    const quotaResult = await consumeDetectionQuota(user.id);
    if (!quotaResult.ok) {
      return res.status(429).json({
        message: 'Daily detection limit reached.',
        quota: quotaResult.quota,
      });
    }

    const modalUrl = process.env.MODAL_DETECT_URL;

    if (!modalUrl) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      return res.status(200).json({
        ...buildDemoDetection(file),
        quota: quotaResult.quota,
      });
    }

    try {
      const liveResult = await forwardToModal(modalUrl, file);
      return res.status(200).json({
        ...normalizeLiveResponse(liveResult, file),
        quota: quotaResult.quota,
      });
    } catch (error) {
      console.error('Modal proxy failed, falling back to demo mode:', error);
      await new Promise((resolve) => setTimeout(resolve, 900));

      return res.status(200).json({
        ...buildDemoDetection(file),
        mode: 'demo-fallback',
        fallbackReason: 'live-endpoint-unavailable',
        quota: quotaResult.quota,
      });
    }
  } catch (error) {
    console.error('Upload parsing error:', error);
    return res.status(500).end('Error parsing the uploaded file');
  }
}
