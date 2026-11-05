
import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "" : "http://127.0.0.1:8000")).replace(/\/+$/, "");

const stems = [
  { name: "Vocals", icon: "≋", color: "pink", value: 64 },
  { name: "Drums & Percussion", icon: "≋", color: "orange", value: 48 },
  { name: "Bass", icon: "≋", color: "green", value: 43 },
  { name: "Other", icon: "≋", color: "gray", value: 48 },
];

const tabs = ["Overview", "Stems", "Structure", "MIDI", "Similar Tracks", "Learning"];

function setStemGain(gain: GainNode, value: number) {
  gain.gain.value = value;
}

function SonanceMark({ animated = false }: { animated?: boolean }) {
  return (
    <span className={`sonance-mark ${animated ? "sonance-mark-animated" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function Waveform({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [mobileWaveform, setMobileWaveform] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 560px)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 560px)");
    const update = () => setMobileWaveform(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const barCount = mobileWaveform ? 88 : 180;
  const seekAt = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || duration <= 0) return;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <svg
      ref={svgRef}
      className="waveform"
      viewBox="0 0 720 54"
      preserveAspectRatio="none"
      role="slider"
      aria-label="Audio position"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      tabIndex={0}
      style={{ cursor: duration > 0 ? "pointer" : "default", touchAction: "none" }}
      onClick={(event) => seekAt(event.clientX)}
      onPointerDown={(event) => {
        if (duration <= 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekAt(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) seekAt(event.clientX);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") onSeek(Math.min(duration, currentTime + 5));
        if (event.key === "ArrowLeft") onSeek(Math.max(0, currentTime - 5));
      }}
    >
      {Array.from({ length: barCount }, (_, i) => {
        const envelope = 7 + Math.sin(i * 0.12) * 8 + Math.sin(i * 0.047) * 10;
        const noise = Math.abs(Math.sin(i * 12.9898) * Math.cos(i * 4.141));
        const h = Math.max(3, envelope * noise + 3);
        const position = i / barCount;
        const played = duration > 0 && position <= currentTime / duration;
        return (
          <line
            key={i}
            x1={position * 720 + 2}
            x2={position * 720 + 2}
            y1={27 - h}
            y2={27 + h}
            stroke={played ? "#b68cff" : `hsl(${210 + (i / 180) * 90} 95% 68%)`}
            strokeWidth={mobileWaveform ? 3.5 : 1.7}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}


function App() {
  const [dark, setDark] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stemAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const stemGainRefs = useRef<Record<string, GainNode>>({});

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const togglePlayback = async () => {
    const mainAudio = audioRef.current;
    if (!mainAudio || !audioUrl) return;
    const stemAudios = Object.values(stemAudioRefs.current);

    if (mainAudio.paused) {
      try {
        if (audioContextRef.current) await audioContextRef.current.resume();
        mainAudio.muted = stemAudios.length > 0;

        if (stemAudios.length > 0) {
          const results = await Promise.all(stemAudios.map(async (audio) => {
            try {
              audio.currentTime = mainAudio.currentTime;
              await audio.play();
              return true;
            } catch {
              audio.pause();
              return false;
            }
          }));
          if (!results.some(Boolean)) {
            mainAudio.muted = false;
            setPlaying(false);
            setAnalysisError("The separated stems could not be played on this device.");
            return;
          }
          setAnalysisError(results.some((ok) => !ok) ? "Some separated layers could not be started." : "");
        }

        await mainAudio.play();
        setPlaying(true);
      } catch {
        mainAudio.pause();
        mainAudio.muted = false;
        stemAudios.forEach((audio) => audio.pause());
        setPlaying(false);
        setAnalysisError("Unable to play this audio file or its separated stems.");
      }
    } else {
      mainAudio.pause();
      mainAudio.muted = false;
      stemAudios.forEach((audio) => audio.pause());
      setPlaying(false);
    }
  };


  const [activeMenu, setActiveMenu] = useState("Analysis");
  const [levels, setLevels] = useState(stems.map(() => 100));
const [mutedStems, setMutedStems] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [trackArtist, setTrackArtist] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
const [analysisError, setAnalysisError] = useState("");
const [genreResult, setGenreResult] = useState<{
  track_id: string;
  genre: string;
  bpm: number;
  key: string;
  energy: number;
  loudness_db: number;
  acousticness: number;
  danceability: number;
  valence: number;
  arousal: number;
  spectral_centroid_hz: number;
  spectral_bandwidth_hz: number;
  zero_crossing_rate: number;
  subgenre: string | null;
  related_subgenres: string[];
} | null>(null);


  useEffect(() => {
    const mainAudio = audioRef.current;
    const mainAudioSrc = mainAudio?.src;
    return () => {
      Object.values(stemAudioRefs.current).forEach((audio) => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      });
      stemAudioRefs.current = {};
      stemGainRefs.current = {};

      if (mainAudio) {
        mainAudio.pause();
        mainAudio.removeAttribute("src");
        mainAudio.load();
        if (mainAudioSrc?.startsWith("blob:")) {
          URL.revokeObjectURL(mainAudioSrc);
        }
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

useEffect(() => {
  const controller = new AbortController();
  const loadDemo = async () => {
    try {
      setAnalyzing(true);
      const response = await fetch(`${API_BASE_URL}/demo`, { signal: controller.signal });
      if (!response.ok) throw new Error("Demo track unavailable");
      const data = await response.json();
      if (controller.signal.aborted) return;
      const stemNames = ["vocals", "drums", "bass", "other"];
      const audioContext = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = audioContext;
      const newStemAudios: Record<string, HTMLAudioElement> = {};
      stemNames.forEach((name) => {
        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.src = `${API_BASE_URL}/stems/${data.track_id}/${name}`;
        audio.volume = 1;
        const source = audioContext.createMediaElementSource(audio);
        const gain = audioContext.createGain();
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(audioContext.destination);
        stemGainRefs.current[name] = gain;
        newStemAudios[name] = audio;
      });
      if (controller.signal.aborted) return;
      stemAudioRefs.current = newStemAudios;
      setAudioUrl(`${API_BASE_URL}/demo/audio`);
      setFileName("Metric - Help I'm Alive.mp3");
      setTrackTitle(data.title || "Help I'm Alive");
      setTrackArtist(data.artist || "Metric");
      setCoverUrl(data.cover_url || null);
      setGenreResult(data);
      setCurrentTime(0);
      setDuration(0);
      setPlaying(false);
      setMutedStems([]);
      setLevels(stems.map(() => 100));
      setAnalysisError("");
    } catch (error) {
      if (!controller.signal.aborted) {
        setAnalysisError(error instanceof Error ? error.message : "Demo loading failed");
      }
    } finally {
      if (!controller.signal.aborted) setAnalyzing(false);
    }
  };
  void loadDemo();
  return () => controller.abort();
}, []);

const handleUpload = async (file?: File) => {
  if (!file) return;

  setFileName(file.name);
  setTrackTitle(file.name.replace(/\\.[^.]+$/, ""));
  setTrackArtist("");
  setCoverUrl(null);
  if (audioUrl?.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
  setAudioUrl(URL.createObjectURL(file));
  setPlaying(false);
  setCurrentTime(0);
  setDuration(0);

  Object.values(stemAudioRefs.current).forEach((audio) => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  });
  stemAudioRefs.current = {};
  stemGainRefs.current = {};
  setMutedStems([]);
  setLevels(stems.map(() => 100));

  setAnalyzing(true);
  setAnalysisError("");
  setGenreResult(null);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `${API_BASE_URL}/analyze/genre`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.detail || "Failed to analyze audio file");
    }

    const data = await response.json();

    const stemNames = ["vocals", "drums", "bass", "other"];
    const newStemAudios: Record<string, HTMLAudioElement> = {};

    const audioContext = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = audioContext;

    stemNames.forEach((name) => {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audio.src = `${API_BASE_URL}/stems/${data.track_id}/${name}`;
      audio.volume = 1;

      const source = audioContext.createMediaElementSource(audio);
      const gain = audioContext.createGain();
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(audioContext.destination);

      stemGainRefs.current[name] = gain;
      newStemAudios[name] = audio;
    });

    stemAudioRefs.current = newStemAudios;
    setGenreResult(data);
    setTrackTitle(data.title || file.name.replace(/\\.[^.]+$/, ""));
    setTrackArtist(data.artist || "Artist information unavailable");
    setCoverUrl(data.cover_url || null);
  } catch (error) {
    setAnalysisError(
      error instanceof Error
        ? error.message
        : "Analysis failed"
    );
  } finally {
    setAnalyzing(false);
  }
};


  return (
    <div className={`app ${dark ? "dark" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <SonanceMark />
          <span>SONANCE <small>AI</small></span>
        </div>

        <nav className="nav">
          {[
            ["⌂", "Home"],
            ["♬", "Analysis"],
            ["♧", "Learn"],
          ].map(([icon, label]) => (
            <button
              key={label}
              className={`nav-item ${activeMenu === label ? "selected" : ""}`}
              disabled={label === "Learn"}
              title={label === "Learn" ? "Coming in the next version" : undefined}
              onClick={() => {
                setActiveMenu(label);
                if (label === "Analysis") {
                  document.getElementById("upload")?.click();
                }
              }}
            >
              <span className="nav-icon">{icon}</span>{label}
            </button>
          ))}
        </nav>

        <div className="sidebar-promo">
          <div className="promo-icon">✦</div>
          <strong>Understand music.<br />Create yours.</strong>
          <button className="round-button" onClick={() => setActiveTab("Learning")}>→</button>
        </div>
        <div className="sidebar-bottom">YOUR MUSIC, DECODED.</div>
      </aside>

      <header className="topbar">
        {activeMenu !== "Home" && <button type="button" className="back-link" onClick={() => setActiveMenu("Home")}><span className="back-chevron" aria-hidden="true" /><span>Back home</span></button>}
        <div className="top-actions">
          <button className="icon-button theme-toggle" onClick={() => setDark(!dark)} title="Switch theme">
            {dark ? "☀" : "☾"}
          </button>
          <button className="icon-button" title="Notifications">♧</button>
          <div className="avatar">S</div>
        </div>
      </header>

      {activeMenu === "Home" ? (
        <main className="landing-page">
          <div className="landing-logo">
            <SonanceMark />
            <span>SONANCE <small>AI</small></span>
          </div>

          <section className="landing-hero">
            <p className="landing-eyebrow">MUSIC INTELLIGENCE PLATFORM</p>
            <h1>Hear music.<br />Understand everything.</h1>
            <p className="landing-description">
              Upload a track to analyse its genre, tempo, key, mood estimates
              and separated audio stems. More music tools are in development.
            </p>
            <button
              className="landing-cta"
              onClick={() => setActiveMenu("Analysis")}
            >
              Explore your music <span>→</span>
            </button>
          </section>

          <section className="landing-features">
            <article className="landing-feature">
              <span>✦</span>
              <h2>Music DNA</h2>
              <p>Reveal genre, mood, tempo and the character of every track.</p>
            </article>
            <article className="landing-feature">
              <span>♫</span>
              <h2>Every layer</h2>
              <p>Explore vocals, drums, bass and instruments separately.</p>
            </article>
            <article className="landing-feature">
              <span>◈</span>
              <h2>Track structure</h2>
              <p>Song sections and energy mapping — in development.</p>
            </article>
          </section>
        </main>
      ) : (
        <main className="main-content">
        <div className="track-heading">
          <div className="track-info">
            <div className="cover-art">
              {coverUrl ? (
                <img src={coverUrl} alt="Track cover" className="track-cover-image" />
              ) : (
                <div className="cover-orb">✧</div>
              )}
              {!coverUrl && <div className="cover-shine" />}
            </div>
            <div className="track-details">
              <h1>{trackTitle || "No track selected"}</h1>
              <p className="artist">{trackArtist || (fileName ? "Artist information unavailable" : "Upload audio to begin")}</p>
              <div className="track-meta">
                <span>◷ &nbsp;{formatTime(duration)}</span><span>♧ &nbsp;{genreResult?.bpm != null ? `${Math.round(genreResult.bpm)} BPM` : "BPM —"}</span><span>♬ &nbsp;{genreResult?.key ?? "Key —"}</span>
                <span>♧ &nbsp;{genreResult?.genre ?? "Genre pending"}</span>
                <span>♡ &nbsp;{genreResult?.subgenre ?? "Subgenre pending"}</span>
              </div>
            </div>
          </div>
        </div>

        <section className="player">
          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => {
              Object.values(stemAudioRefs.current).forEach((audio) => audio.pause());
              if (audioRef.current) audioRef.current.muted = false;
              setPlaying(false);
            }}
            hidden
          />
          <button className="play-button" onClick={togglePlayback} disabled={!audioUrl} aria-label={playing ? "Pause" : "Play"}>
            <span className={`play-icon ${playing ? "is-playing" : ""}`} aria-hidden="true" />
          </button>
          <Waveform
            currentTime={currentTime}
            duration={duration}
            onSeek={(time) => {
              if (audioRef.current) {
                audioRef.current.currentTime = time;
                Object.values(stemAudioRefs.current).forEach((audio) => {
                  audio.currentTime = time;
                });
                setCurrentTime(time);
              }
            }}
          />
          <span className="duration">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </section>

        <label className="upload-strip">
          <span>＋</span>
          <span>{fileName || "Upload an audio file to analyze your own track"}</span>
          <strong>Choose file ↗</strong>
          <input id="upload" type="file" accept="audio/*" onChange={(e) => handleUpload(e.target.files?.[0])} hidden />
        </label>

{analyzing && (
  <p className="analysis-status">
    Analyzing audio…
  </p>
)}

{analysisError && (
  <p className="analysis-error">
    {analysisError}
  </p>
)}




        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? "active" : ""}
            >
              {tab}
            </button>
          ))}
          <span
            className="tabs-indicator"
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${tabs.indexOf(activeTab) * 100}%)`,
            }}
          />
        </div>
        {activeTab === "Overview" && (
          genreResult ? (
            <>
              <section className="panel dna-panel">
                <div className="section-title">
                  <span className="section-symbol">✦</span>
                  <div>
                    <h2>Music DNA</h2>
                    <p>Estimated properties from the uploaded track</p>
                  </div>
                </div>
                <div className="dna-content">
                  <div className="metric">
                    <small>Primary genre</small>
                    <strong>{genreResult.genre}</strong>
                    <em>{genreResult.subgenre ?? "No subgenre returned"}</em>
                  </div>
                  <div className="metric">
                    <small>Mood estimate</small>
                    <strong>
                      {genreResult.valence >= 6 && genreResult.arousal >= 6 ? "Euphoric" :
                        genreResult.valence >= 6 && genreResult.arousal < 4.5 ? "Calm" :
                        genreResult.valence < 4.5 && genreResult.arousal >= 6 ? "Tense" :
                        genreResult.valence < 4.5 && genreResult.arousal < 4.5 ? "Melancholic" :
                        genreResult.arousal >= 6 ? "Energetic" :
                        genreResult.arousal < 4.5 ? "Relaxed" :
                        genreResult.valence >= 5 ? "Warm" : "Reflective"}
                    </strong>
                    <span>Valence {genreResult.valence.toFixed(1)} · Arousal {genreResult.arousal.toFixed(1)}</span>
                    <em className="blue-tag">DEAM model estimate</em>
                  </div>
                  <div className="metric">
                    <small>Key estimate</small>
                    <strong>{genreResult.key}</strong>
                    <span>Chroma profile</span>
                  </div>
                  <div className="metric">
                    <small>Tempo estimate</small>
                    <strong>{Math.round(genreResult.bpm)} BPM</strong>
                    <span>Detected from audio</span>
                  </div>
                  <div className="metric">
                    <small>Loudness</small>
                    <strong>{genreResult.loudness_db.toFixed(1)} dB</strong>
                    <span>Mean RMS level</span>
                  </div>
                  <div className="traits">
                    <div><span>Danceability</span><strong>{genreResult.danceability.toFixed(2)}</strong></div>
                    <div><span>Harmonic share*</span><strong>{Math.round(genreResult.acousticness * 100)}%</strong></div>
                    <div><span>Spectral centroid</span><strong>{Math.round(genreResult.spectral_centroid_hz)} Hz</strong></div>
                    <div><span>Spectral bandwidth</span><strong>{Math.round(genreResult.spectral_bandwidth_hz)} Hz</strong></div>
                  </div>
                </div>
                <p className="analysis-note">
                  Mood and genre are model estimates. *Harmonic share is a signal-derived harmonic/percussive balance, not a trained acousticness prediction.
                </p>
              </section>
              <section className="panel development-panel">
                <span className="development-tag">IN DEVELOPMENT</span>
                <h2>Track Structure &amp; Energy Map</h2>
                <p>Song-section detection and time-aligned energy analysis are not connected yet. No sample timeline is shown as if it came from this track.</p>
              </section>
            </>
          ) : (
            <section className="panel empty-analysis-state">
              <div className="empty-analysis-mark"><SonanceMark /></div>
              <span className="development-tag">READY FOR ANALYSIS</span>
              <h2>Start with a track</h2>
              <p>Upload an audio file to calculate its genre, tempo, key, mood estimates and separated stems.</p>
              <button type="button" className="landing-cta" onClick={() => document.getElementById("upload")?.click()}>
                Choose audio file <span>→</span>
              </button>
            </section>
          )
        )}

        {activeTab !== "Overview" && (
          <section className="panel alternate-panel">
            <div className="section-title">
              <span className="section-symbol">✦</span>
              <div>
                <h2>{activeTab}</h2>
                <p>{activeTab === "Stems" ? "Separated audio stems from this track" : "This module is not connected yet"}</p>
              </div>
            </div>
            {activeTab === "Stems" ? (
              <div className="development-message">
                <span className="development-tag">IN DEVELOPMENT</span>
                <p>Detailed per-stem analysis and a dedicated mixing workspace are still being developed. Basic controls for currently available separated layers remain in the right-side panel.</p>
              </div>
            ) : (
              <div className="development-message">
                <span className="development-tag">IN DEVELOPMENT</span>
                <p>
                  {activeTab === "Structure" && "Automatic song-section detection and time-aligned energy analysis are planned for a later release."}
                  {activeTab === "MIDI" && "MIDI extraction and export are not implemented yet."}
                  {activeTab === "Similar Tracks" && "Track similarity and recommendations are not connected to an analysis model yet."}
                  {activeTab === "Learning" && "Interactive listening lessons and exercises are planned for a later release."}
                </p>
              </div>
            )}
          </section>
        )}
        <footer>SONANCE AI <span>Music intelligence, reimagined.</span><span>{genreResult ? "ANALYSIS ESTIMATES · NOT GROUND TRUTH" : "NO TRACK LOADED"}</span></footer>
        </main>
      )}

      {activeMenu !== "Home" && <aside className="rightbar">
        <section className="stems-section">
          <div className="section-title"><span className="section-symbol">✣</span><div><h2>Stems</h2><p>Isolated tracks</p></div></div>
          {stems.map((stem, i) => {
            const stemMap: Record<string, string> = {
              "Vocals": "vocals",
              "Drums & Percussion": "drums",
              "Bass": "bass",
              "Other": "other",
            };
            const stemFile = stemMap[stem.name];
            const available = Boolean(stemFile && genreResult?.track_id);
            const muted = mutedStems.includes(stem.name) || levels[i] === 0;
            const icons: Record<string, string> = {
              "Vocals": "♬",
              "Drums & Percussion": "▦",
              "Bass": "〰",
              "Harmonic Layers": "◈",
              "Melodic Layers": "♫",
              "Textures & FX": "✧",
              "Other": "◉",
            };

            return (
              <div className={`stem-row ${!available ? "stem-unavailable" : ""}`} key={stem.name}>
                <button
                  type="button"
                  className={`stem-icon ${stem.color} ${muted ? "stem-muted" : ""}`}
                  aria-label={`${muted ? "Enable" : "Mute"} ${stem.name}`}
                  title={available ? `${muted ? "Enable" : "Mute"} ${stem.name}` : `${stem.name} separation unavailable`}
                  disabled={!available}
                  onClick={() => {
                    if (!stemFile) return;
                    const nextMuted = mutedStems.includes(stem.name)
                      ? mutedStems.filter((name) => name !== stem.name)
                      : [...mutedStems, stem.name];
                    setMutedStems(nextMuted);
                    const audio = stemAudioRefs.current[stemFile];
                    const gain = stemGainRefs.current[stemFile];
                    if (audio && gain) {
                      setStemGain(
                        gain,
                        nextMuted.includes(stem.name) || levels[i] === 0
                          ? 0
                          : levels[i] / 100
                      );
                    }
                  }}
                >
                  <span className="stem-glyph">{icons[stem.name]}</span>
                  {muted && <span className="stem-slash" aria-hidden="true" />}
                </button>
                <span className="stem-name">{stem.name}</span>
                <input
                  aria-label={`${stem.name} level`}
                  type="range"
                  min="0"
                  max="200"
                  step="1"
                  value={levels[i]}
                  disabled={!available}
                  onChange={(e) => {
                    const level = Number(e.target.value);
                    setLevels((previous) => previous.map((value, j) => j === i ? level : value));
                    const audio = stemFile ? stemAudioRefs.current[stemFile] : undefined;
                    const gain = stemFile ? stemGainRefs.current[stemFile] : undefined;
                    if (audio && gain) {
                      setStemGain(
                        gain,
                        level === 0 || mutedStems.includes(stem.name)
                          ? 0
                          : level / 100
                      );
                    }
                    if (level === 0 && !mutedStems.includes(stem.name)) {
                      setMutedStems((previous) => [...previous, stem.name]);
                    } else if (level > 0 && mutedStems.includes(stem.name)) {
                      setMutedStems((previous) => previous.filter((name) => name !== stem.name));
                    }
                  }}
                />
                <span className="stem-level">{levels[i]}%</span>
              </div>
            );
          })}
        </section>

        <section className="panel similar-panel">
          <div className="section-title">
            <span className="section-symbol">✣</span>
            <div><h2>Similar Tracks</h2><p>Recommendations based on track similarity</p></div>
          </div>
          <div className="development-message">
            <span className="development-tag">IN DEVELOPMENT</span>
            <p>No recommendations are generated yet. This area will be connected to a similarity model.</p>
          </div>
        </section>

        <button className="learn-card" onClick={() => setActiveTab("Learning")}><span className="learn-spark">✦</span><span><strong>Learning tools</strong><small>Interactive lessons · In development</small></span><span className="learn-arrow">→</span></button>
      </aside>}
    {analyzing && (
      <div className="sonance-loading-overlay" role="status" aria-live="polite">
        <div className="sonance-loading-brand">
          <SonanceMark animated />
          <div className="sonance-loading-wordmark">
            <strong>SONANCE</strong>
            <small>AI</small>
          </div>
        </div>
        <span className="sonance-loading-label">LOADING</span>
      </div>
    )}
    </div>
  );
}

export default App;
