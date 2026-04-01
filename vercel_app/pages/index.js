import { useEffect, useRef, useState } from 'react';

const ANALYSIS_STAGES = {
  zh: ['校验文件', '生成预览', '分析伪造痕迹', '输出检测结果'],
  en: ['Validate file', 'Generate preview', 'Analyze traces', 'Generate result'],
};

const COPY = {
  zh: {
    brandSub: 'Synthetic Media Detection',
    guestMode: '游客模式',
    language: 'EN',
    title: 'AIGC检测',
    uploadTitle: '上传文件',
    previewTitle: '预览文件',
    mediaType: '图片 / 视频',
    image: '图片',
    video: '视频',
    clickUpload: '点击或拖拽上传文件',
    supportMedia: '支持图片和视频',
    fileName: '文件名',
    fileType: '类型',
    fileSize: '大小',
    chooseFile: '选择文件',
    reselectFile: '重新选择',
    startDetect: '开始检测',
    detecting: '检测中...',
    analyzing: '正在分析',
    resultTitle: '检测结果',
    binaryTitle: '二分类结果',
    multiTitle: '多分类结果',
    suspicious: 'AI生成',
    authentic: '真实内容',
    aiProbability: 'AI生成概率',
    topModels: '最可能的生成模型 Top 5',
    resultPlaceholder: '上传文件并点击检测，在这里显示结果',
    unknownType: '未知类型',
    demo: '演示',
    quotaLabel: '今日剩余次数',
    quotaGuest: '游客可用，每日 5 次',
  },
  en: {
    brandSub: 'Synthetic Media Detection',
    guestMode: 'Guest Mode',
    language: '中',
    title: 'AIGC Detection',
    uploadTitle: 'Upload File',
    previewTitle: 'Preview File',
    mediaType: 'Image / Video',
    image: 'Image',
    video: 'Video',
    clickUpload: 'Click or drag a file to upload',
    supportMedia: 'Supports images and videos',
    fileName: 'File Name',
    fileType: 'Type',
    fileSize: 'Size',
    chooseFile: 'Choose File',
    reselectFile: 'Choose Another',
    startDetect: 'Start Detection',
    detecting: 'Analyzing...',
    analyzing: 'Analyzing',
    resultTitle: 'Detection Result',
    binaryTitle: 'Binary Result',
    multiTitle: 'Multi-Class Result',
    suspicious: 'AI Generated',
    authentic: 'Authentic',
    aiProbability: 'AI Generation Probability',
    topModels: 'Top 5 Suspected Generation Models',
    resultPlaceholder: 'Upload a file and start detection to see results here',
    unknownType: 'Unknown type',
    demo: 'Demo',
    quotaLabel: 'Remaining today',
    quotaGuest: 'Guest access, 5 detections per day',
  },
};

function formatBytes(bytes) {
  if (!bytes) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function getRiskTone(score) {
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

async function readApiResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export default function Home() {
  const inputRef = useRef(null);
  const [locale, setLocale] = useState('zh');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStage, setActiveStage] = useState(-1);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const copy = COPY[locale];
  const stages = ANALYSIS_STAGES[locale];
  const mediaKind = file?.type?.startsWith('video/') ? 'video' : 'image';
  const riskTone = getRiskTone(result?.riskScore || 0);
  const resultHeadline = result
    ? locale === 'zh'
      ? result.label === 'fake'
        ? '检测为 AI 生成内容'
        : '检测为真实内容'
      : result.label === 'fake'
        ? 'Detected as AI-generated content'
        : 'Detected as authentic content'
    : '';
  const resultSummary = result
    ? locale === 'zh'
      ? result.label === 'fake'
        ? '系统判断该内容具有较高的 AI 生成概率，并给出最可能的模型来源排名。'
        : '系统判断该内容更接近真实素材，同时给出最接近的生成模型候选作为参考。'
      : result.label === 'fake'
        ? 'The system predicts a high probability of AI generation and lists the most likely source models.'
        : 'The system predicts this sample is more likely authentic while still listing nearby model candidates for reference.'
    : '';

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!loading) {
      if (result) {
        setProgress(100);
        setActiveStage(stages.length - 1);
      }
      return undefined;
    }

    setProgress(12);
    setActiveStage(0);

    const timers = [
      setTimeout(() => {
        setProgress(34);
        setActiveStage(1);
      }, 250),
      setTimeout(() => {
        setProgress(68);
        setActiveStage(2);
      }, 850),
      setTimeout(() => {
        setProgress(92);
        setActiveStage(3);
      }, 1500),
    ];

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [loading, result, stages.length]);

  useEffect(() => {
    const loadMe = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        setUser(data.viewer || null);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    loadMe();
  }, []);
  const handleSelectedFile = (selectedFile) => {
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);
    setError('');
    setProgress(0);
    setActiveStage(-1);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    handleSelectedFile(event.dataTransfer.files?.[0] || null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file || loading) return;

    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        body: formData,
      });

      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(data.message || 'Detection request failed');
      }

      setResult(data);
      if (data.quota) {
        setUser((current) => ({
          kind: current?.kind || 'guest',
          email: current?.email || null,
          quota: data.quota,
        }));
      }
    } catch (submitError) {
      setError(submitError.message || (locale === 'zh' ? '检测失败' : 'Detection failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="brandMark">V</div>
          <div>
            <p className="brandName">VeriLens</p>
            <p className="brandSub">{copy.brandSub}</p>
          </div>
        </div>

        <div className="headerActions">
          <button
            type="button"
            className="langButton"
            onClick={() => setLocale((current) => (current === 'zh' ? 'en' : 'zh'))}
          >
            {copy.language}
          </button>
          <span className="loginButton">{user?.email || copy.guestMode}</span>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <h1>{copy.title}</h1>
        </section>

        <section className="workspace">
          <form className="card uploadCard" onSubmit={handleSubmit}>
            <div className="sectionHead">
              <h2>{file ? copy.previewTitle : copy.uploadTitle}</h2>
              <span>{file ? (mediaKind === 'video' ? copy.video : copy.image) : copy.mediaType}</span>
            </div>

            <label
              className={`dropzone ${dragActive ? 'dropzoneActive' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                className="hiddenInput"
                type="file"
                accept="image/*,video/*"
                onChange={(event) => handleSelectedFile(event.target.files?.[0] || null)}
              />

              {previewUrl ? (
                <div className="previewSurface">
                  {mediaKind === 'video' ? (
                    <video className="media" src={previewUrl} controls playsInline muted />
                  ) : (
                    <img className="media" src={previewUrl} alt="Preview" />
                  )}
                </div>
              ) : (
                <div className="dropzoneInner">
                  <div className="uploadIcon">+</div>
                  <strong>{copy.clickUpload}</strong>
                  <p>{copy.supportMedia}</p>
                </div>
              )}
            </label>

            {file && (
              <div className="fileMeta">
                <div>
                  <span>{copy.fileName}</span>
                  <strong>{file.name}</strong>
                </div>
                <div>
                  <span>{copy.fileType}</span>
                  <strong>{file.type || copy.unknownType}</strong>
                </div>
                <div>
                  <span>{copy.fileSize}</span>
                  <strong>{formatBytes(file.size)}</strong>
                </div>
              </div>
            )}

            <div className="actionRow">
              <button
                type="button"
                className="secondaryButton"
                onClick={() => inputRef.current?.click()}
              >
                {file ? copy.reselectFile : copy.chooseFile}
              </button>

              <button className="primaryButton" type="submit" disabled={!file || loading || authLoading}>
                {loading ? copy.detecting : copy.startDetect}
              </button>
            </div>

            <div className="quotaBar">
              {user?.quota ? (
                <>
                  <span>{copy.quotaLabel}</span>
                  <strong>{user.quota.remaining} / {user.quota.limit}</strong>
                </>
              ) : (
                <span>{copy.quotaGuest}</span>
              )}
            </div>

            {loading && (
              <div className="statusBox">
                <div className="statusTop">
                  <strong>{copy.analyzing}</strong>
                  <span>{progress}%</span>
                </div>
                <div className="progressBar">
                  <div className="progressFill" style={{ width: `${progress}%` }} />
                </div>
                <div className="stageList">
                  {stages.map((stage, index) => (
                    <div key={stage} className={`stageItem ${index <= activeStage ? 'stageItemActive' : ''}`}>
                      {stage}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="errorText">{error}</p>}
          </form>

          <section className="card resultCard">
            <div className="sectionHead">
              <h2>{copy.resultTitle}</h2>
              <span>{result?.mode || copy.demo}</span>
            </div>

            {result ? (
              <div className="resultContent">
                <div className="resultSection">
                  <div className="sectionLabel">{copy.binaryTitle}</div>
                  <div className={`resultBadge resultBadge-${riskTone}`}>
                    {result.label === 'fake' ? copy.suspicious : copy.authentic}
                  </div>
                </div>

                <div className="summaryBox">
                  <h3>{resultHeadline}</h3>
                  <p>{resultSummary}</p>
                </div>

                <div className="probabilityCard">
                  <div className="signalTop">
                    <span>{copy.aiProbability}</span>
                    <strong>{result.aiProbability ?? result.riskScore}%</strong>
                  </div>
                  <div className="signalBar signalBarLarge">
                    <div
                      className="signalFill"
                      style={{ width: `${result.aiProbability ?? result.riskScore}%` }}
                    />
                  </div>
                </div>

                <div className="resultSection">
                  <div className="sectionLabel">{copy.multiTitle}</div>
                  <div className="modelSectionTitle">{copy.topModels}</div>
                </div>

                <div className="modelList">
                  {result.modelPredictions?.slice(0, 5).map((model, index) => (
                    <div key={model.name} className="modelItem">
                      <div className="modelRank">{index + 1}</div>
                      <div className="modelInfo">
                        <div className="modelNameRow">
                          <span className="modelName">{model.name}</span>
                          <strong>{model.score}%</strong>
                        </div>
                        <div className="signalBar">
                          <div className="signalFill" style={{ width: `${model.score}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="placeholder resultPlaceholder">
                <p>{copy.resultPlaceholder}</p>
              </div>
            )}
          </section>
        </section>
      </main>

      <style jsx>{`
        :global(html) {
          scroll-behavior: smooth;
        }

        :global(body) {
          margin: 0;
          background: #ffffff;
          color: #111827;
          font-family: "Avenir Next", "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
        }

        :global(*) {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          background: #ffffff;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: min(1120px, calc(100% - 32px));
          margin: 0 auto;
          padding: 24px 0 8px;
          gap: 12px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .headerActions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brandMark {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #111827;
          color: #ffffff;
          font-weight: 700;
        }

        .brandName,
        .brandSub,
        .sectionHead h2,
        .sectionHead span,
        .dropzoneInner p,
        .placeholder p,
        .statusTop span,
        .errorText,
        .summaryBox p,
        .signalTop span,
        .fileMeta span,
        .quotaBar span,
        .field span,
        .modalHead p,
        .authMessage,
        .accountRow span {
          margin: 0;
        }

        .brandName {
          font-size: 0.98rem;
          font-weight: 700;
        }

        .brandSub {
          font-size: 0.78rem;
          color: #6b7280;
        }

        .loginButton,
        .langButton,
        .closeButton {
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #111827;
          border-radius: 999px;
          padding: 0.7rem 1rem;
          font-size: 0.92rem;
          cursor: pointer;
        }

        .langButton {
          min-width: 52px;
          font-weight: 600;
        }

        .main {
          width: min(1120px, calc(100% - 32px));
          margin: 0 auto;
          padding: 24px 0 64px;
        }

        .hero {
          max-width: 1120px;
          padding: 24px 0 32px;
        }

        .hero h1 {
          margin: 0;
          font-size: clamp(2rem, 5vw, 3.6rem);
          line-height: 1.05;
          letter-spacing: -0.04em;
          white-space: nowrap;
        }

        .workspace {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
          gap: 20px;
          align-items: start;
        }

        .card {
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          background: #ffffff;
          padding: 24px;
        }

        .sectionHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }

        .sectionHead h2 {
          font-size: 1.1rem;
          font-weight: 700;
        }

        .sectionHead span {
          font-size: 0.84rem;
          color: #6b7280;
        }

        .uploadCard {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .dropzone {
          display: block;
          border: 1px dashed #d1d5db;
          border-radius: 20px;
          background: #fafafa;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease;
        }

        .dropzone:hover,
        .dropzoneActive {
          border-color: #111827;
          background: #f5f5f5;
        }

        .hiddenInput {
          display: none;
        }

        .previewSurface {
          overflow: hidden;
          border-radius: 20px;
          background: #fafafa;
        }

        .dropzoneInner {
          min-height: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 8px;
          padding: 24px;
        }

        .uploadIcon {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 999px;
          background: #111827;
          color: #ffffff;
          font-size: 1.4rem;
          line-height: 1;
        }

        .dropzoneInner strong {
          font-size: 1rem;
          font-weight: 600;
        }

        .dropzoneInner p {
          color: #6b7280;
          font-size: 0.92rem;
        }

        .fileMeta {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .fileMeta div {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 14px;
          background: #fafafa;
        }

        .fileMeta span {
          display: block;
          color: #6b7280;
          font-size: 0.8rem;
        }

        .fileMeta strong {
          display: block;
          margin-top: 8px;
          font-size: 0.92rem;
          word-break: break-word;
        }

        .actionRow {
          display: grid;
          grid-template-columns: 160px 1fr;
          gap: 12px;
        }

        .primaryButton,
        .secondaryButton {
          border-radius: 14px;
          padding: 0.95rem 1rem;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
        }

        .primaryButton {
          border: none;
          background: #111827;
          color: #ffffff;
          flex: 1;
        }

        .secondaryButton {
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #111827;
        }

        .primaryButton:disabled,
        .secondaryButton:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .quotaBar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-radius: 16px;
          background: #fafafa;
          border: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 0.88rem;
        }

        .quotaBar strong {
          color: #111827;
        }

        .statusBox {
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          padding: 16px;
          background: #fafafa;
        }

        .statusTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .statusTop strong {
          font-size: 0.95rem;
        }

        .statusTop span {
          color: #6b7280;
          font-size: 0.88rem;
        }

        .progressBar,
        .signalBar {
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: #e5e7eb;
          overflow: hidden;
        }

        .progressFill,
        .signalFill {
          height: 100%;
          border-radius: inherit;
          background: #111827;
          transition: width 0.3s ease;
        }

        .stageList {
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }

        .stageItem {
          font-size: 0.9rem;
          color: #9ca3af;
        }

        .stageItemActive {
          color: #111827;
        }

        .errorText {
          color: #dc2626;
          font-size: 0.9rem;
        }

        .resultPlaceholder {
          min-height: 340px;
        }

        .media {
          display: block;
          width: 100%;
          height: 360px;
          object-fit: cover;
        }

        .placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 340px;
          padding: 24px;
          text-align: center;
          color: #9ca3af;
        }

        .resultContent {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .resultSection {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .sectionLabel {
          color: #6b7280;
          font-size: 0.84rem;
          font-weight: 600;
        }

        .resultBadge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: fit-content;
          border-radius: 999px;
          padding: 0.5rem 0.85rem;
          font-size: 0.84rem;
          font-weight: 600;
        }

        .resultBadge-high,
        .resultBadge-medium {
          background: #fef2f2;
          color: #b91c1c;
        }

        .resultBadge-low {
          background: #f0fdf4;
          color: #15803d;
        }

        .summaryBox,
        .probabilityCard {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 16px;
          background: #fafafa;
        }

        .summaryBox h3 {
          margin: 0 0 8px;
          font-size: 1rem;
        }

        .summaryBox p {
          color: #4b5563;
          line-height: 1.7;
        }

        .signalTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .signalTop span {
          color: #374151;
          font-size: 0.9rem;
        }

        .signalTop strong {
          font-size: 0.9rem;
        }

        .signalBarLarge {
          height: 10px;
          margin-top: 10px;
        }

        .modelSectionTitle {
          color: #111827;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .modelList {
          display: grid;
          gap: 12px;
        }

        .modelItem {
          display: grid;
          grid-template-columns: 40px 1fr;
          gap: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 14px;
          background: #fafafa;
        }

        .modelRank {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: #111827;
          color: #ffffff;
          font-size: 0.88rem;
          font-weight: 700;
        }

        .modelInfo {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .modelNameRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .modelName {
          color: #111827;
          font-size: 0.94rem;
          font-weight: 500;
        }

        .modalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(17, 24, 39, 0.18);
        }

        .modalCard {
          width: min(520px, 100%);
          border-radius: 24px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(17, 24, 39, 0.14);
        }

        .modalHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
        }

        .modalHead h3 {
          margin: 0 0 6px;
          font-size: 1.1rem;
        }

        .modalHead p {
          color: #6b7280;
          line-height: 1.6;
          font-size: 0.92rem;
        }

        .authForm,
        .accountPanel {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field span {
          color: #374151;
          font-size: 0.88rem;
          font-weight: 500;
        }

        .field input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          padding: 0.9rem 1rem;
          font-size: 0.95rem;
          outline: none;
        }

        .field input:focus {
          border-color: #111827;
        }

        .inlineAction {
          display: grid;
          grid-template-columns: 1fr 140px;
          gap: 12px;
          align-items: end;
        }

        .fieldGrow {
          min-width: 0;
        }

        .smallButton {
          width: 100%;
        }

        .fullButton {
          width: 100%;
        }

        .demoCodeBox,
        .accountRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 16px;
          background: #fafafa;
          border: 1px solid #e5e7eb;
        }

        .demoCodeBox span,
        .accountRow span {
          color: #6b7280;
          font-size: 0.88rem;
        }

        .demoCodeBox strong,
        .accountRow strong {
          color: #111827;
          font-size: 0.95rem;
        }

        .authMessage {
          color: #15803d;
          font-size: 0.9rem;
        }

        @media (max-width: 1000px) {
          .workspace {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .header,
          .main {
            width: min(100% - 20px, 1120px);
          }

          .header {
            padding-top: 16px;
            flex-wrap: wrap;
          }

          .card,
          .modalCard {
            padding: 18px;
            border-radius: 20px;
          }

          .fileMeta,
          .actionRow,
          .inlineAction {
            grid-template-columns: 1fr;
          }

          .hero {
            padding-top: 12px;
          }

          .hero h1 {
            font-size: 2rem;
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
}
