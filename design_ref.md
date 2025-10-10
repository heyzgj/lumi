import React, { useState } from "react";
import { motion } from "framer-motion";
import { LucideIcon, Camera, Sparkles, Menu, Settings, Search } from "lucide-react";

/**
 * Ethereal Minimalism — 2025 Full Design System
 * Style: Airy, Liquid Glass, Ultra Minimal
 * Elements: Smooth shadow, liquid transparency, glass gradient, calm motion
 */

const TK = {
  light: {
    bg: "#FAFBFC",
    card: "rgba(255,255,255,0.7)",
    border: "#E3E8EF",
    text: { p: "#212121", s: "#616161", t: "#A0A0A0" },
    accent: { mint: "#EAF9F4", sky: "#E6F3FF", apricot: "#FFF3EA", silver: "#F7F9FB" },
  },
  dark: {
    bg: "#111213",
    card: "rgba(26,27,28,0.65)",
    border: "#2C2F33",
    text: { p: "#F5F5F5", s: "#C7C7C7", t: "#858585" },
    accent: { mint: "#4EE6C1", sky: "#6EB8FF", apricot: "#FFD3A6", silver: "#2D2E31" },
  },
};

const RecursiveShadow = ({ depth = 3, spread = 14, decay = 0.65, children }: any) => {
  const layers = Array.from({ length: depth }).map((_, i) => {
    const opacity = Math.pow(decay, i);
    const blur = spread * (i + 1);
    return `0 ${blur / 3}px ${blur}px rgba(0,0,0,${opacity * 0.25})`;
  });
  return <div style={{ boxShadow: layers.join(", ") }}>{children}</div>;
};

const GlassCard = ({ theme, children }: any) => {
  const t = TK[theme];
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.4 }}
      className="rounded-[28px] p-8 backdrop-blur-2xl border"
      style={{
        background: theme === 'light' ? 'rgba(255,255,255,0.55)' : 'rgba(26,27,28,0.5)',
        borderColor: t.border,
        boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
      }}
    >
      {children}
    </motion.div>
  );
};

const IconSet = ({ theme }: { theme: 'light' | 'dark' }) => {
  const t = TK[theme];
  const icons = [Camera, Sparkles, Menu, Settings, Search];
  return (
    <div className="flex gap-6 text-sm mt-2" style={{ color: theme === 'light' ? '#5B5B5B' : '#E6E6E6' }}>
      {icons.map((IconComp, i) => (
        <div key={i} className="rounded-xl p-3 backdrop-blur-md border" style={{ background: theme==='light'? 'rgba(255,255,255,0.6)':'rgba(35,36,37,0.5)', borderColor: t.border }}>
          <IconComp size={22} />
        </div>
      ))}
    </div>
  );
};

export default function EtherealSystem() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const t = TK[theme];
  const gradient = `linear-gradient(135deg, ${t.accent.mint}, ${t.accent.sky})`;

  return (
    <div className="min-h-screen w-full px-6 pb-20" style={{ background: t.bg, color: t.text.p }}>
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-md rounded-[32px] px-4 py-3 mt-4 flex items-center gap-3" style={{ background: theme==='light'? 'rgba(255,255,255,0.6)': 'rgba(26,27,28,0.6)', border:`1px solid ${t.border}` }}>
        <div className="font-semibold">Ethereal Minimalism — Full Design System</div>
        <div className="text-sm" style={{ color: t.text.s }}>Liquid Glass · Airy Motion · Recursive Shadow</div>
        <div className="grow" />
        <button onClick={()=>setTheme(theme==='light'?'dark':'light')} className="rounded-full px-3 py-1 text-sm border" style={{ borderColor: t.border }}>{theme==='light'?'Dark':'Light'}</button>
      </div>

      {/* Hero */}
      <div className="mt-10 grid md:grid-cols-2 gap-6">
        <GlassCard theme={theme}>
          <div className="text-3xl font-semibold tracking-tight">空灵与液态光感的交织</div>
          <div className="mt-2 text-sm" style={{ color: t.text.s }}>清新透明 · 光滑流动 · 静谧科技</div>
          <motion.button whileHover={{ scale: 1.04 }} className="mt-5 rounded-full px-6 py-3 font-medium" style={{ background: gradient, color: theme==='light'? '#1B1B1B':'#FAFAFA', boxShadow:'0 6px 20px rgba(0,0,0,0.05)' }}>开始体验</motion.button>
        </GlassCard>
        <RecursiveShadow>
          <div className="rounded-[28px] overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
            <img src="https://images.unsplash.com/photo-1503264116251-35a269479413?q=80&w=1887&auto=format&fit=crop" className="w-full h-64 object-cover" />
          </div>
        </RecursiveShadow>
      </div>

      {/* Liquid Glass Layer */}
      <div className="mt-12">
        <div className="text-lg font-semibold mb-3">Liquid Glass Effect</div>
        <div className="grid md:grid-cols-3 gap-6">
          {[1,2,3].map((i)=>(
            <motion.div key={i} whileHover={{ scale: 1.03 }} className="rounded-[24px] h-48 border backdrop-blur-3xl" style={{
              background: theme==='light'? 'linear-gradient(145deg, rgba(255,255,255,0.8), rgba(245,248,250,0.4))':'linear-gradient(145deg, rgba(35,36,37,0.7), rgba(18,18,18,0.4))',
              borderColor: t.border,
              boxShadow:'inset 0 0 20px rgba(255,255,255,0.25)',
            }}>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Iconography */}
      <div className="mt-12">
        <div className="text-lg font-semibold mb-3">Iconography (Lucide Trend 2025)</div>
        <IconSet theme={theme} />
      </div>

      {/* Inputs & Buttons */}
      <div className="mt-12 grid md:grid-cols-2 gap-6">
        <GlassCard theme={theme}>
          <div className="text-sm mb-2" style={{ color: t.text.s }}>输入框</div>
          <input type="text" placeholder="Type something..." className="w-full px-4 py-3 rounded-[16px] text-sm focus:outline-none" style={{ background: theme==='light'? 'rgba(255,255,255,0.9)':'rgba(35,36,37,0.7)', border:`1px solid ${t.border}` }} />
        </GlassCard>
        <GlassCard theme={theme}>
          <div className="text-sm mb-2" style={{ color: t.text.s }}>按钮</div>
          <motion.button whileTap={{ scale: 0.97 }} className="rounded-full px-6 py-3 font-medium" style={{ background: gradient, color: theme==='light'? '#212121':'#FAFAFA', boxShadow:'0 6px 18px rgba(0,0,0,0.08)' }}>Primary</motion.button>
        </GlassCard>
      </div>

      {/* Typography */}
      <div className="mt-12 grid md:grid-cols-2 gap-6">
        <GlassCard theme={theme}>
          <div className="text-3xl font-semibold">标题 H1 — 28pt</div>
          <div className="text-xl mt-2 font-medium">副标题 H2 — 22pt</div>
          <div className="text-sm mt-2" style={{ color: t.text.s }}>正文文字 — 16pt / 行高 1.6x，柔和灰排版。</div>
        </GlassCard>
        <GlassCard theme={theme}>
          <div className="text-lg font-semibold mb-3">色彩系统</div>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(t.accent).map(([k,v])=>(
              <div key={k} className="rounded-xl h-16 flex items-center justify-center text-xs" style={{ background:v }}>{k}</div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Motion showcase */}
      <div className="mt-14 text-center">
        <motion.div animate={{ scale:[1,1.04,1] }} transition={{ repeat:Infinity, duration:3, ease:'easeInOut' }} className="rounded-full w-24 h-24 mx-auto" style={{ background: gradient, boxShadow:'0 0 40px rgba(0,0,0,0.1)' }} />
        <div className="text-sm mt-3" style={{ color:t.text.s }}>微动效 · 呼吸脉冲 Glow</div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs mt-12" style={{ color: t.text.t }}>© 2025 Ethereal Minimalism · Liquid Glass Design System · Calm Future Aesthetic</div>
    </div>
  );
}
