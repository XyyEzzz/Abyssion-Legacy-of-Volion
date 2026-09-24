'use client';

import { ChevronLeft } from 'lucide-react';

const FOUNDERS = [
  { role: 'Founder / Lead Developer', name: 'EZROHELL' },
  { role: 'Co-Founder / Technical Support', name: 'Valz-san' },
];

const SPECIAL_THANKS = [
  'Our Testers',
  'Our Early Alpha Players',
  'Playtesters & Feedback Contributors',
  'Friends & Community',
  'Everyone who contributed development feedback',
];

/**
 * Production credits document every responsibility of the project.
 * Several are performed by the same person — that is deliberate: this
 * section records responsibilities, not team size.
 */
const PRODUCTION_CREDITS: { department: string; name: string }[] = [
  { department: 'GAME DIRECTION & DESIGN', name: 'EZROHELL' },
  { department: 'GAMEPLAY PROGRAMMING', name: 'EZROHELL' },
  { department: 'COMBAT SYSTEMS', name: 'EZROHELL' },
  { department: 'PLAYER CONTROLLER & MOVEMENT SYSTEMS', name: 'EZROHELL' },
  { department: 'GAME SYSTEMS PROGRAMMING', name: 'EZROHELL' },
  { department: 'PROGRESSION & CHARACTER SYSTEMS', name: 'EZROHELL' },
  { department: 'INVENTORY & EQUIPMENT SYSTEMS', name: 'EZROHELL' },
  { department: 'WEAPON SYSTEMS', name: 'EZROHELL' },
  { department: 'ABILITY & SKILL SYSTEMS', name: 'EZROHELL' },
  { department: 'NPC & INTERACTION SYSTEMS', name: 'EZROHELL' },
  { department: 'QUEST & REWARD SYSTEMS', name: 'EZROHELL' },
  { department: 'SAVE / LOAD & PERSISTENCE SYSTEMS', name: 'EZROHELL' },
  { department: 'UI / UX SYSTEMS', name: 'EZROHELL' },
  { department: 'HUD & HUD EDITOR', name: 'EZROHELL' },
  { department: 'MAP & MINIMAP SYSTEMS', name: 'EZROHELL' },
  { department: 'WORLD & LEVEL DESIGN', name: 'EZROHELL' },
  { department: 'WORLD SYSTEMS', name: 'EZROHELL' },
  { department: 'ART & VISUAL DIRECTION', name: 'EZROHELL' },
  { department: 'ANIMATION SYSTEMS', name: 'EZROHELL' },
  { department: 'AUDIO & SOUND DIRECTION', name: 'EZROHELL' },
  { department: 'TECHNICAL ARCHITECTURE', name: 'EZROHELL' },
  { department: 'PERFORMANCE & OPTIMIZATION', name: 'EZROHELL' },
  { department: 'QUALITY ASSURANCE & VALIDATION', name: 'EZROHELL' },
  { department: 'BUILD & INTEGRATION', name: 'EZROHELL' },
  { department: 'NATIVE ENGINE DEVELOPMENT', name: 'EZROHELL' },
  { department: 'TECHNICAL DOCUMENTATION', name: 'EZROHELL' },
  { department: 'WRITING & NARRATIVE DESIGN', name: 'EZROHELL' },
  { department: 'TECHNICAL SUPPORT', name: 'Valz-san' },
  { department: 'BUSINESS DEVELOPMENT & MARKETING LEAD', name: 'ALGANDJA' },
];

const TECH_STACK_WEB = [
  'React / TypeScript',
  'Three.js / React Three Fiber',
  'Rapier Physics',
  'Zustand State Management',
];

const TECH_STACK_NATIVE = [
  'C++17',
  'SDL2',
  'OpenGL 3.3',
  'CMake',
];

const TECH_STACK_DATA = ['Rust', 'Rust C ABI'];

interface CreditsScreenProps {
  onBack: () => void;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-7 flex items-center gap-3">
      <span className="h-2 w-2 shrink-0 bg-[#d68a31] shadow-[0_0_12px_rgba(214,138,49,0.75)]" />
      <h2 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#d68a31]">
        {children}
      </h2>
      <div className="h-px flex-1 bg-gradient-to-r from-[#d68a31]/50 to-transparent" />
    </div>
  );
}

function CreditsSection({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-white/10 pt-10 ${className}`}>
      {children}
    </section>
  );
}

function TechGroup({ label, items, startIndex }: { label: string; items: string[]; startIndex: number }) {
  return (
    <div>
      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
        {label}
      </p>
      <div className="grid gap-3">
        {items.map((technology, index) => (
          <div key={technology} className="flex items-center gap-4 border-b border-white/10 pb-3">
            <span className="font-mono text-[10px] text-[#d68a31]">
              {String(startIndex + index).padStart(2, '0')}
            </span>
            <p className="text-sm font-semibold text-gray-200 sm:text-base">{technology}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CreditsScreen({ onBack }: CreditsScreenProps) {
  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-[#151009] text-white">
      {/* Industrial background treatment */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at 20% 0%, rgba(124, 15, 15, 0.24), transparent 48%),' +
            'radial-gradient(ellipse at 90% 70%, rgba(35, 38, 55, 0.18), transparent 52%),' +
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 42px 42px, 42px 42px',
        }}
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/80" />

      {/* Technical markers */}
      <div className="pointer-events-none fixed left-3 top-3 z-10 font-mono text-[10px] uppercase tracking-wider text-gray-700">
        SYS / CREDITS
      </div>
      <div className="pointer-events-none fixed right-3 top-3 z-10 font-mono text-[10px] uppercase tracking-wider text-gray-700">
        REV / 04
      </div>

      <main className="relative mx-auto w-full max-w-5xl px-5 pb-40 pt-24 sm:px-10 sm:pt-28">
        {/* Title lockup */}
        <header className="border-b border-white/15 pb-12 sm:pb-16">
          <div className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.35em] text-gray-500">
            <span className="h-px w-10 bg-[#d68a31]" />
            CREDITS
            <span className="h-px w-10 bg-[#d68a31]" />
          </div>

          <h1
            className="max-w-4xl uppercase leading-[0.9] text-[#e8d5ae]"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 'clamp(2.65rem, 9vw, 7.5rem)', textShadow: '0 0 30px rgba(214,138,49,0.25)' }}
          >
            ABYSSION:
            <br />
            LEGACY OF VOLION
          </h1>
          <p className="mt-5 font-mono text-xs uppercase tracking-[0.35em] text-gray-500 sm:text-sm">
            (ABYSSION: LoV)
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#d68a31]">
                DEVELOPED BY
              </p>
              <p className="text-2xl font-black uppercase tracking-tight text-gray-100 sm:text-3xl">
                EZROBYTE STUDIOS
              </p>
            </div>
            <div className="border-l border-[#d68a31]/70 pl-5 sm:min-w-[250px]">
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                EST. 28 JULY 2026
              </p>
              <div className="h-1 w-24 bg-[#d68a31]" />
            </div>
          </div>
        </header>

        <div className="space-y-10">
          <CreditsSection className="pt-12">
            <SectionHeading>STUDIO FOUNDERS</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-2">
              {FOUNDERS.map((founder) => (
                <div
                  key={founder.role}
                  className="border border-white/10 bg-white/[0.035] px-5 py-5"
                >
                  <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.13em] text-gray-500">
                    {founder.role}
                  </p>
                  <p className="mt-2 text-xl font-black uppercase tracking-tight text-gray-100">
                    {founder.name}
                  </p>
                </div>
              ))}
            </div>
          </CreditsSection>

          <CreditsSection>
            <SectionHeading>SPECIAL THANKS TO</SectionHeading>
            <div className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
              {SPECIAL_THANKS.map((thanks) => (
                <p
                  key={thanks}
                  className="border-l-2 border-gray-700 pl-4 text-sm font-medium leading-relaxed text-gray-300 sm:text-base"
                >
                  {thanks}
                </p>
              ))}
            </div>
            <div className="mt-8 border border-white/10 bg-black/25 p-5 sm:p-7">
              <div className="space-y-4 text-sm italic leading-relaxed text-gray-400 sm:text-base">
                <p>
                  &ldquo;Without those who tested, questioned, reported, and stayed curious,
                  there would be bugs I would never have reached,
                  problems I would never have seen,
                  and perspectives I could never have found alone.
                </p>
                <p>
                  Every report became another set of eyes.
                  Every piece of feedback became another path forward.
                </p>
                <p>
                  Abyssion may be built by a small team,
                  but it is shaped by every person willing to look closer.&rdquo;
                </p>
              </div>
            </div>
          </CreditsSection>

          <CreditsSection>
            <SectionHeading>GAME PRODUCTION</SectionHeading>
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {PRODUCTION_CREDITS.map((credit) => (
                <div key={credit.department}>
                  <p className="font-mono text-[10px] font-bold leading-relaxed tracking-[0.12em] text-gray-500">
                    {credit.department}
                  </p>
                  <p className="mt-2 text-lg font-black uppercase tracking-tight text-gray-100">
                    {credit.name}
                  </p>
                </div>
              ))}
            </div>
          </CreditsSection>

          <CreditsSection>
            <SectionHeading>TECHNOLOGY STACK</SectionHeading>
            <div className="grid gap-8 sm:grid-cols-3">
              <TechGroup label="WEB" items={TECH_STACK_WEB} startIndex={1} />
              <TechGroup label="NATIVE" items={TECH_STACK_NATIVE} startIndex={5} />
              <TechGroup label="DATA & VALIDATION" items={TECH_STACK_DATA} startIndex={9} />
            </div>
          </CreditsSection>

          <CreditsSection>
            <SectionHeading>DEVELOPMENT TOOLS &amp; AI ASSISTANCE</SectionHeading>
            <div className="border border-white/10 bg-black/20 p-5 sm:p-7">
              <p className="font-mono text-xs leading-loose tracking-[0.08em] text-gray-200 sm:text-sm">
                Google AI Studio | Bolt | Replit | FreeBuff | ChatGPT | Claude | Gemini
              </p>
              <div className="my-6 h-px bg-white/10" />
              <div className="space-y-4 text-sm leading-relaxed text-gray-400 sm:text-base">
                <p>
                  AI tools were used as development assistants for
                  <br className="hidden sm:block" /> research, ideation,
                  debugging, documentation,
                  <br className="hidden sm:block" /> and technical guidance.
                </p>
                <p>
                  Final creative, technical, architectural, and development decisions
                  <br className="hidden sm:block" /> remain with the Abyssion
                  development team.
                </p>
              </div>
            </div>
          </CreditsSection>
        </div>

        {/* Closing title card */}
        <footer className="mt-16 border-t border-[#d68a31]/50 pt-10 text-center sm:mt-24">
          <p className="font-black uppercase tracking-[0.12em] text-gray-100 sm:text-xl">
            ABYSSION: LEGACY OF VOLION
          </p>
          <div className="mx-auto mt-4 h-px w-16 bg-[#d68a31]" />
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.35em] text-gray-500">
            EST. 28 JULY 2026
          </p>
        </footer>
      </main>

      {/* BACK — bottom-centre, matching the menu's navigation convention
          (same placement family as Continue/New Game navigation). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-[#151009] via-[#151009]/90 to-transparent pb-6 pt-10">
        <button
          onClick={onBack}
          className="pointer-events-auto flex items-center gap-2 border border-[#d68a31]/60 bg-black/70 px-8 py-3 text-[#e8d5ae] backdrop-blur-sm transition-colors hover:border-[#d68a31] hover:bg-[#d68a31]/10 hover:text-white"
        >
          <ChevronLeft size={16} />
          <span className="font-mono text-sm font-bold uppercase tracking-[0.25em]">BACK</span>
        </button>
      </div>
    </div>
  );
}
