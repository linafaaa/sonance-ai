
import { useEffect, useRef, useState } from "react";
import "./App.css";

const stems = [
  { name: "Vocals", icon: "≋", color: "pink", value: 64 },
  { name: "Drums & Percussion", icon: "≋", color: "orange", value: 48 },
  { name: "Bass", icon: "≋", color: "green", value: 43 },
  { name: "Other", icon: "≋", color: "gray", value: 48 },
];

const tracks = [
  { name: "Midnight", artist: "ODESZA", score: "92%", color: "sunset" },
  { name: "Bloom", artist: "ODESZA", score: "87%", color: "ocean" },
  { name: "A Moment Apart", artist: "ODESZA", score: "84%", color: "night" },
  { name: "Something About You", artist: "ODESZA", score: "78%", color: "amber" },
  { name: "Sun Models", artist: "ODESZA", score: "74%", color: "violet" },
];

const sections = [
  { name: "Intro", time: "0:00 – 0:32", color: "#5085ff", width: 16 },
  { name: "Verse", time: "0:32 – 1:08", color: "#a65aff", width: 16 },
  { name: "Build", time: "1:08 – 1:46", color: "#ed78d8", width: 17 },
  { name: "Drop", time: "1:46 – 2:28", color: "#4bd3cb", width: 19 },
  { name: "Breakdown", time: "2:28 – 3:10", color: "#f7d96b", width: 19 },
  { name: "Outro", time: "3:10 – 3:42", color: "#9080ff", width: 13 },
];

const tabs = ["Overview", "Stems", "Structure", "MIDI", "Similar Tracks", "Learning"];

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
      {Array.from({ length: 180 }, (_, i) => {
        const envelope = 7 + Math.sin(i * 0.12) * 8 + Math.sin(i * 0.047) * 10;
        const noise = Math.abs(Math.sin(i * 12.9898) * Math.cos(i * 4.141));
        const h = Math.max(3, envelope * noise + 3);
        const played = duration > 0 && i / 180 <= currentTime / duration;
        return (
          <line
            key={i}
            x1={i * 4 + 1}
            x2={i * 4 + 1}
            y1={27 - h}
            y2={27 + h}
            stroke={played ? "#b68cff" : `hsl(${210 + (i / 180) * 90} 95% 68%)`}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function EnergyMap() {
  return (
    <svg className="energy-chart" viewBox="0 0 760 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bd79ff" stopOpacity=".6" />
          <stop offset="100%" stopColor="#70a5ff" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id="energyLine">
          <stop offset="0%" stopColor="#4189ff" />
          <stop offset="55%" stopColor="#c26cff" />
          <stop offset="100%" stopColor="#4bbdff" />
        </linearGradient>
      </defs>
      {[15, 38, 61, 84].map((y) => (
        <line key={y} x1="0" y1={y} x2="760" y2={y} className="chart-grid" />
      ))}
      <path
        d="M0 78 C30 75 40 57 70 61 S115 39 145 47 S185 35 215 44 S250 67 282 43 S320 39 340 51 S360 67 380 46 S420 44 450 31 S500 25 525 33 S560 16 585 35 S610 58 635 43 S670 57 695 51 S730 67 760 71 L760 100 L0 100Z"
        fill="url(#energyFill)"
      />
      <path
        d="M0 78 C30 75 40 57 70 61 S115 39 145 47 S185 35 215 44 S250 67 282 43 S320 39 340 51 S360 67 380 46 S420 44 450 31 S500 25 525 33 S560 16 585 35 S610 58 635 43 S670 57 695 51 S730 67 760 71"
        fill="none"
        stroke="url(#energyLine)"
        strokeWidth="1.5"
      />
      <line x1="355" y1="12" x2="355" y2="91" stroke="#a65aff" strokeWidth="1.5" />
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
  const demoInitializedRef = useRef(false);

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
        const audioContext = audioContextRef.current;
        if (audioContext) await audioContext.resume();

        mainAudio.volume = 0;
        await Promise.all(stemAudios.map(async (audio) => {
          audio.currentTime = mainAudio.currentTime;
          await audio.play();
        }));
        await mainAudio.play();
        setPlaying(true);
      } catch {
        mainAudio.pause();
        stemAudios.forEach((audio) => audio.pause());
        setPlaying(false);
        setAnalysisError("Unable to play this audio file or its separated stems.");
      }
    } else {
      mainAudio.pause();
      stemAudios.forEach((audio) => audio.pause());
      setPlaying(false);
    }
  };


  const [activeMenu, setActiveMenu] = useState("Analyze");
  const [saved, setSaved] = useState(false);
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
    if (demoInitializedRef.current) return;
    demoInitializedRef.current = true;

    const demoTrackId = "2c6e5722ab694a3a90069792bb1a7ccf";

    const demoData: NonNullable<typeof genreResult> = {
      track_id: demoTrackId,
      genre: "Rock",
      bpm: 117.5,
      key: "G Minor",
      energy: 1.0,
      loudness_db: -10.2,
      acousticness: 0.78,
      danceability: 1.114,
      valence: 6.116,
      arousal: 5.082,
      spectral_centroid_hz: 1758.9,
      spectral_bandwidth_hz: 2120.2,
      zero_crossing_rate: 0.0697,
      subgenre: "Alternative Rock",
      related_subgenres: ["Pop Rock", "Indie Rock", "Brit Pop"],
    };

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    stemGainRefs.current = {};

    const newStemAudios: Record<string, HTMLAudioElement> = {};

    ["vocals", "drums", "bass", "other"].forEach((name) => {
      const audio = new Audio(
        "http://" + "127.0.0.1:8000/stems/" + demoTrackId + "/" + name
      );
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
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
    setFileName("Metric - Help I'm Alive.aac");
    setTrackTitle("Help I'm Alive");
    setTrackArtist("Metric");
    setCoverUrl(null);
    setAudioUrl("/demo-track.aac");
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
    setMutedStems([]);
    setLevels(stems.map(() => 100));
    setSaved(false);
    setActiveTab("Overview");
    setGenreResult(demoData);
    setAnalysisError("");
    setAnalyzing(false);

    return () => {
      Object.values(newStemAudios).forEach((audio) => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      });

      if (stemAudioRefs.current === newStemAudios) {
        stemAudioRefs.current = {};
        stemGainRefs.current = {};
      }

      if (audioContextRef.current === audioContext) {
        audioContextRef.current = null;
        void audioContext.close();
      }

      demoInitializedRef.current = false;
    };
  }, []);

const handleUpload = async (file?: File) => {
  if (!file) return;

  setFileName(file.name);
  setTrackTitle(file.name.replace(/\\.[^.]+$/, ""));
  setTrackArtist("");
  setCoverUrl(null);
  setAudioUrl((previous) => {
    if (previous) URL.revokeObjectURL(previous);
    return URL.createObjectURL(file);
  });
  setPlaying(false);
  setCurrentTime(0);
  setDuration(0);

  Object.values(stemAudioRefs.current).forEach((audio) => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  });
  stemAudioRefs.current = {};
  setMutedStems([]);
  setLevels(stems.map(() => 100));

  setAnalyzing(true);
  setAnalysisError("");
  setGenreResult(null);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      "http://" + "127.0.0.1:8000/analyze/genre",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error("Failed to analyze audio file");
    }

    const data = await response.json();

    const stemNames = ["vocals", "drums", "bass", "other"];
    const newStemAudios: Record<string, HTMLAudioElement> = {};

    const audioContext = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = audioContext;

    stemNames.forEach((name) => {
      const audio = new Audio(
        "http://" + "127.0.0.1:8000/stems/" + data.track_id + "/" + name
      );
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
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
    setTrackArtist(data.artist || "Artist not tagged");
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
            ["♬", "Analyze"],
            ["♧", "Learn"],
            ["◉", "Explore"],
            ["▱", "Library"],
          ].map(([icon, label]) => (
            <button
              key={label}
              className={`nav-item ${activeMenu === label ? "selected" : ""}`}
              onClick={() => {
                setActiveMenu(label);
                if (label === "Analyze") {
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
              Discover the DNA behind every track. Explore sound, rhythm,
              mood and structure with AI-powered music analysis.
            </p>
            <button
              className="landing-cta"
              onClick={() => setActiveMenu("Analyze")}
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
              <h2>Sound in motion</h2>
              <p>See how energy and song structure evolve over time.</p>
            </article>
          </section>
        </main>
      ) : (
        <main className="main-content">
        <div className="track-heading">
          <div className="back-link">← <span>Back to library</span></div>
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
              <h1>{trackTitle || "Afterglow"}</h1>
              <p className="artist">{trackArtist || (fileName ? "ARTIST NOT TAGGED" : "ODESZA")}</p>
              <div className="track-meta">
                <span>◷ &nbsp;{formatTime(duration)}</span><span>♧ &nbsp;{genreResult?.bpm != null ? `${Math.round(genreResult.bpm)} BPM` : "BPM —"}</span><span>♬ &nbsp;{genreResult?.key ?? "Key —"}</span>
                <span>♧ &nbsp;{genreResult?.genre ?? "Genre pending"}</span>
                <span>♡ &nbsp;{genreResult?.subgenre ?? "Subgenre pending"}</span>
              </div>
            </div>
            <button className={`save-button ${saved ? "saved" : ""}`} onClick={() => setSaved(!saved)}>
              ♧ &nbsp;{saved ? "Saved to library" : "Save to library"}
            </button>
          </div>
        </div>

        <section className="player">
          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => setPlaying(false)}
            hidden
          />
          <button className="play-button" onClick={togglePlayback} disabled={!audioUrl} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "Ⅱ" : "▶"}
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
        {activeTab === "Overview" && <>
          <section className="panel dna-panel">
            <div className="section-title"><span className="section-symbol">✦</span><div><h2>Music DNA</h2><p>The key elements of this track</p></div></div>
            <div className="dna-content">
              <div className="metric"><small>Primary genre</small><strong>{genreResult?.genre ?? "—"}</strong><em>{genreResult?.subgenre ?? "Upload a track to analyze"}</em></div>
              <div className="metric"><small>Mood</small><strong>{genreResult?.valence != null && genreResult?.arousal != null ? (genreResult.valence >= 6 && genreResult.arousal >= 6 ? "Euphoric" : genreResult.valence >= 6 && genreResult.arousal < 4.5 ? "Calm" : genreResult.valence < 4.5 && genreResult.arousal >= 6 ? "Tense" : genreResult.valence < 4.5 && genreResult.arousal < 4.5 ? "Melancholic" : genreResult.arousal >= 6 ? "Energetic" : genreResult.arousal < 4.5 ? "Relaxed" : genreResult.valence >= 5 ? "Warm" : "Reflective") : "—"}</strong><span>{genreResult?.arousal != null ? `Arousal ${genreResult.arousal.toFixed(1)} / 9` : "Awaiting analysis"}</span><em className="blue-tag">DEAM emotion model</em></div>
              <div className="metric"><small>Key</small><strong>{genreResult?.key ?? "—"}</strong><span>Detected key</span></div>
              <div className="metric"><small>BPM</small><strong>{genreResult?.bpm != null ? Math.round(genreResult.bpm) : "—"}</strong><span>Detected tempo</span></div>
              <div className="metric energy-metric"><small>Energy</small><strong>{genreResult?.energy != null ? (genreResult.energy >= 0.7 ? "High" : genreResult.energy >= 0.35 ? "Medium" : "Low") : "—"}</strong><span>{genreResult?.energy != null ? `${Math.round(genreResult.energy * 100)}% estimated` : "Awaiting analysis"}</span></div>
              <div className="radar"><div className="radar-ring"><div className="radar-core" /></div></div>
              <div className="traits"><div><span>Danceability</span><strong>{genreResult?.danceability != null ? genreResult.danceability.toFixed(2) : "—"}</strong></div><div><span>Acousticness*</span><strong>{genreResult?.acousticness != null ? `${Math.round(genreResult.acousticness * 100)}%` : "—"}</strong></div><div><span>Valence (1–9)</span><strong>{genreResult?.valence != null ? genreResult.valence.toFixed(1) : "—"}</strong></div><div><span>Loudness</span><strong>{genreResult?.loudness_db != null ? `${genreResult.loudness_db} dB` : "—"}</strong></div></div>
            </div>
          </section>

          <section className="panel structure-panel">
            <div className="section-title"><span className="section-symbol">♧</span><div><h2>Track Structure</h2><p>Song sections and energy flow</p></div></div>
            <div className="structure-bar">{sections.map((s) => <div key={s.name} style={{ width: `${s.width}%`, background: s.color }} />)}</div>
            <div className="time-labels"><span>0:00</span><span>0:32</span><span>1:08</span><span>1:46</span><span>2:28</span><span>3:10</span><span>3:42</span></div>
            <div className="legend">{sections.map((s) => <div key={s.name}><span className="legend-dot" style={{ background: s.color }} /><div><strong>{s.name}</strong><small>{s.time}</small></div></div>)}</div>
          </section>

          <section className="panel chart-panel">
            <div className="section-title"><span className="section-symbol">♧</span><div><h2>Energy Map</h2><p>How the intensity changes</p></div></div>
            <div className="chart-wrap"><div className="chart-labels"><span>High</span><span>Low</span></div><EnergyMap /></div>
            <div className="chart-times"><span>0:00</span><span>0:32</span><span>1:08</span><span>1:46</span><span>2:28</span><span>3:10</span><span>3:42</span></div>
          </section>
        </>}

        {activeTab !== "Overview" && <section className="panel alternate-panel">
          <div className="section-title"><span className="section-symbol">✦</span><div><h2>{activeTab}</h2><p>Explore the details of your music</p></div></div>
          {activeTab === "Stems" ? <p>Use the individual stem controls in the right panel to adjust levels. Real stem separation will be connected to the audio backend later.</p> :
            activeTab === "Structure" ? <><div className="structure-bar">{sections.map((s) => <div key={s.name} style={{ width: `${s.width}%`, background: s.color }} />)}</div><div className="legend">{sections.map((s) => <div key={s.name}><span className="legend-dot" style={{ background: s.color }} /><div><strong>{s.name}</strong><small>{s.time}</small></div></div>)}</div></> :
            <p>This workspace is prepared for the {activeTab.toLowerCase()} module. Its analysis features will be implemented in later steps.</p>}
        </section>}
        <footer>SONANCE AI <span>Music intelligence, reimagined.</span><span>DEMO DATA · NOT LIVE ANALYSIS</span></footer>
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
                      gain.gain.value =
                        nextMuted.includes(stem.name) || levels[i] === 0
                          ? 0
                          : levels[i] / 100;
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
                      gain.gain.value =
                        level === 0 || mutedStems.includes(stem.name)
                          ? 0
                          : level / 100;
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
          <div className="similar-heading"><div className="section-title"><span className="section-symbol">✣</span><div><h2>Similar Tracks</h2><p>Based on genre, mood and structure</p></div></div><button onClick={() => setActiveTab("Similar Tracks")}>See all</button></div>
          {tracks.map((track) => <div className="similar-track" key={track.name}>
            <div className={`mini-cover ${track.color}`}><span>✦</span></div>
            <div className="similar-info"><strong>{track.name}</strong><small>{track.artist}</small></div>
            <span className="score">{track.score}</span>
          </div>)}
        </section>

        <button className="learn-card" onClick={() => setActiveTab("Learning")}><span className="learn-spark">✦</span><span><strong>Learn more about this sound</strong><small>Get AI-powered lessons and exercises</small></span><span className="learn-arrow">→</span></button>
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
